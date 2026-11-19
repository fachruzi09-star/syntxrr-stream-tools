import { normalizeModeBPresetTransition } from '../modeBPresetTransitionPolicy';

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

const none = normalizeModeBPresetTransition(undefined, 'Masuk');
assertEqual(none.ok, true, 'missing transition is a cut');
if (none.ok) assertEqual(none.value, null, 'missing transition value');

const fade = normalizeModeBPresetTransition({ type: 'fade', durationMs: 350 }, 'Masuk');
assertEqual(fade.ok, true, 'bounded fade accepted');
if (fade.ok) {
  assertEqual(fade.value?.type, 'fade', 'fade type retained');
  assertEqual(fade.value?.durationMs, 350, 'fade duration retained');
}

const stringFade = normalizeModeBPresetTransition('fade', 'Keluar');
assertEqual(stringFade.ok, true, 'string fade accepted with default duration');
if (stringFade.ok) assertEqual(stringFade.value?.durationMs, 300, 'string fade uses safe default');

const disabled = normalizeModeBPresetTransition({ type: 'slide', enabled: false }, 'Masuk');
assertEqual(disabled.ok, true, 'disabled metadata is treated as cut');
if (disabled.ok) assertEqual(disabled.value, null, 'disabled transition value');

assertEqual(normalizeModeBPresetTransition({ type: 'slide', durationMs: 250 }, 'Keluar').ok, false, 'unsupported slide rejected');
assertEqual(normalizeModeBPresetTransition({ type: 'fade', durationMs: 99 }, 'Masuk').ok, false, 'too-short fade rejected');
assertEqual(normalizeModeBPresetTransition({ type: 'fade', durationMs: 1201 }, 'Masuk').ok, false, 'too-long fade rejected');
assertEqual(normalizeModeBPresetTransition({ type: 'fade', durationMs: 350.5 }, 'Masuk').ok, false, 'fractional duration rejected');
assertEqual(normalizeModeBPresetTransition(['fade'], 'Masuk').ok, false, 'array metadata rejected');

console.log('Mode B preset transition policy tests passed: 14 assertions.');
