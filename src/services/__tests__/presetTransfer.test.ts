// Unit tests for portable per-preset JSON transfer, including local media remapping.
// Run in the project environment with: bun run src/services/__tests__/presetTransfer.test.ts

import { StudioPreset } from '../../types';
import { StorageService, StoredStudioMediaAsset } from '../storage';
import { buildPresetTransferJson, importPresetPackageFile } from '../presetTransfer';

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

async function runPresetTransferTests(): Promise<void> {
  const storage = StorageService as unknown as {
    getStudioMediaAssetsForPresetTransfer: (ids: string[]) => Promise<Array<StoredStudioMediaAsset & { blob: Blob }>>;
    saveStudioMediaAssetsForPresetTransfer: (assets: Array<StoredStudioMediaAsset & { blob: Blob }>) => Promise<void>;
  };
  const originalGet = storage.getStudioMediaAssetsForPresetTransfer;
  const originalSave = storage.saveStudioMediaAssetsForPresetTransfer;
  const sourceBlob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
  const sourceAsset: StoredStudioMediaAsset & { blob: Blob } = {
    id: 'media_original_1',
    name: 'overlay.png',
    type: 'image',
    mimeType: 'image/png',
    sizeBytes: sourceBlob.size,
    addedAt: 1000,
    blob: sourceBlob,
  };
  const backgroundBlob = new Blob([new Uint8Array([66, 71, 13, 10])], { type: 'image/png' });
  const backgroundAsset: StoredStudioMediaAsset & { blob: Blob } = {
    id: 'media_background_1',
    name: 'background.png',
    type: 'image',
    mimeType: 'image/png',
    sizeBytes: backgroundBlob.size,
    addedAt: 1100,
    blob: backgroundBlob,
  };
  const screensaverBlob = new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], { type: 'video/mp4' });
  const screensaverAsset: StoredStudioMediaAsset & { blob: Blob } = {
    id: 'media_screensaver_1',
    name: 'standby.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    sizeBytes: screensaverBlob.size,
    addedAt: 1200,
    blob: screensaverBlob,
  };
  const preset: StudioPreset = {
    id: 'preset_original',
    name: 'Preset Transfer Test',
    category: 'hp_screen',
    canvasOrientation: '9:16',
    elements: [{
      id: 'elem_original',
      name: 'Overlay Logo',
      type: 'image',
      x: 10,
      y: 10,
      width: 30,
      height: 20,
      layer: 2,
      visible: true,
      locked: false,
      opacity: 100,
      rotation: 0,
      properties: { imageAssetId: sourceAsset.id, imageUrl: 'blob:old-webview-url' },
    }],
    createdAt: 1000,
    isFavorite: true,
    description: 'Portable test preset',
    thumbnailColor: '#2563EB',
    canvas: { kind: 'portrait', width: 1080, height: 1920 },
    backgroundUri: 'studio-media://media_background_1',
    groups: [{
      id: 'group_original',
      name: 'Branding',
      elementIds: ['elem_original'],
      visible: false,
      locked: true,
      opacity: 85,
      sequenceOrder: 3,
    }],
    superGroups: [{
      id: 'super_original',
      name: 'Main Layout',
      groupIds: ['group_original'],
      visible: true,
      locked: false,
      sequenceOrder: 1,
    }],
    transitionIn: { type: 'fade', durationMs: 350 },
    transitionOut: { type: 'slide', durationMs: 250 },
    screensaver: { enabled: true, timeoutMs: 30000 },
    schema: 2,
  };
  let savedAssets: Array<StoredStudioMediaAsset & { blob: Blob }> = [];

  try {
    storage.getStudioMediaAssetsForPresetTransfer = async (ids) => {
      assert(ids.includes(sourceAsset.id), 'export requests the referenced local media only');
      assert(ids.includes(backgroundAsset.id), 'export includes the local preset background media');
      return [sourceAsset, backgroundAsset];
    };
    const json = await buildPresetTransferJson(preset);
    const exported = JSON.parse(json);
    assertEqual(exported.format, 'syntxrr-preset', 'export declares the preset package format');
    assertEqual(exported.schemaVersion, 2, 'export declares the structured preset package schema version');
    assertEqual(exported.media.length, 2, 'export bundles overlay media and the background image');
    assertEqual(exported.media[0].dataBase64, 'iVBORw==', 'export embeds the source media bytes');
    assertEqual(exported.media[1].dataBase64, 'QkcNCg==', 'export embeds the background media bytes');

    storage.getStudioMediaAssetsForPresetTransfer = async () => [];
    let missingExportMediaRejected = false;
    try {
      await buildPresetTransferJson(preset);
    } catch (error) {
      missingExportMediaRejected = error instanceof Error && error.message.includes('tidak ditemukan');
    }
    assert(missingExportMediaRejected, 'export refuses a preset with a missing referenced local file');
    storage.getStudioMediaAssetsForPresetTransfer = async () => [sourceAsset, backgroundAsset];

    storage.saveStudioMediaAssetsForPresetTransfer = async (assets) => { savedAssets = assets; };
    const imported = await importPresetPackageFile(new File([json], 'preset.json', { type: 'application/json' }));
    assertEqual(imported.importedMediaCount, 2, 'import restores the overlay image and preset background');
    assertEqual(imported.importedAssetIds.length, 2, 'import returns restored asset IDs for lifecycle rollback');
    assertEqual(savedAssets.length, 2, 'storage receives both restored media assets');
    const importedAssetId = imported.preset.elements[0].properties.imageAssetId;
    const importedBackgroundAsset = savedAssets.find((asset) => asset.name === backgroundAsset.name);
    assert(typeof importedAssetId === 'string' && importedAssetId !== sourceAsset.id, 'import remaps the media id to prevent collision');
    assertEqual(savedAssets.find((asset) => asset.name === sourceAsset.name)?.id, importedAssetId, 'element reference matches the new storage id');
    assert(savedAssets.find((asset) => asset.name === sourceAsset.name)?.blob.size === sourceBlob.size, 'restored overlay media keeps its byte size');
    assert(Boolean(importedBackgroundAsset && importedBackgroundAsset.id !== backgroundAsset.id), 'background media receives a fresh storage id');
    assertEqual(imported.preset.elements[0].properties.imageUrl, '', 'stale WebView blob URL is removed');
    assert(imported.preset.elements[0].id !== 'elem_original', 'element ids are regenerated on import');
    assertEqual(imported.preset.isFavorite, true, 'import preserves favorite metadata');
    assertEqual(imported.preset.canvas?.width, 1080, 'import preserves canvas dimensions');
    assertEqual(imported.preset.backgroundUri, `studio-media://${importedBackgroundAsset?.id}`, 'import rewrites the background URI to its restored media id');
    assertEqual(imported.preset.groups?.length, 1, 'import preserves structured groups');
    assert(imported.preset.groups?.[0].id !== 'group_original', 'import remaps group IDs');
    assertEqual(imported.preset.groups?.[0].elementIds[0], imported.preset.elements[0].id, 'group membership follows remapped element IDs');
    assertEqual(imported.preset.superGroups?.[0].groupIds[0], imported.preset.groups?.[0].id, 'supergroup membership follows remapped group IDs');
    assertEqual((imported.preset.transitionIn as any)?.type, 'fade', 'import preserves transition-in metadata');
    assertEqual((imported.preset.transitionOut as any)?.type, 'slide', 'import preserves transition-out metadata');
    assertEqual((imported.preset.screensaver as any)?.timeoutMs, 30000, 'import preserves screensaver metadata');

    const broken = JSON.parse(json);
    broken.media = [];
    savedAssets = [];
    let missingMediaRejected = false;
    try {
      await importPresetPackageFile(new File([JSON.stringify(broken)], 'broken.json', { type: 'application/json' }));
    } catch (error) {
      missingMediaRejected = error instanceof Error && error.message.includes('tidak disertakan');
    }
    assert(missingMediaRejected, 'import rejects a preset whose referenced local media is missing');
    assertEqual(savedAssets.length, 0, 'missing element media is rejected before any media is restored');

    const missingBackground = JSON.parse(json);
    missingBackground.media = missingBackground.media.filter((item: { id: string }) => item.id !== backgroundAsset.id);
    savedAssets = [];
    let missingBackgroundRejected = false;
    try {
      await importPresetPackageFile(new File([JSON.stringify(missingBackground)], 'missing-background.json', { type: 'application/json' }));
    } catch (error) {
      missingBackgroundRejected = error instanceof Error && error.message.includes('tidak disertakan');
    }
    assert(missingBackgroundRejected, 'import rejects a package that omits the local background image');
    assertEqual(savedAssets.length, 0, 'missing background is rejected before any media is restored');

    let unsupportedFormatRejected = false;
    try {
      await importPresetPackageFile(new File(['{}'], 'wrong.json', { type: 'application/json' }));
    } catch (error) {
      unsupportedFormatRejected = error instanceof Error && error.message.includes('Format preset tidak didukung');
    }
    assert(unsupportedFormatRejected, 'import rejects unrelated JSON backups');

    const invalidGeometry = JSON.parse(json);
    invalidGeometry.preset.elements[0].x = 250;
    let invalidGeometryRejected = false;
    try {
      await importPresetPackageFile(new File([JSON.stringify(invalidGeometry)], 'invalid-geometry.json', { type: 'application/json' }));
    } catch (error) {
      invalidGeometryRejected = error instanceof Error && error.message.includes('di luar batas');
    }
    assert(invalidGeometryRejected, 'import rejects out-of-bounds element geometry');

    const brokenGroup = JSON.parse(json);
    brokenGroup.preset.groups[0].elementIds = ['element-that-does-not-exist'];
    savedAssets = [];
    let brokenGroupRejected = false;
    try {
      await importPresetPackageFile(new File([JSON.stringify(brokenGroup)], 'broken-group.json', { type: 'application/json' }));
    } catch (error) {
      brokenGroupRejected = error instanceof Error && error.message.includes('merujuk elemen yang tidak tersedia');
    }
    assert(brokenGroupRejected, 'import rejects group membership that points to a missing element');
    assertEqual(savedAssets.length, 0, 'invalid group metadata is rejected before restoring media blobs');

    const legacyV1 = JSON.parse(json);
    legacyV1.schemaVersion = 1;
    delete legacyV1.preset.canvas;
    delete legacyV1.preset.backgroundUri;
    delete legacyV1.preset.groups;
    delete legacyV1.preset.superGroups;
    delete legacyV1.preset.transitionIn;
    delete legacyV1.preset.transitionOut;
    delete legacyV1.preset.screensaver;
    const legacyImported = await importPresetPackageFile(new File([JSON.stringify(legacyV1)], 'legacy-v1.json', { type: 'application/json' }));
    assertEqual(legacyImported.preset.groups?.length, 0, 'legacy v1 preset imports with an empty group structure');
    assertEqual(legacyImported.preset.canvas?.kind, 'portrait', 'legacy v1 preset receives a compatible canvas spec');

    // Screensaver local video studio-media:// asset round-trip & remapping
    const presetWithScreensaverMedia: StudioPreset = {
      ...preset,
      screensaver: {
        on: true,
        text: 'Tunggu sebentar',
        media: 'studio-media://media_screensaver_1',
        mediaType: 'video',
        mediaSound: false,
      },
    };
    storage.getStudioMediaAssetsForPresetTransfer = async (ids) => {
      assert(ids.includes(screensaverAsset.id), 'export includes Mode B screensaver local media');
      return [sourceAsset, backgroundAsset, screensaverAsset];
    };
    const ssJson = await buildPresetTransferJson(presetWithScreensaverMedia);
    savedAssets = [];
    const ssImported = await importPresetPackageFile(new File([ssJson], 'screensaver.json', { type: 'application/json' }));
    assertEqual(ssImported.importedMediaCount, 3, 'import restores overlay, background, and screensaver media');
    const restoredScreensaver = savedAssets.find((asset) => asset.name === screensaverAsset.name);
    assert(Boolean(restoredScreensaver && restoredScreensaver.id !== screensaverAsset.id), 'screensaver media receives a fresh asset id');
    assertEqual(
      (ssImported.preset.screensaver as any)?.media,
      `studio-media://${restoredScreensaver?.id}`,
      'import rewrites screensaver studio-media:// URI to restored asset id',
    );

    // Storage validation check before DB access
    let invalidStorageMediaRejected = false;
    try {
      await originalSave([
        {
          id: 'bad id with spaces',
          name: 'invalid.png',
          type: 'image',
          mimeType: 'image/png',
          sizeBytes: sourceBlob.size,
          addedAt: 1000,
          blob: sourceBlob,
        },
      ]);
    } catch (error) {
      invalidStorageMediaRejected = error instanceof Error && error.message.includes('tidak valid');
    }
    assert(invalidStorageMediaRejected, 'storage transfer restore rejects invalid media asset ids');

    console.log(`Preset transfer tests passed: ${assertionCount} assertions (structured v2 round-trip, screensaver media, invalid-reference rejection, and v1 compatibility).`);
  } finally {
    storage.getStudioMediaAssetsForPresetTransfer = originalGet;
    storage.saveStudioMediaAssetsForPresetTransfer = originalSave;
  }
}

runPresetTransferTests().catch((error) => {
  console.error(error);
  throw error;
});
