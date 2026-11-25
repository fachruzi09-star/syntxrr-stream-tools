// Regression tests for A2.10.1: Audio local asset persistence & restoration.
// Run in the project environment with: bun run src/services/__tests__/studioAudioPersistence.test.ts

import { StudioElement, StudioPreset } from '../../types';
import { StorageService } from '../storage';
import {
  DEFAULT_MANUAL_AUDIO_URL,
  MAX_LOCAL_AUDIO_FILE_BYTES,
  buildClearLocalAudioPatch,
  persistLocalAudioFileForElement,
  playManualAudioElement,
  resolveManualAudioPlaybackSource,
  type AudioEnginePlaybackLike,
} from '../studioElementRenderModel';

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

interface FakeMediaIdbOptions {
  data: Map<string, unknown>;
  failOpen?: boolean;
  failPutKeyPrefixes?: string[];
}

function createFakeMediaIndexedDB(options: FakeMediaIdbOptions) {
  const stats = {
    getCalls: [] as string[],
    putCalls: [] as Array<{ key: string; value: unknown }>,
    deleteCalls: [] as string[],
  };

  const fakeFactory = {
    open(name: string, version?: number) {
      assertEqual(name, 'syntxrr_stream_tools_db', 'uses SYNTXRR IndexedDB database');
      assertEqual(version, 3, 'uses DB_VERSION = 3');

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
          openReq.error = new Error('Simulated IndexedDB open failure');
          openReq.onerror?.({});
          return;
        }

        const fakeDb = {
          objectStoreNames: { contains: () => true },
          close() {},
          transaction(storeName: string, _mode: string) {
            assertEqual(storeName, 'store', 'targets store objectStore');
            return {
              objectStore(requestedStore: string) {
                assertEqual(requestedStore, 'store', 'uses store objectStore');
                return {
                  get(key: string) {
                    stats.getCalls.push(key);
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
                    queueMicrotask(() => {
                      req.result = options.data.get(key) ?? null;
                      req.onsuccess?.();
                    });
                    return req;
                  },
                  put(value: unknown, key: string) {
                    stats.putCalls.push({ key, value });
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
                    queueMicrotask(() => {
                      const shouldFail = (options.failPutKeyPrefixes ?? []).some((prefix) =>
                        key.startsWith(prefix),
                      );
                      if (shouldFail) {
                        req.error = new Error(`Simulated IndexedDB quota/write error on ${key}`);
                        req.onerror?.();
                        return;
                      }
                      options.data.set(key, value);
                      req.result = key;
                      req.onsuccess?.();
                    });
                    return req;
                  },
                  delete(key: string) {
                    stats.deleteCalls.push(key);
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
                    queueMicrotask(() => {
                      options.data.delete(key);
                      req.onsuccess?.();
                    });
                    return req;
                  },
                };
              },
            };
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

function makeAudioElement(
  id: string,
  properties: Record<string, unknown> = {},
): StudioElement {
  return {
    id,
    name: 'Audio Latar Belakang',
    type: 'audio',
    x: 10,
    y: 75,
    width: 25,
    height: 8,
    layer: 1,
    visible: true,
    locked: false,
    opacity: 100,
    rotation: 0,
    properties: {
      title: 'Audio Latar Belakang',
      volume: 85,
      channel: 'bgm',
      loop: true,
      audioUrl: DEFAULT_MANUAL_AUDIO_URL,
      ...properties,
    },
  };
}

function createMockAudioEngine(options?: { failLocalPlayback?: boolean }) {
  const calls: Array<{
    method: 'pause' | 'play' | 'setVolume' | 'setLoop' | 'loadAndPlayFile' | 'loadAndPlayUrl';
    args: unknown[];
  }> = [];
  let state = {
    currentTrackId: null as string | null,
    currentTime: 0,
    error: null as string | null,
  };

  const engine: AudioEnginePlaybackLike = {
    getState: () => ({ ...state }),
    pause() {
      calls.push({ method: 'pause', args: [] });
    },
    async play() {
      calls.push({ method: 'play', args: [] });
    },
    setVolume(vol: number) {
      calls.push({ method: 'setVolume', args: [vol] });
    },
    setLoop(loop: boolean) {
      calls.push({ method: 'setLoop', args: [loop] });
    },
    async loadAndPlayFile(id: string, title: string, artist: string, file: File) {
      calls.push({ method: 'loadAndPlayFile', args: [id, title, artist, file] });
      state.currentTrackId = id;
      state.currentTime = 0;
      if (options?.failLocalPlayback) {
        state.error = 'Simulated decode error';
        return false;
      }
      state.error = null;
      return true;
    },
    async loadAndPlayUrl(id: string, title: string, artist: string, url: string) {
      calls.push({ method: 'loadAndPlayUrl', args: [id, title, artist, url] });
      state.currentTrackId = id;
      state.currentTime = 0;
      state.error = null;
      return true;
    },
  };

  return { engine, calls, setState: (next: typeof state) => { state = next; } };
}

async function runStudioAudioPersistenceTests(): Promise<void> {
  const globalRecord = globalThis as unknown as { indexedDB?: unknown };
  const originalIndexedDB = globalRecord.indexedDB;

  try {
    // 1. Audio file saved as Blob with type: 'audio' & complete metadata (no Blob/base64 in element JSON)
    const idbData = new Map<string, unknown>();
    // Seed an unrelated image & video asset to verify restoration doesn't load all media assets
    const unrelatedImageBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    const unrelatedVideoBlob = new Blob([new Uint8Array([5, 6, 7, 8])], { type: 'video/mp4' });
    idbData.set('studio_media_asset:img_unrelated_1', unrelatedImageBlob);
    idbData.set('studio_media_asset:vid_unrelated_1', unrelatedVideoBlob);
    idbData.set('studio_media_assets_index', [
      {
        id: 'img_unrelated_1',
        name: 'banner.png',
        type: 'image',
        mimeType: 'image/png',
        sizeBytes: unrelatedImageBlob.size,
        addedAt: 500,
      },
      {
        id: 'vid_unrelated_1',
        name: 'intro.mp4',
        type: 'video',
        mimeType: 'video/mp4',
        sizeBytes: unrelatedVideoBlob.size,
        addedAt: 600,
      },
    ]);

    const fakeIdb = createFakeMediaIndexedDB({ data: idbData });
    globalRecord.indexedDB = fakeIdb.fakeFactory;

    const audioElem = makeAudioElement('elem_audio_1');
    const otherElem = makeAudioElement('elem_audio_other', {
      title: 'Other Audio Element',
      audioSourceType: 'url',
      audioUrl: 'https://cdn.example.com/other.ogg',
    });
    const otherPreset: StudioPreset = {
      id: 'preset_other',
      name: 'Other Preset',
      category: 'hp_screen',
      canvasOrientation: '9:16',
      elements: [otherElem],
      createdAt: 1000,
      isFavorite: false,
      description: 'Other preset isolation fixture',
    };
    const otherElemSnapshotBefore = JSON.stringify(otherElem);
    const otherPresetSnapshotBefore = JSON.stringify(otherPreset);

    const mp3Bytes = new Uint8Array([73, 68, 51, 3, 0, 0, 0, 0, 0, 12]);
    const localFile = new File([mp3Bytes], 'lofi-stream-bgm.mp3', { type: 'audio/mpeg' });

    const persistResult = await persistLocalAudioFileForElement({
      element: audioElem,
      file: localFile,
      isElementGroupLocked: false,
      isStrictModeBLocked: false,
      saveStudioMediaAsset: (input) => StorageService.saveStudioMediaAsset(input),
    });

    assertEqual(persistResult.saved, true, '1a: local audio file saves cleanly');
    if (!persistResult.saved) {
      throw new Error('Expected persistResult.saved to be true');
    }
    const savedAssetId = persistResult.assetId;
    assert(savedAssetId.startsWith('aud_'), '1b: saved asset ID uses audio prefix');

    const persistedBlob = idbData.get(`studio_media_asset:${savedAssetId}`);
    assert(persistedBlob instanceof Blob, '1c: IndexedDB stores real Blob for audio asset');
    assertEqual((persistedBlob as Blob).size, localFile.size, '1d: stored Blob keeps exact byte size');

    const storedIndex = idbData.get('studio_media_assets_index') as Array<{
      id: string;
      name: string;
      type: string;
      mimeType: string;
      sizeBytes: number;
    }>;
    const savedIndexEntry = storedIndex.find((entry) => entry.id === savedAssetId);
    assert(Boolean(savedIndexEntry), '1e: media index records saved audio metadata');
    assertEqual(savedIndexEntry?.type, 'audio', '1f: media metadata uses type="audio"');
    assertEqual(savedIndexEntry?.name, 'lofi-stream-bgm.mp3', '1g: media metadata stores filename');
    assertEqual(savedIndexEntry?.mimeType, 'audio/mpeg', '1h: media metadata stores MIME type');
    assertEqual(savedIndexEntry?.sizeBytes, localFile.size, '1i: media metadata stores byte size');

    assertEqual(persistResult.patch.audioAssetId, savedAssetId, '1j: element patch stores audioAssetId');
    assertEqual(persistResult.patch.localFileName, 'lofi-stream-bgm.mp3', '1k: element patch stores localFileName');
    assertEqual(persistResult.patch.localFileSize, localFile.size, '1l: element patch stores localFileSize');
    assertEqual(persistResult.patch.audioSourceType, 'local', '1m: element patch sets audioSourceType=local');
    assertEqual(persistResult.patch.title, 'lofi-stream-bgm', '1n: default catalog title updates cleanly');
    const serializedPatch = JSON.stringify(persistResult.patch);
    assert(!serializedPatch.includes('data:'), '1o: element JSON does not store base64 data URI');

    // Simulate closing and reopening Studio (fresh session with empty in-memory cache)
    const reopenedAudioElem: StudioElement = {
      ...audioElem,
      properties: {
        ...audioElem.properties,
        ...persistResult.patch,
      },
    };
    const emptySessionCache = new Map<string, { assetId: string; file: File }>();

    // 2 & 3. Restore Blob by audioAssetId ONLY (without loading unrelated media blobs) and play via loadAndPlayFile
    fakeIdb.stats.getCalls.length = 0;
    const mockEngine1 = createMockAudioEngine();
    let isTesting = false;
    const missingNotices1: Array<{ title: string; message: string }> = [];

    const playLocalRes = await playManualAudioElement({
      element: reopenedAudioElem,
      isTestingAudio: isTesting,
      audioEngine: mockEngine1.engine,
      setIsTestingAudio: (val) => { isTesting = val; },
      getCachedFile: (elemId, assetId) => {
        const entry = emptySessionCache.get(elemId);
        return entry && entry.assetId === assetId ? entry.file : undefined;
      },
      loadAudioAssetsByIds: (ids) => StorageService.getStudioMediaAssetsForPresetTransfer(ids),
      onRestoredLocalFile: (elemId, assetId, restoredFile) => {
        emptySessionCache.set(elemId, { assetId, file: restoredFile });
      },
      onMissingLocalAsset: (notice) => missingNotices1.push(notice),
    });

    assertEqual(playLocalRes.action, 'played_local', '2/3a: reopened local audio element plays via local file path');
    assertEqual(playLocalRes.success, true, '2/3b: restored File playback succeeds');
    assertEqual(isTesting, true, '2/3c: isTestingAudio updates to true');
    assertEqual(missingNotices1.length, 0, '2/3d: no missing-asset warning emitted');

    assert(
      !fakeIdb.stats.getCalls.includes('studio_media_asset:img_unrelated_1') &&
        !fakeIdb.stats.getCalls.includes('studio_media_asset:vid_unrelated_1'),
      '2/3e: restoration reads ONLY the requested audio asset and does not load unrelated media blobs',
    );
    assert(
      fakeIdb.stats.getCalls.includes(`studio_media_asset:${savedAssetId}`),
      '2/3f: restoration fetches the exact audioAssetId blob from IndexedDB',
    );

    const loadFileCall = mockEngine1.calls.find((c) => c.method === 'loadAndPlayFile');
    assert(Boolean(loadFileCall), '3a: audioEngine.loadAndPlayFile is called with restored File');
    assert(
      !mockEngine1.calls.some((c) => c.method === 'loadAndPlayUrl'),
      '3b: audioEngine.loadAndPlayUrl is NOT called for local audio',
    );
    const restoredFileArg = loadFileCall?.args[3] as File;
    assert(restoredFileArg instanceof File, '3c: restored object is a File instance');
    assertEqual(restoredFileArg.name, 'lofi-stream-bgm.mp3', '3d: restored File preserves original filename');
    assertEqual(restoredFileArg.type, 'audio/mpeg', '3e: restored File preserves MIME type');
    assertEqual(restoredFileArg.size, mp3Bytes.byteLength, '3f: restored File preserves byte length');
    assertEqual(
      new Uint8Array(await restoredFileArg.arrayBuffer()).join(','),
      mp3Bytes.join(','),
      '3g: restored File preserves exact audio bytes',
    );

    // 4. Elements with audioSourceType: 'url' continue using loadAndPlayUrl
    const urlElem = makeAudioElement('elem_audio_url', {
      title: 'Online Forest BGM',
      audioSourceType: 'url',
      audioUrl: 'https://actions.google.com/sounds/v1/ambiences/daytime_forest_bonfire.ogg',
    });
    const mockEngineUrl = createMockAudioEngine();
    const missingNoticesUrl: Array<{ title: string; message: string }> = [];
    let isTestingUrl = false;
    const playUrlRes = await playManualAudioElement({
      element: urlElem,
      isTestingAudio: isTestingUrl,
      audioEngine: mockEngineUrl.engine,
      setIsTestingAudio: (val) => { isTestingUrl = val; },
      loadAudioAssetsByIds: (ids) => StorageService.getStudioMediaAssetsForPresetTransfer(ids),
      onMissingLocalAsset: (notice) => missingNoticesUrl.push(notice),
    });

    assertEqual(playUrlRes.action, 'played_url', '4a: audioSourceType=url routes through URL playback');
    assertEqual(isTestingUrl, true, '4b: URL playback sets isTestingAudio=true');
    assertEqual(missingNoticesUrl.length, 0, '4c: URL playback emits no missing local asset notice');
    assert(
      mockEngineUrl.calls.some(
        (c) =>
          c.method === 'loadAndPlayUrl' &&
          c.args[3] === 'https://actions.google.com/sounds/v1/ambiences/daytime_forest_bonfire.ogg',
      ),
      '4d: audioEngine.loadAndPlayUrl receives configured URL',
    );
    assert(
      !mockEngineUrl.calls.some((c) => c.method === 'loadAndPlayFile'),
      '4e: URL audio does not call loadAndPlayFile',
    );

    // 5a. Missing local asset ID in IndexedDB -> clear error, NO silent fallback to URL
    const missingIdElem = makeAudioElement('elem_missing_asset', {
      audioSourceType: 'local',
      localFileName: 'deleted-bgm.mp3',
      audioAssetId: 'aud_nonexistent_123',
      audioUrl: 'https://actions.google.com/sounds/v1/ambiences/daytime_forest_bonfire.ogg',
    });
    const mockEngineMissing = createMockAudioEngine();
    const missingNotices5a: Array<{ title: string; message: string }> = [];
    let isTestingMissing = true;
    const missingPlayRes = await playManualAudioElement({
      element: missingIdElem,
      isTestingAudio: isTestingMissing,
      audioEngine: mockEngineMissing.engine,
      setIsTestingAudio: (val) => { isTestingMissing = val; },
      loadAudioAssetsByIds: (ids) => StorageService.getStudioMediaAssetsForPresetTransfer(ids),
      onMissingLocalAsset: (notice) => missingNotices5a.push(notice),
    });

    assertEqual(missingPlayRes.action, 'missing_local_asset', '5a: missing IDB asset returns missing_local_asset');
    assertEqual(isTestingMissing, false, '5b: missing asset resets isTestingAudio to false');
    assertEqual(missingNotices5a.length, 1, '5c: missing asset emits clear user notice');
    assert(
      missingNotices5a[0].message.toLowerCase().includes('pilih ulang'),
      '5d: notice asks user to re-select file',
    );
    assert(
      !mockEngineMissing.calls.some((c) => c.method === 'loadAndPlayUrl'),
      '5e: missing local asset NEVER silently falls back to loadAndPlayUrl',
    );

    // 5b. Legacy local metadata without audioAssetId -> clear error, NO silent fallback to URL
    const legacyLocalElem = makeAudioElement('elem_legacy_local', {
      audioSourceType: 'local',
      localFileName: 'old-session.mp3',
      audioUrl: 'https://actions.google.com/sounds/v1/ambiences/daytime_forest_bonfire.ogg',
    });
    const mockEngineLegacy = createMockAudioEngine();
    const missingNotices5b: Array<{ title: string; message: string }> = [];
    const legacyPlayRes = await playManualAudioElement({
      element: legacyLocalElem,
      isTestingAudio: false,
      audioEngine: mockEngineLegacy.engine,
      setIsTestingAudio: () => {},
      loadAudioAssetsByIds: (ids) => StorageService.getStudioMediaAssetsForPresetTransfer(ids),
      onMissingLocalAsset: (notice) => missingNotices5b.push(notice),
    });
    assertEqual(legacyPlayRes.action, 'missing_local_asset', '5f: missing audioAssetId returns missing_local_asset');
    assertEqual(missingNotices5b.length, 1, '5g: missing audioAssetId shows clear error notice');
    assert(
      !mockEngineLegacy.calls.some((c) => c.method === 'loadAndPlayUrl'),
      '5h: missing audioAssetId NEVER silently falls back to URL',
    );

    // 5c. Corrupt local audio (playback decoder fails) -> clear error, NO fallback to URL
    const mockEngineCorrupt = createMockAudioEngine({ failLocalPlayback: true });
    const missingNotices5c: Array<{ title: string; message: string }> = [];
    const corruptPlayRes = await playManualAudioElement({
      element: reopenedAudioElem,
      isTestingAudio: false,
      audioEngine: mockEngineCorrupt.engine,
      setIsTestingAudio: () => {},
      loadAudioAssetsByIds: (ids) => StorageService.getStudioMediaAssetsForPresetTransfer(ids),
      onMissingLocalAsset: (notice) => missingNotices5c.push(notice),
    });
    assertEqual(corruptPlayRes.action, 'played_local', '5i: attempts local playback first');
    assertEqual(corruptPlayRes.success, false, '5j: reports false on decode error');
    assertEqual(missingNotices5c.length, 1, '5k: emits clear error notice on corrupt local playback');
    assert(
      !mockEngineCorrupt.calls.some((c) => c.method === 'loadAndPlayUrl'),
      '5l: corrupt local playback does NOT fall back to URL',
    );

    // 6. Storage save failure leaves element metadata unchanged & does not produce saved success
    const failIdb = createFakeMediaIndexedDB({
      data: new Map<string, unknown>(),
      failPutKeyPrefixes: ['studio_media_asset:'],
    });
    globalRecord.indexedDB = failIdb.fakeFactory;

    const failTestElem = makeAudioElement('elem_fail_save', {
      title: 'Existing Custom Title',
      audioSourceType: 'url',
      localFileName: '',
    });
    const beforeFailSnapshot = JSON.stringify(failTestElem);
    const badWavFile = new File([new Uint8Array([82, 73, 70, 70])], 'broken-write.wav', {
      type: 'audio/wav',
    });

    const failedSaveRes = await persistLocalAudioFileForElement({
      element: failTestElem,
      file: badWavFile,
      isElementGroupLocked: false,
      isStrictModeBLocked: false,
      saveStudioMediaAsset: (input) => StorageService.saveStudioMediaAsset(input),
    });

    assertEqual(failedSaveRes.saved, false, '6a: storage error causes persistLocalAudioFileForElement to fail cleanly');
    if (failedSaveRes.saved) {
      throw new Error('Expected failedSaveRes.saved to be false');
    }
    assertEqual(failedSaveRes.reason, 'storage_error', '6b: reports storage_error reason');
    assert(failedSaveRes.message.length > 0, '6c: provides clear failure message');
    assertEqual(JSON.stringify(failTestElem), beforeFailSnapshot, '6d: element metadata remains completely untouched on storage error');

    // Also verify openDB failure when writing Blob rejects cleanly rather than faking success
    const failOpenIdb = createFakeMediaIndexedDB({
      data: new Map<string, unknown>(),
      failOpen: true,
    });
    globalRecord.indexedDB = failOpenIdb.fakeFactory;
    const failedOpenRes = await persistLocalAudioFileForElement({
      element: failTestElem,
      file: badWavFile,
      isElementGroupLocked: false,
      isStrictModeBLocked: false,
      saveStudioMediaAsset: (input) => StorageService.saveStudioMediaAsset(input),
    });
    assertEqual(failedOpenRes.saved, false, '6e: IndexedDB openDB failure returns saved=false instead of silent success');

    // Verify oversized file > 20 MB is rejected BEFORE touching IndexedDB
    globalRecord.indexedDB = fakeIdb.fakeFactory;
    const putCountBeforeInvalid = fakeIdb.stats.putCalls.length;
    const oversizedFile = {
      name: 'huge.mp3',
      size: MAX_LOCAL_AUDIO_FILE_BYTES + 1,
      type: 'audio/mpeg',
    } as unknown as File;
    const oversizedRes = await persistLocalAudioFileForElement({
      element: failTestElem,
      file: oversizedFile,
      isElementGroupLocked: false,
      isStrictModeBLocked: false,
      saveStudioMediaAsset: (input) => StorageService.saveStudioMediaAsset(input),
    });
    assertEqual(oversizedRes.saved, false, '6f: rejects files exceeding 20 MB limit');
    assertEqual(fakeIdb.stats.putCalls.length, putCountBeforeInvalid, '6g: does not write invalid oversized file to IndexedDB');

    // 7. Replacing local file updates audioAssetId to new asset without deleting/corrupting old asset
    const duplicateSharedPresetElem: StudioElement = {
      ...reopenedAudioElem,
      id: 'elem_duplicate_preset_audio',
    };
    const replacementBytes = new Uint8Array([79, 103, 103, 83, 0, 2, 0, 0, 1, 2]);
    const replacementFile = new File([replacementBytes], 'hype-chill.ogg', { type: 'audio/ogg' });
    const replaceRes = await persistLocalAudioFileForElement({
      element: reopenedAudioElem,
      file: replacementFile,
      isElementGroupLocked: false,
      isStrictModeBLocked: false,
      saveStudioMediaAsset: (input) => StorageService.saveStudioMediaAsset(input),
    });

    assertEqual(replaceRes.saved, true, '7a: replacement audio file saves cleanly');
    if (!replaceRes.saved) {
      throw new Error('Expected replaceRes.saved to be true');
    }
    assert(
      replaceRes.assetId !== savedAssetId,
      '7b: replacement produces a distinct new audioAssetId',
    );
    assertEqual(
      replaceRes.patch.audioAssetId,
      replaceRes.assetId,
      '7c: replacement patch points to the new audioAssetId',
    );
    assertEqual(
      replaceRes.patch.localFileName,
      'hype-chill.ogg',
      '7d: replacement patch updates localFileName',
    );

    // Verify OLD asset is STILL intact in IndexedDB for duplicate preset / other element!
    const oldAssetsCheck = await StorageService.getStudioMediaAssetsForPresetTransfer([savedAssetId]);
    assertEqual(oldAssetsCheck.length, 1, '7e: old audio asset remains intact in IndexedDB after replacement');
    assertEqual(oldAssetsCheck[0].blob.size, mp3Bytes.byteLength, '7f: old audio blob bytes remain intact');

    // Verify duplicate preset element still resolves and plays the old asset!
    const dupResolved = await resolveManualAudioPlaybackSource({
      element: duplicateSharedPresetElem,
      loadAudioAssetsByIds: (ids) => StorageService.getStudioMediaAssetsForPresetTransfer(ids),
    });
    assertEqual(dupResolved.kind, 'local_file', '7g: duplicate preset element still resolves old asset');
    if (dupResolved.kind === 'local_file') {
      assertEqual(dupResolved.assetId, savedAssetId, '7h: duplicate element keeps old assetId');
      assertEqual(dupResolved.file.name, 'lofi-stream-bgm.mp3', '7i: duplicate element restores old filename');
    }

    // Verify clear patch cleans local element metadata without deleting shared asset in IndexedDB
    const clearPatch = buildClearLocalAudioPatch({ audioUrl: DEFAULT_MANUAL_AUDIO_URL });
    assertEqual(clearPatch.audioAssetId, '', '7j: clear patch clears audioAssetId');
    assertEqual(clearPatch.localFileName, '', '7k: clear patch clears localFileName');
    assertEqual(clearPatch.localFileSize, undefined, '7l: clear patch clears localFileSize');
    assertEqual(clearPatch.audioSourceType, 'url', '7m: clear patch switches audioSourceType back to url');
    const sharedStillPresent = await StorageService.getStudioMediaAssetsForPresetTransfer([
      savedAssetId,
      replaceRes.assetId,
    ]);
    assertEqual(sharedStillPresent.length, 2, '7n: clearing element local file leaves shared IndexedDB assets intact');

    // 8. Verify no accidental mutation to other elements or presets
    assertEqual(
      JSON.stringify(otherElem),
      otherElemSnapshotBefore,
      '8a: other Studio elements remain completely unmutated',
    );
    assertEqual(
      JSON.stringify(otherPreset),
      otherPresetSnapshotBefore,
      '8b: other Studio presets remain completely unmutated',
    );

    console.log(`studioAudioPersistence.test.ts: PASS (${assertionCount} assertions)`);
  } finally {
    globalRecord.indexedDB = originalIndexedDB;
  }
}

runStudioAudioPersistenceTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
