/** Minimal native snapshot shape used by the synchronous Studio edit guard. */
export interface ModeBSceneMutationSnapshot {
  status?: string | null;
  isStreaming?: boolean | null;
}

const BUSY_STATUSES = new Set([
  'starting',
  'connecting',
  'live',
  'stopping',
  'reshare_waiting',
  'resharing',
  'host_wait',
]);

/** Unknown/unreadable native status is locked; only a known non-streaming state is editable. */
export function shouldLockModeBSceneMutations(
  snapshot: ModeBSceneMutationSnapshot | null | undefined,
): boolean {
  if (!snapshot) return true;
  if (snapshot.isStreaming === true) return true;
  const status = typeof snapshot.status === 'string' ? snapshot.status.trim().toLowerCase() : '';
  if (!status) return true;
  if (BUSY_STATUSES.has(status)) return true;
  return !['idle', 'stopped', 'disconnected', 'capture_lost', 'error'].includes(status);
}
