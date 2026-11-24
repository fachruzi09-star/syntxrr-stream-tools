import type { FeatureStatus } from '../theme/designSystem';
import type { SourceType, StudioElement } from '../types';

export interface StudioSourceCatalogEntry {
  type: SourceType;
  name: string;
  category: 'basic' | 'dynamic';
  categoryLabel: string;
  status: FeatureStatus;
  description: string;
  defaultDimensions: { width: number; height: number };
  defaultProperties: Record<string, unknown>;
  defaultTriggerConfig?: StudioElement['triggerConfig'];
}

export interface StudioElementCreationOverrides {
  id?: string;
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layer?: number;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  rotation?: number;
  properties?: Record<string, unknown>;
  triggerConfig?: StudioElement['triggerConfig'];
}

let elementIdSequence = 0;

function cloneRecord(value: Record<string, unknown> | undefined | null): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (Array.isArray(entry)) {
      copy[key] = entry.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? cloneRecord(item as Record<string, unknown>)
          : item,
      );
    } else if (entry && typeof entry === 'object') {
      copy[key] = cloneRecord(entry as Record<string, unknown>);
    } else {
      copy[key] = entry;
    }
  }
  return copy;
}

function cloneTriggerConfig(
  triggerConfig: StudioElement['triggerConfig'] | undefined,
): StudioElement['triggerConfig'] | undefined {
  if (!triggerConfig || typeof triggerConfig !== 'object') return undefined;
  return { ...triggerConfig };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseRgbaAlphaPercent(color: unknown): number | undefined {
  if (typeof color !== 'string') return undefined;
  const trimmed = color.trim().toLowerCase();
  if (trimmed === 'transparent') return 0;
  const match = trimmed.match(
    /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+|1\.0+)\s*\)$/,
  );
  if (!match) return undefined;
  const alpha = Number(match[1]);
  if (!Number.isFinite(alpha)) return undefined;
  return Math.max(0, Math.min(100, Math.round(alpha * 100)));
}

/**
 * Safely parses numeric progress/donation values from numbers or formatted strings
 * such as "Rp 450.000" or "1,000,000" without returning NaN or mutating strings.
 */
export function parseSafeNumericNominal(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const withoutCurrency = trimmed.replace(/^(?:rp|idr|\$|€|£)\s*/i, '').trim();
  if (!withoutCurrency) return undefined;

  // Exact thousand-grouped integer with dots (e.g. "450.000", "1.000.000")
  if (/^-?\d{1,3}(?:\.\d{3})+$/.test(withoutCurrency)) {
    const parsed = Number(withoutCurrency.replace(/\./g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  // Exact thousand-grouped integer with commas (e.g. "450,000", "1,000,000")
  if (/^-?\d{1,3}(?:,\d{3})+$/.test(withoutCurrency)) {
    const parsed = Number(withoutCurrency.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  // Plain numeric or decimal string (e.g. "350000" or "75.5")
  if (/^-?\d+(?:\.\d+)?$/.test(withoutCurrency)) {
    const parsed = Number(withoutCurrency);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export type ScreenCaptureQuarterRotation = 0 | 90 | 180 | 270;

export function normalizeScreenCaptureRotation(value: unknown): ScreenCaptureQuarterRotation {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const snappedQuarter = Math.round(numeric / 90) * 90;
  const wrapped = ((snappedQuarter % 360) + 360) % 360;
  if (wrapped === 90) return 90;
  if (wrapped === 180) return 180;
  if (wrapped === 270) return 270;
  return 0;
}

/**
 * Single Source of Truth for all 26 Studio source definitions (11 Basic + 15 Dynamic).
 * Pure TypeScript metadata without JSX or UI dependencies.
 */
export const STUDIO_ELEMENT_CATALOG: readonly StudioSourceCatalogEntry[] = [
  // 11 BASIC SOURCES
  {
    type: 'text',
    name: 'Teks Statis',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Menampilkan judul siaran, pengumuman, atau jadwal live streaming dengan kustomisasi font dan warna.',
    defaultDimensions: { width: 60, height: 8 },
    defaultProperties: {
      text: 'SYNTXRR LIVE STREAM',
      fontSize: 20,
      color: '#FFFFFF',
      textColor: '#FFFFFF',
      fontWeight: 'bold',
      backgroundColor: 'transparent',
    },
  },
  {
    type: 'image',
    name: 'Gambar / Logo',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Logo watermark, sponsor banner, bingkai foto, atau stiker PNG transparan.',
    defaultDimensions: { width: 25, height: 15 },
    defaultProperties: {
      url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80',
      imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80',
      borderRadius: 8,
      fit: 'contain',
    },
  },
  {
    type: 'video',
    name: 'Pemutar Video Loop',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Video latar belakang animasi loop, intro siaran, atau video transisi MP4/WebM.',
    defaultDimensions: { width: 50, height: 30 },
    defaultProperties: {
      loop: true,
      muted: true,
      autoplay: true,
      videoUrl: '',
    },
  },
  {
    type: 'shape',
    name: 'Bentuk Geometri',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Bentuk latar belakang persegi atau rounded pill untuk memberi kontras pada elemen teks.',
    defaultDimensions: { width: 40, height: 12 },
    defaultProperties: {
      backgroundColor: 'rgba(242, 194, 48, 0.25)',
      borderColor: '#F2C230',
      borderWidth: 2,
      borderRadius: 12,
    },
  },
  {
    type: 'separator',
    name: 'Garis Pembatas',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Garis pembatas vertikal/horizontal elegan dengan efek glow untuk pemisah informasi.',
    defaultDimensions: { width: 80, height: 2 },
    defaultProperties: {
      lineColor: '#F2C230',
      borderColor: '#F2C230',
      glow: true,
      thickness: 2,
      borderWidth: 2,
    },
  },
  {
    type: 'camera',
    name: 'Kamera / Facecam',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Feed video kamera depan/belakang smartphone secara real-time dengan border modern.',
    defaultDimensions: { width: 38, height: 24 },
    defaultProperties: {
      facingMode: 'user',
      borderColor: '#F2C230',
      borderRadius: 16,
      borderWidth: 3,
      aspectFit: 'cover',
    },
  },
  {
    type: 'screen_capture',
    name: 'Tangkapan Layar HP',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description:
      'Tangkapan layar game atau aplikasi Android via MediaProjection native (FPS mengikuti pengaturan frame rate encoder global).',
    defaultDimensions: { width: 90, height: 50 },
    defaultProperties: {
      cropMode: 'fit',
      fps: 60,
      borderRadius: 12,
    },
  },
  {
    type: 'browser_embed',
    name: 'Browser Embed Web',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Menyematkan widget HTML kustom, URL situs web, atau browser source eksternal.',
    defaultDimensions: { width: 70, height: 35 },
    defaultProperties: {
      url: 'https://syntxrr.com/widgets/preview',
      refreshRate: 0,
    },
  },
  {
    type: 'running_text',
    name: 'Teks Berjalan (Marquee)',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Running text pengumuman berjalan horizontal di bagian atas atau bawah siaran.',
    defaultDimensions: { width: 100, height: 6 },
    defaultProperties: {
      text: 'SELAMAT DATANG DI LIVE STREAM! FOLLOW & TAP LAYAR UNTUK MENDUKUNG KREATOR!',
      speed: 2,
      fontSize: 12,
      textColor: '#FFFFFF',
      bgColor: '#1E232D',
    },
  },
  {
    type: 'audio',
    name: 'Audio Latar Belakang',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Jalur input audio untuk musik BGM atau mixing mikrofon dengan kontrol volume independen.',
    defaultDimensions: { width: 25, height: 8 },
    defaultProperties: {
      title: 'Audio Latar Belakang',
      volume: 85,
      channel: 'bgm',
      loop: true,
      audioUrl: 'https://actions.google.com/sounds/v1/ambiences/daytime_forest_bonfire.ogg',
    },
  },
  {
    type: 'soundboard',
    name: 'Soundboard Cues',
    category: 'basic',
    categoryLabel: 'Sumber Dasar',
    status: 'ACTIVE',
    description: 'Pemicu efek suara reaksi langsung (Air Horn, Applause, Level Up, Tada).',
    defaultDimensions: { width: 30, height: 10 },
    defaultProperties: {
      presetSfx: 'horn',
      volume: 90,
    },
  },

  // 15 DYNAMIC SOURCES
  {
    type: 'dynamic_text',
    name: 'Teks Dinamis Variabel',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Teks otomatis dengan variabel token seperti {username}, {target}, {waktu}, atau {durasi}.',
    defaultDimensions: { width: 65, height: 8 },
    defaultProperties: {
      template: 'Top Donatur: {top_donor_name}',
      fallback: 'Belum ada donasi hari ini',
    },
  },
  {
    type: 'username',
    name: 'Nama Penonton Aktif',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Menyorot nama penonton terbaru yang mengirim gift, komentar, atau melakukan share.',
    defaultDimensions: { width: 45, height: 8 },
    defaultProperties: {
      prefix: '⭐ ',
      badge: 'VIP Supporter',
    },
  },
  {
    type: 'avatar',
    name: 'Avatar Penonton Dinamis',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Foto profil penonton yang baru saja memberikan interaksi live terbaru.',
    defaultDimensions: { width: 14, height: 14 },
    defaultProperties: {
      shape: 'circle',
      borderGlow: true,
    },
  },
  {
    type: 'chat_message',
    name: 'Kotak Chat Interaktif',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Stream chatbox real-time dengan dukungan avatar, nama pengirim, badge, dan animasi masuk.',
    defaultDimensions: { width: 85, height: 28 },
    defaultProperties: {
      maxMessages: 5,
      fontSize: 13,
      showBadges: true,
      backgroundColor: 'rgba(15, 19, 27, 0.82)',
      bgOpacity: 82,
    },
    defaultTriggerConfig: {
      eventType: 'chat',
      action: 'text_update',
      durationSec: 8,
    },
  },
  {
    type: 'event_feed',
    name: 'Event Feed Berjalan',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Daftar riwayat aktivitas penonton (follow, share, like, gift) yang terus terupdate otomatis.',
    defaultDimensions: { width: 80, height: 16 },
    defaultProperties: {
      maxItems: 4,
      slideAnimation: true,
    },
  },
  {
    type: 'counter',
    name: 'Penghitung Target (Goal)',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Penghitung angka dinamis untuk target Like, Follower baru, atau Sub target siaran.',
    defaultDimensions: { width: 50, height: 10 },
    defaultProperties: {
      current: 1240,
      target: 2000,
      targetGoal: 2000,
      label: 'Target Follower Hari Ini',
    },
    defaultTriggerConfig: {
      eventType: 'like',
      action: 'pulse',
      durationSec: 2,
    },
  },
  {
    type: 'combo_counter',
    name: 'Combo Gift Counter',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Penghitung multiplier gift berturut-turut (Combo x10, x50, x100) dengan efek membesar.',
    defaultDimensions: { width: 35, height: 12 },
    defaultProperties: {
      multiplier: 25,
      giftName: 'Mawar Merah',
      comboLabel: 'x25 COMBO MAWAR MERAH!',
      themeColor: '#EA580C',
    },
    defaultTriggerConfig: {
      eventType: 'gift',
      action: 'pulse',
      durationSec: 4,
    },
  },
  {
    type: 'progress_bar',
    name: 'Progress Bar Donasi',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Bilah progres visual donasi dengan persentase real-time dan jumlah nominal terkumpul.',
    defaultDimensions: { width: 80, height: 9 },
    defaultProperties: {
      currentAmount: 350000,
      targetAmount: 1000000,
      currency: 'Rp',
      barColor: '#F2C230',
    },
  },
  {
    type: 'leaderboard',
    name: 'Peringkat Donatur (Leaderboard)',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Klasemen 3 donatur teratas siaran hari ini dengan lencana mahkota emas/perak/perunggu.',
    defaultDimensions: { width: 65, height: 22 },
    defaultProperties: {
      topCount: 3,
      showAmounts: true,
    },
  },
  {
    type: 'song_request',
    name: 'Now Playing & Request',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Kartu lagu yang sedang diputar beserta judul, artis, pengirim request, dan durasi.',
    defaultDimensions: { width: 85, height: 11 },
    defaultProperties: {
      showAlbumArt: true,
      showArt: true,
      showRequester: true,
      showQueueCount: true,
      cardStyle: 'compact',
    },
    defaultTriggerConfig: {
      eventType: 'chat',
      action: 'pulse',
      durationSec: 4,
    },
  },
  {
    type: 'lyrics',
    name: 'Tampilan Lirik Berjalan',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'SIMULATION',
    description: 'Lirik lagu otomatis selaras dengan playback musik lokal atau streaming.',
    defaultDimensions: { width: 70, height: 14 },
    defaultProperties: {
      currentLine: 'Menatap layar malam tak berujung...',
      lyricsText: 'Menatap layar malam tak berujung...',
      align: 'center',
    },
  },
  {
    type: 'live_viewer_counter',
    name: 'Jumlah Penonton Aktif',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Badge kecil indikator siaran langsung disertai angka jumlah penonton aktif.',
    defaultDimensions: { width: 30, height: 7 },
    defaultProperties: {
      viewerCount: 1420,
      liveBadge: true,
    },
  },
  {
    type: 'event_alert',
    name: 'Event Alert Pop-up',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Notifikasi animasi pop-up saat terjadi Gift, Follow, Share, atau Donasi masuk.',
    defaultDimensions: { width: 80, height: 11 },
    defaultProperties: {
      soundEnabled: true,
      soundEffect: true,
      accentColor: '#F2C230',
      badgeColor: '#F2C230',
      animation: 'slide_in',
      animationEffect: 'bounce',
      alertTitle: 'GIFT RECEIVED!',
      alertMessage: 'mengirim hadiah spesial!',
    },
    defaultTriggerConfig: {
      eventType: 'gift',
      action: 'pulse',
      durationSec: 5,
    },
  },
  {
    type: 'sticker',
    name: 'Stiker Reaksi Interaktif',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Animasi stiker interaktif yang muncul ketika penonton mengetuk layar berkali-kali.',
    defaultDimensions: { width: 22, height: 22 },
    defaultProperties: {
      stickerId: 'fire',
      floatEffect: true,
    },
  },
  {
    type: 'live_text',
    name: 'Teks Siaran Langsung',
    category: 'dynamic',
    categoryLabel: 'Sumber Dinamis',
    status: 'ACTIVE',
    description: 'Status siaran langsung: Bitrate, FPS, Resolusi 1080p, dan Durasi On-Air.',
    defaultDimensions: { width: 45, height: 6 },
    defaultProperties: {
      showFps: true,
      showBitrate: true,
    },
  },
];

const CATALOG_BY_TYPE = new Map<SourceType, StudioSourceCatalogEntry>(
  STUDIO_ELEMENT_CATALOG.map((entry) => [entry.type, entry]),
);

export function getStudioSourceCatalogEntry(type: SourceType): StudioSourceCatalogEntry {
  const entry = CATALOG_BY_TYPE.get(type);
  if (!entry) {
    throw new Error(`Tipe sumber Studio tidak dikenal: ${String(type)}`);
  }
  return entry;
}

/**
 * Non-destructively bridges known property aliases across Catalog, Quick-Add,
 * Studio Renderer, Inspector, and Marketplace items without mutating the source
 * object or removing any legacy keys.
 */
export function normalizeStudioElementProperties(element: StudioElement): StudioElement {
  const props = cloneRecord(element?.properties);

  switch (element.type) {
    case 'image': {
      if (props.imageUrl === undefined && typeof props.url === 'string' && props.url.trim().length > 0) {
        props.imageUrl = props.url;
      }
      if (
        props.url === undefined &&
        typeof props.imageUrl === 'string' &&
        props.imageUrl.trim().length > 0 &&
        !props.imageUrl.startsWith('studio-media://')
      ) {
        props.url = props.imageUrl;
      }
      break;
    }

    case 'sticker': {
      if (props.imageUrl === undefined && typeof props.url === 'string' && props.url.trim().length > 0) {
        props.imageUrl = props.url;
      }
      break;
    }

    case 'text': {
      if (props.textColor === undefined && typeof props.color === 'string' && props.color.trim().length > 0) {
        props.textColor = props.color;
      }
      if (props.color === undefined && typeof props.textColor === 'string' && props.textColor.trim().length > 0) {
        props.color = props.textColor;
      }
      break;
    }

    case 'separator': {
      if (
        props.borderColor === undefined &&
        typeof props.lineColor === 'string' &&
        props.lineColor.trim().length > 0
      ) {
        props.borderColor = props.lineColor;
      }
      if (
        props.lineColor === undefined &&
        typeof props.borderColor === 'string' &&
        props.borderColor.trim().length > 0
      ) {
        props.lineColor = props.borderColor;
      }
      if (props.borderWidth === undefined && isFiniteNumber(props.thickness)) {
        props.borderWidth = props.thickness;
      }
      if (props.thickness === undefined && isFiniteNumber(props.borderWidth)) {
        props.thickness = props.borderWidth;
      }
      break;
    }

    case 'counter': {
      if (props.targetGoal === undefined && isFiniteNumber(props.target)) {
        props.targetGoal = props.target;
      }
      if (props.target === undefined && isFiniteNumber(props.targetGoal)) {
        props.target = props.targetGoal;
      }
      break;
    }

    case 'combo_counter': {
      if (
        props.comboLabel === undefined &&
        typeof props.giftName === 'string' &&
        props.giftName.trim().length > 0
      ) {
        const multiplier = isFiniteNumber(props.multiplier) ? props.multiplier : undefined;
        props.comboLabel =
          multiplier !== undefined
            ? `x${multiplier} COMBO ${props.giftName.trim().toUpperCase()}!`
            : props.giftName.trim();
      }
      if (
        props.giftName === undefined &&
        typeof props.comboLabel === 'string' &&
        props.comboLabel.trim().length > 0
      ) {
        props.giftName = props.comboLabel.trim();
      }
      break;
    }

    case 'lyrics': {
      if (props.lyricsText === undefined && typeof props.currentLine === 'string') {
        props.lyricsText = props.currentLine;
      }
      if (props.currentLine === undefined && typeof props.lyricsText === 'string') {
        props.currentLine = props.lyricsText;
      }
      break;
    }

    case 'song_request': {
      if (props.showArt === undefined && typeof props.showAlbumArt === 'boolean') {
        props.showArt = props.showAlbumArt;
      }
      if (props.showAlbumArt === undefined && typeof props.showArt === 'boolean') {
        props.showAlbumArt = props.showArt;
      }
      break;
    }

    case 'event_alert': {
      if (
        props.badgeColor === undefined &&
        typeof props.accentColor === 'string' &&
        props.accentColor.trim().length > 0
      ) {
        props.badgeColor = props.accentColor;
      }
      if (
        props.accentColor === undefined &&
        typeof props.badgeColor === 'string' &&
        props.badgeColor.trim().length > 0
      ) {
        props.accentColor = props.badgeColor;
      }
      if (props.soundEffect === undefined && typeof props.soundEnabled === 'boolean') {
        props.soundEffect = props.soundEnabled;
      }
      if (props.soundEnabled === undefined && typeof props.soundEffect === 'boolean') {
        props.soundEnabled = props.soundEffect;
      }
      break;
    }

    case 'chat_message': {
      // Preserve string backgroundColor and numeric bgOpacity without overwriting color strings with numbers
      if (props.bgOpacity === undefined) {
        const parsedAlpha = parseRgbaAlphaPercent(props.backgroundColor);
        if (parsedAlpha !== undefined) {
          props.bgOpacity = parsedAlpha;
        }
      }
      if (props.backgroundColor === undefined && isFiniteNumber(props.bgOpacity)) {
        const normalizedOpacity = Math.max(0, Math.min(100, props.bgOpacity)) / 100;
        props.backgroundColor = `rgba(12, 14, 18, ${normalizedOpacity})`;
      }
      break;
    }

    case 'progress_bar': {
      // Keep original legacy string fields (e.g. "Rp 450.000") intact; safely derive numeric values when parseable
      if (props.currentAmount === undefined && props.current !== undefined) {
        const parsedCurrent = parseSafeNumericNominal(props.current);
        if (parsedCurrent !== undefined) {
          props.currentAmount = parsedCurrent;
        }
      }
      if (props.targetAmount === undefined && props.target !== undefined) {
        const parsedTarget = parseSafeNumericNominal(props.target);
        if (parsedTarget !== undefined) {
          props.targetAmount = parsedTarget;
        }
      }
      break;
    }

    default:
      break;
  }

  const normalizedRotation =
    element.type === 'screen_capture'
      ? normalizeScreenCaptureRotation(element.rotation)
      : element.rotation;

  return {
    ...element,
    rotation: normalizedRotation,
    properties: props,
    ...(element.triggerConfig ? { triggerConfig: cloneTriggerConfig(element.triggerConfig) } : {}),
  };
}

function generateUniqueElementId(type: SourceType, existingElements: readonly StudioElement[]): string {
  const existingIds = new Set(existingElements.map((item) => item.id));
  let candidate = '';
  do {
    elementIdSequence += 1;
    const randomPart = Math.random().toString(36).substring(2, 7);
    candidate = `elem_${type}_${Date.now()}_${elementIdSequence}_${randomPart}`;
  } while (existingIds.has(candidate));
  return candidate;
}

/**
 * Shared element factory for SourcesLibraryView, Studio Tab Elemen, and Studio Tab Sumber.
 */
export function createStudioElementFromSource(
  type: SourceType,
  existingElements: readonly StudioElement[] = [],
  overrides: StudioElementCreationOverrides = {},
): StudioElement {
  const entry = getStudioSourceCatalogEntry(type);
  const safeExisting = Array.isArray(existingElements) ? existingElements : [];

  const mergedProps = {
    ...cloneRecord(entry.defaultProperties),
    ...cloneRecord(overrides.properties),
  };

  let resolvedName = overrides.name && overrides.name.trim() ? overrides.name.trim() : entry.name;

  if (type === 'camera') {
    const existingCameras = safeExisting.filter((item) => item?.type === 'camera');
    const cameraCount = existingCameras.length + 1;
    const overrideFacing = overrides.properties?.facingMode;
    if (overrideFacing === 'user' || overrideFacing === 'environment') {
      mergedProps.facingMode = overrideFacing;
    } else if (existingCameras.length === 0) {
      mergedProps.facingMode = 'user';
    } else {
      const hasFrontCamera = existingCameras.some(
        (cam) => (cam?.properties?.facingMode ?? 'user') === 'user',
      );
      mergedProps.facingMode = hasFrontCamera ? 'environment' : 'user';
    }

    if (!overrides.name && cameraCount > 1) {
      resolvedName = `Kamera ${cameraCount} (${
        mergedProps.facingMode === 'environment' ? 'Belakang / Handcam' : 'Depan / Facecam'
      })`;
    }
  }

  const defaultWidth = isFiniteNumber(overrides.width)
    ? overrides.width
    : entry.defaultDimensions.width;
  const defaultHeight = isFiniteNumber(overrides.height)
    ? overrides.height
    : entry.defaultDimensions.height;
  const defaultX = isFiniteNumber(overrides.x)
    ? overrides.x
    : defaultWidth >= 100
      ? 0
      : 10;
  const defaultY = isFiniteNumber(overrides.y)
    ? overrides.y
    : 18 + (safeExisting.length % 5) * 8;
  const defaultLayer = isFiniteNumber(overrides.layer)
    ? overrides.layer
    : safeExisting.length + 1;

  const triggerConfig =
    overrides.triggerConfig !== undefined
      ? cloneTriggerConfig(overrides.triggerConfig)
      : cloneTriggerConfig(entry.defaultTriggerConfig);

  const rawElement: StudioElement = {
    id: overrides.id && overrides.id.trim() ? overrides.id.trim() : generateUniqueElementId(type, safeExisting),
    name: resolvedName,
    type: entry.type,
    x: defaultX,
    y: defaultY,
    width: defaultWidth,
    height: defaultHeight,
    layer: defaultLayer,
    visible: overrides.visible ?? true,
    locked: overrides.locked ?? false,
    opacity: isFiniteNumber(overrides.opacity) ? overrides.opacity : 100,
    rotation: isFiniteNumber(overrides.rotation) ? overrides.rotation : 0,
    properties: mergedProps,
    ...(triggerConfig ? { triggerConfig } : {}),
  };

  return normalizeStudioElementProperties(rawElement);
}
