/** Minimal stream-status shape needed by the active-preset mutation guard. */
export interface ModeBPresetSwitchSnapshot {
  status?: string | null;
  isStreaming?: boolean | null;
}

const SAFE_TERMINAL_STATUSES = new Set([
  'idle',
  'stopped',
  'disconnected',
  'capture_lost',
  'error',
]);

/**
 * Preset changes are safe only after the native service has completed its session cleanup.
 * Busy, unknown, missing, or unreadable states fail closed to prevent Studio/RTMP divergence.
 */
export function canChangeActivePresetForSnapshot(
  snapshot: ModeBPresetSwitchSnapshot | null | undefined,
): boolean {
  if (!snapshot || snapshot.isStreaming !== false) return false;
  const status = typeof snapshot.status === 'string' ? snapshot.status.trim().toLowerCase() : '';
  return SAFE_TERMINAL_STATUSES.has(status);
}
