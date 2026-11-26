import type { StudioPreset } from '../types';
import {
  MODE_B_SINGLE_SCREEN_CAPTURE_MESSAGE,
  countVisibleModeBScreenCaptures,
  isVisibleModeBScreenCaptureElement,
  type ModeBOverlaySourceElement,
} from './modeBComposition';
import { applyPresetGroupStateToElements } from './presetModel';

export const MODE_B_SINGLE_SCREEN_CAPTURE_PRESET_MESSAGE =
  'Preset tidak dapat diaktifkan di Mode B karena memiliki lebih dari satu elemen Tangkapan Layar aktif. Mode B hanya mendukung satu elemen Tangkapan Layar aktif.';

export type ModeBScreenCaptureGuardResult =
  | { allowed: true }
  | { allowed: false; visibleCount: number; message: string };

/**
 * Validates adding or duplicating a single element in Studio when Mode B is selected.
 * Uses the exact same visibility predicate as createModeBScreenCaptureLayer().
 */
export function validateModeBScreenCaptureAddition(
  currentElements: readonly ModeBOverlaySourceElement[] | undefined | null,
  candidateElement: ModeBOverlaySourceElement | null | undefined,
  isModeBSelected: boolean,
): ModeBScreenCaptureGuardResult {
  if (!isModeBSelected) {
    return { allowed: true };
  }
  if (!isVisibleModeBScreenCaptureElement(candidateElement)) {
    return { allowed: true };
  }
  const existingVisible = countVisibleModeBScreenCaptures(currentElements);
  if (existingVisible >= 1) {
    return {
      allowed: false,
      visibleCount: existingVisible + 1,
      message: MODE_B_SINGLE_SCREEN_CAPTURE_MESSAGE,
    };
  }
  return { allowed: true };
}

/**
 * Validates installing a batch of elements (e.g. a Marketplace pack) atomically.
 * Rejects the entire batch if existing + incoming visible screen_capture elements > 1.
 */
export function validateModeBScreenCaptureBatch(
  currentElements: readonly ModeBOverlaySourceElement[] | undefined | null,
  incomingElements: readonly ModeBOverlaySourceElement[] | undefined | null,
  isModeBSelected: boolean,
): ModeBScreenCaptureGuardResult {
  if (!isModeBSelected) {
    return { allowed: true };
  }
  const incomingVisible = countVisibleModeBScreenCaptures(incomingElements);
  if (incomingVisible === 0) {
    return { allowed: true };
  }
  const existingVisible = countVisibleModeBScreenCaptures(currentElements);
  const totalVisible = existingVisible + incomingVisible;
  if (totalVisible > 1) {
    return {
      allowed: false,
      visibleCount: totalVisible,
      message: MODE_B_SINGLE_SCREEN_CAPTURE_MESSAGE,
    };
  }
  return { allowed: true };
}

/**
 * Validates activating a preset when Mode B is selected.
 * Accounts for preset group/super-group visibility parity with Mode B composition.
 */
export function validateModeBScreenCapturePresetActivation(
  preset: Pick<StudioPreset, 'elements' | 'groups' | 'superGroups'> | null | undefined,
  isModeBSelected: boolean,
): ModeBScreenCaptureGuardResult {
  if (!isModeBSelected || !preset) {
    return { allowed: true };
  }
  const effectiveElements =
    (preset.groups && preset.groups.length > 0) ||
    (preset.superGroups && preset.superGroups.length > 0)
      ? applyPresetGroupStateToElements(preset)
      : preset.elements;
  const visibleCount = countVisibleModeBScreenCaptures(effectiveElements);
  if (visibleCount > 1) {
    return {
      allowed: false,
      visibleCount,
      message: MODE_B_SINGLE_SCREEN_CAPTURE_PRESET_MESSAGE,
    };
  }
  return { allowed: true };
}

/**
 * Guards element/group visibility or dimension/opacity transitions so hidden duplicates
 * cannot be made visible while another visible screen_capture already exists in Mode B,
 * while always allowing hiding/shrinking/deleting existing elements.
 */
export function validateModeBScreenCaptureSceneTransition(
  previousElements: readonly ModeBOverlaySourceElement[] | undefined | null,
  nextElements: readonly ModeBOverlaySourceElement[] | undefined | null,
  isModeBSelected: boolean,
): ModeBScreenCaptureGuardResult {
  if (!isModeBSelected) {
    return { allowed: true };
  }
  const nextCount = countVisibleModeBScreenCaptures(nextElements);
  if (nextCount <= 1) {
    return { allowed: true };
  }
  const prevCount = countVisibleModeBScreenCaptures(previousElements);
  if (nextCount > prevCount) {
    return {
      allowed: false,
      visibleCount: nextCount,
      message: MODE_B_SINGLE_SCREEN_CAPTURE_MESSAGE,
    };
  }
  return { allowed: true };
}
