import { AppTheme } from '../types';

export type ThemeMode = 'dark' | 'light';

export interface ThemeMeta {
  id: AppTheme;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  bg: string;
  surface: string;
  card: string;
  border: string;
  accent: string;
  accentText: string;
  /** Resolved visual mode. Drives `color-scheme` and the `.dark` class. */
  mode: ThemeMode;
  /** Retained only for saved-settings compatibility. Not offered as a choice. */
  legacy?: boolean;
}

/**
 * ADAPTIVE DARK — the default theme.
 * Colour values here mirror the semantic CSS tokens in `src/index.css` and are
 * exposed for consumers that need a concrete value (e.g. native status bar).
 * CSS custom properties remain the single source of truth for rendering.
 */
const ADAPTIVE_DARK: ThemeMeta = {
  id: 'adaptive_dark',
  name: 'Adaptive Dark',
  nameEn: 'Adaptive Dark',
  description: 'Bawaan SYNTXRR — grafit dalam, aksen kuning solid, fokus pada keterbacaan.',
  descriptionEn: 'SYNTXRR default — deep graphite surfaces with a solid yellow accent and high readability.',
  bg: '#0d1017',
  surface: '#141923',
  card: '#191e28',
  border: 'rgba(255,255,255,0.11)',
  accent: '#f2c230',
  accentText: '#f2c230',
  mode: 'dark',
};

/**
 * ADAPTIVE LIGHT — complete alternative to the default dark theme.
 */
const ADAPTIVE_LIGHT: ThemeMeta = {
  id: 'adaptive_light',
  name: 'Adaptive Light',
  nameEn: 'Adaptive Light',
  description: 'Alternatif terang — permukaan putih hangat, aksen kuning dengan teks gelap.',
  descriptionEn: 'Light alternative — warm white surfaces with a yellow accent and dark foreground text.',
  bg: '#f4f5f2',
  surface: '#ffffff',
  card: '#f8f8f6',
  border: 'rgba(23,27,34,0.14)',
  accent: '#f2c230',
  accentText: '#705400',
  mode: 'light',
};

/**
 * Legacy themes. A user may still have one of these values persisted, so the
 * key must exist. They resolve to ADAPTIVE DARK so a stale value can never
 * produce a missing theme, a broken screen, or an invalid colour state.
 */
const LEGACY_DARK_IDS = ['navy_dark', 'obsidian_dark', 'cyber_slate'] as const;

type LegacyThemeId = (typeof LEGACY_DARK_IDS)[number];

export const DEFAULT_THEME: AppTheme = 'adaptive_dark';

/** Maps every legacy theme id onto its resolved modern theme. */
export const LEGACY_THEME_MAP: Record<LegacyThemeId, AppTheme> = {
  navy_dark: 'adaptive_dark',
  obsidian_dark: 'adaptive_dark',
  cyber_slate: 'adaptive_dark',
};

function legacyMeta(id: LegacyThemeId, name: string): ThemeMeta {
  return {
    ...ADAPTIVE_DARK,
    id,
    name,
    nameEn: name,
    description: 'Tema lama — otomatis dipetakan ke Adaptive Dark.',
    descriptionEn: 'Legacy theme — automatically mapped to Adaptive Dark.',
    legacy: true,
  };
}

export const THEME_CONFIGS: Record<AppTheme, ThemeMeta> = {
  adaptive_dark: ADAPTIVE_DARK,
  adaptive_light: ADAPTIVE_LIGHT,
  navy_dark: legacyMeta('navy_dark', 'Navy Dark'),
  obsidian_dark: legacyMeta('obsidian_dark', 'Obsidian Dark'),
  cyber_slate: legacyMeta('cyber_slate', 'Cyber Slate'),
};

/** Themes offered to the user. Legacy ids are intentionally excluded. */
export const SELECTABLE_THEMES: AppTheme[] = ['adaptive_dark', 'adaptive_light'];

/**
 * Resolves any stored/unknown theme value to a theme that definitely exists.
 * Legacy ids collapse onto ADAPTIVE DARK.
 */
export function resolveTheme(theme: AppTheme | string | null | undefined): AppTheme {
  if (!theme || typeof theme !== 'string') {
    return DEFAULT_THEME;
  }

  if (theme === 'adaptive_dark' || theme === 'adaptive_light') {
    return theme;
  }

  if (Object.prototype.hasOwnProperty.call(LEGACY_THEME_MAP, theme)) {
    return LEGACY_THEME_MAP[theme as LegacyThemeId];
  }

  return DEFAULT_THEME;
}

export function getThemeMeta(theme: AppTheme | string | null | undefined): ThemeMeta {
  return THEME_CONFIGS[resolveTheme(theme)];
}

export function isLightTheme(theme: AppTheme | string | null | undefined): boolean {
  return getThemeMeta(theme).mode === 'light';
}

/**
 * Menerapkan tema aktif ke root dokumen HTML.
 *
 * Warna sepenuhnya berasal dari variabel CSS semantik (`--sx-*`), jadi fungsi
 * ini hanya menetapkan atribut tema, mode warna, dan meta theme-color.
 * Berlangsung instan tanpa reload.
 */
export function applyTheme(theme: AppTheme | string | null | undefined): void {
  const resolvedTheme = resolveTheme(theme);
  const meta = THEME_CONFIGS[resolvedTheme];

  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  root.setAttribute('data-theme', resolvedTheme);
  root.style.colorScheme = meta.mode;

  if (document.body) {
    document.body.setAttribute('data-theme', resolvedTheme);
    // Remove any stale inline background from earlier builds so the token layer wins.
    document.body.style.removeProperty('background-color');
  }

  // Tailwind's `dark:` variant is class-based; keep it in sync with the theme mode.
  root.classList.toggle('dark', meta.mode === 'dark');

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', meta.bg);
  }
}
