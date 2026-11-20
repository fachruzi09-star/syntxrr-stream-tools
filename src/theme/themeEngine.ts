import { AppTheme, ThemeAppearance } from '../types';

/**
 * Safety Gate (Phase 1):
 * Light Mode UI activation remains locked until all views & Studio have been migrated
 * to semantic tokens and verified cleanly (Rule 7).
 */
export const LIGHT_MODE_PUBLICLY_ENABLED = false;

export const DEFAULT_APP_THEME: AppTheme = 'd_plus_dark';

export interface ThemeMeta {
  id: AppTheme;
  appearance: ThemeAppearance;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  bg: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  card: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentInk: string;
  accentText: string;
  accentSoft: string;
  ok: string;
  okSoft: string;
  warn: string;
  warnSoft: string;
  error: string;
  errorSoft: string;
  shadow: string;
}

export const THEME_CONFIGS: Record<AppTheme, ThemeMeta> = {
  d_plus_dark: {
    id: 'd_plus_dark',
    appearance: 'dark',
    name: 'SYNTXRR Flagship Dark',
    nameEn: 'SYNTXRR Flagship Dark',
    description: 'Obsidian studio berlapis dengan aksen kuning resmi SYNTXRR #F2C230.',
    descriptionEn: 'Layered studio obsidian with official SYNTXRR #F2C230 accent.',
    bg: '#0A0C10',
    surface: '#11141B',
    surfaceElevated: '#171B24',
    surfaceMuted: '#0E1117',
    card: '#171B24',
    border: '#202634',
    borderStrong: '#30394D',
    text: '#F5F7FA',
    textSecondary: '#C8CFDC',
    textMuted: '#8690A2',
    accent: '#F2C230',
    accentHover: '#F6CF58',
    accentInk: '#111317',
    accentText: '#F2C230',
    accentSoft: 'rgba(242, 194, 48, 0.12)',
    ok: '#34C77B',
    okSoft: 'rgba(52, 199, 123, 0.11)',
    warn: '#EFA93A',
    warnSoft: 'rgba(239, 169, 58, 0.11)',
    error: '#EC5B6B',
    errorSoft: 'rgba(236, 91, 107, 0.12)',
    shadow: '0 14px 32px -14px rgba(0, 0, 0, 0.58)',
  },
  d_plus_light: {
    id: 'd_plus_light',
    appearance: 'light',
    name: 'SYNTXRR Daylight Porcelain',
    nameEn: 'SYNTXRR Daylight Porcelain',
    description: 'Permukaan porcelain bersih kontras tinggi dengan aksen #F2C230 terkalibrasi.',
    descriptionEn: 'High-contrast clean porcelain surfaces with calibrated #F2C230 accents.',
    bg: '#F5F6F8',
    surface: '#FFFFFF',
    surfaceElevated: '#ECEFF4',
    surfaceMuted: '#F0F2F6',
    card: '#FFFFFF',
    border: '#DFE4EC',
    borderStrong: '#C3CCD9',
    text: '#111318',
    textSecondary: '#394150',
    textMuted: '#636D80',
    accent: '#F2C230',
    accentHover: '#E5B522',
    accentInk: '#111318',
    accentText: '#8A6700',
    accentSoft: 'rgba(242, 194, 48, 0.16)',
    ok: '#168049',
    okSoft: 'rgba(22, 128, 73, 0.09)',
    warn: '#B06708',
    warnSoft: 'rgba(176, 103, 8, 0.09)',
    error: '#C92A3E',
    errorSoft: 'rgba(201, 42, 62, 0.09)',
    shadow: '0 10px 26px -12px rgba(17, 19, 24, 0.08)',
  },
  navy_dark: {
    id: 'navy_dark',
    appearance: 'dark',
    name: 'Navy Dark (Legacy)',
    nameEn: 'Navy Dark (Legacy)',
    description: 'Nuansa biru dongker studio klasik dengan aksen elektrik.',
    descriptionEn: 'Classic deep navy studio palette with electric blue accents.',
    bg: '#080C16',
    surface: '#0E1626',
    surfaceElevated: '#131F36',
    surfaceMuted: '#0B111E',
    card: '#131F36',
    border: '#1E293B',
    borderStrong: '#334155',
    text: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    accent: '#2563EB',
    accentHover: '#1D4ED8',
    accentInk: '#FFFFFF',
    accentText: '#60A5FA',
    accentSoft: 'rgba(37, 99, 235, 0.15)',
    ok: '#34C77B',
    okSoft: 'rgba(52, 199, 123, 0.11)',
    warn: '#EFA93A',
    warnSoft: 'rgba(239, 169, 58, 0.11)',
    error: '#EC5B6B',
    errorSoft: 'rgba(236, 91, 107, 0.12)',
    shadow: '0 14px 32px -14px rgba(0, 0, 0, 0.58)',
  },
  obsidian_dark: {
    id: 'obsidian_dark',
    appearance: 'dark',
    name: 'Obsidian Dark',
    nameEn: 'Obsidian Dark',
    description: 'Gelap pekat OLED — kontras hitam mutlak dengan aksen indigo.',
    descriptionEn: 'Pure OLED black — deep charcoal contrast with indigo accents.',
    bg: '#030305',
    surface: '#0D0D12',
    surfaceElevated: '#14141C',
    surfaceMuted: '#08080C',
    card: '#14141C',
    border: '#22222D',
    borderStrong: '#323242',
    text: '#FFFFFF',
    textSecondary: '#D1D5DB',
    textMuted: '#9CA3AF',
    accent: '#6366F1',
    accentHover: '#4F46E5',
    accentInk: '#FFFFFF',
    accentText: '#818CF8',
    accentSoft: 'rgba(99, 102, 241, 0.15)',
    ok: '#34C77B',
    okSoft: 'rgba(52, 199, 123, 0.11)',
    warn: '#EFA93A',
    warnSoft: 'rgba(239, 169, 58, 0.11)',
    error: '#EC5B6B',
    errorSoft: 'rgba(236, 91, 107, 0.12)',
    shadow: '0 14px 32px -14px rgba(0, 0, 0, 0.65)',
  },
  cyber_slate: {
    id: 'cyber_slate',
    appearance: 'dark',
    name: 'Cyber Slate',
    nameEn: 'Cyber Slate',
    description: 'Kontras tinggi industrial — abu-abu baja dingin dengan aksen cyan futuristik.',
    descriptionEn: 'High contrast industrial — cool steel slate with futuristic cyan accents.',
    bg: '#0A0F18',
    surface: '#131B28',
    surfaceElevated: '#182233',
    surfaceMuted: '#0F1521',
    card: '#182233',
    border: '#2A3A52',
    borderStrong: '#3C5274',
    text: '#F0FDF4',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    accent: '#06B6D4',
    accentHover: '#0891B2',
    accentInk: '#0A0F18',
    accentText: '#38BDF8',
    accentSoft: 'rgba(6, 182, 212, 0.15)',
    ok: '#34C77B',
    okSoft: 'rgba(52, 199, 123, 0.11)',
    warn: '#EFA93A',
    warnSoft: 'rgba(239, 169, 58, 0.11)',
    error: '#EC5B6B',
    errorSoft: 'rgba(236, 91, 107, 0.12)',
    shadow: '0 14px 32px -14px rgba(0, 0, 0, 0.58)',
  },
};

export function isKnownAppTheme(value: unknown): value is AppTheme {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(THEME_CONFIGS, value);
}

/**
 * Validates and preserves stored user theme values across upgrades & backup restores.
 * Legacy themes (navy_dark, obsidian_dark, cyber_slate) remain valid without data loss.
 */
export function normalizeStoredAppTheme(value: unknown, fallback: AppTheme = DEFAULT_APP_THEME): AppTheme {
  return isKnownAppTheme(value) ? value : fallback;
}

/**
 * Resolves the active renderable theme.
 * While LIGHT_MODE_PUBLICLY_ENABLED is false, `d_plus_light` falls back cleanly to `d_plus_dark`
 * so legacy dark screens never become unreadable, without erasing the saved setting.
 */
export function resolveEffectiveTheme(
  value: unknown,
  options?: { allowLightMode?: boolean },
): AppTheme {
  const normalized = normalizeStoredAppTheme(value, DEFAULT_APP_THEME);
  const allowLight = options?.allowLightMode ?? LIGHT_MODE_PUBLICLY_ENABLED;
  if (normalized === 'd_plus_light' && !allowLight) {
    return 'd_plus_dark';
  }
  return normalized;
}

export function getThemeMeta(
  theme: unknown,
  options?: { allowLightMode?: boolean },
): ThemeMeta {
  const resolved = resolveEffectiveTheme(theme, options);
  return THEME_CONFIGS[resolved];
}

/**
 * Applies active theme tokens cleanly to HTML root, data attributes, Tailwind dark class,
 * color-scheme, body background/foreground, and mobile theme-color meta tag.
 */
export function applyTheme(
  theme: AppTheme | string | undefined,
  options?: { allowLightMode?: boolean },
): ThemeMeta {
  const meta = getThemeMeta(theme, options);

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.setAttribute('data-theme', meta.id);
    root.setAttribute('data-theme-mode', meta.appearance);
    root.classList.toggle('dark', meta.appearance === 'dark');
    root.style.colorScheme = meta.appearance;

    if (document.body) {
      document.body.setAttribute('data-theme', meta.id);
      document.body.setAttribute('data-theme-mode', meta.appearance);
      document.body.style.backgroundColor = meta.bg;
      document.body.style.color = meta.text;
    }

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', meta.bg);
    }
  }

  return meta;
}
