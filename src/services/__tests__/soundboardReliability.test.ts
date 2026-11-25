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
import { executeLiveCenterSoundboardDelete } from '../../components/LiveCenterView';

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

  // 10. A2.10.2.1 & A2.10.2.2 Soundboard delete consistency & IndexedDB transaction commit guard
  {
    const globalRecord = globalThis as unknown as { indexedDB?: unknown };
    const originalIndexedDB = globalRecord.indexedDB;

    try {
      const idbData = new Map<string, unknown>();
      type TxMode = 'commit' | 'abort_after_request' | 'tx_error_after_request';
      let failDelete = false;
      let failOpen = false;
      let txMode: TxMode = 'commit';
      let dbOpenCount = 0;
      let dbCloseCount = 0;
      let requestSuccessCount = 0;
      let txCompleteCount = 0;
      let txAbortCount = 0;

      const fakeIdb = {
        open(_name: string, _version?: number) {
          const openReq: {
            result?: unknown;
            error?: Error;
            onsuccess: (() => void) | null;
            onerror: (() => void) | null;
          } = { onsuccess: null, onerror: null };
          queueMicrotask(() => {
            if (failOpen) {
              openReq.error = new Error('Simulated openDB failure');
              openReq.onerror?.();
              return;
            }
            dbOpenCount += 1;
            openReq.result = {
              objectStoreNames: { contains: () => true },
              close() {
                dbCloseCount += 1;
              },
              transaction() {
                const stagedData = new Map(idbData);
                const txObj: {
                  error: Error | null;
                  oncomplete: (() => void) | null;
                  onerror: (() => void) | null;
                  onabort: (() => void) | null;
                  objectStore: () => {
                    delete: (key: string) => {
                      error: Error | null;
                      onsuccess: (() => void) | null;
                      onerror: (() => void) | null;
                    };
                  };
                } = {
                  error: null,
                  oncomplete: null,
                  onerror: null,
                  onabort: null,
                  objectStore() {
                    return {
                      delete(key: string) {
                        const req: {
                          error: Error | null;
                          onsuccess: (() => void) | null;
                          onerror: (() => void) | null;
                        } = { error: null, onsuccess: null, onerror: null };
                        queueMicrotask(() => {
                          if (failDelete) {
                            req.error = new Error(`Simulated IDB delete failure for ${key}`);
                            req.onerror?.();
                            // In IndexedDB, an unhandled request error aborts the transaction without committing
                            queueMicrotask(() => {
                              txObj.error = req.error;
                              txAbortCount += 1;
                              txObj.onabort?.();
                            });
                            return;
                          }

                          stagedData.delete(key);
                          requestSuccessCount += 1;
                          req.onsuccess?.();

                          // Transaction commit / abort happens asynchronously AFTER request.onsuccess
                          queueMicrotask(() => {
                            if (txMode === 'abort_after_request') {
                              // Rollback: do NOT apply stagedData back to idbData
                              txObj.error = new Error(
                                `Simulated transaction abort after request success for ${key}`,
                              );
                              txAbortCount += 1;
                              txObj.onabort?.();
                              return;
                            }
                            if (txMode === 'tx_error_after_request') {
                              txObj.error = new Error(
                                `Simulated transaction error after request success for ${key}`,
                              );
                              txObj.onerror?.();
                              return;
                            }

                            idbData.clear();
                            stagedData.forEach((value, stagedKey) => {
                              idbData.set(stagedKey, value);
                            });
                            txCompleteCount += 1;
                            txObj.oncomplete?.();
                          });
                        });
                        return req;
                      },
                    };
                  },
                };
                return txObj;
              },
            };
            openReq.onsuccess?.();
          });
          return openReq;
        },
      };
      globalRecord.indexedDB = fakeIdb;

      const blobA = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' });
      const blobB = new Blob([new Uint8Array([4, 5, 6])], { type: 'audio/ogg' });
      const blobC = new Blob([new Uint8Array([7, 8, 9])], { type: 'audio/wav' });
      idbData.set('soundboard_audio_sb_custom_a', blobA);
      idbData.set('soundboard_audio_sb_custom_b', blobB);
      idbData.set('soundboard_audio_sb_custom_c', blobC);

      // Verify StorageService.deleteSoundboardAudio rejects when request.onerror fires + closes DB
      failDelete = true;
      let idbDeleteRejected = false;
      try {
        await StorageService.deleteSoundboardAudio('sb_custom_a');
      } catch (err) {
        idbDeleteRejected = err instanceof Error && err.message.includes('Simulated IDB delete failure');
      }
      assert(idbDeleteRejected, '10a: StorageService.deleteSoundboardAudio rejects on IndexedDB request error');
      assert(idbData.has('soundboard_audio_sb_custom_a'), '10b: failed delete leaves Blob in IndexedDB');
      assertEqual(dbCloseCount, dbOpenCount, '10b2: db.close() called after request error');

      // Verify StorageService.deleteSoundboardAudio rejects when openDB fails (no extra close on unopened DB)
      failDelete = false;
      failOpen = true;
      const openBeforeFail = dbOpenCount;
      const closeBeforeFail = dbCloseCount;
      let idbOpenRejected = false;
      try {
        await StorageService.deleteSoundboardAudio('sb_custom_a');
      } catch {
        idbOpenRejected = true;
      }
      assert(idbOpenRejected, '10c: StorageService.deleteSoundboardAudio rejects on openDB error');
      assertEqual(dbOpenCount, openBeforeFail, '10c2: failed openDB does not open connection');
      assertEqual(dbCloseCount, closeBeforeFail, '10c3: failed openDB does not leak or call close');
      failOpen = false;

      // Verify A2.10.2.2: request.onsuccess succeeds, then tx.onabort fires -> MUST reject and keep Blob intact!
      txMode = 'abort_after_request';
      const reqCountBeforeAbort = requestSuccessCount;
      const txAbortBefore = txAbortCount;
      const txCompleteBeforeAbort = txCompleteCount;
      let txAbortCountWhenSettled = -1;
      let abortRejected = false;
      let abortMessage = '';
      const deleteAbortPromise = StorageService.deleteSoundboardAudio('sb_custom_c');
      const settleTracker = deleteAbortPromise.then(
        () => {
          txAbortCountWhenSettled = txAbortCount;
        },
        () => {
          txAbortCountWhenSettled = txAbortCount;
        },
      );
      try {
        await deleteAbortPromise;
      } catch (err) {
        abortRejected = true;
        abortMessage = err instanceof Error ? err.message : String(err);
      }
      await settleTracker;
      assert(abortRejected, '10c4: deleteSoundboardAudio rejects when request succeeds but tx aborts');
      assert(
        abortMessage.includes('Simulated transaction abort after request success'),
        '10c5: transaction abort error propagates to caller',
      );
      assert(
        requestSuccessCount === reqCountBeforeAbort + 1 &&
          txAbortCount === txAbortBefore + 1 &&
          txCompleteCount === txCompleteBeforeAbort,
        '10c6: request.onsuccess ran, tx.onabort ran, and tx.oncomplete never ran',
      );
      assert(
        idbData.get('soundboard_audio_sb_custom_c') === blobC,
        '10c7: old Blob remains intact in IndexedDB when transaction aborts after request success',
      );
      assertEqual(dbCloseCount, dbOpenCount, '10c8: db.close() always called even when transaction aborts');
      assertEqual(
        txAbortCountWhenSettled,
        txAbortBefore + 1,
        '10c9: Promise waited for tx.onabort instead of resolving prematurely at request.onsuccess',
      );

      // Also verify tx.onerror after request.onsuccess rejects cleanly and preserves Blob
      txMode = 'tx_error_after_request';
      let txErrorRejected = false;
      try {
        await StorageService.deleteSoundboardAudio('sb_custom_c');
      } catch (err) {
        txErrorRejected =
          err instanceof Error && err.message.includes('Simulated transaction error after request success');
      }
      assert(txErrorRejected, '10c9b: deleteSoundboardAudio rejects when tx.onerror fires after request success');
      assert(
        idbData.get('soundboard_audio_sb_custom_c') === blobC,
        '10c9c: old Blob stays intact when tx.onerror fires',
      );
      assertEqual(dbCloseCount, dbOpenCount, '10c9d: db.close() called after tx.onerror');

      // Verify A2.10.2.2: delete request succeeds AND transaction completes -> resolves ONLY after tx.oncomplete
      txMode = 'commit';
      let resolvedBeforeTxComplete = false;
      let completedCountDuringResolve = -1;
      const deleteCommitPromise = StorageService.deleteSoundboardAudio('sb_custom_c').then(() => {
        completedCountDuringResolve = txCompleteCount;
        if (txCompleteCount === txCompleteBeforeAbort) {
          resolvedBeforeTxComplete = true;
        }
      });
      await deleteCommitPromise;
      assert(
        !resolvedBeforeTxComplete && completedCountDuringResolve === txCompleteBeforeAbort + 1,
        '10c10: deleteSoundboardAudio resolves strictly after tx.oncomplete',
      );
      assert(!idbData.has('soundboard_audio_sb_custom_c'), '10c11: Blob deleted once transaction commits');
      assertEqual(dbCloseCount, dbOpenCount, '10c12: db.close() called after transaction completes');

      const itemA: SoundboardItem = {
        id: 'sb_custom_a',
        name: 'Custom A',
        category: 'SFX',
        icon: 'Volume2',
        durationSec: 2,
        isQuickSlot: false,
        audioUrl: 'blob:sound/custom-a',
      };
      const itemB: SoundboardItem = {
        id: 'sb_custom_b',
        name: 'Custom B',
        category: 'SFX',
        icon: 'Volume2',
        durationSec: 3,
        isQuickSlot: true,
        quickSlotKey: 2,
        audioUrl: 'blob:sound/custom-b',
      };

      // Simulate App.tsx URL lifecycle tracking to verify single revoke (no double revoke)
      let activeSoundboardList: SoundboardItem[] = [...DEFAULT_SOUNDBOARD, itemA, itemB];
      let trackedUrls = new Map(
        activeSoundboardList
          .filter((entry) => entry.audioUrl)
          .map((entry) => [entry.id, entry.audioUrl as string]),
      );
      const revokedUrlCounts = new Map<string, number>();
      const syncAppUrlLifecycle = (nextList: SoundboardItem[]) => {
        const nextActiveUrls = new Map(
          nextList
            .filter((entry) => entry.audioUrl)
            .map((entry) => [entry.id, entry.audioUrl as string]),
        );
        trackedUrls.forEach((url, id) => {
          if (nextActiveUrls.get(id) !== url && url.startsWith('blob:')) {
            revokedUrlCounts.set(url, (revokedUrlCounts.get(url) ?? 0) + 1);
          }
        });
        trackedUrls = nextActiveUrls;
      };

      const stoppedIds: string[] = [];
      const orderTrace: string[] = [];

      // 10.1 Failed list save: Blob stays, playback NOT stopped, item stays intact
      const snapshotBeforeFail = JSON.stringify(activeSoundboardList);
      const failSaveRes = await executeLiveCenterSoundboardDelete({
        item: itemA,
        existingItems: activeSoundboardList,
        onSoundboardItemsChange: async () => {
          orderTrace.push('save_list_fail');
          throw new Error('Failed saving soundboard_items');
        },
        removeCustomFile: (id) => {
          orderTrace.push('stop_playback');
          stoppedIds.push(id);
        },
        deleteSoundboardAudio: async (id) => {
          orderTrace.push('delete_blob');
          await StorageService.deleteSoundboardAudio(id);
        },
      });
      assertEqual(failSaveRes.status, 'list_save_failed', '10d: failed list save returns list_save_failed');
      assertEqual(stoppedIds.length, 0, '10e: playback is NOT stopped when list save fails');
      assert(idbData.has('soundboard_audio_sb_custom_a'), '10f: Blob is NOT deleted when list save fails');
      assertEqual(JSON.stringify(activeSoundboardList), snapshotBeforeFail, '10g: old list items remain untouched');
      assertEqual(revokedUrlCounts.get('blob:sound/custom-a') ?? 0, 0, '10h: object URL is NOT revoked when delete fails');

      // 10.2 Successful list save: list persisted first -> playback stopped -> Blob deleted -> single URL revoke
      orderTrace.length = 0;
      const successRes = await executeLiveCenterSoundboardDelete({
        item: itemA,
        existingItems: activeSoundboardList,
        onSoundboardItemsChange: async (next) => {
          orderTrace.push('save_list');
          activeSoundboardList = next;
          syncAppUrlLifecycle(next);
        },
        removeCustomFile: (id) => {
          orderTrace.push('stop_playback');
          stoppedIds.push(id);
        },
        deleteSoundboardAudio: async (id) => {
          orderTrace.push('delete_blob');
          await StorageService.deleteSoundboardAudio(id);
        },
      });
      assertEqual(successRes.status, 'deleted', '10i: successful delete returns status=deleted');
      assertEqual(
        orderTrace.join('>'),
        'save_list>stop_playback>delete_blob',
        '10j: delete executes strictly in order save_list -> stop_playback -> delete_blob',
      );
      assert(
        !activeSoundboardList.some((entry) => entry.id === 'sb_custom_a'),
        '10k: deleted item is removed from Soundboard list',
      );
      assertEqual(stoppedIds[0], 'sb_custom_a', '10l: playback stopped for deleted item');
      assert(!idbData.has('soundboard_audio_sb_custom_a'), '10m: Blob deleted from IndexedDB');
      assertEqual(
        revokedUrlCounts.get('blob:sound/custom-a'),
        1,
        '10n: deleted item object URL is revoked exactly once (no double revoke)',
      );
      // Verify other items & their blobs remain untouched
      assert(
        activeSoundboardList.some((entry) => entry.id === 'sb_custom_b') &&
          idbData.get('soundboard_audio_sb_custom_b') === blobB &&
          (revokedUrlCounts.get('blob:sound/custom-b') ?? 0) === 0,
        '10o: other custom Soundboard item and Blob stay completely intact',
      );

      // 10.3 Blob cleanup failure when transaction aborts after request success:
      //     strict order preserved, item stays deleted, warning returned, old Blob rolled back, DB closed
      orderTrace.length = 0;
      txMode = 'abort_after_request';
      const cleanupWarnRes = await executeLiveCenterSoundboardDelete({
        item: itemB,
        existingItems: activeSoundboardList,
        onSoundboardItemsChange: async (next) => {
          orderTrace.push('save_list');
          activeSoundboardList = next;
          syncAppUrlLifecycle(next);
        },
        removeCustomFile: (id) => {
          orderTrace.push('stop_playback');
          stoppedIds.push(id);
        },
        deleteSoundboardAudio: async (id) => {
          orderTrace.push('delete_blob');
          await StorageService.deleteSoundboardAudio(id);
        },
      });
      txMode = 'commit';
      assertEqual(
        cleanupWarnRes.status,
        'deleted_with_cleanup_warning',
        '10p: transaction abort after request success reports deleted_with_cleanup_warning',
      );
      assertEqual(
        orderTrace.join('>'),
        'save_list>stop_playback>delete_blob',
        '10p2: cleanup order save_list -> stop_playback -> delete_blob preserved on tx abort',
      );
      assert(
        !activeSoundboardList.some((entry) => entry.id === 'sb_custom_b'),
        '10q: deleted item is NOT restored to the list when transaction aborts',
      );
      assert(
        stoppedIds.includes('sb_custom_b'),
        '10r: playback is still stopped after list deletion even if transaction aborts',
      );
      assert(
        idbData.get('soundboard_audio_sb_custom_b') === blobB,
        '10r2: old Blob remains rolled back on aborted delete transaction',
      );
      assertEqual(
        revokedUrlCounts.get('blob:sound/custom-b'),
        1,
        '10s: object URL revoked once cleanly',
      );
      assertEqual(dbCloseCount, dbOpenCount, '10s2: db.close() count matches open count across full suite');
      assert(
        DEFAULT_SOUNDBOARD.every((def) => activeSoundboardList.some((entry) => entry.id === def.id)),
        '10t: built-in Soundboard items remain intact',
      );
    } finally {
      globalRecord.indexedDB = originalIndexedDB;
    }
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
        liveCenterSource.includes('executeLiveCenterSoundboardDelete(') &&
        liveCenterSource.includes('hasMissingCustomSoundboardAudio(') &&
        !liveCenterSource.includes('throw error;'),
      'LiveCenterView.tsx uses reliability/delete helpers, renders missing audio indicators, and never throws unhandled errors',
    );
    const deleteFnStart = liveCenterSource.indexOf('export async function executeLiveCenterSoundboardDelete');
    const deleteFnEnd = liveCenterSource.indexOf('export const LiveCenterView', deleteFnStart);
    const deleteFnSection = liveCenterSource.slice(deleteFnStart, deleteFnEnd);
    assert(
      !deleteFnSection.includes('revokeObjectURL') &&
        deleteFnSection.indexOf('onSoundboardItemsChange') < deleteFnSection.indexOf('removeCustomFile') &&
        deleteFnSection.indexOf('removeCustomFile') < deleteFnSection.indexOf('deleteSoundboardAudio'),
      'executeLiveCenterSoundboardDelete persists list before stopping playback and deleting Blob, and delegates object URL cleanup to App.tsx lifecycle',
    );

    const storageSource = readFileSync(join(process.cwd(), 'src', 'services', 'storage.ts'), 'utf8');
    const storageDeleteStart = storageSource.indexOf('async deleteSoundboardAudio(id: string)');
    const storageDeleteEnd = storageSource.indexOf('async deleteAllSoundboardAudio', storageDeleteStart);
    const storageDeleteSection = storageSource.slice(storageDeleteStart, storageDeleteEnd);
    assert(
      !storageDeleteSection.includes('request.onsuccess') &&
        storageDeleteSection.includes('tx.oncomplete = () => finishResolve()') &&
        storageDeleteSection.includes('tx.onerror') &&
        storageDeleteSection.includes('tx.onabort') &&
        storageDeleteSection.includes('request.onerror') &&
        storageDeleteSection.includes('finally') &&
        storageDeleteSection.includes('db.close()'),
      'StorageService.deleteSoundboardAudio resolves strictly on tx.oncomplete, handles errors/abort, and closes DB in finally',
    );
  }

  console.log(`soundboardReliability.test.ts: PASS (${assertionCount} assertions)`);
}

runSoundboardReliabilityTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
