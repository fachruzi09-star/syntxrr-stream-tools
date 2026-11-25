// Standalone regression tests for A2.10.2: Soundboard reliability, startup hydration, and error handling.
// Run in the project environment with: bun run src/services/__tests__/soundboardReliability.test.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SoundboardItem } from '../../types';
import { DEFAULT_SOUNDBOARD, StorageService } from '../storage';
import {
  dispatchSoundboard,
  executeLiveCenterSoundboardPlay,
  executeSoundboardAudioImport,
  hasMissingCustomSoundboardAudio,
  hydrateSoundboardItems,
  type SoundboardPlaybackEngineLike,
} from '../soundboardDispatcher';
import type { SoundboardPlaybackResult } from '../soundboardEngine';

let assertionCount = 0;

function assert(condition: unknown, message: string): void {
  assertionCount += 1;
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assertionCount += 1;
  if (actual !== expected) {
    throw new Error(
      `Assertion failed (${message}): expected=${String(expected)} actual=${String(actual)}`,
    );
  }
}

async function runSoundboardReliabilityTests(): Promise<void> {
  // 1-4. Startup hydration tests
  {
    const storedBlob = new Blob([new Uint8Array([73, 68, 51, 3])], { type: 'audio/mpeg' });
    const createdUrls: string[] = [];

    const items: SoundboardItem[] = [
      ...DEFAULT_SOUNDBOARD,
      {
        id: 'sb_custom_valid_blob',
        name: 'Valid Local Sound',
        category: 'SFX',
        icon: 'Volume2',
        durationSec: 2,
        isQuickSlot: false,
        audioUrl: 'blob:http://stale-previous-session/old-id',
      },
      {
        id: 'sb_custom_missing_blob',
        name: 'Missing Local Sound',
        category: 'SFX',
        icon: 'Volume2',
        durationSec: 3,
        isQuickSlot: true,
        quickSlotKey: 1,
        audioUrl: 'blob:http://stale-previous-session/dead-blob',
      },
      {
        id: 'sb_custom_https',
        name: 'Remote HTTPS SFX',
        category: 'SFX',
        icon: 'Volume2',
        durationSec: 2,
        isQuickSlot: false,
        audioUrl: 'https://cdn.example.com/sfx/horn.mp3',
      },
      {
        id: 'sb_custom_http',
        name: 'Remote HTTP SFX',
        category: 'SFX',
        icon: 'Volume2',
        durationSec: 2,
        isQuickSlot: false,
        audioUrl: 'http://media.example.com/sfx/bell.ogg',
      },
    ];

    const hydrated = await hydrateSoundboardItems(items, {
      getSoundboardAudio: async (id) => (id === 'sb_custom_valid_blob' ? storedBlob : null),
      createObjectUrl: (blob) => {
        const url = `blob:hydrated/${createdUrls.length + 1}/${blob.size}`;
        createdUrls.push(url);
        return url;
      },
    });

    // 1. Valid Blob produces a fresh object URL
    const validItem = hydrated.find((entry) => entry.id === 'sb_custom_valid_blob');
    assert(Boolean(validItem), '1a: valid blob item remains in hydrated list');
    assertEqual(
      validItem?.audioUrl,
      `blob:hydrated/1/${storedBlob.size}`,
      '1b: valid blob creates a fresh object URL replacing stale blob URL',
    );
    assertEqual(createdUrls.length, 1, '1c: createObjectUrl is called ONLY for valid stored Blobs');

    // 2. Missing Blob strips stale blob: URL and keeps item visible in list
    const missingItem = hydrated.find((entry) => entry.id === 'sb_custom_missing_blob');
    assert(Boolean(missingItem), '2a: item with missing Blob is NOT deleted from list');
    assertEqual(missingItem?.audioUrl, undefined, '2b: stale blob: URL is removed when Blob is missing');
    assertEqual(missingItem?.name, 'Missing Local Sound', '2c: missing item retains its identifying name');

    // 3. HTTP / HTTPS online URLs are preserved when no local Blob exists
    const httpsItem = hydrated.find((entry) => entry.id === 'sb_custom_https');
    const httpItem = hydrated.find((entry) => entry.id === 'sb_custom_http');
    assertEqual(
      httpsItem?.audioUrl,
      'https://cdn.example.com/sfx/horn.mp3',
      '3a: HTTPS soundboard URL is preserved during hydration',
    );
    assertEqual(
      httpItem?.audioUrl,
      'http://media.example.com/sfx/bell.ogg',
      '3b: HTTP soundboard URL is preserved during hydration',
    );

    // 4. Built-in synthesizer items remain completely untouched
    for (const defaultItem of DEFAULT_SOUNDBOARD) {
      const hydratedDefault = hydrated.find((entry) => entry.id === defaultItem.id);
      assertEqual(
        JSON.stringify(hydratedDefault),
        JSON.stringify(defaultItem),
        `4: synthesizer item ${defaultItem.id} remains unchanged`,
      );
    }
  }

  // 5 & 6. Missing local audio feedback, playback failure feedback, and configured volume
  {
    const missingItem: SoundboardItem = {
      id: 'sb_custom_missing_1',
      name: 'Lost Meme Sound',
      category: 'SFX',
      icon: 'Volume2',
      durationSec: 2,
      isQuickSlot: false,
    };

    assertEqual(
      hasMissingCustomSoundboardAudio(missingItem),
      true,
      '5a: custom item without audioUrl or synthType is identified as missing local audio',
    );
    assertEqual(
      hasMissingCustomSoundboardAudio(DEFAULT_SOUNDBOARD[0]),
      false,
      '5b: built-in synth item is not flagged as missing audio',
    );
    assertEqual(
      hasMissingCustomSoundboardAudio({
        ...missingItem,
        audioUrl: 'https://cdn.example.com/ok.mp3',
      }),
      false,
      '5c: custom item with valid HTTPS URL is not flagged as missing audio',
    );

    const synthCalls: Array<{ type: string; volume?: number }> = [];
    const customCalls: Array<{ id: string; audioUrl: string; volume?: number }> = [];
    let customResult: SoundboardPlaybackResult = { ok: true };
    let synthResult: SoundboardPlaybackResult = { ok: true };

    const mockEngine: SoundboardPlaybackEngineLike = {
      async playSynthesizedSFX(type, volume) {
        synthCalls.push({ type, volume });
        return synthResult;
      },
      async playCustomFile(id, audioUrl, volume) {
        customCalls.push({ id, audioUrl, volume });
        return customResult;
      },
    };

    // 5d. Playing missing local audio emits clear feedback & NEVER silently plays synth SFX
    const missingErrors: Array<{ title: string; message: string }> = [];
    const missingPlayResult = await executeLiveCenterSoundboardPlay({
      target: missingItem,
      volume: 0.65,
      engine: mockEngine,
      onPlaybackError: (notice) => missingErrors.push(notice),
    });
    assertEqual(missingPlayResult.ok, false, '5d: playing missing local audio returns ok=false');
    if (!missingPlayResult.ok) {
      assertEqual(missingPlayResult.reason, 'missing_local_audio', '5e: reports missing_local_audio reason');
    }
    assertEqual(missingErrors.length, 1, '5f: missing local audio produces user error feedback');
    assert(
      missingErrors[0].message.includes('Lost Meme Sound') &&
        missingErrors[0].message.toLowerCase().includes('impor ulang'),
      '5g: feedback names the missing item and instructs user to re-import',
    );
    assertEqual(
      synthCalls.length,
      0,
      '5h: missing custom audio NEVER silently falls back to playSynthesizedSFX',
    );

    // Also verify dispatcher handles stripped-URL item safely
    const dispatchMissing = await dispatchSoundboard(missingItem, [missingItem], 0.65);
    assertEqual(dispatchMissing.status, 'invalid_audio', '5i: dispatchSoundboard rejects missing audio safely');

    // 6a. Custom file playback failure produces clear feedback & passes configured volume
    customResult = { ok: false, reason: 'audio_play_failed', error: new Error('Decode failed') };
    const customErrors: Array<{ title: string; message: string }> = [];
    const validCustomItem: SoundboardItem = {
      id: 'sb_custom_ok_1',
      name: 'Hype Airhorn',
      category: 'SFX',
      icon: 'Volume2',
      durationSec: 2,
      isQuickSlot: false,
      audioUrl: 'blob:hydrated/valid-horn',
    };
    const customFailRes = await executeLiveCenterSoundboardPlay({
      target: validCustomItem,
      volume: 0.42,
      engine: mockEngine,
      onPlaybackError: (notice) => customErrors.push(notice),
    });
    assertEqual(customFailRes.ok, false, '6a: playCustomFile failure propagates as ok=false');
    assertEqual(customCalls.length, 1, '6b: playCustomFile was invoked');
    assertEqual(customCalls[0].volume, 0.42, '6c: configured Soundboard volume is forwarded to playCustomFile');
    assertEqual(customErrors.length, 1, '6d: playCustomFile failure displays user error feedback');

    // 6b. Synthesizer playback failure produces clear feedback & passes configured volume
    synthResult = { ok: false, reason: 'audio_context_unavailable' };
    const synthErrors: Array<{ title: string; message: string }> = [];
    const synthFailRes = await executeLiveCenterSoundboardPlay({
      target: 'horn',
      volume: 0.73,
      engine: mockEngine,
      onPlaybackError: (notice) => synthErrors.push(notice),
    });
    assertEqual(synthFailRes.ok, false, '6e: playSynthesizedSFX failure propagates as ok=false');
    assertEqual(synthCalls.length, 1, '6f: playSynthesizedSFX was invoked');
    assertEqual(synthCalls[0].volume, 0.73, '6g: configured Soundboard volume is forwarded to playSynthesizedSFX');
    assertEqual(synthErrors.length, 1, '6h: playSynthesizedSFX failure displays user error feedback');
  }

  // 7, 8, 9. Import error handling: no unhandled rejection, existing items untouched, temp object URLs cleaned up
  {
    const initialItems: SoundboardItem[] = [
      ...DEFAULT_SOUNDBOARD,
      {
        id: 'sb_custom_existing',
        name: 'Existing Custom Sound',
        category: 'SFX',
        icon: 'Volume2',
        durationSec: 2,
        isQuickSlot: false,
        audioUrl: 'blob:existing/sound-1',
      },
    ];
    let committedItems = [...initialItems];
    const existingSnapshotBefore = JSON.stringify(committedItems);
    const sampleAudioFile = new File([new Uint8Array([1, 2, 3, 4, 5])], 'fail-test.mp3', {
      type: 'audio/mpeg',
    });

    // 7a / 8a / 9a: Failure inside StorageService.saveSoundboardAudio
    const revokedUrlsA: string[] = [];
    const deletedIdsA: string[] = [];
    let changeCalledOnAudioError = false;
    const failedAudioSaveRes = await executeSoundboardAudioImport({
      file: sampleAudioFile,
      existingItems: committedItems,
      createId: () => 'sb_custom_fail_storage',
      probeDurationSec: async () => 3,
      createObjectUrl: () => 'blob:temp/import-fail-storage',
      revokeObjectUrl: (url) => revokedUrlsA.push(url),
      saveSoundboardAudio: async () => {
        throw new Error('IndexedDB quota exceeded');
      },
      deleteSoundboardAudio: async (id) => {
        deletedIdsA.push(id);
      },
      onSoundboardItemsChange: async (next) => {
        changeCalledOnAudioError = true;
        committedItems = next;
      },
    });

    assertEqual(failedAudioSaveRes.ok, false, '7a: saveSoundboardAudio failure resolves cleanly without throwing');
    assertEqual(changeCalledOnAudioError, false, '8a: failed audio write does NOT invoke onSoundboardItemsChange');
    assertEqual(JSON.stringify(committedItems), existingSnapshotBefore, '8b: existing Soundboard items stay completely intact');
    assert(
      revokedUrlsA.includes('blob:temp/import-fail-storage'),
      '9a: temporary object URL is revoked when saveSoundboardAudio fails',
    );
    assert(
      deletedIdsA.includes('sb_custom_fail_storage'),
      '9b: orphaned audio entry cleanup runs on save failure',
    );

    // 7b / 8b / 9b: Failure inside onSoundboardItemsChange (e.g. StorageService.saveSoundboard fails)
    const revokedUrlsB: string[] = [];
    const deletedIdsB: string[] = [];
    const savedBlobs = new Map<string, Blob>();
    const failedListSaveRes = await executeSoundboardAudioImport({
      file: sampleAudioFile,
      existingItems: committedItems,
      createId: () => 'sb_custom_fail_list',
      probeDurationSec: async () => 4,
      createObjectUrl: () => 'blob:temp/import-fail-list',
      revokeObjectUrl: (url) => revokedUrlsB.push(url),
      saveSoundboardAudio: async (id, blob) => {
        savedBlobs.set(id, blob);
      },
      deleteSoundboardAudio: async (id) => {
        deletedIdsB.push(id);
        savedBlobs.delete(id);
      },
      onSoundboardItemsChange: async (nextItems) => {
        // Simulates App.tsx persistence-before-state: saveSoundboard fails before setSoundboardItems
        const persist = async () => {
          throw new Error('Failed to write soundboard_items');
        };
        await persist();
        committedItems = nextItems;
      },
    });

    assertEqual(failedListSaveRes.ok, false, '7b: onSoundboardItemsChange failure resolves cleanly without throwing');
    assertEqual(
      JSON.stringify(committedItems),
      existingSnapshotBefore,
      '8c: existing items remain untouched when saving list fails',
    );
    assert(
      revokedUrlsB.includes('blob:temp/import-fail-list'),
      '9c: temporary object URL is revoked when onSoundboardItemsChange fails',
    );
    assert(
      deletedIdsB.includes('sb_custom_fail_list') && !savedBlobs.has('sb_custom_fail_list'),
      '9d: saved Blob is rolled back when list persistence fails',
    );

    // Verify StorageService.getSoundboardAudio and saveSoundboardAudio types remain intact
    assertEqual(typeof StorageService.getSoundboardAudio, 'function', 'StorageService.getSoundboardAudio preserved');
    assertEqual(typeof StorageService.saveSoundboardAudio, 'function', 'StorageService.saveSoundboardAudio preserved');
  }

  // Wiring verification in src/App.tsx and src/components/LiveCenterView.tsx
  {
    const appSource = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    const liveCenterSource = readFileSync(
      join(process.cwd(), 'src', 'components', 'LiveCenterView.tsx'),
      'utf8',
    );

    assert(
      appSource.includes('hydrateSoundboardItems(savedSoundboard') &&
        appSource.includes('await StorageService.saveSoundboard(items);\n                setSoundboardItems(items);'),
      'App.tsx hydrates Soundboard via hydrateSoundboardItems and persists before updating state',
    );
    assert(
      liveCenterSource.includes('executeLiveCenterSoundboardPlay(') &&
        liveCenterSource.includes('executeSoundboardAudioImport(') &&
        liveCenterSource.includes('hasMissingCustomSoundboardAudio(') &&
        !liveCenterSource.includes('throw error;'),
      'LiveCenterView.tsx uses reliability helpers, renders missing audio indicators, and never throws unhandled import errors',
    );
  }

  console.log(`soundboardReliability.test.ts: PASS (${assertionCount} assertions)`);
}

runSoundboardReliabilityTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
