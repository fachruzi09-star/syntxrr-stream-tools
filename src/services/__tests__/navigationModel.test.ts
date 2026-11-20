import {
  LEGACY_NAVIGATION_ROUTES,
  PRIMARY_NAVIGATION_TABS,
  isLegacyNavigationRoute,
  isPrimaryNavigationTab,
  resolveBackNavigationStep,
  resolveNavigationTarget,
} from '../navigationModel';

let assertionCount = 0;

function assert(condition: unknown, message: string): void {
  assertionCount += 1;
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assertionCount += 1;
  if (actual !== expected) {
    throw new Error(
      `Assertion failed (${message}): expected=${String(expected)} actual=${String(actual)}`,
    );
  }
}

function runTests(): void {
  // 1. Exactly six primary navigation tabs
  assertEqual(PRIMARY_NAVIGATION_TABS.length, 6, 'PRIMARY_NAVIGATION_TABS has exactly 6 tabs');
  const expectedPrimary = [
    'dashboard',
    'studio',
    'live_center',
    'remote_deck',
    'integrations',
    'settings',
  ] as const;

  for (const tab of expectedPrimary) {
    assert(isPrimaryNavigationTab(tab), `${tab} recognized as primary tab`);
    assert(!isLegacyNavigationRoute(tab), `${tab} is not classified as legacy route`);
    const resolved = resolveNavigationTarget(tab);
    assertEqual(resolved.primaryTab, tab, `primary route ${tab} keeps primaryTab`);
    assertEqual(resolved.legacySubview, null, `primary route ${tab} clears legacySubview`);
    assertEqual(resolved.normalizedFromLegacy, false, `primary route ${tab} not marked legacy`);
  }

  // 2. All seven legacy routes map deterministically
  assertEqual(LEGACY_NAVIGATION_ROUTES.length, 7, 'LEGACY_NAVIGATION_ROUTES lists all 7 legacy routes');

  const cases: Array<{
    legacy: (typeof LEGACY_NAVIGATION_ROUTES)[number];
    primaryTab: (typeof PRIMARY_NAVIGATION_TABS)[number];
    legacySubview: string | null;
  }> = [
    { legacy: 'sources', primaryTab: 'studio', legacySubview: 'sources' },
    { legacy: 'presets', primaryTab: 'studio', legacySubview: 'presets' },
    { legacy: 'scenes', primaryTab: 'studio', legacySubview: 'presets' },
    { legacy: 'marketplace', primaryTab: 'studio', legacySubview: 'marketplace' },
    { legacy: 'music', primaryTab: 'live_center', legacySubview: 'music' },
    { legacy: 'overlay', primaryTab: 'studio', legacySubview: null },
    { legacy: 'alerts', primaryTab: 'live_center', legacySubview: null },
  ];

  for (const testCase of cases) {
    assert(isLegacyNavigationRoute(testCase.legacy), `${testCase.legacy} recognized as legacy`);
    assert(!isPrimaryNavigationTab(testCase.legacy), `${testCase.legacy} is not a primary tab`);
    const resolved = resolveNavigationTarget(testCase.legacy);
    assertEqual(resolved.primaryTab, testCase.primaryTab, `${testCase.legacy} -> primaryTab`);
    assertEqual(resolved.legacySubview, testCase.legacySubview, `${testCase.legacy} -> legacySubview`);
    assertEqual(resolved.normalizedFromLegacy, true, `${testCase.legacy} marked normalizedFromLegacy`);
  }

  // 3. Invalid / corrupted route fallback
  for (const invalid of ['', null, undefined, 'nonexistent_route', 'drawer']) {
    const resolved = resolveNavigationTarget(invalid);
    assertEqual(resolved.primaryTab, 'dashboard', `invalid route (${String(invalid)}) falls back to dashboard`);
    assertEqual(resolved.legacySubview, null, `invalid route (${String(invalid)}) clears legacySubview`);
    assertEqual(resolved.normalizedFromLegacy, false, `invalid route (${String(invalid)}) not marked legacy`);
  }

  // 4. Android hardware back step resolution:
  // legacy subview -> owner primary menu -> dashboard -> exit_app
  const step1 = resolveBackNavigationStep({ activeNav: 'studio', legacySubview: 'sources' });
  assertEqual(step1.action, 'clear_legacy_subview', 'back from legacy sources clears subview first');
  if (step1.action === 'clear_legacy_subview') {
    assertEqual(step1.nextNav, 'studio', 'back from legacy sources stays on studio owner');
    assertEqual(step1.nextLegacySubview, null, 'legacySubview becomes null');
  }

  const step1Music = resolveBackNavigationStep({ activeNav: 'live_center', legacySubview: 'music' });
  assertEqual(step1Music.action, 'clear_legacy_subview', 'back from legacy music clears subview first');
  if (step1Music.action === 'clear_legacy_subview') {
    assertEqual(step1Music.nextNav, 'live_center', 'back from legacy music stays on live_center owner');
  }

  const step2 = resolveBackNavigationStep({ activeNav: 'studio', legacySubview: null });
  assertEqual(step2.action, 'navigate_dashboard', 'back from studio goes to dashboard');

  const step3 = resolveBackNavigationStep({ activeNav: 'dashboard', legacySubview: null });
  assertEqual(step3.action, 'exit_app', 'back from dashboard exits app');

  console.log(`navigationModel.test.ts PASSED (${assertionCount} assertions)`);
}

runTests();
