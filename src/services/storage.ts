import {
  AppSettings,
  Scene,
  SongRequest,
  AlertSettings,
  AlertEvent,
  UnifiedQueueItem,
  LocalAudioTrackMeta,
} from '../types';

const DB_NAME = 'syntxrr_stream_tools_db';
const DB_VERSION = 2; // Incremented for Stage 2 persistence

export const DEFAULT_SETTINGS: AppSettings = {
  operatingMode: 'MODE_A_OVERLAY',
  targetResolution: '1080p',
  frameRate: 60,
  performanceProfile: 'balanced',
  theme: 'navy_dark',
  rtmpServer: 'rtmp://live.twitch.tv/app',
  streamKey: 'live_user_syntxrr_demo_key_secr',
  videoBitrateKbps: 6000,
  audioBitrateKbps: 160,
  enableOverlayInPip: true,
  floatingOverlayOpacity: 92,
  hardwareAcceleration: true,
  // Stage 2
  youtubeApiKey: '',
  spotifyClientId: '',
  spotifyAccessToken: '',
  spotifyTokenExpiry: 0,
  audioVolume: 0.85,
  audioAutoplayNext: true,
};

export const DEFAULT_OVERLAY_CONFIG = {
  nowPlaying: {
    enabled: true,
    x: 4,
    y: 82,
    opacity: 95,
    showAlbumArt: true,
    showProgress: true,
    style: 'compact' as const,
  },
  musicRequest: {
    enabled: true,
    x: 4,
    y: 68,
    opacity: 90,
    maxItems: 3,
    showRequester: true,
  },
  liveChat: {
    enabled: true,
    x: 72,
    y: 40,
    opacity: 90,
    maxMessages: 5,
    fontSize: 13,
    showBadges: true,
  },
  eventAlert: {
    enabled: true,
    x: 50,
    y: 12,
    opacity: 100,
    durationSec: 5,
    soundEnabled: true,
    position: 'top-center' as const,
  },
  customText: {
    enabled: true,
    text: 'ROAD TO 1,000 SUBS',
    goalTarget: '1,000',
    goalCurrent: '842',
    showGoal: true,
    x: 50,
    y: 92,
    opacity: 90,
    color: '#38bdf8',
  },
};

export const DEFAULT_SCENES: Scene[] = [
  {
    id: 'scene_gameplay',
    name: 'Gameplay + Overlay',
    description: 'Optimized for high-FPS mobile gaming with minimized UI footprint',
    isDefault: true,
    createdAt: Date.now() - 3600000,
    overlayConfig: {
      ...DEFAULT_OVERLAY_CONFIG,
      liveChat: {
        ...DEFAULT_OVERLAY_CONFIG.liveChat,
        maxMessages: 4,
        x: 74,
        y: 45,
      },
    },
  },
  {
    id: 'scene_just_chatting',
    name: 'Just Chatting',
    description: 'Prominent chat window with full track info and request list',
    createdAt: Date.now() - 1800000,
    overlayConfig: {
      ...DEFAULT_OVERLAY_CONFIG,
      liveChat: {
        ...DEFAULT_OVERLAY_CONFIG.liveChat,
        maxMessages: 8,
        fontSize: 14,
        x: 68,
        y: 25,
      },
      nowPlaying: {
        ...DEFAULT_OVERLAY_CONFIG.nowPlaying,
        style: 'studio',
        x: 4,
        y: 75,
      },
    },
  },
  {
    id: 'scene_intermission',
    name: 'BRB / Intermission',
    description: 'Centered goal counter and upcoming song requests queue',
    createdAt: Date.now() - 900000,
    overlayConfig: {
      ...DEFAULT_OVERLAY_CONFIG,
      customText: {
        ...DEFAULT_OVERLAY_CONFIG.customText,
        text: 'BE RIGHT BACK - REHYDRATING',
        showGoal: true,
        x: 50,
        y: 48,
      },
      liveChat: {
        ...DEFAULT_OVERLAY_CONFIG.liveChat,
        enabled: true,
        x: 35,
        y: 65,
      },
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
  {
    id: 'req_2',
    title: 'Midnight Overdrive',
    artist: 'Cybernetic Echoes',
    duration: 184,
    requesterName: 'PixelBlade',
    platform: 'Twitch',
    status: 'queued',
    requestedAt: Date.now() - 420000,
    source: 'viewer_request',
    queueStatus: 'approved',
  },
  {
    id: 'req_3',
    title: 'Solar Drift (Lo-Fi Cut)',
    artist: 'Kroma Waves',
    duration: 160,
    requesterName: 'VibeCheck_99',
    platform: 'YouTube',
    status: 'queued',
    requestedAt: Date.now() - 210000,
    source: 'youtube',
    externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    queueStatus: 'approved',
  },
  {
    id: 'req_4',
    title: 'Retrograde Pulse',
    artist: 'Voltage Dreamer',
    duration: 230,
    requesterName: 'NovaGamer',
    platform: 'Spotify',
    status: 'queued',
    requestedAt: Date.now() - 80000,
    source: 'spotify',
    externalUrl: 'https://open.spotify.com',
    queueStatus: 'pending',
  },
];

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  follower: {
    enabled: true,
    messageTemplate: '{username} just followed the stream!',
    durationSec: 5,
    soundEnabled: true,
    accentColor: '#38bdf8',
  },
  gift: {
    enabled: true,
    messageTemplate: '{username} sent {detail}!',
    durationSec: 6,
    soundEnabled: true,
    accentColor: '#fbbf24',
  },
  like: {
    enabled: true,
    messageTemplate: '{username} liked the broadcast x{detail}!',
    durationSec: 3,
    soundEnabled: false,
    accentColor: '#f43f5e',
  },
  chat_event: {
    enabled: true,
    messageTemplate: '{username} triggered {detail}!',
    durationSec: 5,
    soundEnabled: true,
    accentColor: '#a855f7',
  },
};

export const INITIAL_ALERT_EVENTS: AlertEvent[] = [
  {
    id: 'ev_1',
    type: 'follower',
    username: 'GhostRider_X',
    detail: 'New Follower',
    timestamp: Date.now() - 120000,
  },
  {
    id: 'ev_2',
    type: 'gift',
    username: 'LunarQueen',
    detail: '5x Cyber Rocket Gifts',
    timestamp: Date.now() - 95000,
    value: 500,
  },
  {
    id: 'ev_3',
    type: 'like',
    username: 'StreamSamurai',
    detail: '150 Likes tap combo',
    timestamp: Date.now() - 45000,
    value: 150,
  },
];

// Open IndexedDB with safe upgrade handler
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

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
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    // LocalStorage fallback
    try {
      const item = localStorage.getItem(`syntxrr_${key}`);
      return item ? (JSON.parse(item) as T) : null;
    } catch {
      return null;
    }
  }
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('store', 'readwrite');
      const store = tx.objectStore('store');
      const request = store.put(value, key);
      request.onsuccess = () => {
        try {
          localStorage.setItem(`syntxrr_${key}`, JSON.stringify(value));
        } catch {
          // Ignore quota errors
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    try {
      localStorage.setItem(`syntxrr_${key}`, JSON.stringify(value));
    } catch {
      // Storage quota exceeded
    }
  }
}

export const StorageService = {
  async getSettings(): Promise<AppSettings> {
    const stored = await idbGet<AppSettings>('settings');
    return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    await idbSet('settings', settings);
  },

  async getScenes(): Promise<Scene[]> {
    const stored = await idbGet<Scene[]>('scenes');
    if (!stored || stored.length === 0) {
      await idbSet('scenes', DEFAULT_SCENES);
      return DEFAULT_SCENES;
    }
    return stored;
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
    if (!stored || stored.length === 0) {
      await idbSet('song_requests', DEFAULT_SONG_REQUESTS);
      return DEFAULT_SONG_REQUESTS;
    }
    return stored;
  },

  async saveSongRequests(requests: SongRequest[]): Promise<void> {
    await idbSet('song_requests', requests);
  },

  async getAlertSettings(): Promise<AlertSettings> {
    const stored = await idbGet<AlertSettings>('alert_settings');
    return stored ? { ...DEFAULT_ALERT_SETTINGS, ...stored } : DEFAULT_ALERT_SETTINGS;
  },

  async saveAlertSettings(settings: AlertSettings): Promise<void> {
    await idbSet('alert_settings', settings);
  },

  async getAlertHistory(): Promise<AlertEvent[]> {
    const stored = await idbGet<AlertEvent[]>('alert_history');
    if (!stored) {
      await idbSet('alert_history', INITIAL_ALERT_EVENTS);
      return INITIAL_ALERT_EVENTS;
    }
    return stored;
  },

  async saveAlertHistory(events: AlertEvent[]): Promise<void> {
    await idbSet('alert_history', events);
  },

  // Stage 2: Local Audio Tracks Metadata persistence
  async getLocalTracksMeta(): Promise<LocalAudioTrackMeta[]> {
    const stored = await idbGet<LocalAudioTrackMeta[]>('local_audio_tracks_meta');
    return stored || [];
  },

  async saveLocalTracksMeta(tracks: LocalAudioTrackMeta[]): Promise<void> {
    await idbSet('local_audio_tracks_meta', tracks);
  },

  // Stage 2: Unified Queue Persistence
  async getUnifiedQueue(): Promise<UnifiedQueueItem[]> {
    const stored = await idbGet<UnifiedQueueItem[]>('unified_queue');
    if (stored && stored.length > 0) {
      return stored;
    }
    // Convert existing song_requests to unified queue items for seamless migration
    const legacyRequests = await this.getSongRequests();
    const migrated: UnifiedQueueItem[] = legacyRequests.map((req) => ({
      id: req.id,
      title: req.title,
      artist: req.artist,
      source: req.source || (req.platform === 'YouTube' ? 'youtube' : req.platform === 'Spotify' ? 'spotify' : 'viewer_request'),
      externalUrl: req.externalUrl,
      thumbnailUrl: req.thumbnailUrl || req.coverArt,
      duration: req.duration,
      requesterName: req.requesterName,
      platform: req.platform,
      addedAt: req.requestedAt,
      status: req.queueStatus || (req.status === 'playing' ? 'playing' : req.status === 'played' ? 'completed' : 'approved'),
    }));
    await idbSet('unified_queue', migrated);
    return migrated;
  },

  async saveUnifiedQueue(queue: UnifiedQueueItem[]): Promise<void> {
    await idbSet('unified_queue', queue);
    // Also sync backwards-compatible SongRequest array for OverlayStudio and Dashboard
    const legacy: SongRequest[] = queue.map((item) => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      duration: item.duration || 180,
      requesterName: item.requesterName,
      platform: item.platform || 'Manual',
      status: item.status === 'playing' ? 'playing' : item.status === 'completed' ? 'played' : 'queued',
      requestedAt: item.addedAt,
      source: item.source,
      externalUrl: item.externalUrl,
      thumbnailUrl: item.thumbnailUrl,
      queueStatus: item.status,
    }));
    await this.saveSongRequests(legacy);
  },

  async exportAllData(): Promise<string> {
    const settings = await this.getSettings();
    const scenes = await this.getScenes();
    const activeSceneId = await this.getActiveSceneId();
    const songRequests = await this.getSongRequests();
    const unifiedQueue = await this.getUnifiedQueue();
    const localTracksMeta = await this.getLocalTracksMeta();
    const alertSettings = await this.getAlertSettings();
    const alertHistory = await this.getAlertHistory();

    return JSON.stringify(
      {
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        settings,
        scenes,
        activeSceneId,
        songRequests,
        unifiedQueue,
        localTracksMeta,
        alertSettings,
        alertHistory,
      },
      null,
      2
    );
  },

  async importData(jsonString: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonString);
      if (data.settings) await this.saveSettings(data.settings);
      if (Array.isArray(data.scenes)) await this.saveScenes(data.scenes);
      if (data.activeSceneId) await this.saveActiveSceneId(data.activeSceneId);
      if (Array.isArray(data.songRequests)) await this.saveSongRequests(data.songRequests);
      if (Array.isArray(data.unifiedQueue)) await this.saveUnifiedQueue(data.unifiedQueue);
      if (Array.isArray(data.localTracksMeta)) await this.saveLocalTracksMeta(data.localTracksMeta);
      if (data.alertSettings) await this.saveAlertSettings(data.alertSettings);
      if (Array.isArray(data.alertHistory)) await this.saveAlertHistory(data.alertHistory);
      return true;
    } catch (e) {
      console.error('Failed to import data', e);
      return false;
    }
  },

  async resetToDefaults(): Promise<void> {
    await this.saveSettings(DEFAULT_SETTINGS);
    await this.saveScenes(DEFAULT_SCENES);
    await this.saveActiveSceneId(DEFAULT_SCENES[0].id);
    await this.saveSongRequests(DEFAULT_SONG_REQUESTS);
    await this.saveUnifiedQueue([]);
    await this.saveLocalTracksMeta([]);
    await this.saveAlertSettings(DEFAULT_ALERT_SETTINGS);
    await this.saveAlertHistory(INITIAL_ALERT_EVENTS);
  },
};
