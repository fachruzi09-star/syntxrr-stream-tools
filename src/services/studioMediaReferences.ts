import type { StudioElement, StudioPreset } from '../types';
import { getStudioMediaAssetIdFromUri } from './presetModel';

export type StudioMediaReferenceKind =
  | 'active_element'
  | 'preset_element'
  | 'preset_background'
  | 'preset_screensaver';

export type StudioMediaReferenceField =
  | 'imageAssetId'
  | 'videoAssetId'
  | 'audioAssetId'
  | 'imageUrl'
  | 'videoUrl'
  | 'audioUrl'
  | 'backgroundUri'
  | 'screensaver.media';

export interface StudioMediaReference {
  kind: StudioMediaReferenceKind;
  field: StudioMediaReferenceField;
  fields: StudioMediaReferenceField[];
  presetId?: string;
  presetName?: string;
  isActivePreset?: boolean;
  elementId?: string;
  elementName?: string;
  elementType?: StudioElement['type'];
}

export interface FindStudioMediaReferencesInput {
  assetId: string;
  activeElements?: readonly StudioElement[];
  presets?: readonly StudioPreset[];
  activePresetId?: string;
}

export interface StudioMediaReferenceCheckResult {
  assetId: string;
  isReferenced: boolean;
  references: StudioMediaReference[];
}

export interface ExecuteProtectedStudioMediaDeleteDeps {
  assetId: string;
  assetName?: string;
  activeElements?: readonly StudioElement[];
  presets?: readonly StudioPreset[];
  activePresetId?: string;
  deleteFromStorage: (assetId: string) => Promise<void>;
}

export type ExecuteProtectedStudioMediaDeleteResult =
  | {
      deleted: true;
      blockedByReferences: false;
      references: [];
    }
  | {
      deleted: false;
      blockedByReferences: true;
      references: StudioMediaReference[];
      message: string;
    }
  | {
      deleted: false;
      blockedByReferences: false;
      references: [];
      errorMessage: string;
      message: string;
    };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const ELEMENT_ASSET_ID_FIELDS: ReadonlyArray<{
  key: 'imageAssetId' | 'videoAssetId' | 'audioAssetId';
}> = [
  { key: 'imageAssetId' },
  { key: 'videoAssetId' },
  { key: 'audioAssetId' },
];

const ELEMENT_ASSET_URI_FIELDS: ReadonlyArray<{
  key: 'imageUrl' | 'videoUrl' | 'audioUrl';
}> = [
  { key: 'imageUrl' },
  { key: 'videoUrl' },
  { key: 'audioUrl' },
];

function collectMatchingElementFields(
  element: StudioElement | null | undefined,
  normalizedAssetId: string,
): StudioMediaReferenceField[] {
  if (!element || !isPlainRecord(element.properties)) return [];
  const props = element.properties;
  const matchedFields: StudioMediaReferenceField[] = [];

  for (const { key } of ELEMENT_ASSET_ID_FIELDS) {
    const rawValue = props[key];
    if (typeof rawValue === 'string' && rawValue.trim() === normalizedAssetId) {
      matchedFields.push(key);
    }
  }

  for (const { key } of ELEMENT_ASSET_URI_FIELDS) {
    const parsedId = getStudioMediaAssetIdFromUri(props[key]);
    if (parsedId === normalizedAssetId) {
      matchedFields.push(key);
    }
  }

  return matchedFields;
}

/**
 * Checks whether a local Studio media asset ID is still referenced by:
 * - Any element on the active canvas (including unsaved edits),
 * - Any element inside any preset (active or inactive),
 * - Any preset's backgroundUri,
 * - Any preset's screensaver.media.
 *
 * Pure and non-mutating: never alters input elements or presets.
 */
export function findStudioMediaAssetReferences(
  input: FindStudioMediaReferencesInput,
): StudioMediaReferenceCheckResult {
  const normalizedAssetId = typeof input.assetId === 'string' ? input.assetId.trim() : '';
  if (!normalizedAssetId) {
    return {
      assetId: '',
      isReferenced: false,
      references: [],
    };
  }

  const activeElements = Array.isArray(input.activeElements) ? input.activeElements : [];
  const presets = Array.isArray(input.presets) ? input.presets : [];
  const activePresetId =
    typeof input.activePresetId === 'string' && input.activePresetId.trim()
      ? input.activePresetId.trim()
      : undefined;
  const activePreset = activePresetId
    ? presets.find((preset) => preset && preset.id === activePresetId)
    : undefined;

  const references: StudioMediaReference[] = [];
  const activeCanvasMatchedElementIds = new Set<string>();

  for (const element of activeElements) {
    const matchedFields = collectMatchingElementFields(element, normalizedAssetId);
    if (matchedFields.length === 0) continue;
    if (typeof element?.id === 'string' && element.id) {
      activeCanvasMatchedElementIds.add(element.id);
    }
    references.push({
      kind: 'active_element',
      field: matchedFields[0],
      fields: matchedFields,
      ...(activePreset ? { presetId: activePreset.id, presetName: activePreset.name, isActivePreset: true } : {}),
      elementId: element.id,
      elementName: element.name || element.type,
      elementType: element.type,
    });
  }

  for (const preset of presets) {
    if (!preset || typeof preset !== 'object') continue;
    const isActive = Boolean(activePresetId && preset.id === activePresetId);
    const presetName = preset.name || preset.id;

    if (getStudioMediaAssetIdFromUri(preset.backgroundUri) === normalizedAssetId) {
      references.push({
        kind: 'preset_background',
        field: 'backgroundUri',
        fields: ['backgroundUri'],
        presetId: preset.id,
        presetName,
        isActivePreset: isActive,
      });
    }

    if (
      isPlainRecord(preset.screensaver) &&
      getStudioMediaAssetIdFromUri(preset.screensaver.media) === normalizedAssetId
    ) {
      references.push({
        kind: 'preset_screensaver',
        field: 'screensaver.media',
        fields: ['screensaver.media'],
        presetId: preset.id,
        presetName,
        isActivePreset: isActive,
      });
    }

    const presetElements = Array.isArray(preset.elements) ? preset.elements : [];
    for (const element of presetElements) {
      // Avoid reporting the exact same active-preset element twice when already captured from active canvas.
      if (isActive && typeof element?.id === 'string' && activeCanvasMatchedElementIds.has(element.id)) {
        continue;
      }
      const matchedFields = collectMatchingElementFields(element, normalizedAssetId);
      if (matchedFields.length === 0) continue;
      references.push({
        kind: 'preset_element',
        field: matchedFields[0],
        fields: matchedFields,
        presetId: preset.id,
        presetName,
        isActivePreset: isActive,
        elementId: element.id,
        elementName: element.name || element.type,
        elementType: element.type,
      });
    }
  }

  return {
    assetId: normalizedAssetId,
    isReferenced: references.length > 0,
    references,
  };
}

function describeSingleReference(ref: StudioMediaReference): string {
  const presetLabel = ref.presetName || ref.presetId;
  if (ref.kind === 'active_element') {
    const elemLabel = ref.elementName || ref.elementId || 'elemen';
    return presetLabel
      ? `kanvas aktif "${presetLabel}" (elemen "${elemLabel}")`
      : `kanvas aktif (elemen "${elemLabel}")`;
  }
  if (ref.kind === 'preset_element') {
    const elemLabel = ref.elementName || ref.elementId || 'elemen';
    return presetLabel
      ? `preset "${presetLabel}" (elemen "${elemLabel}")`
      : `elemen "${elemLabel}"`;
  }
  if (ref.kind === 'preset_background') {
    return presetLabel
      ? `background preset "${presetLabel}"`
      : 'background preset';
  }
  return presetLabel
    ? `screensaver preset "${presetLabel}"`
    : 'screensaver preset';
}

export function formatStudioMediaBlockedDeleteMessage(
  assetName: string | undefined,
  references: readonly StudioMediaReference[],
): string {
  const displayName = (assetName || '').trim() || 'Aset media';
  if (references.length === 0) {
    return `"${displayName}" tidak dapat dihapus karena masih digunakan.`;
  }

  const maxListed = 3;
  const uniqueDescriptions: string[] = [];
  for (const ref of references) {
    const desc = describeSingleReference(ref);
    if (!uniqueDescriptions.includes(desc)) {
      uniqueDescriptions.push(desc);
    }
  }
  const shown = uniqueDescriptions.slice(0, maxListed);
  const remaining = uniqueDescriptions.length - shown.length;
  const suffix = remaining > 0 ? `, dan ${remaining} referensi lainnya` : '';

  return `"${displayName}" masih digunakan oleh ${shown.join(', ')}${suffix}. Lepas referensi tersebut terlebih dahulu sebelum menghapus aset.`;
}

export async function executeProtectedStudioMediaDelete(
  deps: ExecuteProtectedStudioMediaDeleteDeps,
): Promise<ExecuteProtectedStudioMediaDeleteResult> {
  const check = findStudioMediaAssetReferences({
    assetId: deps.assetId,
    activeElements: deps.activeElements,
    presets: deps.presets,
    activePresetId: deps.activePresetId,
  });

  if (check.isReferenced) {
    return {
      deleted: false,
      blockedByReferences: true,
      references: check.references,
      message: formatStudioMediaBlockedDeleteMessage(deps.assetName, check.references),
    };
  }

  try {
    await deps.deleteFromStorage(check.assetId);
    return {
      deleted: true,
      blockedByReferences: false,
      references: [],
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error && err.message.trim()
        ? err.message.trim()
        : 'Gagal menghapus aset media dari penyimpanan lokal.';
    const displayName = (deps.assetName || '').trim() || check.assetId;
    return {
      deleted: false,
      blockedByReferences: false,
      references: [],
      errorMessage,
      message: `Gagal menghapus "${displayName}": ${errorMessage}`,
    };
  }
}
