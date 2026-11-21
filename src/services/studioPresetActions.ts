import {
  CanvasOrientation,
  PresetCategory,
  StudioElement,
  StudioPreset,
  StudioPresetGroup,
  StudioPresetSuperGroup,
} from '../types';
import { ensureUniqueElementIds } from './storage';
import { normalizeStudioPreset } from './presetModel';

export const STUDIO_PERSISTENCE_DEBOUNCE_MS = 220;

export type StudioSaveStatus = 'saved' | 'pending' | 'saving' | 'error';

export interface StudioSaveState {
  status: StudioSaveStatus;
  lastSavedAt?: number;
  errorMessage?: string;
}

export type StudioAsyncActionResult =
  | { ok: true }
  | { ok: false; reason: 'blocked' | 'error' | 'invalid'; message: string };

export const MODE_B_STRUCTURAL_BLOCK_MESSAGE =
  'Aksi preset diblokir saat siaran Mode B aktif atau sibuk. Hentikan siaran terlebih dahulu.';

function cloneJsonSafe<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonSafe(item)) as unknown as T;
  }
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry !== undefined) {
      copy[key] = cloneJsonSafe(entry);
    }
  }
  return copy as T;
}

export function categoryForOrientation(orientation: CanvasOrientation): PresetCategory {
  if (orientation === '16:9') return 'landscape';
  if (orientation === '9:16') return 'hp_screen';
  return 'portrait';
}

export function createUniquePresetId(
  existingPresets: ReadonlyArray<Pick<StudioPreset, 'id'>>,
  prefix: string = 'preset',
): string {
  const usedIds = new Set(existingPresets.map((preset) => preset.id));
  let counter = 0;
  let candidate = `${prefix}_${Date.now()}`;
  while (usedIds.has(candidate)) {
    counter += 1;
    candidate = `${prefix}_${Date.now()}_${counter}_${Math.random().toString(36).slice(2, 6)}`;
  }
  return candidate;
}

export function createUniqueChildId(prefix: string, usedIds: Set<string>): string {
  let attempt = 0;
  let candidate = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  while (usedIds.has(candidate)) {
    attempt += 1;
    candidate = `${prefix}_${Date.now()}_${attempt}_${Math.random().toString(36).slice(2, 8)}`;
  }
  usedIds.add(candidate);
  return candidate;
}

export function buildBlankPresetDraft(
  existingPresets: ReadonlyArray<Pick<StudioPreset, 'name'>>,
  orientation: CanvasOrientation,
): Omit<StudioPreset, 'id' | 'createdAt'> {
  const existingNames = new Set(
    existingPresets.map((preset) => preset.name.trim().toLowerCase()),
  );
  let name = 'Kanvas Kosong';
  let suffix = 2;
  while (existingNames.has(name.toLowerCase())) {
    name = `Kanvas Kosong ${suffix}`;
    suffix += 1;
  }

  return {
    name,
    category: categoryForOrientation(orientation),
    canvasOrientation: orientation,
    elements: [],
    groups: [],
    superGroups: [],
    isFavorite: false,
    description: 'Kanvas kosong baru Studio SYNTXRR',
    thumbnailColor: '#F2C230',
  };
}

export interface ClonePresetWithRemappedIdsInput {
  sourcePreset?: StudioPreset | null;
  currentElements: StudioElement[];
  existingPresets: ReadonlyArray<StudioPreset>;
  canvasOrientation: CanvasOrientation;
  customName?: string;
  customDescription?: string;
}

/**
 * Creates a deep-cloned StudioPreset copy with collision-free IDs across all elements,
 * groups, and super-groups while preserving Mode B metadata (backgroundUri, screensaver,
 * transitionIn, transitionOut) and Group/Supergroup structure.
 */
export function clonePresetWithRemappedIds(
  input: ClonePresetWithRemappedIdsInput,
): StudioPreset {
  const {
    sourcePreset,
    currentElements,
    existingPresets,
    canvasOrientation,
    customName,
    customDescription,
  } = input;

  const usedElementIds = new Set<string>();
  const usedGroupIds = new Set<string>();
  const usedSuperGroupIds = new Set<string>();

  for (const preset of existingPresets) {
    for (const element of preset.elements || []) {
      if (element?.id) usedElementIds.add(element.id);
    }
    for (const group of preset.groups || []) {
      if (group?.id) usedGroupIds.add(group.id);
    }
    for (const superGroup of preset.superGroups || []) {
      if (superGroup?.id) usedSuperGroupIds.add(superGroup.id);
    }
  }
  for (const element of currentElements) {
    if (element?.id) usedElementIds.add(element.id);
  }

  const sanitizedSourceElements = ensureUniqueElementIds(currentElements);
  const elementIdMap = new Map<string, string>();
  const clonedElements: StudioElement[] = sanitizedSourceElements.map((element) => {
    const newId = createUniqueChildId(`elem_${element.type}`, usedElementIds);
    elementIdMap.set(element.id, newId);
    return {
      ...cloneJsonSafe(element),
      id: newId,
    };
  });

  const groupIdMap = new Map<string, string>();
  const clonedGroups: StudioPresetGroup[] = (sourcePreset?.groups || [])
    .map((group) => {
      const remappedElementIds = (group.elementIds || [])
        .map((id) => elementIdMap.get(id))
        .filter((id): id is string => Boolean(id));
      if (remappedElementIds.length === 0) return null;
      const newGroupId = createUniqueChildId('group', usedGroupIds);
      groupIdMap.set(group.id, newGroupId);
      return {
        ...cloneJsonSafe(group),
        id: newGroupId,
        elementIds: remappedElementIds,
      };
    })
    .filter((group): group is StudioPresetGroup => group !== null);

  const clonedSuperGroups: StudioPresetSuperGroup[] = (sourcePreset?.superGroups || [])
    .map((superGroup) => {
      const remappedGroupIds = (superGroup.groupIds || [])
        .map((id) => groupIdMap.get(id))
        .filter((id): id is string => Boolean(id));
      if (remappedGroupIds.length === 0) return null;
      const newSuperGroupId = createUniqueChildId('super', usedSuperGroupIds);
      return {
        ...cloneJsonSafe(superGroup),
        id: newSuperGroupId,
        groupIds: remappedGroupIds,
      };
    })
    .filter((superGroup): superGroup is StudioPresetSuperGroup => superGroup !== null);

  const resolvedOrientation = canvasOrientation || sourcePreset?.canvasOrientation || '9:16';
  const baseName = sourcePreset?.name?.trim() || 'Preset Studio';
  const resolvedName =
    customName && customName.trim().length > 0
      ? customName.trim()
      : `${baseName} (Salinan)`;
  const resolvedDescription =
    customDescription !== undefined && customDescription.trim().length > 0
      ? customDescription.trim()
      : sourcePreset?.description || 'Salinan preset Studio SYNTXRR';

  const copiedPreset: StudioPreset = {
    ...(sourcePreset?.backgroundUri ? { backgroundUri: sourcePreset.backgroundUri } : {}),
    ...(sourcePreset?.screensaver !== undefined
      ? { screensaver: cloneJsonSafe(sourcePreset.screensaver) }
      : {}),
    ...(sourcePreset?.transitionIn !== undefined
      ? { transitionIn: cloneJsonSafe(sourcePreset.transitionIn) }
      : {}),
    ...(sourcePreset?.transitionOut !== undefined
      ? { transitionOut: cloneJsonSafe(sourcePreset.transitionOut) }
      : {}),
    ...(sourcePreset?.canvas && sourcePreset.canvasOrientation === resolvedOrientation
      ? { canvas: cloneJsonSafe(sourcePreset.canvas) }
      : {}),
    id: createUniquePresetId(existingPresets, 'preset'),
    name: resolvedName,
    category: categoryForOrientation(resolvedOrientation),
    canvasOrientation: resolvedOrientation,
    elements: clonedElements,
    groups: clonedGroups,
    superGroups: clonedSuperGroups,
    createdAt: Date.now(),
    isFavorite: false,
    description: resolvedDescription,
    thumbnailColor: sourcePreset?.thumbnailColor || '#F2C230',
    ...(sourcePreset?.schema !== undefined ? { schema: sourcePreset.schema } : {}),
  };

  return normalizeStudioPreset(copiedPreset);
}

/**
 * Updates only the active preset's elements in memory without discarding its existing
 * metadata (groups, superGroups, backgroundUri, screensaver, transitions) or touching
 * any other presets.
 */
export function applyElementsMutationToPresetState(input: {
  presets: ReadonlyArray<StudioPreset>;
  activePresetId: string;
  newElements: StudioElement[];
}): { elements: StudioElement[]; presets: StudioPreset[] } {
  const sanitized = ensureUniqueElementIds(input.newElements);
  const updatedPresets = input.presets.map((preset) =>
    preset.id === input.activePresetId
      ? normalizeStudioPreset({
          ...preset,
          elements: sanitized,
        })
      : preset,
  );
  return {
    elements: sanitized,
    presets: updatedPresets,
  };
}

export interface StudioPersistenceSnapshot {
  elements: StudioElement[];
  presets: StudioPreset[];
}

export interface StudioPersistenceController {
  schedule: (snapshot: StudioPersistenceSnapshot, delayMs?: number) => void;
  flush: () => Promise<{ success: boolean; errorMessage?: string }>;
  saveNow: (
    snapshot: StudioPersistenceSnapshot,
  ) => Promise<{ success: boolean; errorMessage?: string }>;
  resetSavedState: () => void;
  getState: () => StudioSaveState;
  dispose: () => void;
}

export function createStudioPersistenceController(options: {
  writeSnapshot: (snapshot: StudioPersistenceSnapshot) => Promise<void>;
  onStateChange?: (state: StudioSaveState) => void;
  debounceMs?: number;
}): StudioPersistenceController {
  const defaultDebounceMs = options.debounceMs ?? STUDIO_PERSISTENCE_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: StudioPersistenceSnapshot | null = null;
  let revision = 0;
  let inFlightFlush: Promise<{ success: boolean; errorMessage?: string }> | null = null;
  let state: StudioSaveState = { status: 'saved' };

  const emitState = (next: StudioSaveState) => {
    state = next;
    options.onStateChange?.(next);
  };

  const clearScheduledTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const drainPending = async (): Promise<{ success: boolean; errorMessage?: string }> => {
    while (pending !== null) {
      const target = pending;
      const capturedRevision = revision;
      pending = null;
      emitState({ status: 'saving', lastSavedAt: state.lastSavedAt });

      try {
        await options.writeSnapshot(target);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Gagal menyimpan perubahan Studio.';
        if (pending === null) {
          pending = target;
        }
        emitState({
          status: 'error',
          lastSavedAt: state.lastSavedAt,
          errorMessage,
        });
        return { success: false, errorMessage };
      }

      if (pending === null && revision === capturedRevision) {
        emitState({
          status: 'saved',
          lastSavedAt: Date.now(),
        });
      }
    }

    if (state.status === 'error') {
      return {
        success: false,
        errorMessage: state.errorMessage || 'Gagal menyimpan perubahan Studio.',
      };
    }

    return { success: true };
  };

  const flush = async (): Promise<{ success: boolean; errorMessage?: string }> => {
    clearScheduledTimer();
    if (inFlightFlush) {
      const priorResult = await inFlightFlush;
      if (pending === null) {
        return priorResult;
      }
    }

    const currentRun = drainPending().finally(() => {
      if (inFlightFlush === currentRun) {
        inFlightFlush = null;
      }
    });
    inFlightFlush = currentRun;
    return currentRun;
  };

  const schedule = (snapshot: StudioPersistenceSnapshot, delayMs: number = defaultDebounceMs) => {
    revision += 1;
    pending = snapshot;
    emitState({
      status: 'pending',
      lastSavedAt: state.lastSavedAt,
    });
    clearScheduledTimer();
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delayMs);
  };

  const saveNow = async (
    snapshot: StudioPersistenceSnapshot,
  ): Promise<{ success: boolean; errorMessage?: string }> => {
    revision += 1;
    pending = snapshot;
    return flush();
  };

  const resetSavedState = () => {
    clearScheduledTimer();
    pending = null;
    revision += 1;
    emitState({
      status: 'saved',
      lastSavedAt: Date.now(),
    });
  };

  const dispose = () => {
    clearScheduledTimer();
    if (pending !== null) {
      void flush();
    }
  };

  return {
    schedule,
    flush,
    saveNow,
    resetSavedState,
    getState: () => state,
    dispose,
  };
}

/**
 * Executes an async preset creation callback and guarantees modals/selectors
 * can distinguish Mode B guard rejection (`false`) and storage failures (thrown Error)
 * before deciding whether to close.
 */
export async function submitAsyncPresetCreation(
  action: (() => Promise<boolean | void> | boolean | void) | undefined,
  blockedMessage: string = MODE_B_STRUCTURAL_BLOCK_MESSAGE,
): Promise<StudioAsyncActionResult> {
  if (!action) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Aksi pembuatan preset tidak tersedia.',
    };
  }
  try {
    const result = await action();
    if (result === false) {
      return {
        ok: false,
        reason: 'blocked',
        message: blockedMessage,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message:
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Gagal membuat preset baru ke penyimpanan lokal.',
    };
  }
}
