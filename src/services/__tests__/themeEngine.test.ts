import {
  DEFAULT_APP_THEME,
  LIGHT_MODE_PUBLICLY_ENABLED,
  THEME_CONFIGS,
  getThemeMeta,
  isKnownAppTheme,
  normalizeStoredAppTheme,
  resolveEffectiveTheme,
} from '../../theme/themeEngine';
import { DEFAULT_SETTINGS, mergeBackupSettings } from '../storage';
import {
  __clearAllInAppNoticesForTests,
  dismissInAppNotice,
  showInAppNotice,
  subscribeInAppNotices,
  type InAppNotice,
} from '../uiNotice';

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
  // 1. Default flagship theme & token completeness
  assertEqual(DEFAULT_APP_THEME, 'd_plus_dark', 'DEFAULT_APP_THEME is d_plus_dark');
  assertEqual(DEFAULT_SETTINGS.theme, 'd_plus_dark', 'DEFAULT_SETTINGS.theme defaults to d_plus_dark');
  assertEqual(LIGHT_MODE_PUBLICLY_ENABLED, false, 'Light Mode public flag stays locked during Phase 1');

  assertEqual(THEME_CONFIGS.d_plus_dark.accent, '#F2C230', 'd_plus_dark uses SYNTXRR #F2C230');
  assertEqual(THEME_CONFIGS.d_plus_light.accent, '#F2C230', 'd_plus_light uses SYNTXRR #F2C230');
  assertEqual(THEME_CONFIGS.d_plus_light.appearance, 'light', 'd_plus_light appearance is light');
  assertEqual(THEME_CONFIGS.navy_dark.appearance, 'dark', 'legacy navy_dark stays dark');
  assertEqual(THEME_CONFIGS.obsidian_dark.appearance, 'dark', 'legacy obsidian_dark stays dark');
  assertEqual(THEME_CONFIGS.cyber_slate.appearance, 'dark', 'legacy cyber_slate stays dark');

  // 2. Theme validation & backward compatibility
  assert(isKnownAppTheme('navy_dark'), 'navy_dark recognized');
  assert(isKnownAppTheme('obsidian_dark'), 'obsidian_dark recognized');
  assert(isKnownAppTheme('cyber_slate'), 'cyber_slate recognized');
  assert(isKnownAppTheme('d_plus_dark'), 'd_plus_dark recognized');
  assert(isKnownAppTheme('d_plus_light'), 'd_plus_light recognized');
  assert(!isKnownAppTheme('neon_purple_unknown'), 'unknown theme rejected');

  assertEqual(normalizeStoredAppTheme('obsidian_dark'), 'obsidian_dark', 'preserves legacy obsidian_dark');
  assertEqual(normalizeStoredAppTheme('d_plus_light'), 'd_plus_light', 'preserves stored d_plus_light without wiping');
  assertEqual(normalizeStoredAppTheme('corrupted_theme'), 'd_plus_dark', 'invalid theme falls back to d_plus_dark');

  // 3. Rule 7 Light Mode gate
  assertEqual(
    resolveEffectiveTheme('d_plus_light'),
    'd_plus_dark',
    'd_plus_light resolves safely to d_plus_dark while LIGHT_MODE_PUBLICLY_ENABLED is false',
  );
  assertEqual(
    resolveEffectiveTheme('d_plus_light', { allowLightMode: true }),
    'd_plus_light',
    'd_plus_light resolves cleanly when explicitly enabled',
  );
  assertEqual(getThemeMeta('d_plus_light').bg, '#0A0C10', 'gated getThemeMeta renders dark canvas safely');
  assertEqual(
    getThemeMeta('d_plus_light', { allowLightMode: true }).bg,
    '#F5F6F8',
    'unlocked getThemeMeta returns porcelain light canvas',
  );

  // 4. Storage backup merge backward compatibility
  const baseWithLegacyTheme = {
    ...DEFAULT_SETTINGS,
    theme: 'cyber_slate' as const,
    streamKey: 'kept_secret',
  };
  const backupRestoredInvalid = mergeBackupSettings({ theme: 'nonexistent_v0' }, baseWithLegacyTheme);
  assertEqual(
    backupRestoredInvalid.theme,
    'cyber_slate',
    'invalid backup theme preserves current valid user theme',
  );
  assertEqual(backupRestoredInvalid.streamKey, 'kept_secret', 'credentials remain untouched');

  const backupRestoredLegacy = mergeBackupSettings({ theme: 'navy_dark' }, baseWithLegacyTheme);
  assertEqual(backupRestoredLegacy.theme, 'navy_dark', 'valid legacy navy_dark backup theme restores');

  // 5. Non-blocking InAppNotice service
  __clearAllInAppNoticesForTests();
  let latestNotices: InAppNotice[] = [];
  const unsubscribe = subscribeInAppNotices((list) => {
    latestNotices = list;
  });

  const id1 = showInAppNotice({ tone: 'success', title: 'OK', message: 'Disimpan' });
  assert(Boolean(id1), 'showInAppNotice returns notice id');
  assertEqual(latestNotices.length, 1, 'subscriber receives active notice');
  assertEqual(latestNotices[0]?.message, 'Disimpan', 'notice message matches');

  dismissInAppNotice(id1);
  assertEqual(latestNotices.length, 0, 'dismissInAppNotice clears active notice');

  unsubscribe();
  __clearAllInAppNoticesForTests();

  console.log(`themeEngine.test.ts PASSED (${assertionCount} assertions)`);
}

runTests();
