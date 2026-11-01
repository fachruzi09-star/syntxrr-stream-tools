/**
 * Design System Terpusat — SYNTXRR STREAM
 * Berdasarkan pedoman desain: Deep Navy, Electric Blue Accent, Status Jujur, Touch Targets >= 44px
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

export const THEME_COLORS = {
  canvas: '#080C16',
  surface: '#0E1626',
  card: '#131F36',
  cardHover: '#182744',
  border: '#1E293B',
  borderLight: '#334155',
  accentBlue: '#2563EB',
  accentElectric: '#38BDF8',
  textMuted: '#94A3B8',
  textSecondary: '#CBD5E1',
  textPrimary: '#F8FAFC',
};
