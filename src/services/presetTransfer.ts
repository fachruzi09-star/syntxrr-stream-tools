import {
  StudioElement,
  StudioPreset,
  CanvasOrientation,
  PresetCategory,
  StudioCanvasSpec,
  StudioPresetGroup,
  StudioPresetSuperGroup,
} from '../types';
import {
  ensureUniqueElementIds,
  StorageService,
  StoredStudioMediaAsset,
} from './storage';
import {
  createStudioMediaAssetUri,
  defaultCanvasSpec,
  getStudioMediaAssetIdFromUri,
  isStudioMediaAssetUri,
  normalizeStudioPreset,
} from './presetModel';

type TransferMedia = StoredStudioMediaAsset & { dataBase64: string };

interface PresetTransferPackageV2 {
  app: 'SYNTXRR STREAM';
  format: 'syntxrr-preset';
  schemaVersion: 2;
  exportedAt: string;
  preset: {
    name: string;
    category: Exclude<PresetCategory, 'all' | 'favorites'>;
    canvasOrientation: CanvasOrientation;
    elements: StudioElement[];
    isFavorite: boolean;
    description: string;
    thumbnailColor?: string;
    canvas: StudioCanvasSpec;
    backgroundUri?: string;
    groups: StudioPresetGroup[];
    superGroups: StudioPresetSuperGroup[];
    transitionIn?: StudioPreset['transitionIn'];
    transitionOut?: StudioPreset['transitionOut'];
    screensaver?: StudioPreset['screensaver'];
    schema?: number;
  };
  media: TransferMedia[];
}

export interface ImportedPresetPackageResult {
  preset: Omit<StudioPreset, 'id' | 'createdAt'>;
  importedMediaCount: number;
  importedAssetIds: string[];
}

const MAX_PACKAGE_FILE_BYTES = 48 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 32 * 1024 * 1024;
const MAX_SINGLE_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_PRESET_ELEMENTS = 250;
const ASSET_ID_KEYS = [
  { key: 'imageAssetId', type: 'image' as const },
  { key: 'videoAssetId', type: 'video' as const },
  { key: 'audioAssetId', type: 'audio' as const },
];

function createTransferId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function collectAssetReferences(
  elements: StudioElement[],
  backgroundUri?: string,
  screensaver?: unknown,
): Map<string, 'image' | 'video' | 'audio'> {
  const references = new Map<string, 'image' | 'video' | 'audio'>();
  for (const element of elements) {
    const properties = element?.properties || {};
    for (const reference of ASSET_ID_KEYS) {
      const id = properties[reference.key];
      if (typeof id !== 'string' || !id.trim()) continue;
      const previousType = references.get(id);
      if (previousType && previousType !== reference.type) {
        throw new Error(`Aset ${id} dipakai sebagai lebih dari satu jenis media.`);
      }
      references.set(id, reference.type);
    }
  }
  if (isStudioMediaAssetUri(backgroundUri)) {
    const backgroundAssetId = getStudioMediaAssetIdFromUri(backgroundUri);
    if (!backgroundAssetId) throw new Error('Referensi background lokal dalam preset tidak valid.');
    const previousType = references.get(backgroundAssetId);
    if (previousType && previousType !== 'image') {
      throw new Error(`Aset background ${backgroundAssetId} tidak terdaftar sebagai gambar.`);
    }
    references.set(backgroundAssetId, 'image');
  }
  if (isRecord(screensaver) && isStudioMediaAssetUri(screensaver.media)) {
    const screensaverAssetId = getStudioMediaAssetIdFromUri(screensaver.media);
    if (!screensaverAssetId) {
      throw new Error('Referensi media screensaver lokal dalam preset tidak valid.');
    }
    const expectedType: 'image' | 'video' = screensaver.mediaType === 'video' ? 'video' : 'image';
    const previousType = references.get(screensaverAssetId);
    if (previousType && previousType !== expectedType) {
      throw new Error(`Aset screensaver ${screensaverAssetId} tidak cocok dengan jenis media yang dipilih.`);
    }
    references.set(screensaverAssetId, expectedType);
  }
  return references;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Data media dalam file preset tidak valid.');
  }
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function safeFilename(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return normalized || 'preset';
}

export async function buildPresetTransferJson(preset: StudioPreset): Promise<string> {
  if (!preset || !Array.isArray(preset.elements)) throw new Error('Data preset tidak valid.');
  const normalizedPreset = normalizeStudioPreset(preset);
  const references = collectAssetReferences(
    normalizedPreset.elements,
    normalizedPreset.backgroundUri,
    normalizedPreset.screensaver,
  );
  const localAssets = await StorageService.getStudioMediaAssetsForPresetTransfer([...references.keys()]);
  const assetsById = new Map(localAssets.map((asset) => [asset.id, asset]));
  const media: TransferMedia[] = [];
  let totalBytes = 0;

  for (const [id, expectedType] of references) {
    const asset = assetsById.get(id);
    if (!asset) {
      throw new Error(`Media lokal "${id}" tidak ditemukan. Preset tidak diekspor agar file hasil transfer tidak rusak.`);
    }
    if (asset.type !== expectedType) {
      throw new Error(`Jenis media "${asset.name}" tidak cocok dengan elemen preset.`);
    }
    if (asset.blob.size <= 0 || asset.blob.size > MAX_SINGLE_MEDIA_BYTES) {
      throw new Error(`Media "${asset.name}" melewati batas transfer ${Math.round(MAX_SINGLE_MEDIA_BYTES / 1024 / 1024)} MB per file.`);
    }
    totalBytes += asset.blob.size;
    if (totalBytes > MAX_TOTAL_MEDIA_BYTES) {
      throw new Error(`Total media preset melebihi batas transfer ${Math.round(MAX_TOTAL_MEDIA_BYTES / 1024 / 1024)} MB.`);
    }
    media.push({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      mimeType: asset.mimeType,
      sizeBytes: asset.blob.size,
      addedAt: asset.addedAt,
      dataBase64: bytesToBase64(new Uint8Array(await asset.blob.arrayBuffer())),
    });
  }

  const orientation = normalizedPreset.canvasOrientation;
  const category: Exclude<PresetCategory, 'all' | 'favorites'> =
    orientation === '16:9' ? 'landscape' : orientation === '1:1' ? 'portrait' : 'hp_screen';
  const payload: PresetTransferPackageV2 = {
    app: 'SYNTXRR STREAM',
    format: 'syntxrr-preset',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    preset: {
      name: normalizedPreset.name,
      category,
      canvasOrientation: orientation,
      elements: normalizedPreset.elements,
      isFavorite: normalizedPreset.isFavorite,
      description: normalizedPreset.description,
      thumbnailColor: normalizedPreset.thumbnailColor,
      canvas: normalizedPreset.canvas || defaultCanvasSpec(orientation),
      ...(normalizedPreset.backgroundUri ? { backgroundUri: normalizedPreset.backgroundUri } : {}),
      groups: normalizedPreset.groups || [],
      superGroups: normalizedPreset.superGroups || [],
      ...(normalizedPreset.transitionIn !== undefined ? { transitionIn: normalizedPreset.transitionIn } : {}),
      ...(normalizedPreset.transitionOut !== undefined ? { transitionOut: normalizedPreset.transitionOut } : {}),
      ...(normalizedPreset.screensaver !== undefined ? { screensaver: normalizedPreset.screensaver } : {}),
      schema: normalizedPreset.schema || 2,
    },
    media,
  };

  const json = JSON.stringify(payload, null, 2);
  if (new Blob([json]).size > MAX_PACKAGE_FILE_BYTES) {
    throw new Error('File preset terlalu besar untuk dibagikan. Kurangi media lokal lalu ekspor kembali.');
  }
  return json;
}

export async function exportPresetPackageFile(preset: StudioPreset): Promise<void> {
  const json = await buildPresetTransferJson(preset);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `syntxrr_preset_${safeFilename(preset.name)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseOrientation(value: unknown): CanvasOrientation {
  if (value === '9:16' || value === '16:9' || value === '1:1') return value;
  throw new Error('Orientasi kanvas pada file preset tidak dikenali.');
}

function parseElements(value: unknown): { elements: StudioElement[]; idMap: Map<string, string> } {
  if (!Array.isArray(value) || value.length > MAX_PRESET_ELEMENTS) {
    throw new Error(`Preset harus berisi maksimal ${MAX_PRESET_ELEMENTS} elemen.`);
  }
  const idMap = new Map<string, string>();
  const parsed = value.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`Elemen ke-${index + 1} tidak valid.`);
    const type = typeof raw.type === 'string' ? raw.type.trim() : '';
    if (!type || type.length > 60) throw new Error(`Jenis elemen ke-${index + 1} tidak valid.`);
    const originalId = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (originalId && idMap.has(originalId)) throw new Error(`ID elemen "${originalId}" terduplikasi dalam file preset.`);
    const newId = createTransferId(`elem${index}`);
    if (originalId) idMap.set(originalId, newId);
    const numberField = (key: string, fallback: number, min: number, max: number) => {
      const number = raw[key] === undefined ? fallback : Number(raw[key]);
      if (!Number.isFinite(number) || number < min || number > max) {
        throw new Error(`Nilai ${key} pada elemen ke-${index + 1} di luar batas.`);
      }
      return number;
    };
    const properties = isRecord(raw.properties) ? { ...raw.properties } : {};
    return {
      id: newId,
      name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : type,
      type: type as StudioElement['type'],
      x: numberField('x', 0, -100, 200),
      y: numberField('y', 0, -100, 200),
      width: numberField('width', 10, 0, 300),
      height: numberField('height', 10, 0, 300),
      layer: Math.round(numberField('layer', index + 1, -10000, 10000)),
      visible: raw.visible !== false,
      locked: raw.locked === true,
      opacity: numberField('opacity', 100, 0, 100),
      rotation: numberField('rotation', 0, -3600, 3600),
      properties,
      ...(isRecord(raw.eventBinding) ? { eventBinding: { ...raw.eventBinding } } : {}),
      ...(typeof raw.enterAnimation === 'string' || isRecord(raw.enterAnimation)
        ? { enterAnimation: isRecord(raw.enterAnimation) ? { ...raw.enterAnimation } : raw.enterAnimation }
        : {}),
      ...(typeof raw.exitAnimation === 'string' || isRecord(raw.exitAnimation)
        ? { exitAnimation: isRecord(raw.exitAnimation) ? { ...raw.exitAnimation } : raw.exitAnimation }
        : {}),
      ...(raw.enterDurationMs !== undefined ? { enterDurationMs: numberField('enterDurationMs', 0, 0, 600000) } : {}),
      ...(raw.exitDurationMs !== undefined ? { exitDurationMs: numberField('exitDurationMs', 0, 0, 600000) } : {}),
      ...(raw.displayDurationMs !== undefined ? { displayDurationMs: numberField('displayDurationMs', 0, 0, 3600000) } : {}),
      ...(raw.alertDurationMs !== undefined ? { alertDurationMs: numberField('alertDurationMs', 0, 0, 3600000) } : {}),
      ...(typeof raw.autoDismiss === 'boolean' ? { autoDismiss: raw.autoDismiss } : {}),
      ...(raw.sequenceOrder !== undefined ? { sequenceOrder: Math.round(numberField('sequenceOrder', index, -100000, 100000)) } : {}),
      ...(raw.animationDelayMs !== undefined ? { animationDelayMs: numberField('animationDelayMs', 0, 0, 600000) } : {}),
      ...(isRecord(raw.crop) ? { crop: { ...raw.crop } } : {}),
      ...(isRecord(raw.triggerConfig) ? { triggerConfig: { ...raw.triggerConfig } } : {}),
    } as StudioElement;
  });
  return { elements: ensureUniqueElementIds(parsed), idMap };
}

function parseMetadata(value: unknown, fieldName: string): Record<string, unknown> | string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') {
    if (value.length > 20000) throw new Error(`${fieldName} terlalu besar.`);
    return value;
  }
  if (!isRecord(value) || JSON.stringify(value).length > 20000) throw new Error(`${fieldName} tidak valid.`);
  return { ...value };
}

function parseCanvas(value: unknown, orientation: CanvasOrientation): StudioCanvasSpec {
  const fallback = defaultCanvasSpec(orientation);
  if (value === undefined) return fallback;
  if (!isRecord(value)) throw new Error('Spesifikasi kanvas dalam preset tidak valid.');
  const kind = value.kind;
  if (kind !== 'portrait' && kind !== 'landscape' && kind !== 'square' && kind !== 'custom') {
    throw new Error('Jenis kanvas dalam preset tidak dikenali.');
  }
  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16384 || height > 16384) {
    throw new Error('Ukuran kanvas dalam preset berada di luar batas.');
  }
  return { kind, width, height };
}

function parsePresetGroups(value: unknown, elementIdMap: Map<string, string>): StudioPresetGroup[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new Error('Daftar grup preset tidak valid.');
  const seenGroupIds = new Set<string>();
  return value.map((raw, index) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id.trim() || !Array.isArray(raw.elementIds) || raw.elementIds.length > MAX_PRESET_ELEMENTS) {
      throw new Error(`Grup ke-${index + 1} tidak valid.`);
    }
    if (seenGroupIds.has(raw.id)) throw new Error(`ID grup "${raw.id}" terduplikasi.`);
    seenGroupIds.add(raw.id);
    const elementIds = [...new Set(raw.elementIds.map((id) => {
      if (typeof id !== 'string' || !elementIdMap.has(id)) throw new Error(`Grup "${raw.name || raw.id}" merujuk elemen yang tidak tersedia.`);
      return elementIdMap.get(id)!;
    }))];
    if (!elementIds.length) throw new Error(`Grup "${raw.name || raw.id}" tidak memiliki elemen.`);
    const optionalNumber = (key: string, min: number, max: number) => {
      if (raw[key] === undefined) return undefined;
      const number = Number(raw[key]);
      if (!Number.isFinite(number) || number < min || number > max) throw new Error(`Nilai ${key} pada grup tidak valid.`);
      return number;
    };
    return {
      id: createTransferId(`group${index}`),
      name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) || `Grup ${index + 1}` : `Grup ${index + 1}`,
      elementIds,
      visible: raw.visible !== false,
      locked: raw.locked === true,
      ...(optionalNumber('opacity', 0, 100) !== undefined ? { opacity: optionalNumber('opacity', 0, 100) } : {}),
      ...(optionalNumber('x', -100, 200) !== undefined ? { x: optionalNumber('x', -100, 200) } : {}),
      ...(optionalNumber('y', -100, 200) !== undefined ? { y: optionalNumber('y', -100, 200) } : {}),
      ...(optionalNumber('width', 0, 300) !== undefined ? { width: optionalNumber('width', 0, 300) } : {}),
      ...(optionalNumber('height', 0, 300) !== undefined ? { height: optionalNumber('height', 0, 300) } : {}),
      ...(optionalNumber('rotation', -3600, 3600) !== undefined ? { rotation: optionalNumber('rotation', -3600, 3600) } : {}),
      ...(optionalNumber('zIndex', -10000, 10000) !== undefined ? { zIndex: optionalNumber('zIndex', -10000, 10000) } : {}),
      ...(isRecord(raw.properties) ? { properties: { ...raw.properties } } : {}),
      ...(isRecord(raw.eventBinding) ? { eventBinding: { ...raw.eventBinding } } : {}),
      ...(typeof raw.enterAnimation === 'string' || isRecord(raw.enterAnimation) ? { enterAnimation: raw.enterAnimation as StudioPresetGroup['enterAnimation'] } : {}),
      ...(typeof raw.exitAnimation === 'string' || isRecord(raw.exitAnimation) ? { exitAnimation: raw.exitAnimation as StudioPresetGroup['exitAnimation'] } : {}),
      ...(optionalNumber('enterDurationMs', 0, 600000) !== undefined ? { enterDurationMs: optionalNumber('enterDurationMs', 0, 600000) } : {}),
      ...(optionalNumber('exitDurationMs', 0, 600000) !== undefined ? { exitDurationMs: optionalNumber('exitDurationMs', 0, 600000) } : {}),
      ...(optionalNumber('displayDurationMs', 0, 3600000) !== undefined ? { displayDurationMs: optionalNumber('displayDurationMs', 0, 3600000) } : {}),
      ...(optionalNumber('alertDurationMs', 0, 3600000) !== undefined ? { alertDurationMs: optionalNumber('alertDurationMs', 0, 3600000) } : {}),
      ...(typeof raw.autoDismiss === 'boolean' ? { autoDismiss: raw.autoDismiss } : {}),
      ...(optionalNumber('sequenceOrder', -100000, 100000) !== undefined ? { sequenceOrder: optionalNumber('sequenceOrder', -100000, 100000) } : {}),
      ...(optionalNumber('animationDelayMs', 0, 600000) !== undefined ? { animationDelayMs: optionalNumber('animationDelayMs', 0, 600000) } : {}),
    };
  });
}

function parsePresetSuperGroups(value: unknown, sourceGroupIdMap: Map<string, string>): StudioPresetSuperGroup[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) throw new Error('Daftar supergroup preset tidak valid.');
  const seenSuperGroupIds = new Set<string>();
  return value.map((raw, index) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id.trim() || !Array.isArray(raw.groupIds) || raw.groupIds.length > 100) {
      throw new Error(`Supergroup ke-${index + 1} tidak valid.`);
    }
    if (seenSuperGroupIds.has(raw.id)) throw new Error(`ID supergroup "${raw.id}" terduplikasi.`);
    seenSuperGroupIds.add(raw.id);
    const groupIds = [...new Set(raw.groupIds.map((id) => {
      if (typeof id !== 'string' || !sourceGroupIdMap.has(id)) throw new Error(`Supergroup "${raw.name || raw.id}" merujuk grup yang tidak tersedia.`);
      return sourceGroupIdMap.get(id)!;
    }))];
    if (!groupIds.length) throw new Error(`Supergroup "${raw.name || raw.id}" tidak memiliki grup.`);
    return {
      id: createTransferId(`super${index}`),
      name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) || `Supergroup ${index + 1}` : `Supergroup ${index + 1}`,
      groupIds,
      visible: raw.visible !== false,
      locked: raw.locked === true,
      ...(isRecord(raw.properties) ? { properties: { ...raw.properties } } : {}),
      ...(isRecord(raw.eventBinding) ? { eventBinding: { ...raw.eventBinding } } : {}),
      ...(typeof raw.enterAnimation === 'string' || isRecord(raw.enterAnimation) ? { enterAnimation: raw.enterAnimation as StudioPresetSuperGroup['enterAnimation'] } : {}),
      ...(typeof raw.exitAnimation === 'string' || isRecord(raw.exitAnimation) ? { exitAnimation: raw.exitAnimation as StudioPresetSuperGroup['exitAnimation'] } : {}),
      ...(raw.sequenceOrder !== undefined ? (() => {
        const value = Number(raw.sequenceOrder);
        if (!Number.isInteger(value) || value < -100000 || value > 100000) throw new Error('sequenceOrder pada supergroup tidak valid.');
        return { sequenceOrder: value };
      })() : {}),
      ...(raw.animationDelayMs !== undefined ? (() => {
        const value = Number(raw.animationDelayMs);
        if (!Number.isFinite(value) || value < 0 || value > 600000) throw new Error('animationDelayMs pada supergroup tidak valid.');
        return { animationDelayMs: value };
      })() : {}),
    };
  });
}

function validateMediaType(type: unknown, mimeType: unknown): type is 'image' | 'video' | 'audio' {
  if (type !== 'image' && type !== 'video' && type !== 'audio') return false;
  if (typeof mimeType !== 'string') return false;
  if (type === 'image') return mimeType.startsWith('image/');
  if (type === 'video') return mimeType.startsWith('video/');
  return mimeType.startsWith('audio/');
}

export async function importPresetPackageFile(file: File): Promise<ImportedPresetPackageResult> {
  if (!file || file.size <= 0 || file.size > MAX_PACKAGE_FILE_BYTES) {
    throw new Error(`File preset kosong atau melebihi batas ${Math.round(MAX_PACKAGE_FILE_BYTES / 1024 / 1024)} MB.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('File bukan JSON preset SYNTXRR yang valid.');
  }
  if (!isRecord(parsed) || parsed.app !== 'SYNTXRR STREAM' || parsed.format !== 'syntxrr-preset' || (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2)) {
    throw new Error('Format preset tidak didukung. Pilih file ekspor preset SYNTXRR STREAM.');
  }
  const rawPreset = parsed.preset;
  if (!isRecord(rawPreset)) throw new Error('Data preset tidak ditemukan dalam file.');
  const name = typeof rawPreset.name === 'string' ? rawPreset.name.trim().slice(0, 80) : '';
  if (!name) throw new Error('Nama preset dalam file kosong.');
  const canvasOrientation = parseOrientation(rawPreset.canvasOrientation);
  const category: Exclude<PresetCategory, 'all' | 'favorites'> =
    canvasOrientation === '16:9' ? 'landscape' : canvasOrientation === '1:1' ? 'portrait' : 'hp_screen';
  const parsedElements = parseElements(rawPreset.elements);
  const elements = parsedElements.elements;

  const rawBackgroundUri = typeof rawPreset.backgroundUri === 'string' && rawPreset.backgroundUri.length <= 4096 && !/^blob:/i.test(rawPreset.backgroundUri)
    ? rawPreset.backgroundUri
    : undefined;
  const originalBackgroundAssetId = getStudioMediaAssetIdFromUri(rawBackgroundUri);
  if (isStudioMediaAssetUri(rawBackgroundUri) && !originalBackgroundAssetId) {
    throw new Error('Referensi background lokal dalam file preset tidak valid.');
  }

  const transitionIn = parsed.schemaVersion === 2 ? parseMetadata(rawPreset.transitionIn, 'Transisi masuk') : undefined;
  const transitionOut = parsed.schemaVersion === 2 ? parseMetadata(rawPreset.transitionOut, 'Transisi keluar') : undefined;
  const rawScreensaver = parsed.schemaVersion === 2 ? parseMetadata(rawPreset.screensaver, 'Screensaver') : undefined;
  if (isRecord(rawScreensaver) && typeof rawScreensaver.media === 'string' && isStudioMediaAssetUri(rawScreensaver.media)) {
    if (!getStudioMediaAssetIdFromUri(rawScreensaver.media)) {
      throw new Error('Referensi media screensaver lokal dalam file preset tidak valid.');
    }
  }

  // Validate v2 structured groups & canvas BEFORE writing any media to IndexedDB
  const groups = parsed.schemaVersion === 2
    ? parsePresetGroups(rawPreset.groups, parsedElements.idMap)
    : [];
  const rawSourceGroups = Array.isArray(rawPreset.groups) ? rawPreset.groups : [];
  const groupIdMap = new Map<string, string>();
  rawSourceGroups.forEach((rawGroup: any, index: number) => {
    const importedGroup = groups[index];
    if (isRecord(rawGroup) && typeof rawGroup.id === 'string' && importedGroup) groupIdMap.set(rawGroup.id, importedGroup.id);
  });
  const superGroups = parsed.schemaVersion === 2
    ? parsePresetSuperGroups(rawPreset.superGroups, groupIdMap)
    : [];
  const canvas = parsed.schemaVersion === 2 ? parseCanvas(rawPreset.canvas, canvasOrientation) : defaultCanvasSpec(canvasOrientation);

  if (!Array.isArray(parsed.media) || parsed.media.length > 100) {
    throw new Error('Daftar media preset tidak valid atau terlalu banyak.');
  }
  const referencedAssets = collectAssetReferences(
    elements.map((element, index) => ({
      ...element,
      properties: isRecord((rawPreset.elements as any[])[index]?.properties)
        ? (rawPreset.elements as any[])[index].properties
        : {},
    })),
    rawBackgroundUri,
    rawScreensaver,
  );
  const mediaByOriginalId = new Map<string, StoredStudioMediaAsset & { blob: Blob }>();
  let totalBytes = 0;
  for (const rawMedia of parsed.media) {
    if (!isRecord(rawMedia) || typeof rawMedia.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(rawMedia.id)) {
      throw new Error('Identitas media dalam file preset tidak valid.');
    }
    if (mediaByOriginalId.has(rawMedia.id) || !validateMediaType(rawMedia.type, rawMedia.mimeType) || rawMedia.mimeType.length > 100) {
      throw new Error(`Metadata media "${rawMedia.name || rawMedia.id}" tidak valid.`);
    }
    if (typeof rawMedia.dataBase64 !== 'string') throw new Error(`Data media "${rawMedia.name || rawMedia.id}" tidak ditemukan.`);
    const bytes = base64ToBytes(rawMedia.dataBase64);
    if (bytes.length <= 0 || bytes.length > MAX_SINGLE_MEDIA_BYTES || bytes.length !== Number(rawMedia.sizeBytes)) {
      throw new Error(`Ukuran media "${rawMedia.name || rawMedia.id}" tidak cocok atau melewati batas.`);
    }
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_MEDIA_BYTES) throw new Error('Total media dalam preset melewati batas transfer 32 MB.');
    const blob = new Blob([bytes], { type: rawMedia.mimeType });
    const id = createTransferId('asset');
    mediaByOriginalId.set(rawMedia.id, {
      id,
      name: typeof rawMedia.name === 'string' && rawMedia.name.trim() ? rawMedia.name.slice(0, 180) : `media-${id}`,
      type: rawMedia.type,
      mimeType: rawMedia.mimeType,
      sizeBytes: blob.size,
      addedAt: Date.now(),
      blob,
    });
  }

  const mediaIdMap = new Map<string, string>();
  for (const [id, expectedType] of referencedAssets) {
    const media = mediaByOriginalId.get(id);
    if (!media || media.type !== expectedType) {
      throw new Error(`Media lokal "${id}" tidak disertakan atau jenisnya tidak cocok. Preset tidak diimpor agar elemen tidak rusak.`);
    }
    mediaIdMap.set(id, media.id);
  }

  const remappedElements = elements.map((element, index) => {
    const originalProperties = isRecord((rawPreset.elements as any[])[index]?.properties)
      ? (rawPreset.elements as any[])[index].properties
      : {};
    const properties = { ...element.properties };
    for (const reference of ASSET_ID_KEYS) {
      const oldId = originalProperties[reference.key];
      if (typeof oldId === 'string' && oldId) properties[reference.key] = mediaIdMap.get(oldId) || '';
      const urlKey = reference.key === 'imageAssetId' ? 'imageUrl'
        : reference.key === 'videoAssetId' ? 'videoUrl' : 'audioUrl';
      if (urlKey && typeof properties[urlKey] === 'string' && /^blob:/i.test(properties[urlKey])) {
        properties[urlKey] = '';
      }
    }
    return { ...element, properties };
  });

  const referencedNewIds = new Set(mediaIdMap.values());
  const mediaToSave = [...mediaByOriginalId.values()].filter((media) => referencedNewIds.has(media.id));

  const remappedBackgroundAssetId = originalBackgroundAssetId
    ? mediaIdMap.get(originalBackgroundAssetId)
    : undefined;
  if (originalBackgroundAssetId && !remappedBackgroundAssetId) {
    throw new Error('Media background lokal tidak disertakan atau bukan gambar. Preset tidak diimpor.');
  }
  const backgroundUri = originalBackgroundAssetId
    ? createStudioMediaAssetUri(remappedBackgroundAssetId!)
    : rawBackgroundUri;

  let screensaver: StudioPreset['screensaver'] = rawScreensaver;
  if (isRecord(rawScreensaver)) {
    const clonedScreensaver = { ...rawScreensaver };
    if (typeof clonedScreensaver.media === 'string') {
      if (/^blob:/i.test(clonedScreensaver.media)) {
        clonedScreensaver.media = '';
      } else {
        const originalScreensaverAssetId = getStudioMediaAssetIdFromUri(clonedScreensaver.media);
        if (originalScreensaverAssetId) {
          const remappedScreensaverAssetId = mediaIdMap.get(originalScreensaverAssetId);
          if (!remappedScreensaverAssetId) {
            throw new Error('Media screensaver lokal tidak disertakan atau jenisnya tidak cocok. Preset tidak diimpor.');
          }
          clonedScreensaver.media = createStudioMediaAssetUri(remappedScreensaverAssetId);
        }
      }
    }
    screensaver = clonedScreensaver;
  }

  if (mediaToSave.length > 0) await StorageService.saveStudioMediaAssetsForPresetTransfer(mediaToSave);

  return {
    preset: {
      name,
      category,
      canvasOrientation,
      canvas,
      ...(backgroundUri ? { backgroundUri } : {}),
      groups,
      superGroups,
      ...(transitionIn !== undefined ? { transitionIn } : {}),
      ...(transitionOut !== undefined ? { transitionOut } : {}),
      ...(screensaver !== undefined ? { screensaver } : {}),
      schema: parsed.schemaVersion === 2 && Number.isFinite(Number(rawPreset.schema)) ? Math.round(Number(rawPreset.schema)) : 2,
      elements: ensureUniqueElementIds(remappedElements),
      isFavorite: rawPreset.isFavorite === true,
      description: typeof rawPreset.description === 'string' ? rawPreset.description.slice(0, 500) : 'Preset diimpor dari file SYNTXRR STREAM',
      thumbnailColor: typeof rawPreset.thumbnailColor === 'string' && /^#[0-9a-f]{6}$/i.test(rawPreset.thumbnailColor)
        ? rawPreset.thumbnailColor
        : '#2563EB',
    },
    importedMediaCount: mediaToSave.length,
    importedAssetIds: mediaToSave.map((media) => media.id),
  };
}
