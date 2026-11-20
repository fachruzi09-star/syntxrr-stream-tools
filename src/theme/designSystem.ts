/**
 * Design System Terpusat — SYNTXRR STREAM (D+ Signature Hybrid Flagship Edition)
 * Token warna semantik, status jujur, dan target sentuh >= 44px
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
    dotColor: '#34C77B',
    color: '#34C77B',
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
    dotColor: '#EFA93A',
    color: '#EFA93A',
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

export const THEME_COLORS = {
  canvas: 'var(--app-bg, #0A0C10)',
  surface: 'var(--app-surface, #11141B)',
  surfaceElevated: 'var(--app-surface-elevated, #171B24)',
  surfaceMuted: 'var(--app-surface-muted, #0E1117)',
  card: 'var(--app-card, #171B24)',
  cardHover: 'var(--app-surface-hover, #1D2330)',
  border: 'var(--app-border, #202634)',
  borderLight: 'var(--app-border-strong, #30394D)',
  accentGold: '#F2C230',
  accentBlue: '#2563EB',
  accentElectric: 'var(--app-accent-text, #F2C230)',
  textMuted: 'var(--app-text-muted, #8690A2)',
  textSecondary: 'var(--app-text-secondary, #C8CFDC)',
  textPrimary: 'var(--app-text, #F5F7FA)',
};
