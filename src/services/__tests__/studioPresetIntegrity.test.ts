// Unit tests for Studio Fase 1A data-integrity guarantees.
// Run in the project environment with: bun run src/services/__tests__/studioPresetIntegrity.test.ts

import {
  AppSettings,
  StudioElement,
  StudioPreset,
  StudioScreensaverSettings,
} from '../../types';
import { canChangeActivePresetForSnapshot } from '../modeBPresetSwitchPolicy';
import { shouldLockModeBSceneMutations } from '../modeBSceneMutationPolicy';
import { DEFAULT_SETTINGS, StorageService } from '../storage';
import {
  STUDIO_PERSISTENCE_DEBOUNCE_MS,
  StudioSaveState,
  applyElementsMutationToPresetState,
  buildBlankPresetDraft,
  clonePresetWithRemappedIds,
  createStudioPersistenceController,
  createUniquePresetId,
  submitAsyncPresetCreation,
} from '../studioPresetActions';

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

function createFakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    store,
    storage: {
      getItem(key: string): string | null {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string): void {
        store.set(key, value);
      },
      removeItem(key: string): void {
        store.delete(key);
      },
    },
  };
}

function createRichPreset(id: string, name: string): StudioPreset {
  const elements: StudioElement[] = [
    {
      id: `${id}_elem_cam`,
      name: 'Main Camera',
      type: 'camera',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      layer: 1,
      visible: true,
      locked: false,
      opacity: 100,
      rotation: 0,
      properties: { facingMode: 'user' },
    },
    {
      id: `${id}_elem_chat`,
      name: 'Live Chat',
      type: 'chat_message',
      x: 6,
      y: 62,
      width: 88,
      height: 28,
      layer: 2,
      visible: true,
      locked: false,
      opacity: 90,
      rotation: 0,
      properties: { maxMessages: 5 },
    },
    {
      id: `${id}_elem_text`,
      name: 'Judul Room',
      type: 'text',
      x: 8,
      y: 8,
      width: 60,
      height: 10,
      layer: 3,
      visible: true,
      locked: false,
      opacity: 100,
      rotation: 0,
      properties: { text: 'Live Malam Ini' },
    },
  ];

  return {
    id,
    name,
    category: 'hp_screen',
    canvasOrientation: '9:16',
    elements,
    groups: [
      {
        id: `${id}_group_hud`,
        name: 'HUD Overlay',
        elementIds: [`${id}_elem_chat`, `${id}_elem_text`],
        visible: true,
        locked: false,
      },
    ],
    superGroups: [
      {
        id: `${id}_super_scene`,
        name: 'Scene Master',
        groupIds: [`${id}_group_hud`],
        visible: true,
        locked: false,
      },
    ],
    createdAt: 1700000000000,
    isFavorite: true,
    description: 'Rich preset with groups, supergroups, screensaver & transitions',
    thumbnailColor: '#F2C230',
    backgroundUri: 'studio-media://bg_asset_1',
    screensaver: {
      on: true,
      media: 'studio-media://wait_asset_1',
      mediaType: 'image',
      text: 'Sebentar ya, host istirahat...',
      entry: { type: 'fade', duration: 300 },
      exit: { type: 'cut', duration: 0 },
    },
    transitionIn: { type: 'fade', duration: 350 },
    transitionOut: { type: 'cut', duration: 0 },
    canvas: {
      kind: 'portrait',
      width: 1080,
      height: 1920,
    },
  };
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStudioPresetIntegrityTests(): Promise<void> {
  const g = globalThis as unknown as {
    indexedDB?: unknown;
    localStorage?: unknown;
  };
  const originalIndexedDB = g.indexedDB;
  const originalLocalStorage = g.localStorage;

  try {
    // 1 & 2. Kanvas Kosong creates a NEW blank preset atomically without deleting/modifying
    // previous active preset elements or its Group / Supergroup / Mode B metadata.
    const fakeLs = createFakeLocalStorage();
    g.indexedDB = undefined;
    g.localStorage = fakeLs.storage;

    const richPreset = createRichPreset('preset_rich_1', 'Live Malam Pro');
    const settingsSnapshot: AppSettings = { ...DEFAULT_SETTINGS, canvasOrientation: '9:16' };

    await StorageService.savePresetActivationAtomically({
      presets: [richPreset],
      activePresetId: richPreset.id,
      studioElements: richPreset.elements,
      settings: settingsSnapshot,
    });

    const blankDraft = buildBlankPresetDraft([richPreset], '9:16');
    assertEqual(blankDraft.name, 'Kanvas Kosong', 'first blank canvas name is Kanvas Kosong');
    assertEqual(blankDraft.elements.length, 0, 'blank draft starts with zero elements');
    assertEqual((blankDraft.groups || []).length, 0, 'blank draft starts with zero groups');
    assertEqual((blankDraft.superGroups || []).length, 0, 'blank draft starts with zero superGroups');

    const blankPreset: StudioPreset = {
      ...blankDraft,
      id: createUniquePresetId([richPreset], 'preset'),
      createdAt: Date.now(),
    };
    const nextPresetsAfterBlank = [blankPreset, richPreset];

    await StorageService.savePresetActivationAtomically({
      presets: nextPresetsAfterBlank,
      activePresetId: blankPreset.id,
      studioElements: blankPreset.elements,
      settings: { ...settingsSnapshot, canvasOrientation: blankPreset.canvasOrientation },
    });

    const storedPresets = JSON.parse(fakeLs.store.get('syntxrr_studio_presets') || '[]') as StudioPreset[];
    const storedActiveId = JSON.parse(fakeLs.store.get('syntxrr_active_preset_id') || 'null');
    const storedElements = JSON.parse(fakeLs.store.get('syntxrr_studio_elements') || '[]') as StudioElement[];

    assertEqual(storedPresets.length, 2, 'Kanvas Kosong adds a new preset rather than overwriting old one');
    assertEqual(storedActiveId, blankPreset.id, 'activePresetId switches to new blank preset');
    assertEqual(storedElements.length, 0, 'active studioElements becomes empty for blank preset');

    const preservedOld = storedPresets.find((p) => p.id === richPreset.id)!;
    assert(Boolean(preservedOld), 'old preset remains in storage');
    assertEqual(preservedOld.elements.length, 3, 'old preset keeps all 3 elements intact');
    assertEqual(preservedOld.groups?.length, 1, 'old preset keeps Group intact');
    assertEqual(
      preservedOld.groups?.[0].elementIds.join(','),
      `${richPreset.id}_elem_chat,${richPreset.id}_elem_text`,
      'old preset Group elementIds stay untouched',
    );
    assertEqual(preservedOld.superGroups?.length, 1, 'old preset keeps Supergroup intact');
    assertEqual(
      preservedOld.superGroups?.[0].groupIds.join(','),
      `${richPreset.id}_group_hud`,
      'old preset Supergroup groupIds stay untouched',
    );
    assertEqual(preservedOld.backgroundUri, 'studio-media://bg_asset_1', 'old preset backgroundUri stays intact');
    assertEqual(
      (preservedOld.screensaver as StudioScreensaverSettings | undefined)?.text,
      'Sebentar ya, host istirahat...',
      'old preset screensaver stays intact',
    );

    // Second Kanvas Kosong avoids duplicate name collision
    const secondBlankDraft = buildBlankPresetDraft(storedPresets, '16:9');
    assertEqual(secondBlankDraft.name, 'Kanvas Kosong 2', 'increments Kanvas Kosong suffix when name exists');

    // 3. Kanvas Kosong is rejected cleanly during Mode B LIVE/busy guard
    const modeBLiveBlocked = !canChangeActivePresetForSnapshot({ status: 'live', isStreaming: true });
    assertEqual(modeBLiveBlocked, true, 'Mode B LIVE snapshot blocks preset switch / Kanvas Kosong');
    assertEqual(
      shouldLockModeBSceneMutations({ status: 'starting', isStreaming: false }),
      true,
      'Mode B starting snapshot locks structural mutations',
    );
    const guardAttempt = await submitAsyncPresetCreation(() => !modeBLiveBlocked);
    assertEqual(guardAttempt.ok, false, 'submitAsyncPresetCreation rejects when Mode B guard returns false');
    if (!guardAttempt.ok) {
      assertEqual(guardAttempt.reason, 'blocked', 'rejection reason is blocked');
    }
    assertEqual(
      JSON.parse(fakeLs.store.get('syntxrr_studio_presets') || '[]').length,
      2,
      'rejected Kanvas Kosong leaves persisted presets untouched',
    );

    // 4. Simpan updates the active preset via saveNow without creating duplicates or changing activePresetId
    const statesLog: StudioSaveState['status'][] = [];
    const persistedSnapshots: Array<{ elements: StudioElement[]; presets: StudioPreset[] }> = [];
    let shouldFailWrite = false;

    const saveController = createStudioPersistenceController({
      debounceMs: 25,
      onStateChange: (next) => statesLog.push(next.status),
      writeSnapshot: async (snapshot) => {
        if (shouldFailWrite) {
          throw new Error('Disk penuh');
        }
        persistedSnapshots.push(snapshot);
      },
    });

    const editedRichElements = richPreset.elements.map((el) =>
      el.id.endsWith('_elem_text')
        ? { ...el, properties: { ...el.properties, text: 'Judul Diperbarui' } }
        : el,
    );
    const afterActiveEdit = applyElementsMutationToPresetState({
      presets: [richPreset],
      activePresetId: richPreset.id,
      newElements: editedRichElements,
    });

    const saveNowRes = await saveController.saveNow(afterActiveEdit);
    assertEqual(saveNowRes.success, true, 'Simpan succeeds cleanly');
    assertEqual(persistedSnapshots.length, 1, 'Simpan writes exactly once for active state');
    assertEqual(persistedSnapshots[0].presets.length, 1, 'Simpan does NOT create duplicate presets');
    assertEqual(persistedSnapshots[0].presets[0].id, richPreset.id, 'Simpan preserves activePresetId');
    assertEqual(
      persistedSnapshots[0].presets[0].elements.find((e) => e.id.endsWith('_elem_text'))?.properties?.text,
      'Judul Diperbarui',
      'Simpan persists updated active preset element property',
    );
    assertEqual(saveController.getState().status, 'saved', 'save status returns to saved');

    shouldFailWrite = true;
    const failedSaveRes = await saveController.saveNow(afterActiveEdit);
    assertEqual(failedSaveRes.success, false, 'Simpan reports failure when storage throws');
    assertEqual(saveController.getState().status, 'error', 'save status reflects error on write failure');
    assertEqual(saveController.getState().errorMessage, 'Disk penuh', 'errorMessage surfaces storage error');
    shouldFailWrite = false;

    // 5 & 6. Simpan Sebagai Salinan preserves Group, Supergroup, Mode B metadata, and guarantees non-colliding IDs
    const copiedPreset = clonePresetWithRemappedIds({
      sourcePreset: afterActiveEdit.presets[0],
      currentElements: afterActiveEdit.elements,
      existingPresets: [afterActiveEdit.presets[0], blankPreset],
      canvasOrientation: '9:16',
    });

    assert(copiedPreset.id !== richPreset.id, 'copy has a distinct preset ID');
    assert(copiedPreset.id !== blankPreset.id, 'copy preset ID does not collide with blank preset');
    assertEqual(copiedPreset.name, 'Live Malam Pro (Salinan)', 'copy generates Salinan name');
    assertEqual(copiedPreset.elements.length, 3, 'copy preserves all 3 elements');
    assertEqual(copiedPreset.groups?.length, 1, 'copy preserves Group');
    assertEqual(copiedPreset.superGroups?.length, 1, 'copy preserves Supergroup');
    assertEqual(copiedPreset.backgroundUri, richPreset.backgroundUri, 'copy preserves backgroundUri');
    assertEqual(
      (copiedPreset.screensaver as StudioScreensaverSettings | undefined)?.text,
      (richPreset.screensaver as StudioScreensaverSettings | undefined)?.text,
      'copy preserves screensaver',
    );
    assertEqual(
      (copiedPreset.transitionIn as Record<string, unknown> | undefined)?.type,
      'fade',
      'copy preserves transitionIn',
    );
    assertEqual(
      (copiedPreset.transitionOut as Record<string, unknown> | undefined)?.type,
      'cut',
      'copy preserves transitionOut',
    );
    assertEqual(copiedPreset.canvas?.width, 1080, 'copy preserves canvas dimensions when orientation matches');

    // Verify zero ID collisions across elements, groups, superGroups (including across back-to-back copies)
    const secondCopy = clonePresetWithRemappedIds({
      sourcePreset: afterActiveEdit.presets[0],
      currentElements: afterActiveEdit.elements,
      existingPresets: [afterActiveEdit.presets[0], blankPreset, copiedPreset],
      canvasOrientation: '9:16',
      customName: 'Salinan Kedua',
    });

    const sourceElementIds = new Set(richPreset.elements.map((e) => e.id));
    const copy1ElementIds = new Set(copiedPreset.elements.map((e) => e.id));
    const copy2ElementIds = new Set(secondCopy.elements.map((e) => e.id));

    for (const id of copy1ElementIds) {
      assert(!sourceElementIds.has(id), `copy1 element ID ${id} does not collide with source`);
    }
    for (const id of copy2ElementIds) {
      assert(!sourceElementIds.has(id), `copy2 element ID ${id} does not collide with source`);
      assert(!copy1ElementIds.has(id), `copy2 element ID ${id} does not collide with copy1`);
    }
    assert(
      copiedPreset.groups![0].id !== richPreset.groups![0].id,
      'copy1 group ID does not collide with source group ID',
    );
    assert(
      secondCopy.groups![0].id !== copiedPreset.groups![0].id,
      'copy2 group ID does not collide with copy1 group ID',
    );
    assert(
      copiedPreset.superGroups![0].id !== richPreset.superGroups![0].id,
      'copy1 superGroup ID does not collide with source superGroup ID',
    );
    assert(
      secondCopy.superGroups![0].id !== copiedPreset.superGroups![0].id,
      'copy2 superGroup ID does not collide with copy1 superGroup ID',
    );
    // Remapped Group/Supergroup references point only to the copy's own remapped child IDs
    assert(
      copiedPreset.groups![0].elementIds.every((id) => copy1ElementIds.has(id)),
      'copy1 group elementIds accurately point to copy1 remapped elements',
    );
    assertEqual(
      copiedPreset.superGroups![0].groupIds[0],
      copiedPreset.groups![0].id,
      'copy1 superGroup groupIds accurately point to copy1 remapped group',
    );

    // Verify atomic persistence of copy preserves original
    await StorageService.savePresetActivationAtomically({
      presets: [copiedPreset, afterActiveEdit.presets[0], blankPreset],
      activePresetId: copiedPreset.id,
      studioElements: copiedPreset.elements,
      settings: settingsSnapshot,
    });
    const afterCopyPresets = JSON.parse(fakeLs.store.get('syntxrr_studio_presets') || '[]') as StudioPreset[];
    assertEqual(afterCopyPresets.length, 3, 'atomic Save As Copy stores new preset alongside originals');
    assertEqual(
      afterCopyPresets.find((p) => p.id === richPreset.id)?.groups?.[0].id,
      richPreset.groups?.[0].id,
      'original preset group ID remains unchanged in storage after copy',
    );

    // 7. Failed / rejected async preset creation keeps modal open contract intact
    const rejectedByGuard = await submitAsyncPresetCreation(async () => false);
    assertEqual(rejectedByGuard.ok, false, 'returning false reports failure');
    if (!rejectedByGuard.ok) {
      assertEqual(rejectedByGuard.reason, 'blocked', 'false return maps to blocked reason');
      assert(rejectedByGuard.message.length > 0, 'blocked response includes user-facing message');
    }

    const rejectedByThrow = await submitAsyncPresetCreation(async () => {
      throw new Error('IndexedDB transaction aborted');
    });
    assertEqual(rejectedByThrow.ok, false, 'thrown error reports failure');
    if (!rejectedByThrow.ok) {
      assertEqual(rejectedByThrow.reason, 'error', 'thrown error maps to error reason');
      assertEqual(
        rejectedByThrow.message,
        'IndexedDB transaction aborted',
        'thrown error preserves specific failure message',
      );
    }

    // 8. Rapid consecutive element updates do NOT lose metadata or earlier/later fields
    let rapidPresets = [richPreset, blankPreset];
    let rapidElements = [...richPreset.elements];

    for (let step = 1; step <= 12; step += 1) {
      const nextElements = rapidElements.map((el) =>
        el.id.endsWith('_elem_cam')
          ? { ...el, x: step * 2, y: step }
          : el.id.endsWith('_elem_text')
            ? { ...el, opacity: 50 + step }
            : el,
      );
      const result = applyElementsMutationToPresetState({
        presets: rapidPresets,
        activePresetId: richPreset.id,
        newElements: nextElements,
      });
      rapidElements = result.elements;
      rapidPresets = result.presets;
    }

    const finalRapidPreset = rapidPresets.find((p) => p.id === richPreset.id)!;
    assertEqual(finalRapidPreset.elements[0].x, 24, 'rapid burst preserves latest camera x');
    assertEqual(finalRapidPreset.elements[2].opacity, 62, 'rapid burst preserves latest text opacity');
    assertEqual(finalRapidPreset.groups?.length, 1, 'rapid burst preserves Group metadata');
    assertEqual(finalRapidPreset.superGroups?.length, 1, 'rapid burst preserves Supergroup metadata');
    assertEqual(
      (finalRapidPreset.screensaver as StudioScreensaverSettings | undefined)?.text,
      (richPreset.screensaver as StudioScreensaverSettings | undefined)?.text,
      'rapid burst preserves screensaver',
    );
    assertEqual(finalRapidPreset.backgroundUri, richPreset.backgroundUri, 'rapid burst preserves backgroundUri');
    assertEqual(
      rapidPresets.find((p) => p.id === blankPreset.id)?.elements.length,
      0,
      'rapid burst on active preset never mutates other presets',
    );

    // 9. Auto-save debounce (220ms default) + flush + mid-flight update draining
    assertEqual(STUDIO_PERSISTENCE_DEBOUNCE_MS, 220, 'debounce default constant remains 220ms');

    let writeDelayMs = 30;
    const debouncedWrites: number[] = [];
    const debouncedStates: StudioSaveState['status'][] = [];

    const asyncController = createStudioPersistenceController({
      debounceMs: 30,
      onStateChange: (s) => debouncedStates.push(s.status),
      writeSnapshot: async (snapshot) => {
        await waitMs(writeDelayMs);
        debouncedWrites.push(snapshot.elements[0]?.x ?? -1);
      },
    });

    asyncController.schedule({
      elements: [{ ...richPreset.elements[0], x: 11 }],
      presets: [richPreset],
    });
    assertEqual(asyncController.getState().status, 'pending', 'schedule immediately marks pending');

    // Burst before timer fires -> coalesced to latest value (22)
    asyncController.schedule({
      elements: [{ ...richPreset.elements[0], x: 22 }],
      presets: [richPreset],
    });
    assertEqual(debouncedWrites.length, 0, 'does not write before debounce delay elapses');

    await waitMs(80);
    assertEqual(debouncedWrites.length, 1, 'coalesces pre-timer updates into 1 write');
    assertEqual(debouncedWrites[0], 22, 'debounced write persists latest coalesced snapshot');
    assertEqual(asyncController.getState().status, 'saved', 'returns to saved after debounced write completes');

    // Mid-flight write test: start a slow write (x=33), schedule x=44 while x=33 is in-flight,
    // then call flush() — controller MUST wait and drain x=44 so latest state is never lost.
    writeDelayMs = 45;
    asyncController.schedule({
      elements: [{ ...richPreset.elements[0], x: 33 }],
      presets: [richPreset],
    });
    const firstFlushPromise = asyncController.flush();
    await waitMs(10); // now x=33 write is mid-flight
    asyncController.schedule({
      elements: [{ ...richPreset.elements[0], x: 44 }],
      presets: [richPreset],
    });
    const secondFlushResult = await asyncController.flush();
    await firstFlushPromise;

    assertEqual(secondFlushResult.success, true, 'flush after mid-flight edit succeeds');
    assertEqual(
      debouncedWrites[debouncedWrites.length - 1],
      44,
      'latest mid-flight update (44) is drained and persisted on flush',
    );
    assertEqual(asyncController.getState().status, 'saved', 'final status is saved after drain');

    asyncController.dispose();
    saveController.dispose();

    console.log(
      `Studio preset integrity tests passed: ${assertionCount} assertions (Kanvas Kosong, Simpan vs Salinan, ID remapping, Mode B rejection, rapid updates, debounce & flush).`,
    );
  } finally {
    g.indexedDB = originalIndexedDB;
    g.localStorage = originalLocalStorage;
  }
}

runStudioPresetIntegrityTests().catch((error) => {
  console.error(error);
  throw error;
});
