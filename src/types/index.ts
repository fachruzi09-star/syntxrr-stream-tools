import { FeatureStatus } from '../theme/designSystem';

export type OperatingMode = 'MODE_A_TIKTOK_COMPANION' | 'MODE_B_STREAMING_ENCODER' | 'MODE_A_OVERLAY' | 'MODE_B_ENCODER';

export type CanonicalOperatingMode = 'MODE_A_TIKTOK_COMPANION' | 'MODE_B_STREAMING_ENCODER';

export function isModeAOperatingMode(mode: OperatingMode | string | undefined | null): boolean {
  return mode === 'MODE_A_TIKTOK_COMPANION' || mode === 'MODE_A_OVERLAY';
}

export function isModeBOperatingMode(mode: OperatingMode | string | undefined | null): boolean {
  return mode === 'MODE_B_STREAMING_ENCODER' || mode === 'MODE_B_ENCODER';
}

export function normalizeOperatingMode(mode: OperatingMode | string | undefined | null): CanonicalOperatingMode {
  return isModeBOperatingMode(mode) ? 'MODE_B_STREAMING_ENCODER' : 'MODE_A_TIKTOK_COMPANION';
}

export function normalizeUnitVolume(value: unknown, fallback: number = 0.85): number {
  const safeFallback = Number.isFinite(fallback) ? Math.max(0, Math.min(1, fallback)) : 0.85;
  if (typeof value !== 'number' || !Number.isFinite(value)) return safeFallback;
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
}

export function unitVolumeToPercent(unit: unknown, fallbackUnit: number = 0.85): number {
  return Math.round(normalizeUnitVolume(unit, fallbackUnit) * 100);
}

export function percentToUnitVolume(percent: unknown, fallbackUnit: number = 0.85): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    return normalizeUnitVolume(fallbackUnit, 0.85);
  }
  return Math.max(0, Math.min(1, percent / 100));
}

export type CanvasOrientation = '9:16' | '16:9' | '1:1';

export type ResolutionTarget = '720p' | '1080p' | '1440p';

export type FrameRate = 30 | 60;

export type PerformanceProfile = 'battery_saver' | 'balanced' | 'performance';

export type AppTheme = 'navy_dark' | 'obsidian_dark' | 'cyber_slate';

// SETTINGS FOUNDATION
export type AppLanguage = 'id-ID' | 'en-US';

export type HudPosition = 'left' | 'right';

export type NavigationTab =
  | 'dashboard'
  | 'studio'
  | 'sources'
  | 'presets'
  | 'live_center'
  | 'music'
  | 'marketplace'
  | 'integrations'
  | 'settings'
  | 'remote_deck';

// Alias for backwards compatibility
export type ActiveNav = NavigationTab;

export type ModeBAudioSource = 'mix' | 'internal' | 'microphone';

export interface AppSettings {
  operatingMode: OperatingMode;
  targetResolution: ResolutionTarget;
  frameRate: FrameRate;
  performanceProfile: PerformanceProfile;
  theme: AppTheme;
  canvasOrientation: CanvasOrientation;
  rtmpServer: string;
  streamKey: string;
  modeBAudioSource?: ModeBAudioSource;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  enableOverlayInPip: boolean;
  floatingOverlayOpacity: number;
  hardwareAcceleration: boolean;
  // Stage 2 & 3: Integrations & API settings
  youtubeApiKey?: string;
  spotifyClientId?: string;
  spotifyAccessToken?: string;
  spotifyTokenExpiry?: number;
  audioVolume?: number;
  audioAutoplayNext?: boolean;
  // Mode A TikTok Companion
  tiktokUsername?: string;
  tiktokConnected?: boolean;
  tiktokConnectionMethod?: TikTokConnectionMethod;
  eulerStreamApiKey?: string;
  eulerStreamJwtKey?: string;
  tiktokEulerFallbackEnabled?: boolean;
  // Soundboard & Audio routing
  soundboardVolume?: number;

  // === SETTINGS FOUNDATION (Bagian A–F) ===
  // A. General
  language?: AppLanguage;
  hapticFeedback?: boolean;
  confirmBeforeEndLive?: boolean;
  // B. Audio & Microphone
  microphoneDeviceId?: string;
  micGain?: number; // 0–200 (%)
  noiseSuppression?: boolean;
  micEchoCancellation?: boolean;
  micAutoGainControl?: boolean;
  // C. Floating HUD
  hudEnabled?: boolean;
  hudButtonSize?: number; // 40–64 (dp)
  hudOpacity?: number; // 30–100 (%)
  hudPosition?: HudPosition;
  hudPanelChat?: boolean;
  hudPanelSoundboard?: boolean;
  hudPanelMusic?: boolean;
  hudPanelMixer?: boolean;
  hudPanelLiveControl?: boolean;
  hudPanelSettings?: boolean;
  // D. Graphics & Device Performance
  autoApplyRecommendations?: boolean;
}

// STUDIO & SOURCES DEFINITIONS
export type BasicSourceType =
  | 'text'
  | 'image'
  | 'video'
  | 'shape'
  | 'separator'
  | 'camera'
  | 'screen_capture'
  | 'browser_embed'
  | 'running_text'
  | 'audio'
  | 'soundboard';

export type DynamicSourceType =
  | 'dynamic_text'
  | 'username'
  | 'avatar'
  | 'chat_message'
  | 'event_feed'
  | 'counter'
  | 'combo_counter'
  | 'progress_bar'
  | 'leaderboard'
  | 'song_request'
  | 'lyrics'
  | 'live_viewer_counter'
  | 'event_alert'
  | 'sticker'
  | 'live_text';

export type SourceType = BasicSourceType | DynamicSourceType;

export interface StudioElement {
  id: string;
  name: string;
  type: SourceType;
  x: number; // percentage 0-100 of canvas
  y: number; // percentage 0-100 of canvas
  width: number; // percentage 0-100 of canvas
  height: number; // percentage 0-100 of canvas
  layer: number; // z-index ordering
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-100
  rotation: number; // 0-360 degrees
  properties: Record<string, any>;
  triggerConfig?: {
    eventType?: StreamEventType | 'all';
    action?: 'show' | 'pulse' | 'play_sound' | 'text_update' | 'custom_css';
    durationSec?: number;
    condition?: 'any' | 'amount_gte' | 'keyword_match';
    minAmount?: number;
    matchKeyword?: string;
    cooldownSec?: number;
    priority?: number;
  };
}

export type PresetCategory = 'all' | 'hp_screen' | 'landscape' | 'portrait' | 'favorites';

export type StudioCanvasKind = 'portrait' | 'landscape' | 'square' | 'custom';

export interface StudioCanvasSpec {
  kind: StudioCanvasKind;
  width: number;
  height: number;
}

/** A group is a stable reference to child elements; elements remain stored once in the preset. */
export interface StudioPresetGroup {
  id: string;
  name: string;
  elementIds: string[];
  visible: boolean;
  locked: boolean;
  opacity?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  zIndex?: number;
  properties?: Record<string, unknown>;
  eventBinding?: Record<string, unknown> | null;
  enterAnimation?: string | Record<string, unknown> | null;
  exitAnimation?: string | Record<string, unknown> | null;
  enterDurationMs?: number;
  exitDurationMs?: number;
  displayDurationMs?: number;
  alertDurationMs?: number;
  autoDismiss?: boolean;
  sequenceOrder?: number;
  animationDelayMs?: number;
}

/** A super-group references groups and carries shared presentation/behavior metadata. */
export interface StudioPresetSuperGroup {
  id: string;
  name: string;
  groupIds: string[];
  visible: boolean;
  locked: boolean;
  properties?: Record<string, unknown>;
  eventBinding?: Record<string, unknown> | null;
  enterAnimation?: string | Record<string, unknown> | null;
  exitAnimation?: string | Record<string, unknown> | null;
  sequenceOrder?: number;
  animationDelayMs?: number;
}

export interface StudioPreset {
  id: string;
  name: string;
  category: PresetCategory;
  canvasOrientation: CanvasOrientation;
  elements: StudioElement[];
  createdAt: number;
  isFavorite: boolean;
  description: string;
  thumbnailColor?: string;
  /** CanvasSpec equivalent used by structured scene documents. Legacy orientation remains authoritative for UI layout. */
  canvas?: StudioCanvasSpec;
  backgroundUri?: string;
  groups?: StudioPresetGroup[];
  superGroups?: StudioPresetSuperGroup[];
  screensaver?: StudioScreensaverSettings | Record<string, unknown> | string | null;
  transitionIn?: Record<string, unknown> | string | null;
  transitionOut?: Record<string, unknown> | string | null;
  schema?: number;
}

export interface StudioScreensaverSettings {
  on: boolean;
  text?: string;
  media?: string;
  /** Local Screensaver asset kind; omitted legacy metadata defaults to image. */
  mediaType?: 'image' | 'video';
  mediaSound?: boolean;
  enter?: Record<string, unknown> | string | null;
  exit?: Record<string, unknown> | string | null;
}

// EVENT SYSTEM & SIMULATOR
export type StreamEventType =
  | 'chat'
  | 'gift'
  | 'like'
  | 'follow'
  | 'share'
  | 'join'
  | 'donation'
  | 'viewer'
  | 'custom';

export type TikTokConnectionState =
  | 'disconnected'
  | 'resolving_room'
  | 'connecting_direct'
  | 'connected_direct'
  | 'connecting_euler'
  | 'connected_euler'
  | 'reconnecting'
  | 'waiting_for_live'
  | 'error';

export type TikTokTransportMode = 'none' | 'direct_ws' | 'euler';

export type TikTokConnectionMethod = 'direct' | 'euler';

export type TikTokAccountLinkStatus = 'unlinked' | 'linking' | 'linked' | 'failed';

export type TikTokRoomStatus = 'unknown' | 'not_live' | 'live' | 'not_found' | 'unreadable';

export type ModeASessionMode = 'inactive' | 'with_live_connector' | 'without_live_connection';

export interface TikTokAccountState {
  isLinked: boolean;
  openId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  connectionMethod: TikTokConnectionMethod;
  fallbackEnabled: boolean;
  accountLinkStatus: TikTokAccountLinkStatus;
  lastSuccessfulAuthorization?: number;
  grantedScopes?: string[];
  linkErrorMessage?: string;
}

export interface TikTokConnectorStatus {
  state: TikTokConnectionState;
  transport: TikTokTransportMode;
  connectionMethod?: TikTokConnectionMethod;
  roomStatus?: TikTokRoomStatus;
  username: string;
  roomId: string;
  viewerCount: number;
  totalLikeCount: number;
  message: string;
  errorCode?: string;
  updatedAt: number;
}

export interface StreamEvent {
  id: string;
  type: StreamEventType;
  username: string;
  userAvatar?: string;
  userId?: string;
  detail: string;
  amount?: number;
  currency?: string;
  giftId?: string;
  giftName?: string;
  repeatCount?: number;
  diamondCount?: number;
  giftImage?: string;
  likeCount?: number;
  totalLikeCount?: number;
  viewerCount?: number;
  timestamp: number;
  isSimulation?: boolean;
}

// TTS & NOTIFICATION SYSTEM
export interface TTSConfig {
  enabled: boolean;
  volume: number; // 0-1
  rate: number; // 0.5 - 2
  pitch: number; // 0.5 - 1.5
  voiceUri?: string;
  language: string; // 'id-ID' default
  readComments: boolean;
  readDonations: boolean;
  readGifts: boolean;
  readSongRequests: boolean;
}

export interface NotificationConfig {
  position: 'top-center' | 'top-right' | 'bottom-center';
  durationSec: number;
  maxHistory: number;
  soundEnabled: boolean;
}

// SOUNDBOARD
export type SoundboardCategory = 'Hype' | 'Meme' | 'SFX' | 'Game';

export interface SoundboardItem {
  id: string;
  name: string;
  category: SoundboardCategory;
  icon: string;
  durationSec: number;
  audioUrl?: string; // local object URL or synthesized
  isQuickSlot: boolean;
  quickSlotKey?: number;
  isFavorite?: boolean;
  synthType?: 'cheer' | 'horn' | 'level_up' | 'game_over' | 'tada' | 'bell';
}

// MARKETPLACE
export type MarketplaceCategory = 'scene' | 'widget' | 'element';

export type MarketplaceFilter =
  | 'all'
  | 'song_request'
  | 'chat_message'
  | 'event_feed'
  | 'custom_html'
  | 'alert'
  | 'counter'
  | 'overlay';

export interface MarketplaceItem {
  id: string;
  name: string;
  category: MarketplaceCategory;
  filter: MarketplaceFilter;
  author: string;
  rating: number;
  downloads: number;
  description: string;
  isInstalled: boolean;
  isFavorite: boolean;
  previewGradient: string;
  elementsPayload: StudioElement[];
}

// INTEGRATIONS
export type IntegrationProviderId =
  | 'tiktok'
  | 'youtube'
  | 'facebook'
  | 'twitch'
  | 'kick'
  | 'saweria'
  | 'sociabuzz'
  | 'trakteer'
  | 'toko'
  | 'bagibagi'
  | 'sibagi'
  | 'tiptap';

export interface IntegrationProvider {
  id: IntegrationProviderId;
  name: string;
  category: 'companion' | 'streaming' | 'donation';
  status: FeatureStatus;
  description: string;
  logo: string;
  connectedUser?: string;
  authFields?: { key: string; label: string; placeholder: string; isSecret?: boolean }[];
  guideUrl?: string;
}

// STAGE 1 & 2 PRESERVED TYPES
export interface OverlayWidgetConfig {
  nowPlaying: {
    enabled: boolean;
    x: number;
    y: number;
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
    fontSize: number;
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
  duration?: number;
  requesterName: string;
  platform?: 'TikTok' | 'Twitch' | 'YouTube' | 'Spotify' | 'Local' | 'Manual';
  addedAt: number;
  status: QueueItemStatus;
  notes?: string;
  localFileKey?: string;
}

export interface SongRequest {
  id: string;
  title: string;
  artist: string;
  duration: number;
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
  duration: number;
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

export type AlertType =
  | 'follower'
  | 'gift'
  | 'like'
  | 'chat_event'
  | 'donation'
  | 'follow'
  | 'sub'
  | 'share';

export interface AlertCategoryConfig {
  enabled: boolean;
  messageTemplate?: string;
  durationSec?: number;
  soundEnabled?: boolean;
  accentColor?: string;
  color?: string;
  icon?: string;
  minAmount?: number;
}

export interface AlertSettings {
  follower?: AlertCategoryConfig;
  gift?: AlertCategoryConfig;
  like?: AlertCategoryConfig;
  chat_event?: AlertCategoryConfig;
  follow?: AlertCategoryConfig;
  sub?: AlertCategoryConfig;
  donation?: AlertCategoryConfig;
  share?: AlertCategoryConfig;
  soundEnabled?: boolean;
  soundVolume?: number;
  durationSec?: number;
  types?: Record<string, AlertCategoryConfig>;
  [key: string]: any;
}

export interface AlertEvent {
  id: string;
  type: AlertType;
  username: string;
  detail?: string;
  message?: string;
  timestamp: number;
  value?: number;
  amount?: number;
  currency?: string;
  formattedTime?: string;
}

// ELEMENT TRIGGER SPEC
export interface ElementTriggerRule {
  enabled: boolean;
  eventType: StreamEventType | 'all';
  condition?: 'any' | 'amount_gte' | 'keyword_match';
  minAmount?: number;
  matchKeyword?: string;
  action: 'show' | 'pulse' | 'play_sound' | 'text_update' | 'custom_css';
  durationSec: number;
  cooldownSec: number;
  priority: number;
}

// STREAM DECK COMMAND & SYNC PROTOCOL
export type DeckCommandType =
  | 'start_live'
  | 'stop_live'
  | 'toggle_live'
  | 'switch_scene'
  | 'toggle_overlay'
  | 'mute_mic'
  | 'mute_audio'
  | 'music_play_pause'
  | 'music_skip'
  | 'music_prev'
  | 'play_soundboard'
  | 'trigger_event'
  | 'switch_mode'
  | 'emergency_blank';

export type DeckCommandStatus = 'RECEIVED' | 'EXECUTING' | 'SUCCESS' | 'REJECTED' | 'FAILED';

export interface DeckCommandPacket {
  messageId: string;
  command: DeckCommandType;
  payload?: any;
  timestamp: number;
  sessionId: string;
  senderDeviceId: string;
  token: string;
}

export interface DeckCommandAck {
  messageId: string;
  status: DeckCommandStatus;
  timestamp: number;
  error?: string;
  hostTelemetry?: DeckTelemetry;
}

export interface DeckTelemetry {
  isStreaming: boolean;
  streamDurationSec: number;
  fps: number;
  bitrateKbps: number;
  cpuPercent: number;
  batteryPercent: number;
  deviceTempC: number;
  activePresetName: string;
  micMuted: boolean;
  audioMuted: boolean;
  musicNowPlaying?: string;
  musicIsPlaying: boolean;
  viewerCount: number;
}

export interface DeckButton {
  id: string;
  label: string;
  command: DeckCommandType;
  payload?: any;
  icon: string;
  color: string;
  order: number;
  pageId: string;
}

export interface DeckPage {
  id: string;
  name: string;
  icon: string;
  buttonIds: string[];
}

export interface DeckPairingData {
  hostIp: string;
  port: number;
  pairingPin: string;
  pairingToken: string;
  sessionId: string;
  hostDeviceName: string;
  createdAt: number;
}

export interface ConnectedRemoteDevice {
  deviceId: string;
  deviceName: string;
  connectedAt: number;
  lastPing: number;
  isApproved: boolean;
}

