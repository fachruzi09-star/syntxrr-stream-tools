export type OperatingMode = 'MODE_A_OVERLAY' | 'MODE_B_ENCODER';

export type ResolutionTarget = '720p' | '1080p' | '1440p';

export type FrameRate = 30 | 60;

export type PerformanceProfile = 'battery_saver' | 'balanced' | 'performance';

export type AppTheme = 'navy_dark' | 'obsidian_dark' | 'cyber_slate';

export interface AppSettings {
  operatingMode: OperatingMode;
  targetResolution: ResolutionTarget;
  frameRate: FrameRate;
  performanceProfile: PerformanceProfile;
  theme: AppTheme;
  rtmpServer: string;
  streamKey: string;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  enableOverlayInPip: boolean;
  floatingOverlayOpacity: number;
  hardwareAcceleration: boolean;
  // Stage 2: Music Center Integrations
  youtubeApiKey?: string;
  spotifyClientId?: string;
  spotifyAccessToken?: string;
  spotifyTokenExpiry?: number;
  audioVolume?: number; // 0.0 - 1.0
  audioAutoplayNext?: boolean;
}

export interface OverlayWidgetConfig {
  nowPlaying: {
    enabled: boolean;
    x: number; // percentage 0-100
    y: number; // percentage 0-100
    opacity: number;
    showAlbumArt: boolean;
    showProgress: boolean;
    style: 'compact' | 'studio' | 'minimal';
  };
  musicRequest: {
    enabled: boolean;
    x: number;
    y: number;
    opacity: number;
    maxItems: number;
    showRequester: boolean;
  };
  liveChat: {
    enabled: boolean;
    x: number;
    y: number;
    opacity: number;
    maxMessages: number;
    fontSize: number; // in px
    showBadges: boolean;
  };
  eventAlert: {
    enabled: boolean;
    x: number;
    y: number;
    opacity: number;
    durationSec: number;
    soundEnabled: boolean;
    position: 'top-center' | 'top-right' | 'center';
  };
  customText: {
    enabled: boolean;
    text: string;
    goalTarget: string;
    goalCurrent: string;
    showGoal: boolean;
    x: number;
    y: number;
    opacity: number;
    color: string;
  };
}

export interface Scene {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean;
  createdAt: number;
  overlayConfig: OverlayWidgetConfig;
}

export type MusicSourceType = 'local' | 'youtube' | 'spotify' | 'viewer_request';

export type QueueItemStatus = 'pending' | 'approved' | 'rejected' | 'playing' | 'completed';

export interface UnifiedQueueItem {
  id: string;
  title: string;
  artist: string;
  source: MusicSourceType;
  externalUrl?: string;
  thumbnailUrl?: string;
  duration?: number; // seconds
  requesterName: string;
  platform?: 'TikTok' | 'Twitch' | 'YouTube' | 'Spotify' | 'Local' | 'Manual';
  addedAt: number;
  status: QueueItemStatus;
  notes?: string;
  localFileKey?: string; // reference to local track ID
}

// Stage 1 Backwards-Compatible SongRequest extending UnifiedQueueItem
export interface SongRequest {
  id: string;
  title: string;
  artist: string;
  duration: number; // seconds
  requesterName: string;
  platform: 'TikTok' | 'Twitch' | 'YouTube' | 'Manual' | 'Spotify' | 'Local';
  status: 'playing' | 'queued' | 'played';
  requestedAt: number;
  coverArt?: string;
  source?: MusicSourceType;
  externalUrl?: string;
  thumbnailUrl?: string;
  queueStatus?: QueueItemStatus;
}

export interface LocalAudioTrackMeta {
  id: string;
  title: string;
  artist: string;
  filename: string;
  duration: number; // in seconds
  sizeBytes: number;
  mimeType: string;
  addedAt: number;
}

export interface YouTubeSearchResult {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  videoUrl: string;
  publishedAt: string;
}

export interface SpotifySearchResult {
  id: string;
  title: string;
  artist: string;
  albumName: string;
  thumbnailUrl: string;
  spotifyUrl: string;
  durationMs: number;
}

export type IntegrationStatus =
  | 'available'
  | 'not_configured'
  | 'auth_required'
  | 'disconnected'
  | 'unsupported'
  | 'error';

export type AlertType = 'follower' | 'gift' | 'like' | 'chat_event';

export interface AlertCategoryConfig {
  enabled: boolean;
  messageTemplate: string;
  durationSec: number;
  soundEnabled: boolean;
  accentColor: string;
}

export interface AlertSettings {
  follower: AlertCategoryConfig;
  gift: AlertCategoryConfig;
  like: AlertCategoryConfig;
  chat_event: AlertCategoryConfig;
}

export interface AlertEvent {
  id: string;
  type: AlertType;
  username: string;
  detail: string;
  timestamp: number;
  value?: number; // count of likes, coins, months
}

export type ActiveNav =
  | 'dashboard'
  | 'music'
  | 'overlay'
  | 'scenes'
  | 'alerts'
  | 'settings';
