import { shouldLockModeBSceneMutations } from '../modeBSceneMutationPolicy';

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

assertEqual(shouldLockModeBSceneMutations(null), true, 'unreadable status fails closed');
assertEqual(shouldLockModeBSceneMutations({ status: 'starting', isStreaming: false }), true, 'starting locks edits');
assertEqual(shouldLockModeBSceneMutations({ status: 'live', isStreaming: true }), true, 'live locks direct edits');
assertEqual(shouldLockModeBSceneMutations({ status: 'stopping', isStreaming: false }), true, 'stopping keeps edits locked');
assertEqual(shouldLockModeBSceneMutations({ status: 'idle', isStreaming: false }), false, 'confirmed idle allows edits');
assertEqual(shouldLockModeBSceneMutations({ status: 'stopped', isStreaming: false }), false, 'confirmed stopped allows edits');
assertEqual(shouldLockModeBSceneMutations({ status: 'error', isStreaming: true }), true, 'streaming flag wins over terminal label');
assertEqual(shouldLockModeBSceneMutations({ status: 'unexpected', isStreaming: false }), true, 'unknown status fails closed');

console.log('Mode B scene mutation policy tests passed: 8 assertions.');
