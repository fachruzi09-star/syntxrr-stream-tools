import { canChangeActivePresetForSnapshot } from '../modeBPresetSwitchPolicy';

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

export function runModeBPresetSwitchPolicyTests(): void {
  for (const status of ['idle', 'stopped', 'disconnected', 'capture_lost', 'error']) {
    assertEqual(
      canChangeActivePresetForSnapshot({ status, isStreaming: false }),
      true,
      `${status} allows preset change after cleanup`,
    );
  }
  for (const status of ['starting', 'connecting', 'live', 'stopping']) {
    assertEqual(
      canChangeActivePresetForSnapshot({ status, isStreaming: false }),
      false,
      `${status} blocks preset change`,
    );
  }
  assertEqual(
    canChangeActivePresetForSnapshot({ status: 'live', isStreaming: true }),
    false,
    'streaming flag always blocks preset change',
  );
  assertEqual(
    canChangeActivePresetForSnapshot({ status: 'unknown', isStreaming: false }),
    false,
    'unknown status fails closed',
  );
  assertEqual(
    canChangeActivePresetForSnapshot({ status: 'idle' }),
    false,
    'missing streaming flag fails closed',
  );
  assertEqual(canChangeActivePresetForSnapshot(null), false, 'missing snapshot fails closed');
}

runModeBPresetSwitchPolicyTests();
console.log('Mode B preset switch policy tests passed: 13 assertions.');
