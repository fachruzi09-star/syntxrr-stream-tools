/**
 * Haptic feedback helper for SYNTXRR STREAM.
 *
 * Vibration is delivered through `navigator.vibrate`, which on Android requires
 * android.permission.VIBRATE (declared in AndroidManifest.xml). Whether it works depends on the
 * WebView and the device, so callers must treat `false` as "no vibration happened", never as an
 * application error.
 *
 * The helper deliberately respects the user's `hapticFeedback` setting so that switching the
 * toggle off actually silences feedback across the whole app instead of only its own test button.
 */

export type HapticPattern = 'light' | 'medium' | 'success' | 'warning';

const PATTERN_DURATIONS: Record<HapticPattern, number | number[]> = {
  light: 15,
  medium: 35,
  success: [12, 45, 12],
  warning: [25, 60, 25],
};

/** True when the current runtime exposes the Vibration API. */
export function isHapticSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Fires a pattern regardless of the saved setting.
 * Only for the Settings device test, which must work while the toggle is still off.
 */
export function vibrateNow(pattern: HapticPattern = 'light'): boolean {
  if (!isHapticSupported()) return false;
  try {
    return navigator.vibrate(PATTERN_DURATIONS[pattern]);
  } catch {
    return false;
  }
}

/**
 * Fires a pattern only when the user has haptic feedback enabled.
 * Returns false when the setting is off or the device cannot vibrate.
 */
export function triggerHaptic(
  settings: { hapticFeedback?: boolean } | null | undefined,
  pattern: HapticPattern = 'light'
): boolean {
  if (!settings?.hapticFeedback) return false;
  return vibrateNow(pattern);
}
