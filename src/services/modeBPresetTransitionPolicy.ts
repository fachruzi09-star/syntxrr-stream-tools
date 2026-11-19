/**
 * Explicit bounded fade transition policy matching ModeBPresetTransitionPolicy.java.
 */
export interface ModeBPresetTransitionSpec {
  type: 'fade';
  durationMs: number;
}

export type ModeBPresetTransitionResult =
  | { ok: true; value: ModeBPresetTransitionSpec | null }
  | { ok: false; message: string };

export const MODE_B_PRESET_TRANSITION_DEFAULT_MS = 300;
export const MODE_B_PRESET_TRANSITION_MIN_MS = 100;
export const MODE_B_PRESET_TRANSITION_MAX_MS = 1200;

export function normalizeModeBPresetTransition(value: unknown, label: string): ModeBPresetTransitionResult {
  if (value === undefined || value === null) return { ok: true, value: null };
  let type = '';
  let durationMs = MODE_B_PRESET_TRANSITION_DEFAULT_MS;

  if (typeof value === 'string') {
    type = value.trim().toLowerCase();
  } else if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.enabled === false) return { ok: true, value: null };
    type = typeof record.type === 'string' ? record.type.trim().toLowerCase() : '';
    if (record.durationMs !== undefined) {
      if (typeof record.durationMs !== 'number' || !Number.isInteger(record.durationMs)) {
        return { ok: false, message: `${label}: durasi transisi harus berupa bilangan bulat.` };
      }
      durationMs = record.durationMs;
    }
  } else {
    return { ok: false, message: `${label}: format metadata transisi tidak didukung.` };
  }

  if (type === '' || type === 'none' || type === 'cut') return { ok: true, value: null };
  if (type !== 'fade') {
    return {
      ok: false,
      message: `${label}: saat ini hanya transisi fade yang dapat digunakan saat LIVE. Hentikan LIVE untuk memakai jenis transisi lain.`,
    };
  }
  if (durationMs < MODE_B_PRESET_TRANSITION_MIN_MS || durationMs > MODE_B_PRESET_TRANSITION_MAX_MS) {
    return {
      ok: false,
      message: `${label}: durasi fade saat LIVE harus ${MODE_B_PRESET_TRANSITION_MIN_MS}–${MODE_B_PRESET_TRANSITION_MAX_MS} ms.`,
    };
  }
  return { ok: true, value: { type: 'fade', durationMs } };
}
