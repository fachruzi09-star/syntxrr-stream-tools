import {
  CanvasOrientation,
  StudioCanvasSpec,
  StudioPreset,
  StudioPresetGroup,
  StudioPresetSuperGroup,
  StudioElement,
} from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Stable reference for an image stored in the Studio IndexedDB media library. */
export const STUDIO_MEDIA_URI_PREFIX = 'studio-media://';

export function createStudioMediaAssetUri(assetId: string): string | undefined {
  const normalized = typeof assetId === 'string' ? assetId.trim() : '';
  return /^[A-Za-z0-9_-]{1,100}$/.test(normalized)
    ? `${STUDIO_MEDIA_URI_PREFIX}${normalized}`
    : undefined;
}

export function getStudioMediaAssetIdFromUri(uri: unknown): string | undefined {
  if (typeof uri !== 'string' || !uri.startsWith(STUDIO_MEDIA_URI_PREFIX)) return undefined;
  const assetId = uri.slice(STUDIO_MEDIA_URI_PREFIX.length);
  return /^[A-Za-z0-9_-]{1,100}$/.test(assetId) ? assetId : undefined;
}

export function isStudioMediaAssetUri(uri: unknown): boolean {
  return typeof uri === 'string' && uri.startsWith(STUDIO_MEDIA_URI_PREFIX);
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

export function defaultCanvasSpec(orientation: CanvasOrientation): StudioCanvasSpec {
  if (orientation === '16:9') return { kind: 'landscape', width: 1920, height: 1080 };
  if (orientation === '1:1') return { kind: 'square', width: 1080, height: 1080 };
  return { kind: 'portrait', width: 1080, height: 1920 };
}

function normalizeCanvas(value: unknown, orientation: CanvasOrientation): StudioCanvasSpec {
  const fallback = defaultCanvasSpec(orientation);
  if (!isRecord(value)) return fallback;
  const kind = value.kind === 'portrait' || value.kind === 'landscape' || value.kind === 'square' || value.kind === 'custom'
    ? value.kind
    : fallback.kind;
  return {
    kind,
    width: Math.round(finiteNumber(value.width, fallback.width, 1, 16384)),
    height: Math.round(finiteNumber(value.height, fallback.height, 1, 16384)),
  };
}


export interface PresetGroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const roundPosition = (value: number): number => Math.round(value * 10) / 10;

/** Derives the live group frame from its child elements instead of trusting stale saved bounds. */
export function getPresetGroupBounds(
  group: Pick<StudioPresetGroup, 'elementIds'>,
  elements: StudioElement[],
): PresetGroupBounds | null {
  const memberIds = new Set(group.elementIds || []);
  const children = elements.filter((element) => memberIds.has(element.id));
  if (!children.length) return null;

  const left = Math.min(...children.map((element) => element.x));
  const top = Math.min(...children.map((element) => element.y));
  const right = Math.max(...children.map((element) => element.x + element.width));
  const bottom = Math.max(...children.map((element) => element.y + element.height));
  if (![left, top, right, bottom].every(Number.isFinite)) return null;

  return {
    x: roundPosition(left),
    y: roundPosition(top),
    width: roundPosition(Math.max(0, right - left)),
    height: roundPosition(Math.max(0, bottom - top)),
  };
}

/**
 * Applies one absolute group transform from the pointer-down snapshot. Passing the original
 * elements on every pointer move avoids cumulative rounding drift and leaves non-members intact.
 */
export function transformPresetGroupElements(
  currentElements: StudioElement[],
  group: Pick<StudioPresetGroup, 'elementIds'>,
  originalElements: StudioElement[],
  startBounds: PresetGroupBounds,
  targetBounds: PresetGroupBounds,
): StudioElement[] {
  const memberIds = new Set(group.elementIds || []);
  const originalById = new Map(originalElements.map((element) => [element.id, element]));
  const scaleX = startBounds.width > 0 ? targetBounds.width / startBounds.width : 1;
  const scaleY = startBounds.height > 0 ? targetBounds.height / startBounds.height : 1;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    return currentElements;
  }

  return currentElements.map((element) => {
    if (!memberIds.has(element.id)) return element;
    const original = originalById.get(element.id);
    if (!original) return element;
    return {
      ...element,
      x: roundPosition(targetBounds.x + (original.x - startBounds.x) * scaleX),
      y: roundPosition(targetBounds.y + (original.y - startBounds.y) * scaleY),
      width: roundPosition(Math.max(5, original.width * scaleX)),
      height: roundPosition(Math.max(3, original.height * scaleY)),
    };
  });
}

function normalizeGroup(raw: unknown, index: number, validElementIds: Set<string>): StudioPresetGroup | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim().slice(0, 120) : '';
  if (!id) return null;
  const elementIds = Array.isArray(raw.elementIds)
    ? [...new Set(raw.elementIds.filter((item): item is string => typeof item === 'string' && validElementIds.has(item)))]
    : [];
  if (!elementIds.length) return null;
  return {
    ...(raw as unknown as StudioPresetGroup),
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : `Grup ${index + 1}`,
    elementIds,
    visible: raw.visible !== false,
    locked: raw.locked === true,
    ...(raw.opacity !== undefined ? { opacity: finiteNumber(raw.opacity, 100, 0, 100) } : {}),
    ...(raw.x !== undefined ? { x: finiteNumber(raw.x, 0, -100, 200) } : {}),
    ...(raw.y !== undefined ? { y: finiteNumber(raw.y, 0, -100, 200) } : {}),
    ...(raw.width !== undefined ? { width: finiteNumber(raw.width, 0, 0, 300) } : {}),
    ...(raw.height !== undefined ? { height: finiteNumber(raw.height, 0, 0, 300) } : {}),
    ...(raw.rotation !== undefined ? { rotation: finiteNumber(raw.rotation, 0, -3600, 3600) } : {}),
    ...(raw.zIndex !== undefined ? { zIndex: finiteNumber(raw.zIndex, index, -10000, 10000) } : {}),
    ...(isRecord(raw.properties) ? { properties: { ...raw.properties } } : {}),
    ...(isRecord(raw.eventBinding) ? { eventBinding: { ...raw.eventBinding } } : {}),
    ...(typeof raw.enterAnimation === 'string' || isRecord(raw.enterAnimation) ? { enterAnimation: raw.enterAnimation as StudioPresetGroup['enterAnimation'] } : {}),
    ...(typeof raw.exitAnimation === 'string' || isRecord(raw.exitAnimation) ? { exitAnimation: raw.exitAnimation as StudioPresetGroup['exitAnimation'] } : {}),
  };
}

function normalizeSuperGroup(raw: unknown, index: number, validGroupIds: Set<string>): StudioPresetSuperGroup | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim().slice(0, 120) : '';
  if (!id) return null;
  const groupIds = Array.isArray(raw.groupIds)
    ? [...new Set(raw.groupIds.filter((item): item is string => typeof item === 'string' && validGroupIds.has(item)))]
    : [];
  if (!groupIds.length) return null;
  return {
    ...(raw as unknown as StudioPresetSuperGroup),
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : `Supergroup ${index + 1}`,
    groupIds,
    visible: raw.visible !== false,
    locked: raw.locked === true,
    ...(isRecord(raw.properties) ? { properties: { ...raw.properties } } : {}),
    ...(isRecord(raw.eventBinding) ? { eventBinding: { ...raw.eventBinding } } : {}),
    ...(typeof raw.enterAnimation === 'string' || isRecord(raw.enterAnimation) ? { enterAnimation: raw.enterAnimation as StudioPresetSuperGroup['enterAnimation'] } : {}),
    ...(typeof raw.exitAnimation === 'string' || isRecord(raw.exitAnimation) ? { exitAnimation: raw.exitAnimation as StudioPresetSuperGroup['exitAnimation'] } : {}),
  };
}

/**
 * Normalizes legacy flat presets while retaining structured scene fields. Element/group
 * references that point to missing children are removed instead of leaving broken links.
 */
export function normalizeStudioPreset(preset: StudioPreset): StudioPreset {
  const orientation: CanvasOrientation = preset.canvasOrientation === '16:9' || preset.canvasOrientation === '1:1'
    ? preset.canvasOrientation
    : '9:16';
  const elements = Array.isArray(preset.elements) ? preset.elements : [];
  const validElementIds = new Set(elements.map((element) => element?.id).filter((id): id is string => typeof id === 'string' && id.length > 0));
  const rawGroups = Array.isArray(preset.groups) ? preset.groups : [];
  const usedElementIds = new Set<string>();
  const groups: StudioPresetGroup[] = [];
  const usedGroupIds = new Set<string>();
  for (let index = 0; index < rawGroups.length; index += 1) {
    const group = normalizeGroup(rawGroups[index], index, validElementIds);
    if (!group || usedGroupIds.has(group.id)) continue;
    group.elementIds = group.elementIds.filter((id) => {
      if (usedElementIds.has(id)) return false;
      usedElementIds.add(id);
      return true;
    });
    if (!group.elementIds.length) continue;
    usedGroupIds.add(group.id);
    groups.push(group);
  }
  // In SYNTXRR, Group geometry is the live axis-aligned bounds of its absolute-positioned children.
  // Recompute it during normalization so drag, resize, undo, and redo cannot leave stale bounds.
  const groupsWithLiveBounds = groups.map((group) => {
    const bounds = getPresetGroupBounds(group, elements);
    return bounds ? { ...group, ...bounds } : group;
  });

  const rawSuperGroups = Array.isArray(preset.superGroups) ? preset.superGroups : [];
  const usedGroups = new Set<string>();
  const superGroups: StudioPresetSuperGroup[] = [];
  for (let index = 0; index < rawSuperGroups.length; index += 1) {
    const group = normalizeSuperGroup(rawSuperGroups[index], index, usedGroupIds);
    if (!group || superGroups.some((item) => item.id === group.id)) continue;
    group.groupIds = group.groupIds.filter((id) => {
      if (usedGroups.has(id)) return false;
      usedGroups.add(id);
      return true;
    });
    if (group.groupIds.length) superGroups.push(group);
  }

  const backgroundUri = typeof preset.backgroundUri === 'string' && preset.backgroundUri.length <= 4096 && !/^blob:/i.test(preset.backgroundUri)
    ? preset.backgroundUri
    : undefined;
  const isMetadataValue = (value: unknown): value is Record<string, unknown> | string | null =>
    value === null || typeof value === 'string' || isRecord(value);

  return {
    ...preset,
    canvas: normalizeCanvas(preset.canvas, orientation),
    ...(backgroundUri !== undefined ? { backgroundUri } : { backgroundUri: undefined }),
    groups: groupsWithLiveBounds,
    superGroups,
    ...(isMetadataValue(preset.transitionIn) ? { transitionIn: preset.transitionIn } : {}),
    ...(isMetadataValue(preset.transitionOut) ? { transitionOut: preset.transitionOut } : {}),
    ...(isMetadataValue(preset.screensaver) ? { screensaver: preset.screensaver } : {}),
    schema: Math.max(1, Math.min(100, Math.round(finiteNumber(preset.schema, 2, 1, 100)))),
  };
}

export function createGroupForElements(
  elements: StudioPreset['elements'],
  elementIds: string[],
  name: string,
): StudioPresetGroup {
  const selected = new Set(elementIds);
  const children = elements.filter((element) => selected.has(element.id));
  const left = Math.min(...children.map((element) => element.x));
  const top = Math.min(...children.map((element) => element.y));
  const right = Math.max(...children.map((element) => element.x + element.width));
  const bottom = Math.max(...children.map((element) => element.y + element.height));
  return {
    id: `group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim().slice(0, 80) || `Grup ${Date.now()}`,
    elementIds: children.map((element) => element.id),
    visible: children.every((element) => element.visible),
    locked: children.every((element) => element.locked),
    opacity: 100,
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    rotation: 0,
    zIndex: Math.max(...children.map((element) => element.layer)),
  };
}

export function createSuperGroupForGroups(groups: StudioPresetGroup[], groupIds: string[], name: string): StudioPresetSuperGroup {
  const selected = new Set(groupIds);
  const children = groups.filter((group) => selected.has(group.id));
  return {
    id: `super_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim().slice(0, 80) || `Supergroup ${Date.now()}`,
    groupIds: children.map((group) => group.id),
    visible: children.every((group) => group.visible),
    locked: children.every((group) => group.locked),
  };
}


/** Applies inherited group visibility/lock state without mutating the stored preset children. */
export function applyPresetGroupStateToElements(preset: Pick<StudioPreset, 'elements' | 'groups' | 'superGroups'>): StudioElement[] {
  const groups = Array.isArray(preset.groups) ? preset.groups : [];
  const superGroups = Array.isArray(preset.superGroups) ? preset.superGroups : [];
  const groupByElement = new Map<string, StudioPresetGroup>();
  for (const group of groups) {
    for (const elementId of group.elementIds || []) {
      if (!groupByElement.has(elementId)) groupByElement.set(elementId, group);
    }
  }
  const superGroupByGroup = new Map<string, StudioPresetSuperGroup>();
  for (const superGroup of superGroups) {
    for (const groupId of superGroup.groupIds || []) {
      if (!superGroupByGroup.has(groupId)) superGroupByGroup.set(groupId, superGroup);
    }
  }
  return (Array.isArray(preset.elements) ? preset.elements : []).map((element) => {
    const group = groupByElement.get(element.id);
    const superGroup = group ? superGroupByGroup.get(group.id) : undefined;
    return {
      ...element,
      visible: element.visible !== false && group?.visible !== false && superGroup?.visible !== false,
      locked: element.locked === true || group?.locked === true || superGroup?.locked === true,
    };
  });
}
