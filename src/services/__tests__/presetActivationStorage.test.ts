// Unit tests for atomic multi-key preset activation storage in StorageService.
// Run in the project environment with: bun run src/services/__tests__/presetActivationStorage.test.ts

import { AppSettings, StudioElement, StudioPreset } from '../../types';
import { DEFAULT_SETTINGS, StorageService } from '../storage';

let assertionCount = 0;

function assert(condition: unknown, message: string): void {
  assertionCount += 1;
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assertionCount += 1;
  if (actual !== expected) {
    throw new Error(`Assertion failed (${message}): expected=${String(expected)} actual=${String(actual)}`);
  }
}

interface FakeIdbOptions {
  committedData: Map<string, unknown>;
  failOpen?: boolean;
  failOnKey?: string;
}

function createFakeIndexedDB(options: FakeIdbOptions) {
  const stats = {
    openAttempts: 0,
    transactionsOpened: 0,
    putCalls: [] as Array<{ key: string; value: unknown }>,
    abortedCount: 0,
    completedCount: 0,
    closedCount: 0,
  };

  const fakeFactory = {
    open(name: string, version?: number) {
      stats.openAttempts += 1;
      assertEqual(name, 'syntxrr_stream_tools_db', 'uses existing database name');
      assertEqual(version, 3, 'preserves DB_VERSION = 3');

      const openReq: {
        result?: unknown;
        error?: Error;
        onsuccess: ((event?: unknown) => void) | null;
        onerror: ((event?: unknown) => void) | null;
        onupgradeneeded: ((event?: unknown) => void) | null;
      } = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

      queueMicrotask(() => {
        if (options.failOpen) {
          openReq.error = new Error('Simulated openDB failure');
          openReq.onerror?.({});
          return;
        }

        const fakeDb = {
          objectStoreNames: { contains: () => true },
          close() {
            stats.closedCount += 1;
          },
          transaction(storeName: string, mode: string) {
            assertEqual(storeName, 'store', 'targets store object store');
            assertEqual(mode, 'readwrite', 'opens readwrite transaction');
            stats.transactionsOpened += 1;

            const staged = new Map<string, unknown>(options.committedData);
            let aborted = false;
            let completed = false;
            let pendingAsync = 0;
            let finalizeScheduled = false;

            const tx: {
              error: Error | null;
              oncomplete: (() => void) | null;
              onerror: (() => void) | null;
              onabort: (() => void) | null;
              abort: () => void;
              objectStore: (requestedStore: string) => {
                put: (value: unknown, key: string) => {
                  result?: unknown;
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
              abort() {
                if (aborted || completed) return;
                aborted = true;
                staged.clear();
                stats.abortedCount += 1;
                if (!tx.error) {
                  tx.error = new Error('Transaction aborted');
                }
                queueMicrotask(() => {
                  tx.onabort?.();
                });
              },
              objectStore(requestedStore: string) {
                assertEqual(requestedStore, 'store', 'writes to store objectStore');
                return {
                  put(value: unknown, key: string) {
                    const req: {
                      result?: unknown;
                      error: Error | null;
                      onsuccess: (() => void) | null;
                      onerror: (() => void) | null;
                    } = {
                      error: null,
                      onsuccess: null,
                      onerror: null,
                    };
                    stats.putCalls.push({ key, value });
                    pendingAsync += 1;

                    const scheduleCompletionCheck = () => {
                      if (finalizeScheduled) return;
                      finalizeScheduled = true;
                      queueMicrotask(() => {
                        finalizeScheduled = false;
                        if (!aborted && !completed && pendingAsync === 0) {
                          completed = true;
                          options.committedData.clear();
                          for (const [stagedKey, stagedVal] of staged.entries()) {
                            options.committedData.set(stagedKey, stagedVal);
                          }
                          stats.completedCount += 1;
                          tx.oncomplete?.();
                        }
                      });
                    };

                    queueMicrotask(() => {
                      pendingAsync -= 1;
                      if (aborted || completed) return;
                      if (options.failOnKey && key === options.failOnKey) {
                        const err = new Error(`Simulated put failure at ${key}`);
                        req.error = err;
                        tx.error = err;
                        req.onerror?.();
                        return;
                      }
                      staged.set(key, value);
                      req.result = key;
                      req.onsuccess?.();
                      scheduleCompletionCheck();
                    });

                    return req;
                  },
                };
              },
            };

            return tx;
          },
        };

        openReq.result = fakeDb;
        openReq.onsuccess?.({});
      });

      return openReq;
    },
  };

  return { fakeFactory, stats };
}

function createFakeLocalStorage(options?: { failOnKey?: string }) {
  const store = new Map<string, string>();
  return {
    store,
    storage: {
      getItem(key: string): string | null {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string): void {
        if (options?.failOnKey && key === options.failOnKey) {
          throw new Error(`Simulated localStorage quota failure on ${key}`);
        }
        store.set(key, value);
      },
      removeItem(key: string): void {
        store.delete(key);
      },
    },
  };
}

function makePreset(id: string, name: string, orientation: '9:16' | '16:9' = '9:16'): StudioPreset {
  const elem: StudioElement = {
    id: `elem_${id}`,
    name: `Element ${name}`,
    type: 'text',
    x: 10,
    y: 10,
    width: 40,
    height: 15,
    layer: 1,
    visible: true,
    locked: false,
    opacity: 100,
    rotation: 0,
    properties: { text: name },
  };
  return {
    id,
    name,
    category: orientation === '16:9' ? 'landscape' : 'hp_screen',
    canvasOrientation: orientation,
    elements: [elem],
    createdAt: 1000,
    isFavorite: false,
    description: `Desc ${name}`,
  };
}

async function runPresetActivationStorageTests(): Promise<void> {
  const g = globalThis as unknown as {
    indexedDB?: unknown;
    localStorage?: unknown;
  };
  const originalIndexedDB = g.indexedDB;
  const originalLocalStorage = g.localStorage;

  try {
    // A. Atomic success
    const committedA = new Map<string, unknown>();
    const fakeA = createFakeIndexedDB({ committedData: committedA });
    const fakeLsA = createFakeLocalStorage();
    g.indexedDB = fakeA.fakeFactory;
    g.localStorage = fakeLsA.storage;

    const oldPreset = makePreset('preset_old', 'Old Preset', '9:16');
    const newPreset = makePreset('preset_new', 'New Preset', '16:9');
    const snapshotSettingsA: AppSettings = {
      ...DEFAULT_SETTINGS,
      canvasOrientation: '16:9',
      streamKey: 'live_abc',
    };

    await StorageService.savePresetActivationAtomically({
      presets: [newPreset, oldPreset],
      activePresetId: 'preset_new',
      studioElements: newPreset.elements,
      settings: snapshotSettingsA,
    });

    assertEqual(fakeA.stats.transactionsOpened, 1, 'uses exactly one readwrite transaction');
    assertEqual(fakeA.stats.completedCount, 1, 'transaction completes once');
    assertEqual(fakeA.stats.closedCount, 1, 'database connection is closed after transaction');
    assertEqual(
      fakeA.stats.putCalls.map((call) => call.key).join(','),
      'studio_presets,active_preset_id,studio_elements,settings',
      'writes all four activation keys inside the single transaction',
    );
    assertEqual((committedA.get('studio_presets') as StudioPreset[]).length, 2, 'committed presets list has both presets');
    assertEqual(committedA.get('active_preset_id'), 'preset_new', 'committed active_preset_id points to new preset');
    assertEqual(
      (committedA.get('studio_elements') as StudioElement[])[0].id,
      newPreset.elements[0].id,
      'committed studio_elements matches new preset elements',
    );
    assertEqual(
      (committedA.get('settings') as AppSettings).canvasOrientation,
      '16:9',
      'committed settings matches snapshot orientation',
    );
    assertEqual(
      JSON.parse(fakeLsA.store.get('syntxrr_active_preset_id') || 'null'),
      'preset_new',
      'mirrors active_preset_id to localStorage after transaction completion',
    );

    // B. Atomic failure on 4th key ("settings") after 3 keys staged
    const committedB = new Map<string, unknown>([
      ['studio_presets', [oldPreset]],
      ['active_preset_id', 'preset_old'],
      ['studio_elements', oldPreset.elements],
      ['settings', { ...DEFAULT_SETTINGS, canvasOrientation: '9:16' }],
    ]);
    const fakeB = createFakeIndexedDB({
      committedData: committedB,
      failOnKey: 'settings',
    });
    const fakeLsB = createFakeLocalStorage();
    fakeLsB.store.set('syntxrr_active_preset_id', JSON.stringify('preset_old'));
    g.indexedDB = fakeB.fakeFactory;
    g.localStorage = fakeLsB.storage;

    let failedAtomically = false;
    try {
      await StorageService.savePresetActivationAtomically({
        presets: [newPreset, oldPreset],
        activePresetId: 'preset_new',
        studioElements: newPreset.elements,
        settings: snapshotSettingsA,
      });
    } catch (error) {
      failedAtomically = error instanceof Error && error.message.includes('settings');
    }

    assert(failedAtomically, 'rejects Promise when put for key "settings" fails');
    assertEqual(fakeB.stats.transactionsOpened, 1, 'does not retry or split into separate IDB writes on abort');
    assertEqual(fakeB.stats.abortedCount, 1, 'aborts the single transaction when a write fails');
    assertEqual(fakeB.stats.completedCount, 0, 'aborted transaction never completes');
    assertEqual(fakeB.stats.closedCount, 1, 'closes DB in finally even on transaction abort');
    assertEqual((committedB.get('studio_presets') as StudioPreset[]).length, 1, 'studio_presets stays intact on abort');
    assertEqual(committedB.get('active_preset_id'), 'preset_old', 'active_preset_id stays intact on abort');
    assertEqual(
      (committedB.get('studio_elements') as StudioElement[])[0].id,
      oldPreset.elements[0].id,
      'studio_elements stays intact on abort',
    );
    assertEqual(
      (committedB.get('settings') as AppSettings).canvasOrientation,
      '9:16',
      'settings stays intact on abort',
    );
    assertEqual(
      JSON.parse(fakeLsB.store.get('syntxrr_active_preset_id') || 'null'),
      'preset_old',
      'does not write localStorage mirror when IndexedDB transaction aborts',
    );

    // C. Input validation rejects BEFORE touching DB
    const committedC = new Map<string, unknown>([['active_preset_id', 'preset_old']]);
    const fakeC = createFakeIndexedDB({ committedData: committedC });
    g.indexedDB = fakeC.fakeFactory;

    let missingActiveRejected = false;
    try {
      await StorageService.savePresetActivationAtomically({
        presets: [oldPreset],
        activePresetId: 'preset_missing',
        studioElements: oldPreset.elements,
        settings: DEFAULT_SETTINGS,
      });
    } catch (error) {
      missingActiveRejected = error instanceof Error && error.message.includes('tidak ditemukan');
    }
    assert(missingActiveRejected, 'rejects when activePresetId is missing from presets');
    assertEqual(fakeC.stats.openAttempts, 0, 'invalid activePresetId never opens IndexedDB');

    let emptyPresetsRejected = false;
    try {
      await StorageService.savePresetActivationAtomically({
        presets: [],
        activePresetId: 'preset_old',
        studioElements: [],
        settings: DEFAULT_SETTINGS,
      });
    } catch {
      emptyPresetsRejected = true;
    }
    assert(emptyPresetsRejected, 'rejects empty presets array before DB access');
    assertEqual(fakeC.stats.openAttempts, 0, 'empty presets never opens IndexedDB');
    assertEqual(committedC.get('active_preset_id'), 'preset_old', 'invalid input leaves database untouched');

    // D. localStorage fallback rollback when openDB() itself fails before transaction
    const fakeD = createFakeIndexedDB({ committedData: new Map(), failOpen: true });
    const fakeLsD = createFakeLocalStorage({ failOnKey: 'syntxrr_settings' });
    fakeLsD.store.set('syntxrr_studio_presets', JSON.stringify([oldPreset]));
    fakeLsD.store.set('syntxrr_active_preset_id', JSON.stringify('preset_old'));
    fakeLsD.store.set('syntxrr_studio_elements', JSON.stringify(oldPreset.elements));
    fakeLsD.store.set('syntxrr_settings', JSON.stringify({ ...DEFAULT_SETTINGS, canvasOrientation: '9:16' }));
    g.indexedDB = fakeD.fakeFactory;
    g.localStorage = fakeLsD.storage;

    let fallbackRollbackTriggered = false;
    try {
      await StorageService.savePresetActivationAtomically({
        presets: [newPreset, oldPreset],
        activePresetId: 'preset_new',
        studioElements: newPreset.elements,
        settings: snapshotSettingsA,
      });
    } catch {
      fallbackRollbackTriggered = true;
    }
    assert(fallbackRollbackTriggered, 'throws when localStorage fallback fails mid-write');
    assertEqual(
      JSON.parse(fakeLsD.store.get('syntxrr_active_preset_id') || 'null'),
      'preset_old',
      'localStorage fallback restores previous snapshot on partial write error',
    );
    assertEqual(
      JSON.parse(fakeLsD.store.get('syntxrr_studio_presets') || '[]').length,
      1,
      'localStorage fallback restores studio_presets snapshot on partial write error',
    );

    // E. A2.9.1 Atomic Studio Autosave Snapshot (studio_presets + studio_elements only)
    // E1. Success in single readwrite transaction without touching active_preset_id or settings
    const committedE1 = new Map<string, unknown>([
      ['active_preset_id', 'preset_old'],
      ['settings', { ...DEFAULT_SETTINGS, streamKey: 'keep_stream_key' }],
    ]);
    const fakeE1 = createFakeIndexedDB({ committedData: committedE1 });
    const fakeLsE1 = createFakeLocalStorage();
    fakeLsE1.store.set('syntxrr_active_preset_id', JSON.stringify('preset_old'));
    g.indexedDB = fakeE1.fakeFactory;
    g.localStorage = fakeLsE1.storage;

    const snapPresetInput = makePreset('preset_auto', 'Autosave Preset', '9:16');
    const dupElemA: StudioElement = {
      ...snapPresetInput.elements[0],
      id: 'dup_el',
      x: 15,
      y: 25,
      properties: { text: 'First Dup' },
    };
    const dupElemB: StudioElement = {
      ...snapPresetInput.elements[0],
      id: 'dup_el',
      x: 50,
      y: 60,
      properties: { text: 'Second Dup' },
    };
    const sourceElementsSnapshot: StudioElement[] = [dupElemA, dupElemB];
    const sourcePresetsSnapshot: StudioPreset[] = [
      {
        ...snapPresetInput,
        elements: [dupElemA, dupElemB],
      },
      oldPreset,
    ];

    await StorageService.saveStudioSnapshotAtomically({
      presets: sourcePresetsSnapshot,
      studioElements: sourceElementsSnapshot,
    });

    assertEqual(fakeE1.stats.transactionsOpened, 1, 'autosave opens exactly one readwrite transaction');
    assertEqual(fakeE1.stats.completedCount, 1, 'autosave transaction completes once');
    assertEqual(fakeE1.stats.closedCount, 1, 'autosave closes DB after transaction');
    assertEqual(
      fakeE1.stats.putCalls.map((call) => call.key).join(','),
      'studio_presets,studio_elements',
      'autosave writes only studio_presets and studio_elements inside the single transaction',
    );
    assertEqual(committedE1.get('active_preset_id'), 'preset_old', 'autosave preserves active_preset_id');
    assertEqual(
      (committedE1.get('settings') as AppSettings).streamKey,
      'keep_stream_key',
      'autosave preserves settings',
    );
    const savedAutoPresets = committedE1.get('studio_presets') as StudioPreset[];
    const savedAutoElements = committedE1.get('studio_elements') as StudioElement[];
    assertEqual(savedAutoPresets.length, 2, 'autosave commits both presets');
    assertEqual(savedAutoElements.length, 2, 'autosave keeps distinct non-identical elements');
    assert(
      savedAutoElements[0].id !== savedAutoElements[1].id,
      'autosave sanitizes duplicate element IDs cleanly',
    );
    assert(
      savedAutoPresets[0].elements[0].id !== savedAutoPresets[0].elements[1].id,
      'autosave sanitizes duplicate element IDs inside presets',
    );
    // Source non-mutation checks
    assertEqual(dupElemA.id, 'dup_el', 'source element A id is not mutated');
    assertEqual(dupElemB.id, 'dup_el', 'source element B id is not mutated');
    assertEqual(sourceElementsSnapshot[1].id, 'dup_el', 'source elements array is not mutated');
    assertEqual(sourcePresetsSnapshot[0].elements[1].id, 'dup_el', 'source preset elements array is not mutated');

    // E2. Failure on second key ("studio_elements") aborts transaction & leaves old data intact
    const committedE2 = new Map<string, unknown>([
      ['studio_presets', [oldPreset]],
      ['studio_elements', oldPreset.elements],
      ['active_preset_id', 'preset_old'],
      ['settings', { ...DEFAULT_SETTINGS, streamKey: 'keep_stream_key' }],
    ]);
    const fakeE2 = createFakeIndexedDB({
      committedData: committedE2,
      failOnKey: 'studio_elements',
    });
    const fakeLsE2 = createFakeLocalStorage();
    fakeLsE2.store.set('syntxrr_studio_presets', JSON.stringify([oldPreset]));
    fakeLsE2.store.set('syntxrr_studio_elements', JSON.stringify(oldPreset.elements));
    g.indexedDB = fakeE2.fakeFactory;
    g.localStorage = fakeLsE2.storage;

    let autosaveAborted = false;
    try {
      await StorageService.saveStudioSnapshotAtomically({
        presets: [newPreset, oldPreset],
        studioElements: newPreset.elements,
      });
    } catch (error) {
      autosaveAborted = error instanceof Error && error.message.includes('studio_elements');
    }
    assert(autosaveAborted, 'autosave rejects when put for studio_elements fails');
    assertEqual(fakeE2.stats.transactionsOpened, 1, 'aborted autosave uses only one transaction');
    assertEqual(fakeE2.stats.abortedCount, 1, 'aborted autosave triggers tx.abort()');
    assertEqual(fakeE2.stats.completedCount, 0, 'aborted autosave never completes');
    assertEqual(fakeE2.stats.closedCount, 1, 'aborted autosave still closes DB');
    assertEqual(
      (committedE2.get('studio_presets') as StudioPreset[]).length,
      1,
      'old studio_presets stays intact after abort',
    );
    assertEqual(
      (committedE2.get('studio_elements') as StudioElement[])[0].id,
      oldPreset.elements[0].id,
      'old studio_elements stays intact after abort',
    );
    assertEqual(
      JSON.parse(fakeLsE2.store.get('syntxrr_studio_presets') || '[]').length,
      1,
      'localStorage studio_presets untouched on IDB abort',
    );

    // E3. Fallback localStorage succeeds when IndexedDB fails to open
    const fakeE3 = createFakeIndexedDB({ committedData: new Map(), failOpen: true });
    const fakeLsE3 = createFakeLocalStorage();
    fakeLsE3.store.set('syntxrr_active_preset_id', JSON.stringify('preset_old'));
    g.indexedDB = fakeE3.fakeFactory;
    g.localStorage = fakeLsE3.storage;

    await StorageService.saveStudioSnapshotAtomically({
      presets: [newPreset, oldPreset],
      studioElements: newPreset.elements,
    });
    assertEqual(
      JSON.parse(fakeLsE3.store.get('syntxrr_studio_presets') || '[]').length,
      2,
      'fallback localStorage saves studio_presets when openDB fails',
    );
    assertEqual(
      JSON.parse(fakeLsE3.store.get('syntxrr_studio_elements') || '[]')[0].id,
      newPreset.elements[0].id,
      'fallback localStorage saves studio_elements when openDB fails',
    );
    assertEqual(
      JSON.parse(fakeLsE3.store.get('syntxrr_active_preset_id') || 'null'),
      'preset_old',
      'fallback localStorage does not modify active_preset_id',
    );

    // E4. Fallback localStorage rollback restores both keys on partial write failure
    const fakeE4 = createFakeIndexedDB({ committedData: new Map(), failOpen: true });
    const fakeLsE4 = createFakeLocalStorage({ failOnKey: 'syntxrr_studio_elements' });
    fakeLsE4.store.set('syntxrr_studio_presets', JSON.stringify([oldPreset]));
    fakeLsE4.store.set('syntxrr_studio_elements', JSON.stringify(oldPreset.elements));
    g.indexedDB = fakeE4.fakeFactory;
    g.localStorage = fakeLsE4.storage;

    let fallbackAutosaveFailed = false;
    try {
      await StorageService.saveStudioSnapshotAtomically({
        presets: [newPreset, oldPreset],
        studioElements: newPreset.elements,
      });
    } catch {
      fallbackAutosaveFailed = true;
    }
    assert(fallbackAutosaveFailed, 'autosave fallback throws when second key write fails');
    assertEqual(
      JSON.parse(fakeLsE4.store.get('syntxrr_studio_presets') || '[]').length,
      1,
      'autosave fallback rollback restores previous studio_presets',
    );
    assertEqual(
      JSON.parse(fakeLsE4.store.get('syntxrr_studio_elements') || '[]')[0].id,
      oldPreset.elements[0].id,
      'autosave fallback rollback keeps previous studio_elements intact',
    );

    // E5. Invalid inputs rejected BEFORE opening IndexedDB
    const committedE5 = new Map<string, unknown>([['studio_presets', [oldPreset]]]);
    const fakeE5 = createFakeIndexedDB({ committedData: committedE5 });
    g.indexedDB = fakeE5.fakeFactory;

    for (const invalidCase of [
      { presets: [], studioElements: oldPreset.elements },
      { presets: [oldPreset], studioElements: 'bad' as unknown as StudioElement[] },
      { presets: [oldPreset], studioElements: [null as unknown as StudioElement] },
      { presets: [oldPreset, oldPreset], studioElements: oldPreset.elements },
      { presets: [{ ...oldPreset, elements: null as unknown as StudioElement[] }], studioElements: [] },
    ]) {
      let rejected = false;
      try {
        await StorageService.saveStudioSnapshotAtomically(invalidCase);
      } catch {
        rejected = true;
      }
      assert(rejected, 'invalid autosave snapshot input is rejected');
    }
    assertEqual(fakeE5.stats.openAttempts, 0, 'invalid autosave snapshot never opens IndexedDB');
    assertEqual(
      (committedE5.get('studio_presets') as StudioPreset[]).length,
      1,
      'database remains untouched after invalid autosave rejection',
    );

    console.log(`Preset activation storage tests passed: ${assertionCount} assertions (atomic commit, abort rollback, input validation, fallback rollback, and A2.9.1 atomic autosave).`);
  } finally {
    g.indexedDB = originalIndexedDB;
    g.localStorage = originalLocalStorage;
  }
}

runPresetActivationStorageTests().catch((error) => {
  console.error(error);
  throw error;
});
