import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StudioElement, StudioPreset } from '../../types';
import { createStudioMediaAssetUri } from '../presetModel';
import { StorageService } from '../storage';
import {
  executeProtectedStudioMediaDelete,
  findStudioMediaAssetReferences,
  formatStudioMediaBlockedDeleteMessage,
} from '../studioMediaReferences';

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

function makeElement(
  id: string,
  type: StudioElement['type'],
  properties: Record<string, unknown>,
  name?: string,
): StudioElement {
  return {
    id,
    name: name || id,
    type,
    x: 10,
    y: 10,
    width: 25,
    height: 25,
    layer: 1,
    visible: true,
    locked: false,
    opacity: 100,
    rotation: 0,
    properties,
  };
}

function makePreset(
  id: string,
  name: string,
  elements: StudioElement[],
  extra?: Partial<StudioPreset>,
): StudioPreset {
  return {
    id,
    name,
    category: 'hp_screen',
    canvasOrientation: '9:16',
    elements,
    createdAt: 1,
    isFavorite: false,
    description: `${name} description`,
    ...extra,
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

async function runTests(): Promise<void> {
  const activeCanvasImageElem = makeElement(
    'elem_img_active',
    'image',
    {
      imageAssetId: 'img_active_1',
      imageUrl: createStudioMediaAssetUri('img_active_1'),
    },
    'Overlay Logo Aktif',
  );

  const otherPresetVideoElem = makeElement(
    'elem_vid_other',
    'video',
    {
      videoAssetId: 'vid_other_1',
      videoUrl: createStudioMediaAssetUri('vid_other_1'),
    },
    'Intro Loop Preset Lain',
  );

  const otherPresetAudioElem = makeElement(
    'elem_aud_other',
    'audio',
    {
      audioSourceType: 'local',
      audioAssetId: 'aud_other_1',
      audioName: 'theme.mp3',
    },
    'BGM Preset Lain',
  );

  const legacyUriImageElem = makeElement(
    'elem_img_legacy_uri',
    'image',
    {
      imageUrl: 'studio-media://img_legacy_uri_1',
    },
    'Sticker URI Lama',
  );

  const legacyUriVideoElem = makeElement(
    'elem_vid_legacy_uri',
    'video',
    {
      videoUrl: 'studio-media://vid_legacy_uri_1',
    },
    'Video URI Lama',
  );

  const legacyUriAudioElem = makeElement(
    'elem_aud_legacy_uri',
    'audio',
    {
      audioUrl: 'studio-media://aud_legacy_uri_1',
    },
    'Audio URI Lama',
  );

  const activePreset = makePreset('preset_active', 'Scene Utama', [activeCanvasImageElem]);
  const inactivePresetVideo = makePreset('preset_video', 'Scene Bumper', [otherPresetVideoElem], {
    backgroundUri: createStudioMediaAssetUri('img_bg_1'),
  });
  const inactivePresetAudio = makePreset('preset_audio', 'Scene Musik', [
    otherPresetAudioElem,
    legacyUriImageElem,
    legacyUriVideoElem,
    legacyUriAudioElem,
  ], {
    screensaver: {
      on: true,
      text: 'Sebentar ya',
      media: createStudioMediaAssetUri('vid_screensaver_1'),
      mediaType: 'video',
      mediaSound: false,
    },
  });

  const activeElementsFrozen = deepFreeze([activeCanvasImageElem]);
  const presetsFrozen = deepFreeze([activePreset, inactivePresetVideo, inactivePresetAudio]);

  // 1. Aset gambar yang digunakan elemen aktif tidak boleh dihapus.
  {
    let deleteCalled = false;
    const res = await executeProtectedStudioMediaDelete({
      assetId: 'img_active_1',
      assetName: 'logo.png',
      activeElements: activeElementsFrozen,
      presets: presetsFrozen,
      activePresetId: 'preset_active',
      deleteFromStorage: async () => {
        deleteCalled = true;
      },
    });
    assertEqual(res.deleted, false, 'Test 1: active image asset delete is blocked');
    assertEqual(res.blockedByReferences, true, 'Test 1: flagged as blockedByReferences');
    assertEqual(deleteCalled, false, 'Test 1: storage delete is NOT called when referenced');
    assert(
      !res.deleted && res.references.some((r) => r.elementId === 'elem_img_active'),
      'Test 1: references include active canvas image element',
    );
    assert(
      !res.deleted && res.message.includes('Overlay Logo Aktif'),
      'Test 1: notice mentions referencing element name',
    );
  }

  // 2. Aset video yang digunakan elemen di preset lain tidak boleh dihapus.
  {
    let deleteCalled = false;
    const res = await executeProtectedStudioMediaDelete({
      assetId: 'vid_other_1',
      assetName: 'bumper.mp4',
      activeElements: activeElementsFrozen,
      presets: presetsFrozen,
      activePresetId: 'preset_active',
      deleteFromStorage: async () => {
        deleteCalled = true;
      },
    });
    assertEqual(res.deleted, false, 'Test 2: video asset in another preset cannot be deleted');
    assertEqual(deleteCalled, false, 'Test 2: storage delete is NOT called');
    assert(
      !res.deleted &&
        res.references.some(
          (r) => r.kind === 'preset_element' && r.presetId === 'preset_video' && r.elementId === 'elem_vid_other',
        ),
      'Test 2: references report preset_video element',
    );
  }

  // 3. Aset audio yang digunakan elemen di preset lain tidak boleh dihapus.
  {
    let deleteCalled = false;
    const res = await executeProtectedStudioMediaDelete({
      assetId: 'aud_other_1',
      assetName: 'bgm.mp3',
      activeElements: activeElementsFrozen,
      presets: presetsFrozen,
      activePresetId: 'preset_active',
      deleteFromStorage: async () => {
        deleteCalled = true;
      },
    });
    assertEqual(res.deleted, false, 'Test 3: audio asset in another preset cannot be deleted');
    assertEqual(deleteCalled, false, 'Test 3: storage delete is NOT called');
    assert(
      !res.deleted &&
        res.references.some(
          (r) =>
            r.kind === 'preset_element' &&
            r.presetId === 'preset_audio' &&
            r.field === 'audioAssetId',
        ),
      'Test 3: references report preset_audio audioAssetId',
    );
  }

  // 4. Aset yang digunakan di backgroundUri preset tidak boleh dihapus.
  {
    let deleteCalled = false;
    const res = await executeProtectedStudioMediaDelete({
      assetId: 'img_bg_1',
      assetName: 'wallpaper.png',
      activeElements: activeElementsFrozen,
      presets: presetsFrozen,
      activePresetId: 'preset_active',
      deleteFromStorage: async () => {
        deleteCalled = true;
      },
    });
    assertEqual(res.deleted, false, 'Test 4: asset in backgroundUri cannot be deleted');
    assertEqual(deleteCalled, false, 'Test 4: storage delete is NOT called');
    assert(
      !res.deleted &&
        res.references.some(
          (r) => r.kind === 'preset_background' && r.presetId === 'preset_video' && r.field === 'backgroundUri',
        ),
      'Test 4: references report preset_background',
    );
  }

  // 5. Aset yang digunakan di screensaver.media tidak boleh dihapus.
  {
    let deleteCalled = false;
    const res = await executeProtectedStudioMediaDelete({
      assetId: 'vid_screensaver_1',
      assetName: 'afk.mp4',
      activeElements: activeElementsFrozen,
      presets: presetsFrozen,
      activePresetId: 'preset_active',
      deleteFromStorage: async () => {
        deleteCalled = true;
      },
    });
    assertEqual(res.deleted, false, 'Test 5: asset in screensaver.media cannot be deleted');
    assertEqual(deleteCalled, false, 'Test 5: storage delete is NOT called');
    assert(
      !res.deleted &&
        res.references.some(
          (r) =>
            r.kind === 'preset_screensaver' &&
            r.presetId === 'preset_audio' &&
            r.field === 'screensaver.media',
        ),
      'Test 5: references report preset_screensaver',
    );
  }

  // 6. Referensi URI lama studio-media:// pada imageUrl, videoUrl, audioUrl tetap dikenali.
  {
    const imgLegacy = findStudioMediaAssetReferences({
      assetId: 'img_legacy_uri_1',
      activeElements: activeElementsFrozen,
      presets: presetsFrozen,
      activePresetId: 'preset_active',
    });
    assertEqual(imgLegacy.isReferenced, true, 'Test 6a: legacy imageUrl studio-media:// recognized');
    assertEqual(imgLegacy.references[0]?.field, 'imageUrl', 'Test 6a: field is imageUrl');

    const vidLegacy = findStudioMediaAssetReferences({
      assetId: 'vid_legacy_uri_1',
      activeElements: activeElementsFrozen,
      presets: presetsFrozen,
      activePresetId: 'preset_active',
    });
    assertEqual(vidLegacy.isReferenced, true, 'Test 6b: legacy videoUrl studio-media:// recognized');
    assertEqual(vidLegacy.references[0]?.field, 'videoUrl', 'Test 6b: field is videoUrl');

    const audLegacy = findStudioMediaAssetReferences({
      assetId: 'aud_legacy_uri_1',
      activeElements: activeElementsFrozen,
      presets: presetsFrozen,
      activePresetId: 'preset_active',
    });
    assertEqual(audLegacy.isReferenced, true, 'Test 6c: legacy audioUrl studio-media:// recognized');
    assertEqual(audLegacy.references[0]?.field, 'audioUrl', 'Test 6c: field is audioUrl');
  }

  // 7. Aset yang tidak memiliki referensi boleh dihapus.
  {
    const deletedIds: string[] = [];
    const res = await executeProtectedStudioMediaDelete({
      assetId: 'img_unused_99',
      assetName: 'unused.png',
      activeElements: activeElementsFrozen,
      presets: presetsFrozen,
      activePresetId: 'preset_active',
      deleteFromStorage: async (id) => {
        deletedIds.push(id);
      },
    });
    assertEqual(res.deleted, true, 'Test 7: unreferenced asset delete succeeds');
    assertEqual(res.blockedByReferences, false, 'Test 7: not blocked by references');
    assertEqual(deletedIds.length, 1, 'Test 7: storage delete called once');
    assertEqual(deletedIds[0], 'img_unused_99', 'Test 7: storage delete received exact assetId');
  }

  // 8. Referensi di preset yang sedang tidak aktif tetap terdeteksi.
  {
    const check = findStudioMediaAssetReferences({
      assetId: 'vid_other_1',
      activeElements: [],
      presets: presetsFrozen,
      activePresetId: 'preset_active',
    });
    assertEqual(check.isReferenced, true, 'Test 8: inactive preset reference detected even with empty active canvas');
    assertEqual(check.references[0]?.isActivePreset, false, 'Test 8: marked isActivePreset=false');
    assertEqual(check.references[0]?.presetName, 'Scene Bumper', 'Test 8: inactive preset name reported');
  }

  // 9. Elemen kanvas aktif yang belum disimpan tetap melindungi aset dari penghapusan.
  {
    const savedPresetWithoutAsset = makePreset('preset_draft_test', 'Preset Draft', []);
    const unsavedCanvasElement = makeElement(
      'elem_unsaved_new',
      'image',
      { imageAssetId: 'img_unsaved_1' },
      'Banner Belum Disimpan',
    );
    let deleteCalled = false;
    const res = await executeProtectedStudioMediaDelete({
      assetId: 'img_unsaved_1',
      assetName: 'banner.png',
      activeElements: deepFreeze([unsavedCanvasElement]),
      presets: deepFreeze([savedPresetWithoutAsset]),
      activePresetId: 'preset_draft_test',
      deleteFromStorage: async () => {
        deleteCalled = true;
      },
    });
    assertEqual(res.deleted, false, 'Test 9: unsaved active canvas element blocks asset deletion');
    assertEqual(deleteCalled, false, 'Test 9: storage delete skipped for unsaved canvas element');
    assert(
      !res.deleted &&
        res.references.some(
          (r) => r.kind === 'active_element' && r.elementId === 'elem_unsaved_new',
        ),
      'Test 9: reports active_element reference',
    );
  }

  // 10. Beberapa referensi ke aset yang sama harus dilaporkan dengan benar.
  {
    const sharedId = 'img_shared_multi';
    const unsavedEl = makeElement('el_unsaved_shared', 'image', { imageAssetId: sharedId }, 'Kartu Live');
    const savedActiveEl = makeElement('el_saved_other', 'image', { imageUrl: createStudioMediaAssetUri(sharedId) }, 'Watermark');
    const presetA = makePreset('p_a', 'Preset Alpha', [savedActiveEl], {
      backgroundUri: createStudioMediaAssetUri(sharedId),
    });
    const presetB = makePreset(
      'p_b',
      'Preset Beta',
      [makeElement('el_beta', 'sticker', { imageAssetId: sharedId }, 'Stiker Beta')],
      {
        screensaver: {
          on: true,
          media: createStudioMediaAssetUri(sharedId),
          mediaType: 'image',
        },
      },
    );

    const check = findStudioMediaAssetReferences({
      assetId: sharedId,
      activeElements: deepFreeze([unsavedEl, savedActiveEl]),
      presets: deepFreeze([presetA, presetB]),
      activePresetId: 'p_a',
    });

    assertEqual(check.isReferenced, true, 'Test 10: multi-reference asset detected');
    assertEqual(
      check.references.length,
      5,
      'Test 10: reports active unsaved + active saved (deduped from preset) + preset_background + preset_element + preset_screensaver (5 distinct refs)',
    );
    const kinds = new Set(check.references.map((r) => r.kind));
    assert(kinds.has('active_element'), 'Test 10: includes active_element');
    assert(kinds.has('preset_background'), 'Test 10: includes preset_background');
    assert(kinds.has('preset_element'), 'Test 10: includes preset_element');
    assert(kinds.has('preset_screensaver'), 'Test 10: includes preset_screensaver');

    const msg = formatStudioMediaBlockedDeleteMessage('shared.png', check.references);
    assert(msg.includes('shared.png'), 'Test 10: message includes asset name');
    assert(msg.includes('Preset Alpha'), 'Test 10: message includes Preset Alpha');
    assert(msg.includes('referensi lainnya'), 'Test 10: message summarizes remaining references cleanly');
  }

  // 11. Storage failure preservation: unreferenced asset deletion error is surfaced and does not report success.
  {
    const res = await executeProtectedStudioMediaDelete({
      assetId: 'img_fail_storage',
      assetName: 'broken.png',
      activeElements: [],
      presets: [],
      deleteFromStorage: async () => {
        throw new Error('Disk penuh / transaksi gagal');
      },
    });
    assertEqual(res.deleted, false, 'Test 11: storage failure returns deleted=false');
    assertEqual(res.blockedByReferences, false, 'Test 11: storage failure is distinct from reference block');
    assert(
      !res.deleted && res.message.includes('Disk penuh / transaksi gagal'),
      'Test 11: storage error message preserved clearly for user',
    );
  }

  // 12. Real StorageService.deleteStudioMediaAsset rejects on IndexedDB abort and preserves blob & index,
  //     and commits cleanly on tx.oncomplete.
  {
    const globalRecord = globalThis as unknown as { indexedDB?: unknown };
    const prevIndexedDb = globalRecord.indexedDB;
    const storedMap = new Map<string, unknown>();
    const testBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    storedMap.set('studio_media_asset:img_idb_1', testBlob);
    storedMap.set('studio_media_assets_index', [
      {
        id: 'img_idb_1',
        name: 'idb.png',
        type: 'image',
        mimeType: 'image/png',
        sizeBytes: 4,
        addedAt: 100,
      },
    ]);

    let simulateAbort = true;
    let dbCloseCount = 0;
    let dbOpenCount = 0;

    globalRecord.indexedDB = {
      open() {
        const req: Record<string, unknown> = {
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null,
          result: null,
          error: null,
        };
        queueMicrotask(() => {
          dbOpenCount += 1;
          const db = {
            objectStoreNames: { contains: () => true },
            close: () => {
              dbCloseCount += 1;
            },
            transaction: () => {
              const staged = new Map(storedMap);
              const txObj: Record<string, unknown> = {
                error: null,
                oncomplete: null,
                onerror: null,
                onabort: null,
                abort: () => {
                  txObj.error = new Error('Simulated abort');
                  (txObj.onabort as (() => void) | null)?.();
                },
              };
              let pending = 0;
              let aborted = false;
              const maybeFinishTx = () => {
                queueMicrotask(() => {
                  if (pending !== 0 || aborted) return;
                  if (simulateAbort) {
                    aborted = true;
                    txObj.error = new Error('Simulated IDB commit abort');
                    (txObj.onabort as (() => void) | null)?.();
                    return;
                  }
                  storedMap.clear();
                  staged.forEach((v, k) => storedMap.set(k, v));
                  (txObj.oncomplete as (() => void) | null)?.();
                });
              };
              txObj.objectStore = () => ({
                get: (k: string) => {
                  pending += 1;
                  const r: Record<string, unknown> = { onsuccess: null, onerror: null, result: undefined };
                  queueMicrotask(() => {
                    r.result = staged.get(k) ?? null;
                    (r.onsuccess as (() => void) | null)?.();
                    pending -= 1;
                    maybeFinishTx();
                  });
                  return r;
                },
                put: (v: unknown, k: string) => {
                  pending += 1;
                  const r: Record<string, unknown> = { onsuccess: null, onerror: null, result: k };
                  queueMicrotask(() => {
                    staged.set(k, v);
                    (r.onsuccess as (() => void) | null)?.();
                    pending -= 1;
                    maybeFinishTx();
                  });
                  return r;
                },
                delete: (k: string) => {
                  pending += 1;
                  const r: Record<string, unknown> = { onsuccess: null, onerror: null };
                  queueMicrotask(() => {
                    staged.delete(k);
                    (r.onsuccess as (() => void) | null)?.();
                    pending -= 1;
                    maybeFinishTx();
                  });
                  return r;
                },
              });
              return txObj;
            },
          };
          req.result = db;
          (req.onsuccess as (() => void) | null)?.();
        });
        return req;
      },
    };

    try {
      let abortedRejected = false;
      try {
        await StorageService.deleteStudioMediaAsset('img_idb_1');
      } catch (err) {
        abortedRejected = err instanceof Error && err.message.includes('Simulated IDB commit abort');
      }
      assert(abortedRejected, 'Test 12a: StorageService.deleteStudioMediaAsset rejects on IDB transaction abort');
      assert(storedMap.has('studio_media_asset:img_idb_1'), 'Test 12b: aborted delete keeps blob intact');
      assertEqual(
        (storedMap.get('studio_media_assets_index') as Array<{ id: string }>).length,
        1,
        'Test 12c: aborted delete keeps metadata index intact',
      );
      assertEqual(dbCloseCount, dbOpenCount, 'Test 12d: DB connection closed in finally after abort');

      simulateAbort = false;
      await StorageService.deleteStudioMediaAsset('img_idb_1');
      assertEqual(storedMap.has('studio_media_asset:img_idb_1'), false, 'Test 12e: committed delete removes blob');
      assertEqual(
        (storedMap.get('studio_media_assets_index') as Array<{ id: string }>).length,
        0,
        'Test 12f: committed delete updates metadata index',
      );
      assertEqual(dbCloseCount, dbOpenCount, 'Test 12g: DB connection closed in finally after commit');
    } finally {
      if (prevIndexedDb === undefined) {
        delete globalRecord.indexedDB;
      } else {
        globalRecord.indexedDB = prevIndexedDb;
      }
    }
  }

  // 13. Static wiring verification in StudioView.tsx
  {
    const studioSource = readFileSync(
      join(process.cwd(), 'src/components/StudioView.tsx'),
      'utf-8',
    );
    const deleteIdx = studioSource.indexOf('const handleDeleteLocalMediaAsset');
    const addMediaIdx = studioSource.indexOf('const handleAddMediaToCanvas');
    assert(deleteIdx !== -1 && addMediaIdx !== -1 && deleteIdx < addMediaIdx, 'Test 13a: handleDeleteLocalMediaAsset exists');
    const fnBody = studioSource.slice(deleteIdx, addMediaIdx);
    const guardIdx = fnBody.indexOf('executeProtectedStudioMediaDelete(');
    const checkReturnIdx = fnBody.indexOf('if (!result.deleted)');
    const revokeIdx = fnBody.indexOf('URL.revokeObjectURL(');
    const filterIdx = fnBody.indexOf('setMediaLibrary(');
    assert(
      guardIdx !== -1 &&
        checkReturnIdx !== -1 &&
        revokeIdx !== -1 &&
        filterIdx !== -1 &&
        guardIdx < checkReturnIdx &&
        checkReturnIdx < revokeIdx &&
        checkReturnIdx < filterIdx,
      'Test 13b: StudioView runs executeProtectedStudioMediaDelete and returns on failure/block before revoking Object URL or updating mediaLibrary',
    );
    assert(
      fnBody.includes('activeElements: elementsRef.current') &&
        fnBody.includes('presets') &&
        fnBody.includes('activePresetId: activePresetIdRef.current'),
      'Test 13c: StudioView passes active canvas elements, presets, and activePresetId to reference check',
    );
  }

  console.log(`studioMediaReferenceProtection.test.ts: PASS (${assertionCount} assertions)`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
