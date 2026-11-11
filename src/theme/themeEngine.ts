import { AppTheme } from '../types';

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
}

export const THEME_CONFIGS: Record<AppTheme, ThemeMeta> = {
  navy_dark: {
    id: 'navy_dark',
    name: 'Navy Dark',
    nameEn: 'Navy Dark',
    description: 'Bawaan studio — nuansa biru dongker profesional dan aksen elektrik.',
    descriptionEn: 'Studio default — professional deep navy with electric blue accents.',
    bg: '#080c16',
    surface: '#0e1626',
    card: '#131f36',
    border: '#1e293b',
    accent: '#2563eb',
    accentText: '#60a5fa',
  },
  obsidian_dark: {
    id: 'obsidian_dark',
    name: 'Obsidian Dark',
    nameEn: 'Obsidian Dark',
    description: 'Gelap pekat OLED — kontras hitam mutlak dengan aksen indigo.',
    descriptionEn: 'Pure OLED black — deep charcoal contrast with indigo accents.',
    bg: '#030305',
    surface: '#0d0d12',
    card: '#14141c',
    border: '#22222d',
    accent: '#6366f1',
    accentText: '#818cf8',
  },
  cyber_slate: {
    id: 'cyber_slate',
    name: 'Cyber Slate',
    nameEn: 'Cyber Slate',
    description: 'Kontras tinggi industrial — abu-abu baja dingin dengan aksen cyan futuristik.',
    descriptionEn: 'High contrast industrial — cool steel slate with futuristic cyan accents.',
    bg: '#0a0f18',
    surface: '#131b28',
    card: '#182233',
    border: '#2a3a52',
    accent: '#06b6d4',
    accentText: '#38bdf8',
  },
};

/**
 * Menerapkan tema aktif ke root dokumen HTML, atribut data-theme, dan meta theme-color.
 * Berlangsung instan tanpa perlu reload.
 */
export function applyTheme(theme: AppTheme): void {
  const resolvedTheme: AppTheme = THEME_CONFIGS[theme] ? theme : 'navy_dark';
  const meta = THEME_CONFIGS[resolvedTheme];

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.body.setAttribute('data-theme', resolvedTheme);
    document.body.style.backgroundColor = meta.bg;

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', meta.bg);
    }
  }
}
