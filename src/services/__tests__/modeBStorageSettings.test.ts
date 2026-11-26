import {
  CREDENTIAL_SETTING_KEYS,
  DEFAULT_SETTINGS,
  STUDIO_MEDIA_URI_PREFIX,
  StorageService,
  createStudioMediaAssetUri,
  getStudioMediaAssetIdFromUri,
  mergeBackupSettings,
  normalizeModeBAudioSource,
  omitCredentials,
} from '../storage';
import {
  __resetNativeStreamingBridgeForTests,
  __setNativeStreamingBridgeTestAdapter,
  createModeBOverlaySnapshot,
  prepareModeBOverlayAssets,
  type NativeStreamingPluginInterface,
} from '../nativeStreamingBridge';

let assertionCount = 0;

function assert(condition: unknown, message: string): void {
  assertionCount += 1;
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assertionCount += 1;
  if (actual !== expected) {
    throw new Error(
      `Assertion failed (${message}): expected=${String(expected)} actual=${String(actual)}`,
    );
  }
}

function createInMemoryIndexedDB(): IDBFactory {
  const stores = new Map<string, Map<string, unknown>>();

  const makeRequest = <T>(executor: () => T): IDBRequest<T> => {
    const req: Record<string, unknown> = {
      onsuccess: null,
      onerror: null,
      result: undefined,
      error: null,
    };
    queueMicrotask(() => {
      try {
        req.result = executor();
        if (typeof req.onsuccess === 'function') {
          (req.onsuccess as (ev: unknown) => void)({ target: req });
        }
      } catch (err) {
        req.error = err;
        if (typeof req.onerror === 'function') {
          (req.onerror as (ev: unknown) => void)({ target: req });
        }
      }
    });
    return req as unknown as IDBRequest<T>;
  };

  return {
    open(name: string) {
      const req: Record<string, unknown> = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: null,
        error: null,
      };
      if (!stores.has(name)) {
        stores.set(name, new Map());
      }
      const dbMap = stores.get(name)!;
      const storeNames = new Set<string>(['store']);
      const db = {
        objectStoreNames: {
          contains: (storeName: string) => storeNames.has(storeName),
        },
        createObjectStore: (storeName: string) => {
          storeNames.add(storeName);
        },
        close: () => {},
        transaction: () => {
          const txObj: Record<string, unknown> = {
            error: null,
            oncomplete: null,
            onerror: null,
            onabort: null,
          };
          let pending = 0;
          const scheduleCompleteCheck = () => {
            queueMicrotask(() => {
              if (pending === 0 && typeof txObj.oncomplete === 'function') {
                (txObj.oncomplete as (ev: unknown) => void)({ target: txObj });
              }
            });
          };
          const trackRequest = <T>(executor: () => T): IDBRequest<T> => {
            pending += 1;
            const req: Record<string, unknown> = {
              onsuccess: null,
              onerror: null,
              result: undefined,
              error: null,
            };
            queueMicrotask(() => {
              try {
                req.result = executor();
                if (typeof req.onsuccess === 'function') {
                  (req.onsuccess as (ev: unknown) => void)({ target: req });
                }
                pending -= 1;
                scheduleCompleteCheck();
              } catch (err) {
                req.error = err;
                txObj.error = err;
                if (typeof req.onerror === 'function') {
                  (req.onerror as (ev: unknown) => void)({ target: req });
                }
                pending -= 1;
                if (typeof txObj.onerror === 'function') {
                  (txObj.onerror as (ev: unknown) => void)({ target: txObj });
                }
              }
            });
            return req as unknown as IDBRequest<T>;
          };
          txObj.objectStore = () => ({
            get: (key: string) => trackRequest(() => dbMap.get(key) ?? null),
            put: (value: unknown, key: string) =>
              trackRequest(() => {
                dbMap.set(key, value);
                return key;
              }),
            delete: (key: string) =>
              trackRequest(() => {
                dbMap.delete(key);
                return undefined;
              }),
          });
          return txObj;
        },
      };

      queueMicrotask(() => {
        req.result = db;
        if (typeof req.onupgradeneeded === 'function') {
          (req.onupgradeneeded as (ev: unknown) => void)({ target: req });
        }
        if (typeof req.onsuccess === 'function') {
          (req.onsuccess as (ev: unknown) => void)({ target: req });
        }
      });

      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

async function runTests(): Promise<void> {
  // 1. DEFAULT_SETTINGS checks: no hardcoded demo streamKey, safe Mode B defaults
  assertEqual(DEFAULT_SETTINGS.streamKey, '', 'DEFAULT_SETTINGS.streamKey must be empty');
  assertEqual(DEFAULT_SETTINGS.modeBAudioSource, 'mix', 'DEFAULT_SETTINGS.modeBAudioSource defaults to mix');
  assert(
    !String(DEFAULT_SETTINGS.streamKey).toLowerCase().includes('demo'),
    'DEFAULT_SETTINGS.streamKey must not contain a demo key',
  );
  assert(
    CREDENTIAL_SETTING_KEYS.includes('streamKey'),
    'streamKey remains protected in CREDENTIAL_SETTING_KEYS',
  );

  // 2. normalizeModeBAudioSource & URI helpers
  assertEqual(normalizeModeBAudioSource('internal'), 'internal', 'keeps valid internal audio source');
  assertEqual(normalizeModeBAudioSource('microphone'), 'microphone', 'keeps valid microphone audio source');
  assertEqual(normalizeModeBAudioSource('invalid_value'), 'mix', 'invalid audio source falls back to mix');
  assertEqual(
    createStudioMediaAssetUri('img_123-abc'),
    `${STUDIO_MEDIA_URI_PREFIX}img_123-abc`,
    'createStudioMediaAssetUri builds studio-media URI',
  );
  assertEqual(
    createStudioMediaAssetUri('../escape'),
    undefined,
    'createStudioMediaAssetUri rejects unsafe path traversal IDs',
  );
  assertEqual(
    getStudioMediaAssetIdFromUri('studio-media://vid_asset_01'),
    'vid_asset_01',
    'getStudioMediaAssetIdFromUri parses valid URI',
  );
  assertEqual(
    getStudioMediaAssetIdFromUri('https://example.com/a.png'),
    undefined,
    'getStudioMediaAssetIdFromUri ignores non-studio-media URLs',
  );

  // 3. Credentials preservation & backup compatibility
  const localWithSecret = {
    ...DEFAULT_SETTINGS,
    streamKey: 'live_user_secret_999',
    modeBAudioSource: 'internal' as const,
  };
  const exported = omitCredentials(localWithSecret);
  assert(!('streamKey' in exported), 'omitCredentials removes streamKey from backups');

  const restored = mergeBackupSettings(
    {
      rtmpServer: 'rtmps://live-api-s.facebook.com:443/rtmp/',
      streamKey: 'attacker_injected_key',
      modeBAudioSource: 'microphone',
    },
    localWithSecret,
  );
  assertEqual(restored.streamKey, 'live_user_secret_999', 'mergeBackupSettings preserves local streamKey');
  assertEqual(restored.modeBAudioSource, 'microphone', 'mergeBackupSettings restores valid modeBAudioSource');

  // Install in-memory IndexedDB for end-to-end StorageService tests
  const prevIndexedDb = (globalThis as Record<string, unknown>).indexedDB;
  (globalThis as Record<string, unknown>).indexedDB = createInMemoryIndexedDB();

  try {
    // Legacy settings without modeBAudioSource + with existing user streamKey stay intact
    await StorageService.saveSettings({
      ...DEFAULT_SETTINGS,
      streamKey: 'existing_user_key_preserved',
      modeBAudioSource: undefined,
    });
    const loadedSettings = await StorageService.getSettings();
    assertEqual(loadedSettings.streamKey, 'existing_user_key_preserved', 'stored streamKey is preserved');
    assertEqual(loadedSettings.modeBAudioSource, 'mix', 'missing modeBAudioSource normalizes to mix');

    // 4. Studio media assets CRUD & getStudioMediaAssetsByIds guarantees
    assertEqual(
      (await StorageService.getStudioMediaAssetsByIds([])).length,
      0,
      'getStudioMediaAssetsByIds returns [] for empty input',
    );

    const imgAsset = await StorageService.saveStudioMediaAsset({
      id: 'img_badge_01',
      name: 'logo.png',
      type: 'image',
      mimeType: 'image/png',
      blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
    });
    const vidAsset = await StorageService.saveStudioMediaAsset({
      id: 'vid_loop_01',
      name: 'intro.mp4',
      type: 'video',
      mimeType: 'video/mp4',
      blob: new Blob([new Uint8Array([0, 0, 0, 24])], { type: 'video/mp4' }),
    });

    const ordered = await StorageService.getStudioMediaAssetsByIds([
      'vid_loop_01',
      'img_badge_01',
      'vid_loop_01',
      '../invalid',
      'missing_asset',
    ]);
    assertEqual(ordered.length, 2, 'getStudioMediaAssetsByIds deduplicates and skips invalid/missing IDs');
    assertEqual(ordered[0]?.id, 'vid_loop_01', 'getStudioMediaAssetsByIds preserves requested order (0)');
    assertEqual(ordered[1]?.id, 'img_badge_01', 'getStudioMediaAssetsByIds preserves requested order (1)');
    assertEqual(imgAsset.mimeType, 'image/png', 'saved image metadata records MIME type');
    assertEqual(vidAsset.mimeType, 'video/mp4', 'saved video metadata records MIME type');

    // 5. Integration check with prepareModeBOverlayAssets via StorageService.getStudioMediaAssetsByIds
    const uploadedAssets: Array<{ id: string; assetNamespace?: string }> = [];
    const mockPlugin = {
      async clearOverlayAssets() {
        return { success: true };
      },
      async clearOverlayAssetNamespace() {
        return { success: true };
      },
      async uploadOverlayAsset(options: { id: string; assetNamespace?: string }) {
        uploadedAssets.push(options);
        return { success: true, bytes: 4 };
      },
      async startStream() {
        return { success: true, status: 'starting' };
      },
      async stopStream() {
        return { success: true, status: 'stopping' };
      },
      async requestScreenReshare() {
        return { success: true, status: 'resharing' };
      },
      async setHostWait() {
        return { success: true, status: 'host_wait' };
      },
      async replaceLiveScene() {
        return { success: true, status: 'live' };
      },
      async pushOverlayEvent() {
        return { accepted: true };
      },
      async getStatus() {
        return { status: 'idle', message: 'Siap', isStreaming: false, bitrateKbps: 0 };
      },
      async addListener() {
        return { remove: async () => {} };
      },
    } as unknown as NativeStreamingPluginInterface;

    __setNativeStreamingBridgeTestAdapter({
      isNativeAvailable: true,
      plugin: mockPlugin,
    });

    const snapshot = createModeBOverlaySnapshot([
      {
        id: 'el_logo',
        name: 'Logo',
        type: 'image',
        x: 5,
        y: 5,
        width: 20,
        height: 10,
        layer: 1,
        visible: true,
        opacity: 100,
        rotation: 0,
        properties: {
          imageAssetId: 'img_badge_01',
        },
      },
    ]);

    const prepared = await prepareModeBOverlayAssets(snapshot, undefined, {
      resolveAssets: (ids) => StorageService.getStudioMediaAssetsByIds(ids),
    });
    assert(Boolean(prepared.sceneAssetNamespace), 'prepareModeBOverlayAssets returns sceneAssetNamespace');
    assertEqual(uploadedAssets.length, 1, 'uploadOverlayAsset invoked once for referenced Studio image');
    assertEqual(uploadedAssets[0]?.id, 'img_badge_01', 'uploaded asset id matches saved Studio media ID');

    await StorageService.deleteStudioMediaAsset('img_badge_01');
    const afterDelete = await StorageService.getStudioMediaAssetsByIds(['img_badge_01', 'vid_loop_01']);
    assertEqual(afterDelete.length, 1, 'deleteStudioMediaAsset removes deleted asset cleanly');
    assertEqual(afterDelete[0]?.id, 'vid_loop_01', 'remaining asset intact after single deletion');
  } finally {
    __resetNativeStreamingBridgeForTests();
    if (prevIndexedDb === undefined) {
      delete (globalThis as Record<string, unknown>).indexedDB;
    } else {
      (globalThis as Record<string, unknown>).indexedDB = prevIndexedDb;
    }
  }

  console.log(`modeBStorageSettings.test.ts PASSED (${assertionCount} assertions)`);
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
