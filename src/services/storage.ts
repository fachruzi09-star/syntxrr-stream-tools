import {
  AppSettings,
  Scene,
  SongRequest,
  AlertSettings,
  AlertEvent,
  UnifiedQueueItem,
  LocalAudioTrackMeta,
  StudioPreset,
  StudioElement,
  SoundboardItem,
  MarketplaceItem,
  IntegrationProvider,
  TTSConfig,
  StreamEvent,
  TikTokAccountState,
  ModeBAudioSource,
  normalizeOperatingMode,
  normalizeUnitVolume,
} from '../types';
import { DEFAULT_TTS_CONFIG } from './ttsService';
import { normalizeStudioPreset } from './presetModel';

const DB_NAME = 'syntxrr_stream_tools_db';
const DB_VERSION = 3; // Incremented for SYNTXRR STREAM Master Architecture

export const STUDIO_MEDIA_URI_PREFIX = 'studio-media://';
const VALID_STUDIO_MEDIA_ASSET_ID = /^[A-Za-z0-9_-]{1,100}$/;

export interface StoredStudioMediaAsset {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  mimeType: string;
  sizeBytes: number;
  addedAt: number;
}

export function createStudioMediaAssetUri(assetId: string): string | undefined {
  const normalized = typeof assetId === 'string' ? assetId.trim() : '';
  return VALID_STUDIO_MEDIA_ASSET_ID.test(normalized)
    ? `${STUDIO_MEDIA_URI_PREFIX}${normalized}`
    : undefined;
}

export function getStudioMediaAssetIdFromUri(uri: unknown): string | undefined {
  if (typeof uri !== 'string' || !uri.startsWith(STUDIO_MEDIA_URI_PREFIX)) return undefined;
  const assetId = uri.slice(STUDIO_MEDIA_URI_PREFIX.length).trim();
  return VALID_STUDIO_MEDIA_ASSET_ID.test(assetId) ? assetId : undefined;
}

export function normalizeModeBAudioSource(value: unknown, fallback: ModeBAudioSource = 'mix'): ModeBAudioSource {
  if (value === 'mix' || value === 'internal' || value === 'microphone') {
    return value;
  }
  return fallback;
}

export const DEFAULT_SETTINGS: AppSettings = {
  operatingMode: 'MODE_A_TIKTOK_COMPANION',
  targetResolution: '1080p',
  frameRate: 60,
  performanceProfile: 'balanced',
  theme: 'navy_dark',
  canvasOrientation: '9:16',
  rtmpServer: 'rtmp://live.twitch.tv/app',
  streamKey: '',
  modeBAudioSource: 'mix',
  videoBitrateKbps: 6000,
  audioBitrateKbps: 160,
  enableOverlayInPip: true,
  floatingOverlayOpacity: 92,
  hardwareAcceleration: true,
  // Stage 2 & 3
  youtubeApiKey: '',
  spotifyClientId: '',
  spotifyAccessToken: '',
  spotifyTokenExpiry: 0,
  audioVolume: 0.85,
  audioAutoplayNext: true,
  tiktokUsername: '',
  tiktokConnected: false,
  tiktokConnectionMethod: 'direct',
  eulerStreamApiKey: '',
  eulerStreamJwtKey: '',
  tiktokEulerFallbackEnabled: true,
  soundboardVolume: 0.85,
  // === SETTINGS FOUNDATION DEFAULTS ===
  // A. General
  language: 'id-ID',
  hapticFeedback: true,
  confirmBeforeEndLive: true,
  // B. Audio & Microphone
  microphoneDeviceId: '',
  micGain: 100,
  noiseSuppression: true,
  micEchoCancellation: true,
  micAutoGainControl: false,
  // C. Floating HUD
  hudEnabled: true,
  hudButtonSize: 48,
  hudOpacity: 92,
  hudPosition: 'right',
  hudPanelChat: true,
  hudPanelSoundboard: true,
  hudPanelMusic: true,
  hudPanelMixer: true,
  hudPanelLiveControl: true,
  hudPanelSettings: true,
  // D. Graphics & Device Performance
  autoApplyRecommendations: false,
};

// INITIAL STUDIO ELEMENTS (Default Layout)
export const DEFAULT_STUDIO_ELEMENTS: StudioElement[] = [
  {
    id: 'elem_camera',
    name: 'Kamera Utama / Facecam',
    type: 'camera',
    x: 6,
    y: 6,
    width: 38,
    height: 24,
    layer: 1,
    visible: true,
    locked: false,
    opacity: 100,
    rotation: 0,
    properties: {
      facingMode: 'user',
      borderColor: '#2563EB',
      borderRadius: 12,
    },
  },
  {
    id: 'elem_alert',
    name: 'Event Alert Pop-up',
    type: 'event_alert',
    x: 10,
    y: 32,
    width: 80,
    height: 10,
    layer: 4,
    visible: true,
    locked: false,
    opacity: 100,
    rotation: 0,
    properties: {
      soundEnabled: true,
      accentColor: '#38BDF8',
      sampleText: 'GhostRider_X baru saja Follow!',
    },
  },
  {
    id: 'elem_chat',
    name: 'Kotak Chat Interaktif',
    type: 'chat_message',
    x: 6,
    y: 52,
    width: 88,
    height: 26,
    layer: 2,
    visible: true,
    locked: false,
    opacity: 90,
    rotation: 0,
    properties: {
      maxMessages: 5,
      fontSize: 13,
      showBadges: true,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
    },
  },
  {
    id: 'elem_ticker',
    name: 'Running Text Pengumuman',
    type: 'running_text',
    x: 0,
    y: 94,
    width: 100,
    height: 6,
    layer: 5,
    visible: true,
    locked: false,
    opacity: 95,
    rotation: 0,
    properties: {
      text: 'SELAMAT DATANG DI LIVE STREAMING! JANGAN LUPA TAP-TAP LAYAR & SHARE KE TEMAN-TEMAN!',
      speed: 2,
      textColor: '#FFFFFF',
      bgColor: '#1E3A8A',
    },
  },
  {
    id: 'elem_song',
    name: 'Now Playing Widget',
    type: 'song_request',
    x: 6,
    y: 82,
    width: 88,
    height: 10,
    layer: 3,
    visible: true,
    locked: false,
    opacity: 95,
    rotation: 0,
    properties: {
      showArt: true,
      showRequester: true,
    },
  },
];

// UNIQUE ID SANITIZER FOR STUDIO ELEMENTS
export function ensureUniqueElementIds(elements: StudioElement[]): StudioElement[] {
  if (!Array.isArray(elements)) return [];
  const seenIds = new Set<string>();
  const result: StudioElement[] = [];

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    if (!elem) continue;

    let id = elem.id;
    if (!id || seenIds.has(id)) {
      // Check if it's an exact identical ghost duplicate (same id, type, x, y)
      const existing = result.find((r) => r.id === elem.id);
      if (existing && existing.type === elem.type && existing.x === elem.x && existing.y === elem.y) {
        // Skip identical duplicate to clean corrupted state
        continue;
      }
      // Otherwise assign a guaranteed unique ID
      id = `${elem.id || 'elem'}_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
    }

    seenIds.add(id);
    result.push({
      ...elem,
      id,
    });
  }
  return result;
}

// INITIAL STUDIO PRESETS
export const DEFAULT_PRESETS: StudioPreset[] = [
  {
    id: 'preset_tiktok_vertical',
    name: 'Mobile Gaming (9:16 Vertical)',
    category: 'hp_screen',
    canvasOrientation: '9:16',
    elements: DEFAULT_STUDIO_ELEMENTS,
    createdAt: Date.now() - 3600000,
    isFavorite: true,
    description: 'Tata letak vertikal optimal untuk MLBB, Free Fire, dan TikTok LIVE.',
    thumbnailColor: '#2563EB',
  },
  {
    id: 'preset_esports_landscape',
    name: 'Esports Broadcast (16:9 Landscape)',
    category: 'landscape',
    canvasOrientation: '16:9',
    elements: [
      {
        ...DEFAULT_STUDIO_ELEMENTS[0],
        id: 'elem_esports_camera',
        x: 4,
        y: 68,
        width: 25,
        height: 28,
      },
      {
        ...DEFAULT_STUDIO_ELEMENTS[1],
        id: 'elem_esports_alert',
        x: 35,
        y: 8,
        width: 30,
        height: 12,
      },
      {
        ...DEFAULT_STUDIO_ELEMENTS[2],
        id: 'elem_esports_chat',
        x: 74,
        y: 20,
        width: 24,
        height: 55,
      },
      {
        ...DEFAULT_STUDIO_ELEMENTS[3],
        id: 'elem_esports_ticker',
        x: 0,
        y: 94,
        width: 100,
        height: 6,
      },
    ],
    createdAt: Date.now() - 1800000,
    isFavorite: true,
    description: 'Standar turnamen dan gameplay layar lebar YouTube/Twitch.',
    thumbnailColor: '#06B6D4',
  },
  {
    id: 'preset_just_chatting',
    name: 'Just Chatting & Podcast (9:16)',
    category: 'portrait',
    canvasOrientation: '9:16',
    elements: [
      {
        ...DEFAULT_STUDIO_ELEMENTS[0],
        id: 'elem_chatting_camera',
        x: 5,
        y: 10,
        width: 90,
        height: 40,
        properties: { ...DEFAULT_STUDIO_ELEMENTS[0].properties, borderRadius: 16 },
      },
      {
        ...DEFAULT_STUDIO_ELEMENTS[2],
        id: 'elem_chatting_chat',
        x: 5,
        y: 55,
        width: 90,
        height: 35,
      },
    ],
    createdAt: Date.now() - 900000,
    isFavorite: false,
    description: 'Fokus interaksi penonton dengan kamera besar dan chat teratas.',
    thumbnailColor: '#A855F7',
  },
];

// INITIAL SOUNDBOARD ITEMS
export const DEFAULT_SOUNDBOARD: SoundboardItem[] = [
  { id: 'sb_1', name: 'Airhorn Hype', category: 'Hype', icon: '📢', durationSec: 1, isQuickSlot: true, quickSlotKey: 1, synthType: 'horn' },
  { id: 'sb_2', name: 'Level Up', category: 'Game', icon: '⭐', durationSec: 2, isQuickSlot: true, quickSlotKey: 2, synthType: 'level_up' },
  { id: 'sb_3', name: 'Sorak Penonton', category: 'Hype', icon: '👏', durationSec: 3, isQuickSlot: true, quickSlotKey: 3, synthType: 'cheer' },
  { id: 'sb_4', name: 'Tada Celebration', category: 'Meme', icon: '🎉', durationSec: 2, isQuickSlot: true, quickSlotKey: 4, synthType: 'tada' },
  { id: 'sb_5', name: 'Lonceng Donasi', category: 'SFX', icon: '🔔', durationSec: 1, isQuickSlot: false, synthType: 'bell' },
  { id: 'sb_6', name: 'Game Over', category: 'Game', icon: '💀', durationSec: 2, isQuickSlot: false, synthType: 'game_over' },
];

// INITIAL MARKETPLACE CATALOG
export const DEFAULT_MARKETPLACE_ITEMS: MarketplaceItem[] = [
  {
    id: 'mkt_cyberpunk_hud',
    name: 'Cyberpunk HUD 9:16',
    category: 'scene',
    filter: 'overlay',
    author: 'Syntxrr Design Lab',
    rating: 4.9,
    downloads: 1420,
    description: 'Template lengkap bernuansa futuristik dengan neon border, live chat transparan, dan running text kustom.',
    isInstalled: true,
    isFavorite: true,
    previewGradient: 'from-blue-900 to-indigo-950',
    elementsPayload: [
      { ...DEFAULT_STUDIO_ELEMENTS[0], id: 'elem_mkt_cyberpunk_camera' },
      { ...DEFAULT_STUDIO_ELEMENTS[1], id: 'elem_mkt_cyberpunk_alert' },
      { ...DEFAULT_STUDIO_ELEMENTS[2], id: 'elem_mkt_cyberpunk_chat' },
      { ...DEFAULT_STUDIO_ELEMENTS[3], id: 'elem_mkt_cyberpunk_ticker' },
      { ...DEFAULT_STUDIO_ELEMENTS[4], id: 'elem_mkt_cyberpunk_song' },
    ],
  },
  {
    id: 'mkt_neon_chat',
    name: 'Neon Glass Chat Widget',
    category: 'widget',
    filter: 'chat_message',
    author: 'StudioKreatif',
    rating: 4.8,
    downloads: 890,
    description: 'Widget kotak obrolan berlatar kaca gelap dengan efek highlight nama pengguna dan filter badge VIP.',
    isInstalled: false,
    isFavorite: false,
    previewGradient: 'from-cyan-950 to-slate-900',
    elementsPayload: [{ ...DEFAULT_STUDIO_ELEMENTS[2], id: 'elem_mkt_neon_chat' }],
  },
  {
    id: 'mkt_saweria_goal',
    name: 'Saweria / Donasi Progress Bar',
    category: 'widget',
    filter: 'counter',
    author: 'IndoStreamer',
    rating: 4.9,
    downloads: 2310,
    description: 'Progress bar donasi interaktif dengan target target rupiah dan animasi ketika ada tip masuk.',
    isInstalled: false,
    isFavorite: true,
    previewGradient: 'from-amber-950 to-slate-900',
    elementsPayload: [
      {
        id: 'elem_goal_saweria',
        name: 'Target Donasi Stream',
        type: 'progress_bar',
        x: 10,
        y: 90,
        width: 80,
        height: 6,
        layer: 3,
        visible: true,
        locked: false,
        opacity: 100,
        rotation: 0,
        properties: { current: 'Rp 450.000', target: 'Rp 1.000.000', label: 'Beli Mic Baru' },
      },
    ],
  },
  {
    id: 'mkt_esports_pack',
    name: 'Pro Tournament Overlay (16:9)',
    category: 'scene',
    filter: 'overlay',
    author: 'Esports Asia',
    rating: 4.7,
    downloads: 1150,
    description: 'Tata letak widescreen 1080p dengan panel scoreboard, avatar pemain, dan sponsor bar.',
    isInstalled: false,
    isFavorite: false,
    previewGradient: 'from-purple-950 to-slate-900',
    elementsPayload: [
      { ...DEFAULT_STUDIO_ELEMENTS[0], id: 'elem_mkt_esports_camera', x: 4, y: 68, width: 25, height: 28 },
      { ...DEFAULT_STUDIO_ELEMENTS[1], id: 'elem_mkt_esports_alert', x: 35, y: 8, width: 30, height: 12 },
      { ...DEFAULT_STUDIO_ELEMENTS[2], id: 'elem_mkt_esports_chat', x: 74, y: 20, width: 24, height: 55 },
      { ...DEFAULT_STUDIO_ELEMENTS[3], id: 'elem_mkt_esports_ticker', x: 0, y: 94, width: 100, height: 6 },
    ],
  },
];

export const DEFAULT_TIKTOK_ACCOUNT_STATE: TikTokAccountState = {
  isLinked: false,
  connectionMethod: 'direct',
  fallbackEnabled: true,
  accountLinkStatus: 'unlinked',
};

export function sanitizeTikTokAccountState(raw: unknown): TikTokAccountState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_TIKTOK_ACCOUNT_STATE };
  }
  const obj = raw as Record<string, unknown>;
  const openId =
    typeof obj.openId === 'string' && obj.openId.trim() ? obj.openId.trim() : undefined;
  const isLinked =
    obj.isLinked === true && obj.accountLinkStatus === 'linked' && Boolean(openId);
  const connectionMethod = obj.connectionMethod === 'euler' ? 'euler' : 'direct';
  const fallbackEnabled = typeof obj.fallbackEnabled === 'boolean' ? obj.fallbackEnabled : true;
  const rawStatus = obj.accountLinkStatus;
  const accountLinkStatus: TikTokAccountState['accountLinkStatus'] = isLinked
    ? 'linked'
    : rawStatus === 'failed'
    ? 'failed'
    : 'unlinked'; // Jangan pernah memulihkan status 'linking' yang tertinggal saat startup

  const grantedScopes = Array.isArray(obj.grantedScopes)
    ? obj.grantedScopes.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : undefined;
  const hasProfileScope = !grantedScopes || grantedScopes.includes('user.info.profile');
  const rawUsername = typeof obj.username === 'string' ? obj.username.trim().replace(/^@+/, '') : '';

  return {
    isLinked,
    openId: isLinked ? openId : undefined,
    username: isLinked && hasProfileScope && rawUsername ? rawUsername : undefined,
    displayName:
      isLinked && typeof obj.displayName === 'string' && obj.displayName.trim()
        ? obj.displayName.trim()
        : undefined,
    avatarUrl:
      isLinked && typeof obj.avatarUrl === 'string' && /^https?:\/\//i.test(obj.avatarUrl.trim())
        ? obj.avatarUrl.trim()
        : undefined,
    connectionMethod,
    fallbackEnabled,
    accountLinkStatus,
    lastSuccessfulAuthorization:
      isLinked && typeof obj.lastSuccessfulAuthorization === 'number' && Number.isFinite(obj.lastSuccessfulAuthorization)
        ? obj.lastSuccessfulAuthorization
        : undefined,
    grantedScopes: isLinked ? grantedScopes : undefined,
    linkErrorMessage:
      accountLinkStatus === 'failed' && typeof obj.linkErrorMessage === 'string'
        ? obj.linkErrorMessage
        : undefined,
  };
}

// INITIAL INTEGRATIONS DIRECTORY
export const DEFAULT_INTEGRATIONS: IntegrationProvider[] = [
  {
    id: 'tiktok',
    name: 'TikTok LIVE Companion',
    category: 'companion',
    status: 'NOT_CONNECTED',
    description: 'Mode pendamping sesi live TikTok dengan floating overlay di atas aplikasi.',
    logo: '🎵',
    guideUrl: 'https://www.tiktok.com/live',
  },
  {
    id: 'youtube',
    name: 'YouTube Live',
    category: 'streaming',
    status: 'NOT_CONNECTED',
    description: 'Koneksi siaran langsung dan katalog metadata video YouTube Data API v3.',
    logo: '▶️',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    category: 'streaming',
    status: 'NOT_CONNECTED',
    description: 'Integrasi chat PubSub, emote kustom, dan stream ingest RTMP Twitch.',
    logo: '🟣',
  },
  {
    id: 'kick',
    name: 'Kick Streaming',
    category: 'streaming',
    status: 'NOT_CONNECTED',
    description: 'Siaran langsung multiplatform via protokol RTMP standar industri.',
    logo: '🟢',
  },
  {
    id: 'saweria',
    name: 'Saweria Overlay & Alert',
    category: 'donation',
    status: 'NOT_CONNECTED',
    description: 'Notifikasi tip dan donasi lokal Indonesia (QRIS, GoPay, OVO, Dana).',
    logo: '💰',
  },
  {
    id: 'sociabuzz',
    name: 'SociaBuzz Tribe',
    category: 'donation',
    status: 'NOT_CONNECTED',
    description: 'Pemberitahuan donasi, dukungan kreator, dan pesan berbayar penonton.',
    logo: '⚡',
  },
  {
    id: 'trakteer',
    name: 'Trakteer.id',
    category: 'donation',
    status: 'NOT_CONNECTED',
    description: 'Webhook peringatan tip traktiran cendol & karya eksklusif penonton.',
    logo: '🍧',
  },
  {
    id: 'bagibagi',
    name: 'BagiBagi',
    category: 'donation',
    status: 'NOT_CONNECTED',
    description: 'Notifikasi donasi instan komunitas streamer Indonesia.',
    logo: '🎁',
  },
];

// PRESERVED STAGE 1 & 2 FALLBACKS
export const DEFAULT_SCENES: Scene[] = [
  {
    id: 'scene_gameplay',
    name: 'Gameplay + Overlay',
    description: 'Optimasi untuk performa tinggi mobile gaming dengan footprint minimal',
    isDefault: true,
    createdAt: Date.now() - 3600000,
    overlayConfig: {
      nowPlaying: { enabled: true, x: 4, y: 82, opacity: 95, showAlbumArt: true, showProgress: true, style: 'compact' },
      musicRequest: { enabled: true, x: 4, y: 68, opacity: 90, maxItems: 3, showRequester: true },
      liveChat: { enabled: true, x: 74, y: 45, opacity: 90, maxMessages: 4, fontSize: 13, showBadges: true },
      eventAlert: { enabled: true, x: 50, y: 12, opacity: 100, durationSec: 5, soundEnabled: true, position: 'top-center' },
      customText: { enabled: true, text: 'ROAD TO 1,000 SUBS', goalTarget: '1,000', goalCurrent: '842', showGoal: true, x: 50, y: 92, opacity: 90, color: '#38bdf8' },
    },
  },
];

export const DEFAULT_SONG_REQUESTS: SongRequest[] = [
  {
    id: 'req_1',
    title: 'Neon Horizon',
    artist: 'Syntxrr Sound Lab',
    duration: 215,
    requesterName: 'AeroStream',
    platform: 'TikTok',
    status: 'playing',
    requestedAt: Date.now() - 600000,
    source: 'viewer_request',
    queueStatus: 'playing',
  },
];

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  soundEnabled: true,
  soundVolume: 80,
  durationSec: 5,
  types: {
    follow: { enabled: true, color: '#38bdf8', icon: 'UserPlus' },
    sub: { enabled: true, color: '#a855f7', icon: 'Star' },
    donation: { enabled: true, color: '#10b981', minAmount: 10000, icon: 'DollarSign' },
    gift: { enabled: true, color: '#ec4899', icon: 'Gift' },
    like: { enabled: true, color: '#f43f5e', icon: 'Heart' },
    share: { enabled: true, color: '#f59e0b', icon: 'Share2' },
  },
};

export const DEFAULT_OVERLAY_CONFIG = DEFAULT_SCENES[0].overlayConfig;

// IndexedDB Helper
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idbFactory =
      typeof indexedDB !== 'undefined'
        ? indexedDB
        : typeof window !== 'undefined' && 'indexedDB' in window
        ? window.indexedDB
        : null;
    if (!idbFactory) {
      return reject(new Error('IndexedDB tidak didukung'));
    }
    const request = idbFactory.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('store')) {
        db.createObjectStore('store');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('store', 'readonly');
      const store = tx.objectStore('store');
      const request = store.get(key);
      request.onsuccess = () => {
        db.close();
        resolve(request.result ?? null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch {
    try {
      if (typeof localStorage === 'undefined') return null;
      const item = localStorage.getItem(`syntxrr_${key}`);
      return item ? (JSON.parse(item) as T) : null;
    } catch {
      return null;
    }
  }
}

function isBlobValue(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const isBlob = isBlobValue(value);
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('store', 'readwrite');
      const store = tx.objectStore('store');
      const request = store.put(value, key);
      request.onsuccess = () => {
        db.close();
        if (!isBlob && typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(`syntxrr_${key}`, JSON.stringify(value));
          } catch {}
        }
        resolve();
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch {
    if (!isBlob && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`syntxrr_${key}`, JSON.stringify(value));
      } catch {}
    }
  }
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('store', 'readwrite');
      const request = tx.objectStore('store').delete(key);
      request.onsuccess = () => {
        db.close();
        resolve();
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch {}

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`syntxrr_${key}`);
    }
  } catch {}
}

// ============================================================
// PERLINDUNGAN KREDENSIAL PADA CADANGAN (Phase 1)
// Kredensial sensitif tidak pernah ditulis ke file cadangan dan tidak
// pernah dipulihkan dari file cadangan (milik pengguna/perangkat lain).
// ============================================================
export const CREDENTIAL_SETTING_KEYS = [
  'streamKey',
  'youtubeApiKey',
  'spotifyAccessToken',
  'eulerStreamApiKey',
  'eulerStreamJwtKey',
] as const;
export type CredentialSettingKey = (typeof CREDENTIAL_SETTING_KEYS)[number];

const isCredentialSettingKey = (key: string): key is CredentialSettingKey =>
  (CREDENTIAL_SETTING_KEYS as readonly string[]).includes(key);

/** Salinan settings tanpa field kredensial, untuk ditulis ke file cadangan. */
export function omitCredentials(settings: AppSettings): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...settings };
  for (const key of CREDENTIAL_SETTING_KEYS) {
    delete sanitized[key];
  }
  return sanitized;
}

/**
 * Gabungkan settings dari file cadangan dengan settings lokal perangkat ini.
 * - Kredensial lokal selalu dipertahankan dan tidak pernah ditimpa file cadangan.
 * - Field kredensial yang hilang, redacted, null, atau kosong tidak menghapus nilai lokal.
 * - Field non-sensitif yang dikenal tetap dipulihkan (kompatibilitas cadangan lama).
 */
export function mergeBackupSettings(imported: unknown, current: AppSettings): AppSettings {
  if (!imported || typeof imported !== 'object' || Array.isArray(imported)) return current;

  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(imported as Record<string, unknown>)) {
    if (isCredentialSettingKey(key)) continue; // kredensial lokal selalu menang
    if (!(key in DEFAULT_SETTINGS)) continue; // abaikan key yang tidak dikenal
    if (value === undefined || value === null) continue; // jangan menghapus nilai lokal
    merged[key] = value;
  }
  if ('operatingMode' in merged) {
    merged.operatingMode = normalizeOperatingMode(merged.operatingMode as string | undefined);
  }
  merged.modeBAudioSource = normalizeModeBAudioSource(
    merged.modeBAudioSource,
    normalizeModeBAudioSource(current.modeBAudioSource, 'mix'),
  );
  if ('audioVolume' in merged) {
    merged.audioVolume = normalizeUnitVolume(merged.audioVolume, DEFAULT_SETTINGS.audioVolume ?? 0.85);
  }
  if ('soundboardVolume' in merged) {
    merged.soundboardVolume = normalizeUnitVolume(merged.soundboardVolume, DEFAULT_SETTINGS.soundboardVolume ?? 0.85);
  }
  if ('micGain' in merged && typeof merged.micGain === 'number' && Number.isFinite(merged.micGain)) {
    merged.micGain = Math.max(0, Math.min(200, Math.round(merged.micGain)));
  }
  return merged as unknown as AppSettings;
}

function normalizeSettingsFields(settings: AppSettings): AppSettings {
  const eulerStreamApiKey = typeof settings.eulerStreamApiKey === 'string' ? settings.eulerStreamApiKey.trim() : '';
  const eulerStreamJwtKey = typeof settings.eulerStreamJwtKey === 'string' ? settings.eulerStreamJwtKey.trim() : '';
  return {
    ...settings,
    operatingMode: normalizeOperatingMode(settings.operatingMode),
    modeBAudioSource: normalizeModeBAudioSource(settings.modeBAudioSource, 'mix'),
    streamKey: typeof settings.streamKey === 'string' ? settings.streamKey : '',
    rtmpServer: typeof settings.rtmpServer === 'string' ? settings.rtmpServer : DEFAULT_SETTINGS.rtmpServer,
    eulerStreamApiKey,
    // Enforce mutual exclusivity if corrupted storage contains both credentials.
    eulerStreamJwtKey: eulerStreamApiKey ? '' : eulerStreamJwtKey,
    audioVolume: normalizeUnitVolume(settings.audioVolume, DEFAULT_SETTINGS.audioVolume ?? 0.85),
    soundboardVolume: normalizeUnitVolume(settings.soundboardVolume, DEFAULT_SETTINGS.soundboardVolume ?? 0.85),
    micGain:
      typeof settings.micGain === 'number' && Number.isFinite(settings.micGain)
        ? Math.max(0, Math.min(200, Math.round(settings.micGain)))
        : (DEFAULT_SETTINGS.micGain ?? 100),
  };
}

export const StorageService = {
  // SETTINGS
  async getSettings(): Promise<AppSettings> {
    const stored = await idbGet<AppSettings>('settings');
    const merged = stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
    return normalizeSettingsFields(merged);
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    await idbSet('settings', normalizeSettingsFields(settings));
  },

  // PRESETS
  async getPresets(): Promise<StudioPreset[]> {
    const stored = await idbGet<StudioPreset[]>('studio_presets');
    if (!Array.isArray(stored) || stored.length === 0) {
      const defaults = DEFAULT_PRESETS.map((preset) =>
        normalizeStudioPreset({
          ...preset,
          elements: ensureUniqueElementIds(preset.elements || []),
        }),
      );
      await idbSet('studio_presets', defaults);
      return defaults;
    }
    return stored.map((preset) =>
      normalizeStudioPreset({
        ...preset,
        elements: ensureUniqueElementIds(preset.elements || []),
      }),
    );
  },

  async savePresets(presets: StudioPreset[]): Promise<void> {
    await idbSet(
      'studio_presets',
      presets.map((preset) => normalizeStudioPreset(preset)),
    );
  },

  async getActivePresetId(): Promise<string> {
    const stored = await idbGet<string>('active_preset_id');
    return stored || DEFAULT_PRESETS[0].id;
  },

  async saveActivePresetId(id: string): Promise<void> {
    await idbSet('active_preset_id', id);
  },

  // STUDIO ELEMENTS
  async getStudioElements(): Promise<StudioElement[]> {
    const stored = await idbGet<StudioElement[]>('studio_elements');
    // An empty canvas is a valid user choice. Only a missing/corrupt value should
    // initialize defaults; treating [] as missing silently repopulates deleted elements.
    if (!Array.isArray(stored)) {
      await idbSet('studio_elements', DEFAULT_STUDIO_ELEMENTS);
      return DEFAULT_STUDIO_ELEMENTS;
    }
    const sanitized = ensureUniqueElementIds(stored);
    if (sanitized.length !== stored.length || sanitized.some((el, i) => el.id !== stored[i]?.id)) {
      await idbSet('studio_elements', sanitized);
    }
    return sanitized;
  },

  async saveStudioElements(elements: StudioElement[]): Promise<void> {
    const sanitized = ensureUniqueElementIds(elements);
    await idbSet('studio_elements', sanitized);
  },

  /**
   * Atomically persists presets, activePresetId, studioElements, and settings in one IndexedDB transaction.
   * Only falls back to synchronized localStorage writes when openDB() fails before starting a transaction.
   */
  async savePresetActivationAtomically(input: {
    presets: StudioPreset[];
    activePresetId: string;
    studioElements: StudioElement[];
    settings: AppSettings;
  }): Promise<void> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Data aktivasi preset tidak valid.');
    }
    if (!Array.isArray(input.presets) || input.presets.length === 0) {
      throw new Error('Daftar preset tidak boleh kosong.');
    }
    const activePresetId = typeof input.activePresetId === 'string' ? input.activePresetId.trim() : '';
    if (!activePresetId) {
      throw new Error('ID preset aktif tidak valid.');
    }
    if (!Array.isArray(input.studioElements)) {
      throw new Error('Daftar elemen Studio tidak valid.');
    }
    if (!input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings)) {
      throw new Error('Pengaturan aplikasi tidak valid.');
    }

    const seenPresetIds = new Set<string>();
    const normalizedPresets = input.presets.map((preset) => {
      if (!preset || typeof preset !== 'object' || Array.isArray(preset)) {
        throw new Error('Item preset tidak valid.');
      }
      const presetId = typeof preset.id === 'string' ? preset.id.trim() : '';
      if (!presetId || seenPresetIds.has(presetId)) {
        throw new Error('ID preset tidak valid atau terduplikasi.');
      }
      if (!Array.isArray(preset.elements)) {
        throw new Error(`Elemen pada preset "${preset.name || presetId}" tidak valid.`);
      }
      seenPresetIds.add(presetId);
      return normalizeStudioPreset({
        ...preset,
        id: presetId,
        elements: ensureUniqueElementIds(preset.elements),
      });
    });

    if (!normalizedPresets.some((preset) => preset.id === activePresetId)) {
      throw new Error(`Preset aktif "${activePresetId}" tidak ditemukan dalam daftar preset.`);
    }

    const normalizedElements = ensureUniqueElementIds(input.studioElements);
    const normalizedSettings = normalizeSettingsFields(input.settings);

    const entries: Array<[string, unknown]> = [
      ['studio_presets', normalizedPresets],
      ['active_preset_id', activePresetId],
      ['studio_elements', normalizedElements],
      ['settings', normalizedSettings],
    ];

    let db: IDBDatabase;
    try {
      db = await openDB();
    } catch {
      if (typeof localStorage === 'undefined') {
        throw new Error('IndexedDB gagal dibuka dan localStorage tidak tersedia.');
      }
      const previousEntries: Array<{ key: string; existed: boolean; value: string | null }> = [];
      for (const [key] of entries) {
        const storageKey = `syntxrr_${key}`;
        const existing = localStorage.getItem(storageKey);
        previousEntries.push({
          key: storageKey,
          existed: existing !== null,
          value: existing,
        });
      }
      try {
        for (const [key, value] of entries) {
          localStorage.setItem(`syntxrr_${key}`, JSON.stringify(value));
        }
        return;
      } catch (writeError) {
        try {
          for (const prev of previousEntries) {
            if (prev.existed && prev.value !== null) {
              localStorage.setItem(prev.key, prev.value);
            } else {
              localStorage.removeItem(prev.key);
            }
          }
        } catch (rollbackError) {
          throw new Error(
            `Penulisan fallback localStorage gagal dan pemulihan snapshot ikut gagal: ${
              rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
            }`,
          );
        }
        throw writeError instanceof Error ? writeError : new Error('Penulisan fallback localStorage gagal.');
      }
    }

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let abortReason: Error | null = null;
        const fail = (err: unknown) => {
          if (settled) return;
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err || 'Transaksi aktivasi preset gagal.')));
        };

        let tx: IDBTransaction;
        try {
          tx = db.transaction('store', 'readwrite');
        } catch (err) {
          fail(err);
          return;
        }

        tx.oncomplete = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        tx.onerror = () => fail(abortReason || tx.error || new Error('Transaksi aktivasi preset gagal.'));
        tx.onabort = () => fail(abortReason || tx.error || new Error('Transaksi aktivasi preset dibatalkan.'));

        try {
          const store = tx.objectStore('store');
          for (const [key, value] of entries) {
            const request = store.put(value, key);
            request.onerror = () => {
              abortReason =
                request.error instanceof Error
                  ? request.error
                  : new Error(`Gagal menulis key ${key} pada transaksi aktivasi preset.`);
              try {
                tx.abort();
              } catch {}
              fail(abortReason);
            };
          }
        } catch (syncError) {
          abortReason = syncError instanceof Error ? syncError : new Error(String(syncError));
          try {
            tx.abort();
          } catch {}
          fail(abortReason);
        }
      });
    } finally {
      db.close();
    }

    if (typeof localStorage !== 'undefined') {
      try {
        for (const [key, value] of entries) {
          localStorage.setItem(`syntxrr_${key}`, JSON.stringify(value));
        }
      } catch {}
    }
  },

  // STUDIO MEDIA ASSETS (Mode B local images / MP4 / audio stored as Blob in same DB)
  async saveStudioMediaAsset(input: {
    id?: string;
    name: string;
    type: 'image' | 'video' | 'audio';
    mimeType: string;
    blob: Blob;
    addedAt?: number;
  }): Promise<StoredStudioMediaAsset> {
    if (!isBlobValue(input.blob) || input.blob.size <= 0) {
      throw new Error('Berkas media Studio kosong atau tidak valid.');
    }
    const rawId = typeof input.id === 'string' ? input.id.trim() : '';
    const id = VALID_STUDIO_MEDIA_ASSET_ID.test(rawId)
      ? rawId
      : `${input.type === 'video' ? 'vid' : input.type === 'audio' ? 'aud' : 'img'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const metadata: StoredStudioMediaAsset = {
      id,
      name: (input.name || id).trim().slice(0, 140),
      type: input.type,
      mimeType: (input.mimeType || input.blob.type || 'application/octet-stream').trim().toLowerCase(),
      sizeBytes: input.blob.size,
      addedAt: typeof input.addedAt === 'number' && Number.isFinite(input.addedAt) ? input.addedAt : Date.now(),
    };
    await idbSet(`studio_media_asset:${id}`, input.blob);
    const currentIndex = (await idbGet<StoredStudioMediaAsset[]>('studio_media_assets_index')) || [];
    const nextIndex = [
      metadata,
      ...(Array.isArray(currentIndex) ? currentIndex.filter((entry) => entry && entry.id !== id) : []),
    ];
    await idbSet('studio_media_assets_index', nextIndex);
    return metadata;
  },

  async getStudioMediaAssets(): Promise<Array<StoredStudioMediaAsset & { blob: Blob }>> {
    const index = await idbGet<StoredStudioMediaAsset[]>('studio_media_assets_index');
    if (!Array.isArray(index) || index.length === 0) return [];
    const results: Array<StoredStudioMediaAsset & { blob: Blob }> = [];
    for (const metadata of index) {
      if (
        !metadata ||
        !VALID_STUDIO_MEDIA_ASSET_ID.test(metadata.id) ||
        (metadata.type !== 'image' && metadata.type !== 'video' && metadata.type !== 'audio')
      ) {
        continue;
      }
      const blob = await idbGet<Blob>(`studio_media_asset:${metadata.id}`);
      if (isBlobValue(blob) && blob.size > 0) {
        results.push({ ...metadata, blob });
      }
    }
    return results;
  },

  /** Loads requested visual Studio media assets by ID in requested order without reading unrelated blobs. */
  async getStudioMediaAssetsByIds(
    ids: string[],
  ): Promise<Array<Omit<StoredStudioMediaAsset, 'type'> & { type: 'image' | 'video'; blob: Blob }>> {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const orderedUniqueIds: string[] = [];
    const seen = new Set<string>();
    for (const rawId of ids) {
      const normalized = typeof rawId === 'string' ? rawId.trim() : '';
      if (!VALID_STUDIO_MEDIA_ASSET_ID.test(normalized) || seen.has(normalized)) continue;
      seen.add(normalized);
      orderedUniqueIds.push(normalized);
    }
    if (orderedUniqueIds.length === 0) return [];

    const index = await idbGet<StoredStudioMediaAsset[]>('studio_media_assets_index');
    if (!Array.isArray(index) || index.length === 0) return [];

    const metadataById = new Map<
      string,
      Omit<StoredStudioMediaAsset, 'type'> & { type: 'image' | 'video' }
    >();
    for (const entry of index) {
      if (
        entry &&
        typeof entry.id === 'string' &&
        seen.has(entry.id) &&
        (entry.type === 'image' || entry.type === 'video')
      ) {
        metadataById.set(entry.id, { ...entry, type: entry.type });
      }
    }

    const results: Array<Omit<StoredStudioMediaAsset, 'type'> & { type: 'image' | 'video'; blob: Blob }> = [];
    for (const id of orderedUniqueIds) {
      const metadata = metadataById.get(id);
      if (!metadata) continue;
      const blob = await idbGet<Blob>(`studio_media_asset:${id}`);
      if (isBlobValue(blob) && blob.size > 0) {
        results.push({ ...metadata, blob });
      }
    }
    return results;
  },

  /** Returns all requested Studio media kinds, including audio, for portable preset transfer. */
  async getStudioMediaAssetsForPresetTransfer(
    ids: string[],
  ): Promise<Array<StoredStudioMediaAsset & { blob: Blob }>> {
    const wanted = new Set(
      (Array.isArray(ids) ? ids : []).filter(
        (id): id is string => typeof id === 'string' && VALID_STUDIO_MEDIA_ASSET_ID.test(id),
      ),
    );
    if (wanted.size === 0) return [];
    const index = await idbGet<StoredStudioMediaAsset[]>('studio_media_assets_index');
    if (!Array.isArray(index) || index.length === 0) return [];

    const selected = index.filter(
      (metadata): metadata is StoredStudioMediaAsset =>
        Boolean(metadata) &&
        wanted.has(metadata.id) &&
        (metadata.type === 'image' || metadata.type === 'video' || metadata.type === 'audio'),
    );
    const assets: Array<StoredStudioMediaAsset & { blob: Blob }> = [];
    for (const metadata of selected) {
      const blob = await idbGet<Blob>(`studio_media_asset:${metadata.id}`);
      if (isBlobValue(blob) && blob.size > 0) {
        assets.push({ ...metadata, blob });
      }
    }
    return assets;
  },

  /** Atomically restores a set of media files for an imported preset inside one readwrite transaction. */
  async saveStudioMediaAssetsForPresetTransfer(
    assets: Array<StoredStudioMediaAsset & { blob: Blob }>,
  ): Promise<void> {
    if (!Array.isArray(assets) || assets.length === 0) return;
    const seenIds = new Set<string>();
    for (const asset of assets) {
      if (
        !asset ||
        typeof asset.id !== 'string' ||
        !VALID_STUDIO_MEDIA_ASSET_ID.test(asset.id) ||
        seenIds.has(asset.id)
      ) {
        throw new Error('Identitas media preset yang akan dipulihkan tidak valid.');
      }
      if (
        typeof asset.name !== 'string' ||
        !asset.name.trim() ||
        !['image', 'video', 'audio'].includes(asset.type) ||
        !isBlobValue(asset.blob) ||
        asset.blob.size <= 0 ||
        asset.blob.size !== asset.sizeBytes ||
        typeof asset.mimeType !== 'string' ||
        !asset.mimeType.trim()
      ) {
        throw new Error(`Data media ${asset.name || asset.id} tidak valid.`);
      }
      seenIds.add(asset.id);
    }

    const db = await openDB();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('store', 'readwrite');
        const store = tx.objectStore('store');
        const indexRequest = store.get('studio_media_assets_index');
        indexRequest.onsuccess = () => {
          const current = Array.isArray(indexRequest.result)
            ? (indexRequest.result as StoredStudioMediaAsset[])
            : [];
          const incomingIds = new Set(assets.map((asset) => asset.id));
          for (const asset of assets) {
            store.put(asset.blob, `studio_media_asset:${asset.id}`);
          }
          store.put(
            [
              ...assets.map(({ blob: _blob, ...metadata }) => metadata),
              ...current.filter((item) => item && !incomingIds.has(item.id)),
            ],
            'studio_media_assets_index',
          );
        };
        indexRequest.onerror = () => tx.abort();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Pemulihan media preset gagal.'));
        tx.onabort = () => reject(tx.error || new Error('Pemulihan media preset dibatalkan.'));
      });
    } finally {
      db.close();
    }
  },

  async deleteStudioMediaAsset(id: string): Promise<void> {
    if (!VALID_STUDIO_MEDIA_ASSET_ID.test(id)) return;
    await idbDelete(`studio_media_asset:${id}`);
    const currentIndex = (await idbGet<StoredStudioMediaAsset[]>('studio_media_assets_index')) || [];
    if (Array.isArray(currentIndex)) {
      await idbSet(
        'studio_media_assets_index',
        currentIndex.filter((entry) => entry && entry.id !== id),
      );
    }
  },

  // SOUNDBOARD
  async getSoundboard(): Promise<SoundboardItem[]> {
    const stored = await idbGet<SoundboardItem[]>('soundboard_items');
    if (!stored || stored.length === 0) {
      await idbSet('soundboard_items', DEFAULT_SOUNDBOARD);
      return DEFAULT_SOUNDBOARD;
    }
    return stored;
  },

  async saveSoundboard(items: SoundboardItem[]): Promise<void> {
    await idbSet('soundboard_items', items);
  },

  async getSoundboardAudio(id: string): Promise<Blob | null> {
    return idbGet<Blob>(`soundboard_audio_${id}`);
  },

  async saveSoundboardAudio(id: string, file: Blob): Promise<void> {
    await idbSet(`soundboard_audio_${id}`, file);
  },

  async deleteSoundboardAudio(id: string): Promise<void> {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('store', 'readwrite');
        const request = tx.objectStore('store').delete(`soundboard_audio_${id}`);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {}

    try {
      localStorage.removeItem(`syntxrr_soundboard_audio_${id}`);
    } catch {}
  },

  async deleteAllSoundboardAudio(): Promise<void> {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('store', 'readwrite');
        const store = tx.objectStore('store');
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          if (typeof cursor.key === 'string' && cursor.key.startsWith('soundboard_audio_')) {
            cursor.delete();
          }
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      try {
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key?.startsWith('syntxrr_soundboard_audio_')) localStorage.removeItem(key);
        }
      } catch {}
    }
  },

  // MARKETPLACE
  async getMarketplace(): Promise<MarketplaceItem[]> {
    const stored = await idbGet<MarketplaceItem[]>('marketplace_items');
    if (!stored || stored.length === 0) {
      await idbSet('marketplace_items', DEFAULT_MARKETPLACE_ITEMS);
      return DEFAULT_MARKETPLACE_ITEMS;
    }
    return stored;
  },

  async saveMarketplace(items: MarketplaceItem[]): Promise<void> {
    await idbSet('marketplace_items', items);
  },

  // INTEGRATIONS
  async getIntegrations(): Promise<IntegrationProvider[]> {
    const stored = await idbGet<IntegrationProvider[]>('integrations');
    if (!stored || stored.length === 0) {
      await idbSet('integrations', DEFAULT_INTEGRATIONS);
      return DEFAULT_INTEGRATIONS;
    }
    return stored;
  },

  async saveIntegrations(integrations: IntegrationProvider[]): Promise<void> {
    await idbSet('integrations', integrations);
  },

  // TIKTOK ACCOUNT LINKING STATE (disimpan lokal di perangkat, tidak ikut diekspor di backup)
  async getTikTokAccount(): Promise<TikTokAccountState> {
    const stored = await idbGet<unknown>('tiktok_account_state');
    return sanitizeTikTokAccountState(stored);
  },

  async saveTikTokAccount(account: TikTokAccountState): Promise<TikTokAccountState> {
    const sanitized = sanitizeTikTokAccountState(account);
    await idbSet('tiktok_account_state', sanitized);
    return sanitized;
  },

  async clearTikTokAccount(): Promise<TikTokAccountState> {
    const current = await this.getTikTokAccount();
    const cleared: TikTokAccountState = {
      isLinked: false,
      connectionMethod: current.connectionMethod,
      fallbackEnabled: current.fallbackEnabled,
      accountLinkStatus: 'unlinked',
    };
    await idbSet('tiktok_account_state', cleared);

    const currentSettings = await this.getSettings();
    const normalizedSettingsTarget = (currentSettings.tiktokUsername || '').trim().replace(/^@+/, '').toLowerCase();
    const normalizedAccountUser = (current.username || '').trim().replace(/^@+/, '').toLowerCase();
    const shouldClearTarget =
      normalizedSettingsTarget !== '' &&
      normalizedAccountUser !== '' &&
      normalizedSettingsTarget === normalizedAccountUser;
    const nextSettings = {
      ...currentSettings,
      ...(shouldClearTarget ? { tiktokUsername: '' } : {}),
      tiktokConnected: false,
      eulerStreamApiKey: '',
      eulerStreamJwtKey: '',
    };
    await this.saveSettings(nextSettings);

    const preservedTarget = (nextSettings.tiktokUsername || '').trim().replace(/^@+/, '');
    const currentIntegrations = await this.getIntegrations();
    await this.saveIntegrations(
      currentIntegrations.map((item) =>
        item.id === 'tiktok'
          ? {
              ...item,
              status: 'NOT_CONNECTED',
              connectedUser: preservedTarget || undefined,
            }
          : item
      )
    );

    return cleared;
  },

  // TTS CONFIG
  async getTTSConfig(): Promise<TTSConfig> {
    const stored = await idbGet<TTSConfig>('tts_config');
    const merged = stored ? { ...DEFAULT_TTS_CONFIG, ...stored } : DEFAULT_TTS_CONFIG;
    return {
      ...merged,
      volume: normalizeUnitVolume(merged.volume, DEFAULT_TTS_CONFIG.volume),
    };
  },

  async saveTTSConfig(config: TTSConfig): Promise<void> {
    await idbSet('tts_config', {
      ...config,
      volume: normalizeUnitVolume(config.volume, DEFAULT_TTS_CONFIG.volume),
    });
  },

  // QUEUE & AUDIO (STAGE 2 PRESERVED)
  async getUnifiedQueue(): Promise<UnifiedQueueItem[]> {
    const stored = await idbGet<UnifiedQueueItem[]>('unified_queue');
    return stored || [];
  },

  async saveUnifiedQueue(queue: UnifiedQueueItem[]): Promise<void> {
    await idbSet('unified_queue', queue);
  },

  async getLocalTracksMeta(): Promise<LocalAudioTrackMeta[]> {
    const stored = await idbGet<LocalAudioTrackMeta[]>('local_audio_tracks_meta');
    return stored || [];
  },

  async saveLocalTracksMeta(tracks: LocalAudioTrackMeta[]): Promise<void> {
    await idbSet('local_audio_tracks_meta', tracks);
  },

  // STAGE 1 PRESERVED METHODS
  async getScenes(): Promise<Scene[]> {
    const stored = await idbGet<Scene[]>('scenes');
    return stored || DEFAULT_SCENES;
  },

  async saveScenes(scenes: Scene[]): Promise<void> {
    await idbSet('scenes', scenes);
  },

  async getActiveSceneId(): Promise<string> {
    const stored = await idbGet<string>('active_scene_id');
    return stored || DEFAULT_SCENES[0].id;
  },

  async saveActiveSceneId(id: string): Promise<void> {
    await idbSet('active_scene_id', id);
  },

  async getSongRequests(): Promise<SongRequest[]> {
    const stored = await idbGet<SongRequest[]>('song_requests');
    return stored || DEFAULT_SONG_REQUESTS;
  },

  async saveSongRequests(requests: SongRequest[]): Promise<void> {
    await idbSet('song_requests', requests);
  },

  async getAlertHistory(): Promise<AlertEvent[]> {
    const stored = await idbGet<AlertEvent[]>('alert_history');
    return stored || [];
  },

  async saveAlertHistory(events: AlertEvent[]): Promise<void> {
    await idbSet('alert_history', events);
  },

  async getAlertSettings(): Promise<AlertSettings> {
    const stored = await idbGet<AlertSettings>('alert_settings');
    return stored || DEFAULT_ALERT_SETTINGS;
  },

  async saveAlertSettings(settings: AlertSettings): Promise<void> {
    await idbSet('alert_settings', settings);
  },

  // EXPORT & IMPORT BACKUP (BAHASA INDONESIA & MULTI-VERSION COMPATIBLE)
  async exportAllData(): Promise<string> {
    const settings = await this.getSettings();
    const presets = await this.getPresets();
    const activePresetId = await this.getActivePresetId();
    const studioElements = await this.getStudioElements();
    const soundboard = await this.getSoundboard();
    const marketplace = await this.getMarketplace();
    const integrations = await this.getIntegrations();
    const ttsConfig = await this.getTTSConfig();
    const unifiedQueue = await this.getUnifiedQueue();
    const localTracksMeta = await this.getLocalTracksMeta();
    const scenes = await this.getScenes();

    return JSON.stringify(
      {
        appName: 'SYNTXRR STREAM',
        version: '3.0.0',
        exportedAt: new Date().toISOString(),
        settings: omitCredentials(settings),
        presets,
        activePresetId,
        studioElements,
        soundboard,
        marketplace,
        integrations,
        ttsConfig,
        unifiedQueue,
        localTracksMeta,
        scenes,
      },
      null,
      2
    );
  },

  async importData(jsonString: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') return false;
      if (data.settings && typeof data.settings === 'object') {
        // Kredensial lokal selalu dipertahankan; hanya field non-sensitif yang dipulihkan.
        const currentSettings = await this.getSettings();
        await this.saveSettings(mergeBackupSettings(data.settings, currentSettings));
      }
      if (Array.isArray(data.presets)) await this.savePresets(data.presets);
      if (data.activePresetId) await this.saveActivePresetId(data.activePresetId);
      if (Array.isArray(data.studioElements)) await this.saveStudioElements(data.studioElements);
      if (Array.isArray(data.soundboard)) await this.saveSoundboard(data.soundboard);
      if (Array.isArray(data.marketplace)) await this.saveMarketplace(data.marketplace);
      if (Array.isArray(data.integrations)) await this.saveIntegrations(data.integrations);
      if (data.ttsConfig) await this.saveTTSConfig(data.ttsConfig);
      if (Array.isArray(data.unifiedQueue)) await this.saveUnifiedQueue(data.unifiedQueue);
      if (Array.isArray(data.localTracksMeta)) await this.saveLocalTracksMeta(data.localTracksMeta);
      if (Array.isArray(data.scenes)) await this.saveScenes(data.scenes);
      return true;
    } catch (e) {
      console.error('Gagal memulihkan backup data:', e instanceof Error ? e.message : 'unknown error');
      return false;
    }
  },

  async resetToDefaults(): Promise<void> {
    await this.deleteAllSoundboardAudio();
    await this.saveSettings(DEFAULT_SETTINGS);
    await this.savePresets(DEFAULT_PRESETS);
    await this.saveActivePresetId(DEFAULT_PRESETS[0].id);
    await this.saveStudioElements(DEFAULT_STUDIO_ELEMENTS);
    await this.saveSoundboard(DEFAULT_SOUNDBOARD);
    await this.saveMarketplace(DEFAULT_MARKETPLACE_ITEMS);
    await this.saveIntegrations(DEFAULT_INTEGRATIONS);
    await idbSet('tiktok_account_state', DEFAULT_TIKTOK_ACCOUNT_STATE);
    await this.saveTTSConfig(DEFAULT_TTS_CONFIG);
    await this.saveUnifiedQueue([]);
    await this.saveLocalTracksMeta([]);
  },
};
