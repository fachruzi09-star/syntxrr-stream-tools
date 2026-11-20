/**
 * Design System Terpusat — SYNTXRR STREAM
 *
 * Batch 7.1A: CSS custom properties in `src/index.css` are the single source of
 * truth for visual colour. Values exported here are `var(--sx-*)` references so
 * nothing in TypeScript maintains a competing palette.
 *
 * Note: `STATUS_DEFINITIONS[].color` must remain a literal hex value because
 * existing screens interpolate it into alpha-suffixed strings
 * (e.g. `${color}20`). Do not convert it to a CSS variable.
 */

export type FeatureStatus = 'ACTIVE' | 'SIMULATION' | 'FOUNDATION' | 'NOT_CONNECTED' | 'NOT_SUPPORTED';

export interface StatusMeta {
  code: FeatureStatus;
  label: string;
  badgeClass: string;
  dotColor: string;
  color: string;
  description: string;
}

export const STATUS_DEFINITIONS: Record<FeatureStatus, StatusMeta> = {
  ACTIVE: {
    code: 'ACTIVE',
    label: 'Aktif',
    badgeClass: 'bg-emerald-950/80 text-emerald-400 border border-emerald-800',
    dotColor: '#10B981',
    color: '#10B981',
    description: 'Fitur benar-benar berfungsi dan berjalan di perangkat.',
  },
  SIMULATION: {
    code: 'SIMULATION',
    label: 'Simulasi',
    badgeClass: 'bg-cyan-950/80 text-cyan-400 border border-cyan-800',
    dotColor: '#06B6D4',
    color: '#06B6D4',
    description: 'Fitur berjalan menggunakan simulator lokal untuk pengujian studio.',
  },
  FOUNDATION: {
    code: 'FOUNDATION',
    label: 'Pondasi UI',
    badgeClass: 'bg-purple-950/80 text-purple-400 border border-purple-800',
    dotColor: '#A855F7',
    color: '#A855F7',
    description: 'Struktur data dan UI siap menerima implementasi native bertahap.',
  },
  NOT_CONNECTED: {
    code: 'NOT_CONNECTED',
    label: 'Belum Terhubung',
    badgeClass: 'bg-amber-950/80 text-amber-400 border border-amber-800',
    dotColor: '#F59E0B',
    color: '#F59E0B',
    description: 'Menunggu kredensial atau otorisasi layanan pihak ketiga.',
  },
  NOT_SUPPORTED: {
    code: 'NOT_SUPPORTED',
    label: 'Tidak Didukung',
    badgeClass: 'bg-slate-900 text-slate-400 border border-slate-800',
    dotColor: '#64748B',
    color: '#64748B',
    description: 'Tidak didukung oleh batasan API platform atau perangkat saat ini.',
  },
};

/**
 * Feature status → semantic token. Brand yellow is NOT a status colour, so the
 * status scale stays green / orange / red / blue / grey.
 */
export const STATUS_TOKENS: Record<FeatureStatus, string> = {
  ACTIVE: 'var(--sx-success)',
  SIMULATION: 'var(--sx-info)',
  FOUNDATION: 'var(--sx-neutral)',
  NOT_CONNECTED: 'var(--sx-warning)',
  NOT_SUPPORTED: 'var(--sx-neutral)',
};

/**
 * Theme-driven colours. These are CSS variable references, valid anywhere a
 * `color`/`background-color` string is accepted by the DOM.
 */
export const THEME_COLORS = {
  canvas: 'var(--sx-bg)',
  surface: 'var(--sx-surface-1)',
  card: 'var(--sx-surface-2)',
  cardHover: 'var(--sx-surface-3)',
  border: 'var(--sx-border)',
  borderLight: 'var(--sx-border-strong)',
  accentBlue: 'var(--sx-accent)',
  accentElectric: 'var(--sx-accent-hover)',
  textMuted: 'var(--sx-text-muted)',
  textSecondary: 'var(--sx-text-secondary)',
  textPrimary: 'var(--sx-text)',
} as const;

/** Small, disciplined radius scale. */
export const RADIUS = {
  sm: 'var(--sx-radius-sm)',
  md: 'var(--sx-radius-md)',
  lg: 'var(--sx-radius-lg)',
  xl: 'var(--sx-radius-xl)',
  full: 'var(--sx-radius-full)',
} as const;

/** Semantic elevation levels. */
export const ELEVATION = {
  flat: 'none',
  raised: 'var(--sx-shadow-raised)',
  overlay: 'var(--sx-shadow-overlay)',
} as const;

/** 4px spacing scale. */
export const SPACING = {
  0: 'var(--sx-space-0)',
  1: 'var(--sx-space-1)',
  2: 'var(--sx-space-2)',
  3: 'var(--sx-space-3)',
  4: 'var(--sx-space-4)',
  5: 'var(--sx-space-5)',
  6: 'var(--sx-space-6)',
  8: 'var(--sx-space-8)',
  10: 'var(--sx-space-10)',
  12: 'var(--sx-space-12)',
  16: 'var(--sx-space-16)',
} as const;

/** Motion foundation — shared by CSS utilities and the `motion` package. */
export const MOTION = {
  durationInstant: 'var(--sx-duration-instant)',
  durationFast: 'var(--sx-duration-fast)',
  durationBase: 'var(--sx-duration-base)',
  durationSlow: 'var(--sx-duration-slow)',
  easeStandard: 'var(--sx-ease-standard)',
  easeEmphasized: 'var(--sx-ease-emphasized)',
  easeExit: 'var(--sx-ease-exit)',
} as const;

/**
 * Type scale. Labels default to at least 12px (`caption`); anything smaller is
 * reserved for genuinely essential compact metadata.
 */
export const TYPE_SCALE = {
  display: 'var(--text-sx-display)',
  title: 'var(--text-sx-title)',
  section: 'var(--text-sx-section)',
  body: 'var(--text-sx-body)',
  secondary: 'var(--text-sx-secondary)',
  caption: 'var(--text-sx-caption)',
  numeric: 'var(--text-sx-numeric)',
} as const;
