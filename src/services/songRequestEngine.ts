// Dedicated Mode A Song Request Engine — SYNTXRR STREAM
// Integrates with streamEventBus (!play, !sr, !songrequest, !queue, !np, !nowplaying),
// official YouTube Music & YouTube Data API v3 + Spotify Web API metadata catalogs,
// Android NativeMusicPlayer (MediaPlayer + MediaSession inside CompanionService), and HTML5 Audio fallback on Web
// strictly for authorized direct playback sources.
// All Now Playing / isPlaying / progress / error states reflect actual playback engine state.

import { streamEventBus } from './eventBus';
import { nativeAudioBridge, type MusicStateEvent } from './nativeAudioBridge';
import { YouTubeService } from './youtubeService';
import { YouTubeMusicService } from './youtubeMusicService';
import { SpotifyService } from './spotifyService';
import {
  isModeAOperatingMode,
  type OperatingMode,
  type StreamEvent,
} from '../types';

export type SongRequestProvider =
  | 'youtube_music'
  | 'youtube'
  | 'spotify'
  | 'authorized_stream';

export type SongRequestSourceType =
  | 'remote_url'
  | 'youtube_metadata'
  | 'spotify_metadata';

export interface SongRequestItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  requester: string;
  durationSec: number;
  requestedAt: number;
  sourceType: SongRequestSourceType;
  provider: SongRequestProvider;
  providerTrackId?: string;
  playable: boolean;
  audioUrl?: string;
  externalUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  platform?: 'TikTok' | 'Twitch' | 'YouTube' | 'YouTube Music' | 'Spotify' | 'Stream' | 'Manual';
  rightsHolder?: string;
  licenseType?: string;
  copyrightNotice?: string;
  notes?: string;
}

export interface SongRequestPolicy {
  enabled: boolean;
  maxQueueSize: number;
  userCooldownSec: number;
  allowedRoles: 'all' | 'vip_only' | 'subscribers';
  blacklistedKeywords: string[];
}

export type SongPlaybackStatus =
  | 'idle'
  | 'preparing'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'error';

export type AudioPlaybackMode =
  | 'idle'
  | 'native_android_media'
  | 'real_html5_audio'
  | 'pending_source';

export interface SongRequestHistoryTrackSnapshot {
  id: string;
  title: string;
  artist: string;
  album?: string;
  requester: string;
  durationSec: number;
  requestedAt: number;
  sourceType: SongRequestSourceType;
  provider: SongRequestProvider;
  providerTrackId?: string;
  playable: boolean;
  audioUrl?: string;
  externalUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  platform?: SongRequestItem['platform'];
  rightsHolder?: string;
  licenseType?: string;
  copyrightNotice?: string;
  notes?: string;
}

export interface SongRequestHistoryEntry {
  id: string;
  sessionId: string;
  trackId: string;
  title: string;
  artist: string;
  album?: string;
  provider: SongRequestProvider;
  providerTrackId?: string;
  sourceType: SongRequestSourceType;
  thumbnailUrl?: string;
  durationSec: number;
  externalUrl?: string;
  requester: string;
  rightsHolder?: string;
  licenseType?: string;
  copyrightNotice?: string;
  startedAt: number;
  updatedAt: number;
  timestamp: number;
  status: 'playing' | 'completed' | 'skipped' | 'error';
  errorMessage?: string;
  trackSnapshot: SongRequestHistoryTrackSnapshot;
}

export interface SongRequestRequeueResult {
  success: boolean;
  item?: SongRequestItem;
  queuePosition?: number;
  error?: string;
}

export interface SongRequestState {
  currentTrack: SongRequestItem | null;
  queue: SongRequestItem[];
  history: SongRequestHistoryEntry[];
  isPlaying: boolean;
  playbackStatus: SongPlaybackStatus;
  currentTimeSec: number;
  durationSec: number;
  volume: number; // 0-100
  muted: boolean;
  policy: SongRequestPolicy;
  recentAnnouncements: string[];
  isLiveChatConnected: boolean;
  audioPlaybackMode: AudioPlaybackMode;
  audioSourceResolved: boolean;
  audioRoutedToStream: boolean;
  lastError: string | null;
  lastCatalogReference?: SongRequestItem | null;
  lastTestPipelineResult: SongRequestTestPipelineResult | null;
}

// 7-STAGE TEST PIPELINE RESULT
export interface SongRequestTestStage {
  name: string;
  stageNumber: number;
  status: 'success' | 'failed' | 'warning' | 'pending';
  summary: string;
  technicalDetail: string;
}

export interface SongRequestTestPipelineResult {
  command: string;
  requester: string;
  isSimulation: boolean;
  timestamp: number;
  overallSuccess: boolean;
  stages: {
    stage1_commandReceived: SongRequestTestStage;
    stage2_commandParsed: SongRequestTestStage;
    stage3_policyValidation: SongRequestTestStage;
    stage4_queueUpdated: SongRequestTestStage;
    stage5_audioSourceResolved: SongRequestTestStage;
    stage6_playbackStarted: SongRequestTestStage;
    stage7_audioRoutedToStream: SongRequestTestStage;
  };
}

export interface SongRequestContextConfig {
  operatingMode?: OperatingMode;
  youtubeApiKey?: string;
  spotifyAccessToken?: string;
  volumeUnit?: number;
  muted?: boolean;
}

type SongRequestListener = (state: SongRequestState) => void;

export const MAX_SONG_REQUEST_HISTORY = 100;

const SENSITIVE_URL_PARAM_PATTERN = /(token|api[_-]?key|key|secret|signature|sig|expires|auth|credential|x-amz-)/i;

export function normalizeSongRequestProvider(
  provider: unknown,
  sourceType?: SongRequestSourceType
): SongRequestProvider {
  if (
    provider === 'youtube_music' ||
    provider === 'youtube' ||
    provider === 'spotify' ||
    provider === 'authorized_stream'
  ) {
    return provider;
  }
  if (sourceType === 'youtube_metadata') return 'youtube';
  if (sourceType === 'spotify_metadata') return 'spotify';
  return 'authorized_stream';
}

export function normalizeSongRequestSourceType(
  sourceType: unknown,
  provider?: SongRequestProvider
): SongRequestSourceType {
  if (
    sourceType === 'youtube_metadata' ||
    sourceType === 'spotify_metadata' ||
    sourceType === 'remote_url'
  ) {
    return sourceType;
  }
  if (provider === 'youtube' || provider === 'youtube_music') return 'youtube_metadata';
  if (provider === 'spotify') return 'spotify_metadata';
  return 'remote_url';
}

const NON_AUDIO_CATALOG_PAGE_HOSTS = [
  'youtube.com',
  'youtu.be',
  'music.youtube.com',
  'open.spotify.com',
  'music.apple.com',
  'music.amazon.com',
  'soundcloud.com',
  'tiktok.com',
  'instagram.com',
  'facebook.com',
  'x.com',
  'twitter.com',
  'wikipedia.org',
];

const SUPPORTED_AUDIO_PATH_EXT_PATTERN =
  /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm|weba|m3u8|mpd|caf|aif|aiff)$/i;

const NON_AUDIO_WEBPAGE_EXT_PATTERN =
  /\.(html?|xhtml|php|aspx?|jsp|cgi|txt|md|json|xml|rss|atom|pdf|svg|png|jpe?g|webp|gif|ico|css|m?js|woff2?|ttf)$/i;

const NON_AUDIO_WEBPAGE_PATH_PATTERN =
  /(^|\/)(watch|embed|playlist|album|artist|channel|shorts|wiki|article|blog|about|home|index)(\/|$)/i;

const SUPPORTED_AUDIO_MIME_PATTERN =
  /^(audio\/[a-z0-9.+-]+|application\/(vnd\.apple\.mpegurl|x-mpegurl|dash\+xml|ogg))(\s*;.*)?$/i;

const SUPPORTED_AUDIO_FORMAT_QUERY_PATTERN =
  /^(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm|weba|m3u8|mpd|caf|aif|aiff)$/i;

export function isPersistentAuthorizedAudioUrl(url: unknown, mimeType?: unknown): url is string {
  if (!isAuthorizedPlaybackAudioUrl(url, mimeType)) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.username || parsed.password) return false;
    for (const [paramKey] of parsed.searchParams.entries()) {
      if (SENSITIVE_URL_PARAM_PATTERN.test(paramKey)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function isAuthorizedPlaybackAudioUrl(url: unknown, mimeType?: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || /^(blob|data):/i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.username || parsed.password) return false;

    const host = parsed.hostname.toLowerCase();
    if (NON_AUDIO_CATALOG_PAGE_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
      return false;
    }

    const pathname = (parsed.pathname || '').toLowerCase();
    if (NON_AUDIO_WEBPAGE_EXT_PATTERN.test(pathname)) {
      return false;
    }

    const hasAudioExtension = SUPPORTED_AUDIO_PATH_EXT_PATTERN.test(pathname);
    if (!hasAudioExtension && NON_AUDIO_WEBPAGE_PATH_PATTERN.test(pathname)) {
      return false;
    }

    if (hasAudioExtension) {
      return true;
    }

    if (pathname === '' || pathname === '/') {
      const formatParam =
        parsed.searchParams.get('format') ||
        parsed.searchParams.get('ext') ||
        parsed.searchParams.get('codec') ||
        '';
      const mimeParam =
        parsed.searchParams.get('mime') ||
        parsed.searchParams.get('mime_type') ||
        parsed.searchParams.get('content_type') ||
        '';
      return (
        SUPPORTED_AUDIO_FORMAT_QUERY_PATTERN.test(formatParam.trim()) ||
        SUPPORTED_AUDIO_MIME_PATTERN.test(mimeParam.trim())
      );
    }

    if (typeof mimeType === 'string' && SUPPORTED_AUDIO_MIME_PATTERN.test(mimeType.trim())) {
      return true;
    }

    const mimeParam =
      parsed.searchParams.get('mime') ||
      parsed.searchParams.get('mime_type') ||
      parsed.searchParams.get('content_type') ||
      parsed.searchParams.get('type') ||
      '';
    if (SUPPORTED_AUDIO_MIME_PATTERN.test(mimeParam.trim())) {
      return true;
    }

    const formatParam =
      parsed.searchParams.get('format') ||
      parsed.searchParams.get('ext') ||
      parsed.searchParams.get('codec') ||
      '';
    if (SUPPORTED_AUDIO_FORMAT_QUERY_PATTERN.test(formatParam.trim())) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function isPlayableSongRequestItem(
  item: Partial<SongRequestItem> | null | undefined
): boolean {
  if (!item || typeof item !== 'object') return false;
  if (item.playable !== true) return false;
  if (item.sourceType !== 'remote_url') return false;
  return isAuthorizedPlaybackAudioUrl(item.audioUrl, item.mimeType);
}

export function formatCatalogPlatformLabel(item: Partial<SongRequestItem>): string {
  if (item.provider === 'youtube_music' || item.platform === 'YouTube Music') {
    return 'YouTube Music';
  }
  if (item.sourceType === 'youtube_metadata' || item.provider === 'youtube' || item.platform === 'YouTube') {
    return 'YouTube';
  }
  if (item.sourceType === 'spotify_metadata' || item.provider === 'spotify' || item.platform === 'Spotify') {
    return 'Spotify';
  }
  return 'Katalog';
}

export function buildMetadataPlaybackUnavailableMessage(item: Partial<SongRequestItem>): string {
  const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Lagu ini';
  const platformLabel = formatCatalogPlatformLabel(item);
  const safeExternal = sanitizeReferenceUrl(item.externalUrl);
  return safeExternal
    ? `Lagu "${title}" ditemukan di katalog ${platformLabel}, tetapi playback otomatis belum tersedia (sumber audio berizin tidak tersedia). Buka eksternal: ${safeExternal}`
    : `Lagu "${title}" ditemukan di katalog ${platformLabel}, tetapi playback otomatis belum tersedia (sumber audio berizin tidak tersedia).`;
}

export function sanitizeReferenceUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed || /^(blob|data):/i.test(trimmed)) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    if (parsed.username || parsed.password) return undefined;
    for (const [paramKey] of parsed.searchParams.entries()) {
      if (SENSITIVE_URL_PARAM_PATTERN.test(paramKey)) {
        return undefined;
      }
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function sanitizeHistoryTrackSnapshot(
  item: Partial<SongRequestItem | SongRequestHistoryTrackSnapshot>
): SongRequestHistoryTrackSnapshot {
  const isLegacyRemovedAudius = String(item.provider || '').toLowerCase() === 'audius';
  const provider = normalizeSongRequestProvider(
    item.provider,
    item.sourceType === 'youtube_metadata' || item.sourceType === 'spotify_metadata' || item.sourceType === 'remote_url'
      ? item.sourceType
      : undefined
  );
  const sourceType = normalizeSongRequestSourceType(item.sourceType, provider);
  const safeAudioUrl =
    !isLegacyRemovedAudius &&
    sourceType === 'remote_url' &&
    item.playable === true &&
    isPersistentAuthorizedAudioUrl(item.audioUrl, item.mimeType)
      ? item.audioUrl.trim()
      : undefined;
  const safeExternalUrl = sanitizeReferenceUrl(item.externalUrl);
  const safeThumbnailUrl = sanitizeReferenceUrl(item.thumbnailUrl);
  const cleanProviderTrackId =
    typeof item.providerTrackId === 'string' && item.providerTrackId.trim()
      ? item.providerTrackId.trim()
      : undefined;
  const cleanRightsHolder =
    typeof item.rightsHolder === 'string' && item.rightsHolder.trim() ? item.rightsHolder.trim() : undefined;
  const cleanLicenseType =
    typeof item.licenseType === 'string' && item.licenseType.trim() ? item.licenseType.trim() : undefined;
  const cleanCopyrightNotice =
    typeof item.copyrightNotice === 'string' && item.copyrightNotice.trim()
      ? item.copyrightNotice.trim()
      : undefined;
  const isPlayableSnapshot =
    !isLegacyRemovedAudius &&
    sourceType === 'remote_url' &&
    item.playable === true &&
    Boolean(safeAudioUrl);

  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `sr_hist_item_${Date.now()}`,
    title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Untitled Track',
    artist: typeof item.artist === 'string' && item.artist.trim() ? item.artist.trim() : 'Unknown Artist',
    ...(typeof item.album === 'string' && item.album.trim() ? { album: item.album.trim() } : {}),
    requester: typeof item.requester === 'string' && item.requester.trim() ? item.requester.trim() : 'Viewer',
    durationSec:
      typeof item.durationSec === 'number' && Number.isFinite(item.durationSec) && item.durationSec > 0
        ? Math.round(item.durationSec)
        : 0,
    requestedAt:
      typeof item.requestedAt === 'number' && Number.isFinite(item.requestedAt) && item.requestedAt > 0
        ? Math.round(item.requestedAt)
        : Date.now(),
    sourceType,
    provider,
    ...(cleanProviderTrackId ? { providerTrackId: cleanProviderTrackId } : {}),
    playable: isPlayableSnapshot,
    ...(safeAudioUrl ? { audioUrl: safeAudioUrl } : {}),
    ...(safeExternalUrl ? { externalUrl: safeExternalUrl } : {}),
    ...(safeThumbnailUrl ? { thumbnailUrl: safeThumbnailUrl } : {}),
    ...(typeof item.mimeType === 'string' && item.mimeType.trim() ? { mimeType: item.mimeType.trim() } : {}),
    ...(item.platform ? { platform: item.platform } : {}),
    ...(cleanRightsHolder ? { rightsHolder: cleanRightsHolder } : {}),
    ...(cleanLicenseType ? { licenseType: cleanLicenseType } : {}),
    ...(cleanCopyrightNotice ? { copyrightNotice: cleanCopyrightNotice } : {}),
    ...(typeof item.notes === 'string' && item.notes.trim() ? { notes: item.notes.trim() } : {}),
  };
}

export function sanitizeSongRequestHistoryEntries(entries: unknown): SongRequestHistoryEntry[] {
  if (!Array.isArray(entries)) return [];
  const bySession = new Map<string, SongRequestHistoryEntry>();

  for (const raw of entries) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const candidate = raw as Partial<SongRequestHistoryEntry>;
    const rawSnapshot =
      candidate.trackSnapshot && typeof candidate.trackSnapshot === 'object'
        ? candidate.trackSnapshot
        : {
            id: candidate.trackId || candidate.id || `track_${Date.now()}`,
            title: candidate.title || 'Untitled Track',
            artist: candidate.artist || 'Unknown Artist',
            album: candidate.album,
            requester: candidate.requester || 'Viewer',
            durationSec: candidate.durationSec || 0,
            requestedAt: candidate.startedAt || candidate.timestamp || Date.now(),
            sourceType: candidate.sourceType,
            provider: candidate.provider,
            providerTrackId: candidate.providerTrackId,
            playable: false,
            externalUrl: candidate.externalUrl,
            thumbnailUrl: candidate.thumbnailUrl,
            rightsHolder: candidate.rightsHolder,
            licenseType: candidate.licenseType,
            copyrightNotice: candidate.copyrightNotice,
          };

    const snapshot = sanitizeHistoryTrackSnapshot(rawSnapshot);
    const sessionId =
      typeof candidate.sessionId === 'string' && candidate.sessionId.trim()
        ? candidate.sessionId.trim()
        : typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : `sr_session_${snapshot.requestedAt}_${Math.random().toString(36).slice(2, 6)}`;
    const startedAt =
      typeof candidate.startedAt === 'number' && Number.isFinite(candidate.startedAt) && candidate.startedAt > 0
        ? Math.round(candidate.startedAt)
        : typeof candidate.timestamp === 'number' && Number.isFinite(candidate.timestamp) && candidate.timestamp > 0
        ? Math.round(candidate.timestamp)
        : snapshot.requestedAt;
    const updatedAt =
      typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt) && candidate.updatedAt > 0
        ? Math.round(candidate.updatedAt)
        : startedAt;
    const status: SongRequestHistoryEntry['status'] =
      candidate.status === 'playing' ||
      candidate.status === 'completed' ||
      candidate.status === 'skipped' ||
      candidate.status === 'error'
        ? candidate.status
        : 'completed';

    const sanitized: SongRequestHistoryEntry = {
      id: sessionId,
      sessionId,
      trackId:
        typeof candidate.trackId === 'string' && candidate.trackId.trim()
          ? candidate.trackId.trim()
          : snapshot.id,
      title: snapshot.title,
      artist: snapshot.artist,
      ...(snapshot.album ? { album: snapshot.album } : {}),
      provider: snapshot.provider,
      ...(snapshot.providerTrackId ? { providerTrackId: snapshot.providerTrackId } : {}),
      sourceType: snapshot.sourceType,
      ...(snapshot.thumbnailUrl ? { thumbnailUrl: snapshot.thumbnailUrl } : {}),
      durationSec: snapshot.durationSec,
      ...(snapshot.externalUrl ? { externalUrl: snapshot.externalUrl } : {}),
      requester: snapshot.requester,
      ...(snapshot.rightsHolder ? { rightsHolder: snapshot.rightsHolder } : {}),
      ...(snapshot.licenseType ? { licenseType: snapshot.licenseType } : {}),
      ...(snapshot.copyrightNotice ? { copyrightNotice: snapshot.copyrightNotice } : {}),
      startedAt,
      updatedAt,
      timestamp: startedAt,
      status,
      ...(status === 'error' && typeof candidate.errorMessage === 'string' && candidate.errorMessage.trim()
        ? { errorMessage: candidate.errorMessage.trim() }
        : {}),
      trackSnapshot: snapshot,
    };

    const existing = bySession.get(sessionId);
    if (!existing || sanitized.updatedAt >= existing.updatedAt) {
      bySession.set(sessionId, sanitized);
    }
  }

  return Array.from(bySession.values())
    .sort((a, b) => (b.startedAt !== a.startedAt ? b.startedAt - a.startedAt : b.updatedAt - a.updatedAt))
    .slice(0, MAX_SONG_REQUEST_HISTORY);
}

export class SongRequestEngine {
  private state: SongRequestState = {
    currentTrack: null,
    queue: [],
    history: [],
    isPlaying: false,
    playbackStatus: 'idle',
    currentTimeSec: 0,
    durationSec: 0,
    volume: 85,
    muted: false,
    policy: {
      enabled: true,
      maxQueueSize: 5,
      userCooldownSec: 15,
      allowedRoles: 'all',
      blacklistedKeywords: ['hate', 'spam', 'nsfw', 'toxic', 'rasis'],
    },
    recentAnnouncements: [
      'Song Request Mode A siap. Ketik !play <judul lagu> di chat.',
    ],
    isLiveChatConnected: false,
    audioPlaybackMode: 'idle',
    audioSourceResolved: false,
    audioRoutedToStream: false,
    lastError: null,
    lastCatalogReference: null,
    lastTestPipelineResult: null,
  };

  private listeners: Set<SongRequestListener> = new Set();
  private userLastRequestTime: Map<string, number> = new Map();
  private processedEventIdSet: Set<string> = new Set();
  private processedEventIdQueue: string[] = [];
  private audioElement: HTMLAudioElement | null = null;
  private nativePollTimer: ReturnType<typeof setInterval> | null = null;
  private nativeListenersAttached = false;
  private playbackGeneration = 0;
  private activePlaybackSessionId: string | null = null;
  private requeueCounter = 0;
  private handlingTrackEnd = false;
  private lastEndedPlaybackGen = -1;
  private suppressAudioEvents = false;
  private busUnsubscribe: (() => void) | null = null;

  // Context supplied by App.tsx
  private operatingMode: OperatingMode = 'MODE_A_TIKTOK_COMPANION';
  private youtubeApiKey = '';
  private spotifyAccessToken = '';

  constructor() {
    this.initAudioElement();
    this.attachNativeListeners();
    this.startChatCommandListener();
  }

  private effectiveVolumeUnit(): number {
    if (this.state.muted) return 0;
    return Math.max(0, Math.min(1, this.state.volume / 100));
  }

  private initAudioElement() {
    if (typeof Audio === 'undefined') return;
    try {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.volume = this.effectiveVolumeUnit();

      audio.addEventListener('playing', () => {
        if (this.suppressAudioEvents || !this.state.currentTrack) return;
        const duration =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? Math.round(audio.duration)
            : this.state.currentTrack.durationSec;
        if (this.activePlaybackSessionId) {
          this.recordSessionHistory(
            this.state.currentTrack,
            'playing',
            undefined,
            this.activePlaybackSessionId
          );
        }
        this.updateState({
          isPlaying: true,
          playbackStatus: 'playing',
          durationSec: duration,
          audioPlaybackMode: 'real_html5_audio',
          audioSourceResolved: true,
          audioRoutedToStream: true,
          lastError: null,
        });
      });

      audio.addEventListener('pause', () => {
        if (this.suppressAudioEvents) return;
        if (this.state.playbackStatus === 'stopped' || this.state.playbackStatus === 'idle' || this.state.playbackStatus === 'completed') {
          return;
        }
        if (!audio.ended && this.state.currentTrack) {
          this.updateState({
            isPlaying: false,
            playbackStatus: 'paused',
          });
        }
      });

      audio.addEventListener('timeupdate', () => {
        if (this.suppressAudioEvents || !this.state.currentTrack) return;
        const nextSec = Math.floor(audio.currentTime || 0);
        const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration) : this.state.durationSec;
        if (nextSec !== this.state.currentTimeSec || dur !== this.state.durationSec) {
          this.updateState({
            currentTimeSec: nextSec,
            durationSec: dur,
          });
        }
      });

      audio.addEventListener('durationchange', () => {
        if (this.suppressAudioEvents) return;
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          this.updateState({ durationSec: Math.round(audio.duration) });
        }
      });

      audio.addEventListener('ended', () => {
        if (this.suppressAudioEvents) return;
        void this.handleTrackEnded();
      });

      audio.addEventListener('error', () => {
        if (this.suppressAudioEvents) return;
        if (
          !this.activePlaybackSessionId &&
          this.state.playbackStatus !== 'preparing' &&
          this.state.playbackStatus !== 'playing'
        ) {
          return;
        }
        const mediaErr = audio.error;
        const msg = mediaErr
          ? `Gagal memutar audio (kode ${mediaErr.code}). Format atau sumber tidak didukung.`
          : 'Gagal mendekode aliran audio.';
        if (this.state.currentTrack && this.activePlaybackSessionId) {
          this.recordSessionHistory(
            this.state.currentTrack,
            'error',
            msg,
            this.activePlaybackSessionId
          );
        }
        this.activePlaybackSessionId = null;
        this.updateState({
          isPlaying: false,
          playbackStatus: 'error',
          currentTimeSec: 0,
          audioPlaybackMode: 'idle',
          audioSourceResolved: false,
          audioRoutedToStream: false,
          lastError: msg,
        });
      });

      this.audioElement = audio;
    } catch (err) {
      console.warn('SongRequest HTMLAudioElement init warning:', err);
    }
  }

  private attachNativeListeners() {
    if (this.nativeListenersAttached || !nativeAudioBridge.isNativeAndroid()) return;
    this.nativeListenersAttached = true;

    void nativeAudioBridge.onMusicState((ev: MusicStateEvent) => {
      this.handleNativeMusicState(ev);
    });

    void nativeAudioBridge.onMusicTransport((ev) => {
      if (ev.command === 'play') {
        void this.resume();
      } else if (ev.command === 'pause') {
        void this.pause();
      } else if (ev.command === 'next') {
        void this.skipTrack('MediaSession');
      } else if (ev.command === 'stop') {
        void this.stop();
      }
    });
  }

  private handleNativeMusicState(ev: MusicStateEvent) {
    const active = this.state.currentTrack;
    if (!active && ev.status !== 'stopped' && ev.status !== 'idle') {
      return;
    }
    if (active && ev.trackId && ev.trackId !== active.id) {
      return;
    }

    const posSec = Math.max(0, Math.floor((ev.positionMs || 0) / 1000));
    const durSec =
      ev.durationMs && ev.durationMs > 0
        ? Math.round(ev.durationMs / 1000)
        : active?.durationSec || this.state.durationSec;

    switch (ev.status) {
      case 'preparing':
        this.updateState({
          isPlaying: false,
          playbackStatus: 'preparing',
          currentTimeSec: posSec,
          durationSec: durSec,
          audioPlaybackMode: 'native_android_media',
          lastError: null,
        });
        break;
      case 'playing':
        this.startNativePositionPoll();
        if (active && this.activePlaybackSessionId) {
          this.recordSessionHistory(active, 'playing', undefined, this.activePlaybackSessionId);
        }
        this.updateState({
          isPlaying: true,
          playbackStatus: 'playing',
          currentTimeSec: posSec,
          durationSec: durSec,
          audioPlaybackMode: 'native_android_media',
          audioRoutedToStream: true,
          lastError: null,
        });
        break;
      case 'paused':
        this.stopNativePositionPoll();
        this.updateState({
          isPlaying: false,
          playbackStatus: 'paused',
          currentTimeSec: posSec,
          durationSec: durSec,
        });
        break;
      case 'completed':
        this.stopNativePositionPoll();
        void this.handleTrackEnded();
        break;
      case 'stopped':
        this.stopNativePositionPoll();
        this.updateState({
          isPlaying: false,
          playbackStatus: 'stopped',
          currentTimeSec: 0,
          audioPlaybackMode: 'idle',
          audioRoutedToStream: false,
        });
        break;
      case 'error': {
        this.stopNativePositionPoll();
        const errMsg = ev.errorMessage || 'Terjadi kesalahan pemutaran native Android.';
        if (active && this.activePlaybackSessionId) {
          this.recordSessionHistory(active, 'error', errMsg, this.activePlaybackSessionId);
        }
        this.activePlaybackSessionId = null;
        this.updateState({
          isPlaying: false,
          playbackStatus: 'error',
          currentTimeSec: 0,
          audioPlaybackMode: 'idle',
          audioSourceResolved: false,
          audioRoutedToStream: false,
          lastError: errMsg,
        });
        break;
      }
      default:
        break;
    }
  }

  private startNativePositionPoll() {
    this.stopNativePositionPoll();
    if (!nativeAudioBridge.isNativeAndroid()) return;
    this.nativePollTimer = setInterval(() => {
      if (this.state.playbackStatus !== 'playing' && this.state.playbackStatus !== 'preparing') {
        this.stopNativePositionPoll();
        return;
      }
      void nativeAudioBridge.getMusicStatus().then((snap) => {
        const active = this.state.currentTrack;
        if (!active || (snap.trackId && snap.trackId !== active.id)) return;
        if (snap.status === 'completed') {
          this.stopNativePositionPoll();
          void this.handleTrackEnded();
          return;
        }
        const posSec = Math.max(0, Math.floor((snap.positionMs || 0) / 1000));
        const durSec = snap.durationMs > 0 ? Math.round(snap.durationMs / 1000) : this.state.durationSec;
        if (
          posSec !== this.state.currentTimeSec ||
          durSec !== this.state.durationSec ||
          snap.isPlaying !== this.state.isPlaying
        ) {
          this.updateState({
            currentTimeSec: posSec,
            durationSec: durSec,
            isPlaying: snap.isPlaying,
            playbackStatus: snap.isPlaying ? 'playing' : this.state.playbackStatus,
          });
        }
      });
    }, 1000);
  }

  private stopNativePositionPoll() {
    if (this.nativePollTimer !== null) {
      clearInterval(this.nativePollTimer);
      this.nativePollTimer = null;
    }
  }

  private isDuplicateChatEvent(eventId?: string): boolean {
    const id = (eventId || '').trim();
    if (!id) return false;
    if (this.processedEventIdSet.has(id)) {
      return true;
    }
    this.processedEventIdSet.add(id);
    this.processedEventIdQueue.push(id);
    if (this.processedEventIdQueue.length > 200) {
      const oldest = this.processedEventIdQueue.shift();
      if (oldest) {
        this.processedEventIdSet.delete(oldest);
      }
    }
    return false;
  }

  // Subscribe to Mode A chat events on streamEventBus
  private startChatCommandListener() {
    if (this.busUnsubscribe) {
      this.busUnsubscribe();
    }
    this.busUnsubscribe = streamEventBus.subscribe((event: StreamEvent) => {
      if (event.type !== 'chat') return;
      if (!this.state.policy.enabled) return;
      if (!isModeAOperatingMode(this.operatingMode)) return;
      if (this.isDuplicateChatEvent(event.id)) return;

      const message = (event.detail || '').trim();
      if (!message.startsWith('!')) return;

      const parts = message.split(/\s+/);
      const command = (parts[0] || '').toLowerCase();
      const query = parts.slice(1).join(' ').trim();
      const isSim = !!event.isSimulation;
      const requester = event.username || 'Viewer';

      if (!isSim && !this.state.isLiveChatConnected) {
        this.updateState({ isLiveChatConnected: true });
      }

      if (command === '!play' || command === '!sr' || command === '!songrequest') {
        void this.handlePlayCommand(requester, query, isSim);
      } else if (command === '!queue') {
        this.handleQueueCommand(isSim);
      } else if (command === '!np' || command === '!nowplaying') {
        this.handleNowPlayingCommand(isSim);
      }
    });
  }

  public configureContext(config: SongRequestContextConfig) {
    if (config.operatingMode) {
      this.operatingMode = config.operatingMode;
    }
    if (typeof config.youtubeApiKey === 'string') {
      this.youtubeApiKey = config.youtubeApiKey;
    }
    if (typeof config.spotifyAccessToken === 'string') {
      this.spotifyAccessToken = config.spotifyAccessToken;
    }
    if (typeof config.volumeUnit === 'number' && Number.isFinite(config.volumeUnit)) {
      const pct = Math.round(Math.max(0, Math.min(1, config.volumeUnit)) * 100);
      this.setVolume(pct);
    }
    if (typeof config.muted === 'boolean') {
      this.setMuted(config.muted);
    }
  }

  private validatePolicy(query: string, requester: string, isSimulation: boolean): {
    stage1: SongRequestTestStage;
    stage2: SongRequestTestStage;
    stage3: SongRequestTestStage;
    stage4: SongRequestTestStage;
    passed: boolean;
    failReason?: string;
  } {
    const timestamp = Date.now();
    const cleanQuery = (query || '').trim();

    const stage1: SongRequestTestStage = {
      name: 'Command Received',
      stageNumber: 1,
      status: cleanQuery ? 'success' : 'failed',
      summary: cleanQuery ? `Perintah !play diterima dari @${requester}` : 'Parameter judul lagu kosong',
      technicalDetail: `RAW: !play ${cleanQuery} | Mode: ${this.operatingMode} | Source: ${isSimulation ? 'Simulated Chat' : 'Mode A Chat Event'}`,
    };

    const stage2: SongRequestTestStage = {
      name: 'Command Parsed',
      stageNumber: 2,
      status: cleanQuery.length >= 2 ? 'success' : 'failed',
      summary: cleanQuery.length >= 2 ? `Query lagu valid: "${cleanQuery}"` : 'Query terlalu pendek (min 2 karakter)',
      technicalDetail: `Command: !play | Query: "${cleanQuery}"`,
    };

    const lowerQuery = cleanQuery.toLowerCase();
    const hasBlacklisted = this.state.policy.blacklistedKeywords.some((word) =>
      lowerQuery.includes(word.toLowerCase())
    );
    const lastTime = this.userLastRequestTime.get(requester) || 0;
    const cooldownMs = this.state.policy.userCooldownSec * 1000;
    const isCooldownActive = timestamp - lastTime < cooldownMs && !isSimulation;
    const isQueueFull = this.state.queue.length >= this.state.policy.maxQueueSize;

    let stage3Status: 'success' | 'failed' = 'success';
    let stage3Summary = 'Policy valid (Blacklist, Cooldown, Kuota OK)';
    if (!this.state.policy.enabled) {
      stage3Status = 'failed';
      stage3Summary = 'Ditolak: Subsistem Song Request sedang dinonaktifkan';
    } else if (hasBlacklisted) {
      stage3Status = 'failed';
      stage3Summary = 'Ditolak: Mengandung kata terlarang dalam blacklist';
    } else if (isCooldownActive) {
      stage3Status = 'failed';
      const waitSec = Math.ceil((cooldownMs - (timestamp - lastTime)) / 1000);
      stage3Summary = `Ditolak: Cooldown aktif, tunggu ${waitSec} detik lagi`;
    } else if (isQueueFull) {
      stage3Status = 'failed';
      stage3Summary = `Ditolak: Antrean penuh (${this.state.policy.maxQueueSize} lagu)`;
    }

    const stage3: SongRequestTestStage = {
      name: 'Policy Validation',
      stageNumber: 3,
      status: stage3Status,
      summary: stage3Summary,
      technicalDetail: `Enabled: ${this.state.policy.enabled} | Blacklist: ${hasBlacklisted ? 'MATCH' : 'CLEAR'} | Cooldown: ${isCooldownActive ? 'ACTIVE' : 'PASS'} | Queue: ${this.state.queue.length}/${this.state.policy.maxQueueSize}`,
    };

    const passed = stage1.status === 'success' && stage2.status === 'success' && stage3.status === 'success';

    const stage4: SongRequestTestStage = {
      name: 'Queue Ready',
      stageNumber: 4,
      status: passed ? 'success' : 'failed',
      summary: passed
        ? `Siap diproses ke posisi antrean #${this.state.queue.length + 1}`
        : stage3Status === 'failed'
        ? stage3Summary
        : stage2.summary,
      technicalDetail: `Queue Size: ${this.state.queue.length}/${this.state.policy.maxQueueSize}`,
    };

    return {
      stage1,
      stage2,
      stage3,
      stage4,
      passed,
      failReason: passed ? undefined : stage4.summary,
    };
  }

  private async resolveSongFromProviders(
    query: string,
    requester: string
  ): Promise<{ item?: SongRequestItem; error?: string; providerNote?: string }> {
    const cleanQuery = query.trim();
    const errors: string[] = [];
    let anyCatalogSucceededEmpty = false;

    const hasYoutubeKey = Boolean(this.youtubeApiKey.trim());
    const hasSpotifyToken = Boolean(this.spotifyAccessToken.trim());

    if (!hasYoutubeKey && !hasSpotifyToken) {
      return {
        error:
          'YouTube Data API v3 Key belum dikonfigurasi di Settings untuk mencari katalog YouTube Music.',
      };
    }

    // 1. Primary provider: YouTube Music (official YouTube Data API v3 videoCategoryId=10 — metadata & music.youtube.com deep-link)
    if (hasYoutubeKey) {
      const ytmRes = await YouTubeMusicService.searchMusicCatalog(cleanQuery, this.youtubeApiKey);
      if (ytmRes.success && ytmRes.results.length > 0) {
        const first = ytmRes.results[0];
        return {
          item: {
            id: `sr_ytm_${first.id}_${Date.now()}`,
            title: first.title,
            artist: first.artist || first.channelTitle || 'YouTube Music',
            requester,
            durationSec: 0,
            requestedAt: Date.now(),
            sourceType: 'youtube_metadata',
            provider: 'youtube_music',
            providerTrackId: first.id,
            playable: false,
            externalUrl: first.musicUrl,
            thumbnailUrl: first.thumbnailUrl,
            platform: 'YouTube Music',
            notes: 'Metadata katalog YouTube Music (sumber playback berizin belum tersedia).',
          },
        };
      }
      if (ytmRes.success) {
        anyCatalogSucceededEmpty = true;
        // Fallback within same API key to general YouTube Data API v3 only when Music category (10) returns empty
        const ytRes = await YouTubeService.searchCatalog(cleanQuery, this.youtubeApiKey);
        if (ytRes.success && ytRes.results.length > 0) {
          const first = ytRes.results[0];
          return {
            item: {
              id: `sr_yt_${first.id}_${Date.now()}`,
              title: first.title,
              artist: first.channelTitle || 'YouTube',
              requester,
              durationSec: 0,
              requestedAt: Date.now(),
              sourceType: 'youtube_metadata',
              provider: 'youtube',
              providerTrackId: first.id,
              playable: false,
              externalUrl: first.videoUrl,
              thumbnailUrl: first.thumbnailUrl,
              platform: 'YouTube',
              notes: 'Metadata katalog YouTube (sumber playback berizin belum tersedia).',
            },
          };
        }
        if (ytRes.success) {
          anyCatalogSucceededEmpty = true;
        } else if (ytRes.error) {
          errors.push(`YouTube: ${ytRes.error}`);
        }
      } else if (ytmRes.error) {
        errors.push(`YouTube Music: ${ytmRes.error}`);
      }
    }

    // 2. Optional metadata fallback: Spotify Web API catalog (zero audio extraction)
    if (hasSpotifyToken) {
      const spRes = await SpotifyService.searchCatalog(cleanQuery, this.spotifyAccessToken);
      if (spRes.success && spRes.results.length > 0) {
        const first = spRes.results[0];
        return {
          item: {
            id: `sr_sp_${first.id}_${Date.now()}`,
            title: first.title,
            artist: first.artist || 'Spotify',
            ...(first.albumName ? { album: first.albumName } : {}),
            requester,
            durationSec: Math.max(0, Math.round((first.durationMs || 0) / 1000)),
            requestedAt: Date.now(),
            sourceType: 'spotify_metadata',
            provider: 'spotify',
            providerTrackId: first.id,
            playable: false,
            externalUrl: first.spotifyUrl,
            thumbnailUrl: first.thumbnailUrl,
            platform: 'Spotify',
            notes: 'Metadata katalog Spotify (sumber playback berizin belum tersedia).',
          },
        };
      }
      if (spRes.success) {
        anyCatalogSucceededEmpty = true;
      } else if (spRes.error) {
        errors.push(`Spotify: ${spRes.error}`);
      }
    }

    if (errors.length > 0 && !anyCatalogSucceededEmpty) {
      return { error: errors.join(' | ') };
    }

    const baseNotFound = `Lagu "${cleanQuery}" tidak ditemukan di katalog metadata YouTube Music${
      hasSpotifyToken ? '/YouTube/Spotify' : '/YouTube'
    }.`;
    return {
      error: errors.length > 0 ? `${baseNotFound} (${errors.join(' | ')})` : baseNotFound,
    };
  }

  public async handlePlayCommand(
    username: string,
    query: string,
    isSimulation: boolean = false
  ): Promise<{ success: boolean; item?: SongRequestItem; error?: string }> {
    const cleanQuery = (query || '').trim();
    const policyCheck = this.validatePolicy(cleanQuery, username, isSimulation);

    if (!policyCheck.passed) {
      const errMsg = policyCheck.failReason || 'Permintaan ditolak oleh kebijakan Song Request.';
      this.updateState({
        lastError: errMsg,
        lastTestPipelineResult: this.buildPipelineResult(cleanQuery, username, isSimulation, policyCheck, {
          resolved: false,
          resolveSummary: errMsg,
          resolveDetail: 'Policy check gagal sebelum pencarian sumber.',
          playbackStarted: false,
          playbackSummary: 'Pemutaran tidak dijalankan.',
        }),
      });
      this.announce(`[${isSimulation ? 'SIMULASI' : 'LIVE'}] @${username}: ${errMsg}`);
      return { success: false, error: errMsg };
    }

    const resolution = await this.resolveSongFromProviders(cleanQuery, username);
    if (!resolution.item) {
      const errMsg = resolution.error || `Sumber lagu "${cleanQuery}" tidak ditemukan.`;
      this.updateState({
        audioSourceResolved: false,
        lastError: errMsg,
        lastTestPipelineResult: this.buildPipelineResult(cleanQuery, username, isSimulation, policyCheck, {
          resolved: false,
          resolveSummary: errMsg,
          resolveDetail: `YT key: ${this.youtubeApiKey ? 'set' : 'missing'}, Spotify token: ${this.spotifyAccessToken ? 'set' : 'missing'}`,
          playbackStarted: false,
          playbackSummary: 'Pemutaran dibatalkan karena sumber tidak tersedia.',
        }),
      });
      this.announce(`❌ [${isSimulation ? 'SIMULASI' : 'LIVE'}] @${username}: ${errMsg}`);
      return { success: false, error: errMsg };
    }

    const item = resolution.item;
    const isIdle =
      !this.state.currentTrack ||
      this.state.playbackStatus === 'idle' ||
      this.state.playbackStatus === 'stopped' ||
      this.state.playbackStatus === 'completed' ||
      this.state.playbackStatus === 'error';

    // Metadata-only catalog entries (YouTube Music, YouTube, Spotify) MUST NOT enter playback queue
    // and MUST NOT consume viewer cooldown.
    if (!isPlayableSongRequestItem(item)) {
      const metadataRefItem: SongRequestItem = {
        ...item,
        playable: false,
        audioUrl: undefined,
      };
      const errMsg = buildMetadataPlaybackUnavailableMessage(metadataRefItem);
      this.updateState({
        audioSourceResolved: false,
        lastError: errMsg,
        lastCatalogReference: metadataRefItem,
        ...(isIdle
          ? {
              isPlaying: false,
              audioPlaybackMode: 'pending_source',
            }
          : {}),
        lastTestPipelineResult: this.buildPipelineResult(cleanQuery, username, isSimulation, policyCheck, {
          resolved: false,
          resolveSummary: errMsg,
          resolveDetail: `Provider: ${metadataRefItem.provider} | SourceType: ${metadataRefItem.sourceType} | Playable: false | ExternalUrl: ${metadataRefItem.externalUrl || '-'}`,
          playbackStarted: false,
          playbackSummary: 'Playback otomatis tidak tersedia untuk item metadata katalog.',
        }),
      });
      this.announce(`⚠️ [${isSimulation ? 'SIMULASI' : 'LIVE'}] @${username}: ${errMsg}`);
      return { success: false, item: metadataRefItem, error: errMsg };
    }

    // Consume cooldown ONLY after a valid, playable audio source is accepted.
    this.userLastRequestTime.set(username, Date.now());

    if (isIdle) {
      const started = await this.playItem(item);
      this.updateState({
        audioSourceResolved: started,
        lastCatalogReference: null,
        lastTestPipelineResult: this.buildPipelineResult(cleanQuery, username, isSimulation, policyCheck, {
          resolved: started || this.state.audioSourceResolved,
          resolveSummary: started
            ? `Sumber playback berizin ditemukan: "${item.title}"`
            : this.state.lastError || `Sumber audio "${item.title}" gagal diputar.`,
          resolveDetail: `Provider: ${item.provider} | SourceType: ${item.sourceType} | Playable: ${started}`,
          playbackStarted: started,
          playbackSummary: started
            ? `Pemutaran dimulai melalui ${nativeAudioBridge.isNativeAndroid() ? 'NativeMusicPlayer (MediaPlayer)' : 'HTML5 Audio'}`
            : this.state.lastError || 'Gagal memulai pemutaran sumber audio berizin.',
        }),
      });
      if (started) {
        this.announce(`🎵 [${isSimulation ? 'SIMULASI' : 'LIVE'}] @${username} memutar "${item.title}"`);
      } else {
        this.announce(`⚠️ [${isSimulation ? 'SIMULASI' : 'LIVE'}] @${username}: ${this.state.lastError || 'Gagal memutar lagu.'}`);
      }
      return { success: started, item, error: started ? undefined : this.state.lastError || undefined };
    }

    const newQueue = [...this.state.queue, item];
    this.updateState({
      queue: newQueue,
      audioSourceResolved: true,
      lastCatalogReference: null,
      lastTestPipelineResult: this.buildPipelineResult(cleanQuery, username, isSimulation, policyCheck, {
        resolved: true,
        resolveSummary: `Ditambahkan ke antrean #${newQueue.length}: "${item.title}" (${item.sourceType})`,
        resolveDetail: `Queue length: ${newQueue.length}`,
        playbackStarted: false,
        playbackQueued: true,
        playbackSummary: 'Lagu masuk antrean playback; menunggu giliran pemutaran.',
      }),
    });
    this.announce(
      `🎵 [${isSimulation ? 'SIMULASI' : 'LIVE'}] @${username} menambahkan "${item.title}" ke antrean (#${newQueue.length}).`
    );
    return { success: true, item };
  }

  public async enqueueAndPlayItem(item: SongRequestItem): Promise<boolean> {
    if (!isPlayableSongRequestItem(item)) {
      const metadataRefItem: SongRequestItem = {
        ...item,
        playable: false,
        audioUrl: undefined,
      };
      const errMsg = buildMetadataPlaybackUnavailableMessage(metadataRefItem);
      const isIdle =
        !this.state.currentTrack ||
        this.state.playbackStatus === 'idle' ||
        this.state.playbackStatus === 'stopped' ||
        this.state.playbackStatus === 'completed' ||
        this.state.playbackStatus === 'error';
      this.updateState({
        audioSourceResolved: false,
        lastError: errMsg,
        lastCatalogReference: metadataRefItem,
        ...(isIdle ? { isPlaying: false, audioPlaybackMode: 'pending_source' } : {}),
      });
      return false;
    }

    const isIdle =
      !this.state.currentTrack ||
      this.state.playbackStatus === 'idle' ||
      this.state.playbackStatus === 'stopped' ||
      this.state.playbackStatus === 'completed' ||
      this.state.playbackStatus === 'error';
    if (isIdle) {
      return this.playItem(item);
    }

    if (this.state.queue.length >= this.state.policy.maxQueueSize) {
      this.updateState({
        lastError: `Antrean penuh (${this.state.queue.length}/${this.state.policy.maxQueueSize} lagu).`,
      });
      return false;
    }

    this.updateState({ queue: [...this.state.queue, item] });
    return true;
  }

  public async playItem(item: SongRequestItem): Promise<boolean> {
    const gen = ++this.playbackGeneration;
    const prevTrack = this.state.currentTrack;
    const prevSessionId = this.activePlaybackSessionId;
    this.activePlaybackSessionId = null;
    await this.stopActivePlaybackOnly();
    if (prevTrack && prevSessionId) {
      this.recordSessionHistory(prevTrack, 'skipped', undefined, prevSessionId);
    }
    if (gen !== this.playbackGeneration) return false;

    if (!isPlayableSongRequestItem(item)) {
      const metadataRefItem: SongRequestItem = {
        ...item,
        playable: false,
        audioUrl: undefined,
      };
      const errMsg = buildMetadataPlaybackUnavailableMessage(metadataRefItem);
      this.updateState({
        currentTrack: metadataRefItem,
        isPlaying: false,
        playbackStatus: 'error',
        currentTimeSec: 0,
        durationSec: item.durationSec || 0,
        audioPlaybackMode: 'pending_source',
        audioSourceResolved: false,
        audioRoutedToStream: false,
        lastError: errMsg,
        lastCatalogReference: metadataRefItem,
      });
      return false;
    }

    const activeItem = item;
    const authorizedUrl = isAuthorizedPlaybackAudioUrl(activeItem.audioUrl, activeItem.mimeType)
      ? activeItem.audioUrl.trim()
      : '';

    if (!authorizedUrl || !isAuthorizedPlaybackAudioUrl(authorizedUrl, activeItem.mimeType)) {
      const msg = `Sumber playback berizin untuk "${activeItem.title}" belum tersedia.`;
      this.updateState({
        currentTrack: activeItem,
        isPlaying: false,
        playbackStatus: 'error',
        currentTimeSec: 0,
        durationSec: activeItem.durationSec || 0,
        audioPlaybackMode: 'pending_source',
        audioSourceResolved: false,
        audioRoutedToStream: false,
        lastError: msg,
      });
      return false;
    }

    const sessionId = `sr_session_${Date.now()}_${gen}_${Math.random().toString(36).slice(2, 6)}`;
    this.activePlaybackSessionId = sessionId;

    // Android Native MediaPlayer Path (persists in CompanionService foreground process)
    if (nativeAudioBridge.isNativeAndroid()) {
      this.updateState({
        currentTrack: activeItem,
        isPlaying: false,
        playbackStatus: 'preparing',
        currentTimeSec: 0,
        durationSec: activeItem.durationSec || 0,
        audioPlaybackMode: 'native_android_media',
        audioSourceResolved: true,
        audioRoutedToStream: false,
        lastError: null,
      });

      const res = await nativeAudioBridge.playMusicTrack({
        trackId: activeItem.id,
        title: activeItem.title,
        artist: activeItem.artist,
        sourceUri: authorizedUrl,
        mimeType: activeItem.mimeType || 'audio/mpeg',
        volume: this.effectiveVolumeUnit(),
      });

      if (gen !== this.playbackGeneration) return false;
      if (!res.success) {
        const msg = res.message || 'Gagal memulai pemutaran di Android MediaPlayer.';
        this.activePlaybackSessionId = null;
        this.updateState({
          isPlaying: false,
          playbackStatus: 'error',
          currentTimeSec: 0,
          audioPlaybackMode: 'idle',
          audioSourceResolved: false,
          audioRoutedToStream: false,
          lastError: msg,
        });
        return false;
      }

      this.startNativePositionPoll();
      return true;
    }

    // Web / Browser HTML5 Audio Path (authorized direct stream only)
    if (!this.audioElement) {
      const msg = 'HTML5 Audio tidak tersedia pada lingkungan ini.';
      this.activePlaybackSessionId = null;
      this.updateState({
        currentTrack: activeItem,
        isPlaying: false,
        playbackStatus: 'error',
        currentTimeSec: 0,
        audioPlaybackMode: 'idle',
        audioSourceResolved: false,
        audioRoutedToStream: false,
        lastError: msg,
      });
      return false;
    }

    this.updateState({
      currentTrack: activeItem,
      isPlaying: false,
      playbackStatus: 'preparing',
      currentTimeSec: 0,
      durationSec: activeItem.durationSec || 0,
      audioPlaybackMode: 'real_html5_audio',
      audioSourceResolved: true,
      audioRoutedToStream: false,
      lastError: null,
    });

    try {
      this.audioElement.volume = this.effectiveVolumeUnit();
      this.audioElement.src = authorizedUrl;
      this.audioElement.load();
      await this.audioElement.play();
      if (gen !== this.playbackGeneration) return false;
      const actualDur =
        Number.isFinite(this.audioElement.duration) && this.audioElement.duration > 0
          ? Math.round(this.audioElement.duration)
          : activeItem.durationSec || 0;
      if (this.activePlaybackSessionId === sessionId) {
        this.recordSessionHistory(activeItem, 'playing', undefined, sessionId);
      }
      this.updateState({
        isPlaying: true,
        playbackStatus: 'playing',
        durationSec: actualDur,
        audioPlaybackMode: 'real_html5_audio',
        audioSourceResolved: true,
        audioRoutedToStream: true,
        lastCatalogReference: null,
        lastError: null,
      });
      return true;
    } catch (err: any) {
      if (gen !== this.playbackGeneration) return false;
      const msg = err?.message || 'Pemutaran audio ditolak oleh browser atau format tidak didukung.';
      this.recordSessionHistory(activeItem, 'error', msg, sessionId);
      if (this.activePlaybackSessionId === sessionId) {
        this.activePlaybackSessionId = null;
      }
      await this.stopActivePlaybackOnly();
      if (gen !== this.playbackGeneration) return false;
      this.updateState({
        isPlaying: false,
        playbackStatus: 'error',
        currentTimeSec: 0,
        audioPlaybackMode: 'idle',
        audioSourceResolved: false,
        audioRoutedToStream: false,
        lastError: msg,
      });
      return false;
    }
  }

  private async stopActivePlaybackOnly() {
    this.stopNativePositionPoll();
    if (nativeAudioBridge.isNativeAndroid()) {
      await nativeAudioBridge.stopMusicTrack();
    }
    if (this.audioElement) {
      this.suppressAudioEvents = true;
      try {
        this.audioElement.pause();
        this.audioElement.removeAttribute('src');
        this.audioElement.load();
      } catch {
        // ignore cleanup errors
      } finally {
        this.suppressAudioEvents = false;
      }
    }
  }

  private async playNextPlayableFromQueue(): Promise<{
    started: boolean;
    playedTrack?: SongRequestItem;
    skippedInvalidCount: number;
    failedCount: number;
    lastSkippedTitle?: string;
    lastFailureMessage?: string;
  }> {
    let skippedInvalidCount = 0;
    let failedCount = 0;
    let lastSkippedTitle: string | undefined;
    let lastFailedTrack: SongRequestItem | undefined;
    let lastFailureMessage: string | undefined;

    while (this.state.queue.length > 0) {
      const candidate = this.state.queue[0];
      const remaining = this.state.queue.slice(1);
      this.updateState({
        queue: remaining,
        currentTimeSec: 0,
      });

      if (!isPlayableSongRequestItem(candidate)) {
        skippedInvalidCount += 1;
        lastSkippedTitle = candidate?.title || 'Track tidak valid';
        continue;
      }

      const genBeforePlay = this.playbackGeneration;
      const started = await this.playItem(candidate);
      if (started) {
        return {
          started: true,
          playedTrack: candidate,
          skippedInvalidCount,
          failedCount,
          lastSkippedTitle,
        };
      }
      if (this.playbackGeneration !== genBeforePlay + 1) {
        // Preempted by stop() / skipTrack() / another playItem() call while preparing
        return {
          started: false,
          skippedInvalidCount,
          failedCount,
          lastSkippedTitle,
          lastFailureMessage: this.state.lastError || undefined,
        };
      }

      failedCount += 1;
      lastFailedTrack = candidate;
      lastFailureMessage =
        this.state.lastError || `Gagal memutar "${candidate.title}".`;
    }

    if (failedCount > 0 || skippedInvalidCount > 0) {
      await this.stopActivePlaybackOnly();
      const summaryMessage =
        failedCount > 0 && skippedInvalidCount > 0
          ? `${failedCount} lagu gagal diputar dan ${skippedInvalidCount} item non-playable dilewati (${lastFailureMessage || 'Error playback'}).`
          : failedCount > 1
          ? `${failedCount} lagu berikutnya gagal diputar beruntun (${lastFailureMessage || 'Error playback'}).`
          : failedCount === 1
          ? lastFailureMessage || `Gagal memutar "${lastFailedTrack?.title || 'lagu berikutnya'}".`
          : `${skippedInvalidCount} item antrean tidak playable dilewati; tidak ada sumber audio berizin tersisa.`;
      this.activePlaybackSessionId = null;
      this.updateState({
        currentTrack: null,
        isPlaying: false,
        playbackStatus: failedCount > 0 ? 'error' : 'idle',
        currentTimeSec: 0,
        durationSec: 0,
        audioPlaybackMode: 'idle',
        audioSourceResolved: false,
        audioRoutedToStream: false,
        lastError: summaryMessage,
      });
      return {
        started: false,
        playedTrack: lastFailedTrack,
        skippedInvalidCount,
        failedCount,
        lastSkippedTitle,
        lastFailureMessage: summaryMessage,
      };
    }

    return {
      started: false,
      skippedInvalidCount,
      failedCount,
      lastSkippedTitle,
    };
  }

  public async handleSkipCommand(username: string = 'Streamer', isSimulation: boolean = false): Promise<boolean> {
    const skippedTrack = this.state.currentTrack;
    const skippedSessionId = this.activePlaybackSessionId;
    this.activePlaybackSessionId = null;
    this.playbackGeneration++;
    await this.stopActivePlaybackOnly();
    if (skippedTrack && skippedSessionId) {
      this.recordSessionHistory(skippedTrack, 'skipped', undefined, skippedSessionId);
    }

    if (this.state.queue.length === 0) {
      this.updateState({
        currentTrack: null,
        isPlaying: false,
        playbackStatus: 'idle',
        currentTimeSec: 0,
        durationSec: 0,
        audioPlaybackMode: 'idle',
        audioSourceResolved: false,
        audioRoutedToStream: false,
        lastError: null,
      });
      this.announce(
        `⏭️ [${isSimulation ? 'SIMULASI' : 'LIVE'}] @${username}: Antrean kosong — pemutaran dihentikan.`
      );
      return false;
    }

    this.updateState({ lastError: null });
    const advancement = await this.playNextPlayableFromQueue();
    if (advancement.started && advancement.playedTrack) {
      const notes: string[] = [];
      if (advancement.skippedInvalidCount > 0) {
        notes.push(`${advancement.skippedInvalidCount} item non-playable dilewati`);
      }
      if (advancement.failedCount > 0) {
        notes.push(`${advancement.failedCount} lagu gagal dilewati`);
      }
      const skipNote = notes.length > 0 ? ` (${notes.join(', ')})` : '';
      this.announce(
        `⏭️ [${isSimulation ? 'SIMULASI' : 'LIVE'}] Di-skip oleh @${username}. Memutar: "${advancement.playedTrack.title}"${skipNote}.`
      );
      return true;
    }

    const failSummary =
      advancement.lastFailureMessage ||
      this.state.lastError ||
      'Tidak ada lagu playable tersisa dalam antrean.';
    this.announce(`⚠️ [${isSimulation ? 'SIMULASI' : 'LIVE'}] @${username}: ${failSummary}`);
    return false;
  }

  private handleQueueCommand(isSimulation: boolean) {
    if (this.state.queue.length === 0) {
      this.announce(`[${isSimulation ? 'SIMULASI' : 'LIVE'}] Antrean Song Request kosong. Ketik !play <judul lagu>.`);
    } else {
      const top3 = this.state.queue
        .slice(0, 3)
        .map((item, idx) => `#${idx + 1} "${item.title}" (@${item.requester})`)
        .join(' | ');
      this.announce(`[${isSimulation ? 'SIMULASI' : 'LIVE'}] Antrean (${this.state.queue.length} lagu): ${top3}`);
    }
  }

  private handleNowPlayingCommand(isSimulation: boolean) {
    if (this.state.currentTrack) {
      const statusLabel = this.state.isPlaying ? 'Memutar' : this.state.playbackStatus;
      this.announce(
        `🎶 [${isSimulation ? 'SIMULASI' : 'LIVE'}] Now Playing (${statusLabel}): "${this.state.currentTrack.title}" — ${this.state.currentTrack.artist} (@${this.state.currentTrack.requester})`
      );
    } else {
      this.announce(`[${isSimulation ? 'SIMULASI' : 'LIVE'}] Tidak ada lagu Song Request yang aktif.`);
    }
  }

  public async handleTrackEnded() {
    if (this.handlingTrackEnd) return;
    if (this.lastEndedPlaybackGen === this.playbackGeneration) return;
    this.handlingTrackEnd = true;
    this.lastEndedPlaybackGen = this.playbackGeneration;
    this.stopNativePositionPoll();

    try {
      const completedTrack = this.state.currentTrack;
      const completedSessionId = this.activePlaybackSessionId;
      this.activePlaybackSessionId = null;
      if (completedTrack && completedSessionId) {
        this.recordSessionHistory(completedTrack, 'completed', undefined, completedSessionId);
      }

      if (this.state.queue.length > 0) {
        const advancement = await this.playNextPlayableFromQueue();
        if (advancement.started && advancement.playedTrack) {
          this.announce(
            `🎶 Otomatis memutar lagu berikutnya: "${advancement.playedTrack.title}" (@${advancement.playedTrack.requester})`
          );
          return;
        }
        if (advancement.failedCount > 0 || advancement.skippedInvalidCount > 0) {
          this.announce(
            `⚠️ ${advancement.lastFailureMessage || this.state.lastError || 'Gagal melanjutkan antrean lagu.'}`
          );
          return;
        }
      }

      await this.stopActivePlaybackOnly();
      this.updateState({
        currentTrack: null,
        isPlaying: false,
        playbackStatus: 'completed',
        currentTimeSec: 0,
        durationSec: 0,
        audioPlaybackMode: 'idle',
        audioSourceResolved: false,
        audioRoutedToStream: false,
      });
      this.announce('Antrean Song Request selesai.');
    } finally {
      this.handlingTrackEnd = false;
    }
  }

  public execute7StageTestPipeline(
    query: string,
    requester: string,
    isSimulation: boolean
  ): SongRequestTestPipelineResult {
    const cleanQuery = (query || '').trim();
    const policyCheck = this.validatePolicy(cleanQuery, requester, isSimulation);
    const hasRemoteConfig = Boolean(this.youtubeApiKey.trim() || this.spotifyAccessToken.trim());

    const stage5: SongRequestTestStage = {
      name: 'Audio Source Resolved',
      stageNumber: 5,
      status: policyCheck.passed ? 'pending' : 'failed',
      summary: policyCheck.passed
        ? hasRemoteConfig
          ? 'API katalog terkonfigurasi, tetapi belum ada sumber audio playable yang terverifikasi'
          : 'API katalog belum dikonfigurasi dan belum ada sumber audio playable'
        : 'Resolusi sumber dibatalkan karena validasi policy gagal',
      technicalDetail: `YTKey: ${!!this.youtubeApiKey.trim()} | SpotifyToken: ${!!this.spotifyAccessToken.trim()} | PlayableSourceVerified: false`,
    };

    const stage6: SongRequestTestStage = {
      name: 'Playback Started',
      stageNumber: 6,
      status: policyCheck.passed ? 'pending' : 'failed',
      summary: 'Pemutaran belum dimulai; menunggu sumber audio berizin yang benar-benar playable',
      technicalDetail: nativeAudioBridge.isNativeAndroid()
        ? 'Engine: Android MediaPlayer + MediaSession (CompanionService foreground)'
        : 'Engine: HTML5 Audio Element',
    };

    const stage7: SongRequestTestStage = {
      name: 'Audio Routed to Stream Output',
      stageNumber: 7,
      status: policyCheck.passed ? 'pending' : 'failed',
      summary: 'Output audio belum aktif; penangkapan audio oleh TikTok LIVE tidak dapat diverifikasi otomatis di Mode A',
      technicalDetail: `PlaybackStatus: ${this.state.playbackStatus} | AudioRouted: false | NativeAndroid: ${nativeAudioBridge.isNativeAndroid()}`,
    };

    return {
      command: `!play ${cleanQuery}`,
      requester,
      isSimulation,
      timestamp: Date.now(),
      overallSuccess: false,
      stages: {
        stage1_commandReceived: policyCheck.stage1,
        stage2_commandParsed: policyCheck.stage2,
        stage3_policyValidation: policyCheck.stage3,
        stage4_queueUpdated: policyCheck.stage4,
        stage5_audioSourceResolved: stage5,
        stage6_playbackStarted: stage6,
        stage7_audioRoutedToStream: stage7,
      },
    };
  }

  private buildPipelineResult(
    cleanQuery: string,
    requester: string,
    isSimulation: boolean,
    policyCheck: ReturnType<SongRequestEngine['validatePolicy']>,
    outcome: {
      resolved: boolean;
      resolveSummary: string;
      resolveDetail: string;
      playbackStarted: boolean;
      playbackQueued?: boolean;
      playbackSummary: string;
    }
  ): SongRequestTestPipelineResult {
    const stage5: SongRequestTestStage = {
      name: 'Audio Source Resolved',
      stageNumber: 5,
      status: policyCheck.passed ? (outcome.resolved ? 'success' : 'failed') : 'pending',
      summary: outcome.resolveSummary,
      technicalDetail: outcome.resolveDetail,
    };

    const stage6: SongRequestTestStage = {
      name: 'Playback Started',
      stageNumber: 6,
      status:
        policyCheck.passed && outcome.resolved
          ? outcome.playbackStarted
            ? 'success'
            : outcome.playbackQueued
            ? 'warning'
            : 'failed'
          : 'failed',
      summary: outcome.playbackSummary,
      technicalDetail: nativeAudioBridge.isNativeAndroid()
        ? 'Engine: Android MediaPlayer + MediaSession (CompanionService foreground)'
        : 'Engine: HTML5 Audio Element',
    };

    const isLocalAudioActive = outcome.playbackStarted && (this.state.isPlaying || this.state.playbackStatus === 'preparing');
    const stage7: SongRequestTestStage = {
      name: 'Audio Routed to Stream Output',
      stageNumber: 7,
      status: isLocalAudioActive ? 'warning' : 'failed',
      summary: isLocalAudioActive
        ? this.state.audioRoutedToStream
          ? 'Audio perangkat & sinkronisasi Studio/HUD aktif; penangkapan audio oleh siaran TikTok LIVE belum terverifikasi otomatis'
          : 'Playback perangkat sedang disiapkan; penangkapan audio oleh TikTok LIVE belum terverifikasi'
        : 'Belum ada pemutaran audio aktif yang dirutekan ke output perangkat atau overlay',
      technicalDetail: `PlaybackStatus: ${this.state.playbackStatus} | DeviceRouted: ${this.state.audioRoutedToStream} | TikTokAudioCaptureVerified: false | NativeAndroid: ${nativeAudioBridge.isNativeAndroid()}`,
    };

    const overallSuccess =
      policyCheck.passed &&
      stage5.status === 'success' &&
      stage6.status === 'success';

    return {
      command: `!play ${cleanQuery}`,
      requester,
      isSimulation,
      timestamp: Date.now(),
      overallSuccess,
      stages: {
        stage1_commandReceived: policyCheck.stage1,
        stage2_commandParsed: policyCheck.stage2,
        stage3_policyValidation: policyCheck.stage3,
        stage4_queueUpdated: policyCheck.stage4,
        stage5_audioSourceResolved: stage5,
        stage6_playbackStarted: stage6,
        stage7_audioRoutedToStream: stage7,
      },
    };
  }

  private announce(message: string) {
    const updated = [message, ...this.state.recentAnnouncements.slice(0, 9)];
    this.updateState({ recentAnnouncements: updated });
  }

  // Public Controls
  public async pause(): Promise<void> {
    if (nativeAudioBridge.isNativeAndroid()) {
      const res = await nativeAudioBridge.pauseMusicTrack();
      this.stopNativePositionPoll();
      this.updateState({
        isPlaying: false,
        playbackStatus: res.success ? 'paused' : this.state.playbackStatus,
      });
      return;
    }
    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause();
      this.updateState({ isPlaying: false, playbackStatus: 'paused' });
    }
  }

  public async resume(): Promise<void> {
    if (!this.state.currentTrack) {
      if (this.state.queue.length > 0) {
        await this.playNextPlayableFromQueue();
      }
      return;
    }

    if (!isPlayableSongRequestItem(this.state.currentTrack)) {
      const invalidCurrent = this.state.currentTrack;
      const prevSessionId = this.activePlaybackSessionId;
      const preservedRef: SongRequestItem | null = invalidCurrent.externalUrl
        ? { ...invalidCurrent, playable: false, audioUrl: undefined }
        : this.state.lastCatalogReference || null;
      const skippedMsg = buildMetadataPlaybackUnavailableMessage(invalidCurrent);

      this.activePlaybackSessionId = null;
      this.playbackGeneration++;
      await this.stopActivePlaybackOnly();
      if (prevSessionId) {
        this.recordSessionHistory(invalidCurrent, 'error', skippedMsg, prevSessionId);
      }

      this.updateState({
        currentTrack: null,
        isPlaying: false,
        playbackStatus: 'idle',
        currentTimeSec: 0,
        durationSec: 0,
        audioPlaybackMode: 'idle',
        audioSourceResolved: false,
        audioRoutedToStream: false,
        lastCatalogReference: preservedRef,
        lastError: skippedMsg,
      });

      if (this.state.queue.length > 0) {
        const advancement = await this.playNextPlayableFromQueue();
        if (advancement.started && advancement.playedTrack) {
          this.announce(
            `⏭️ Melewati item non-playable "${invalidCurrent.title}" dan memutar "${advancement.playedTrack.title}".`
          );
        } else if (advancement.lastFailureMessage) {
          this.announce(`⚠️ ${advancement.lastFailureMessage}`);
        }
      } else {
        this.updateState({
          audioPlaybackMode: 'pending_source',
        });
        this.announce(`⚠️ ${skippedMsg}`);
      }
      return;
    }

    if (nativeAudioBridge.isNativeAndroid()) {
      const res = await nativeAudioBridge.resumeMusicTrack();
      if (res.success) {
        this.startNativePositionPoll();
        this.updateState({
          isPlaying: true,
          playbackStatus: 'playing',
          audioSourceResolved: true,
          lastError: null,
        });
      } else {
        const started = await this.playItem(this.state.currentTrack);
        if (!started && this.state.queue.length > 0) {
          await this.playNextPlayableFromQueue();
        }
      }
      return;
    }

    if (this.audioElement && this.audioElement.src) {
      try {
        await this.audioElement.play();
        this.updateState({
          isPlaying: true,
          playbackStatus: 'playing',
          audioSourceResolved: true,
          audioRoutedToStream: true,
          lastError: null,
        });
      } catch (err: any) {
        const msg = err?.message || 'Gagal melanjutkan pemutaran audio.';
        if (this.state.currentTrack && this.activePlaybackSessionId) {
          this.recordSessionHistory(this.state.currentTrack, 'error', msg, this.activePlaybackSessionId);
        }
        this.activePlaybackSessionId = null;
        await this.stopActivePlaybackOnly();
        this.updateState({
          isPlaying: false,
          playbackStatus: 'error',
          currentTimeSec: 0,
          audioPlaybackMode: 'idle',
          audioSourceResolved: false,
          audioRoutedToStream: false,
          lastError: msg,
        });
        if (this.state.queue.length > 0) {
          await this.playNextPlayableFromQueue();
        }
      }
    } else {
      const started = await this.playItem(this.state.currentTrack);
      if (!started && this.state.queue.length > 0) {
        await this.playNextPlayableFromQueue();
      }
    }
  }

  public async togglePlayPause(): Promise<void> {
    if (this.state.isPlaying) {
      await this.pause();
    } else {
      await this.resume();
    }
  }

  public async skipTrack(actor: string = 'Streamer'): Promise<boolean> {
    return this.handleSkipCommand(actor, false);
  }

  public async stop(): Promise<void> {
    const stoppedTrack = this.state.currentTrack;
    const stoppedSessionId = this.activePlaybackSessionId;
    this.activePlaybackSessionId = null;
    this.playbackGeneration++;
    await this.stopActivePlaybackOnly();
    if (stoppedTrack && stoppedSessionId) {
      this.recordSessionHistory(stoppedTrack, 'skipped', undefined, stoppedSessionId);
    }
    this.updateState({
      currentTrack: null,
      isPlaying: false,
      playbackStatus: 'stopped',
      currentTimeSec: 0,
      durationSec: 0,
      audioPlaybackMode: 'idle',
      audioSourceResolved: false,
      audioRoutedToStream: false,
      lastError: null,
    });
  }

  public removeQueueItem(id: string) {
    const updated = this.state.queue.filter((q) => q.id !== id);
    this.updateState({ queue: updated });
  }

  public clearQueue() {
    this.updateState({ queue: [] });
  }

  public setQueue(items: SongRequestItem[]) {
    const incoming = Array.isArray(items) ? items : [];
    const playableItems = incoming.filter((item) => isPlayableSongRequestItem(item));
    const rejectedCount = incoming.length - playableItems.length;
    this.updateState({
      queue: playableItems,
      ...(rejectedCount > 0
        ? {
            lastError: `${rejectedCount} item metadata/non-playable ditolak dari antrean playback.`,
          }
        : {}),
    });
  }

  public hydrateQueue(items: Partial<SongRequestItem>[]): SongRequestItem[] {
    const incoming = Array.isArray(items) ? items : [];
    const playableItems = incoming.filter((item): item is SongRequestItem => isPlayableSongRequestItem(item));
    this.updateState({ queue: playableItems });
    return playableItems;
  }

  public updatePolicy(partial: Partial<SongRequestPolicy>) {
    let nextMaxQueueSize = this.state.policy.maxQueueSize;
    if (typeof partial.maxQueueSize === 'number' && Number.isFinite(partial.maxQueueSize)) {
      nextMaxQueueSize = Math.max(1, Math.min(20, Math.round(partial.maxQueueSize)));
    }
    this.updateState({
      policy: {
        ...this.state.policy,
        ...partial,
        maxQueueSize: nextMaxQueueSize,
      },
    });
  }

  public hydrateHistory(entries: SongRequestHistoryEntry[]): SongRequestHistoryEntry[] {
    const sanitizedStored = sanitizeSongRequestHistoryEntries(entries);
    const merged = sanitizeSongRequestHistoryEntries([...this.state.history, ...sanitizedStored]);
    this.updateState({ history: merged });
    return merged;
  }

  public requeueFromHistory(
    historyEntryId: string,
    actor: string = 'Streamer'
  ): SongRequestRequeueResult {
    if (!this.state.policy.enabled) {
      return {
        success: false,
        error: 'Subsistem Song Request sedang dinonaktifkan.',
      };
    }

    const sourceEntry = this.state.history.find(
      (entry) => entry.id === historyEntryId || entry.sessionId === historyEntryId
    );
    if (!sourceEntry) {
      return {
        success: false,
        error: 'Entri riwayat lagu tidak ditemukan.',
      };
    }

    const snapshot = sanitizeHistoryTrackSnapshot(sourceEntry.trackSnapshot);
    if (!isPlayableSongRequestItem(snapshot)) {
      const errMsg = buildMetadataPlaybackUnavailableMessage(snapshot);
      return {
        success: false,
        error: errMsg,
      };
    }

    if (this.state.queue.length >= this.state.policy.maxQueueSize) {
      const errMsg = `Antrean penuh (${this.state.queue.length}/${this.state.policy.maxQueueSize} lagu).`;
      return {
        success: false,
        error: errMsg,
      };
    }

    const requesterName = actor.trim() || 'Streamer';
    const newId = `sr_requeue_${Date.now()}_${++this.requeueCounter}_${Math.random().toString(36).slice(2, 6)}`;
    const newItem: SongRequestItem = {
      ...snapshot,
      id: newId,
      requester: requesterName,
      requestedAt: Date.now(),
    };

    const nextQueue = [...this.state.queue, newItem];
    this.updateState({ queue: nextQueue });
    this.announce(
      `🔁 @${requesterName} menambahkan ulang "${newItem.title}" ke antrean (#${nextQueue.length}).`
    );

    return {
      success: true,
      item: newItem,
      queuePosition: nextQueue.length,
    };
  }

  public setVolume(vol: number) {
    const clampedPct = Math.max(0, Math.min(100, Math.round(Number.isFinite(vol) ? vol : 85)));
    this.updateState({ volume: clampedPct });
    const unit = this.state.muted ? 0 : clampedPct / 100;
    if (this.audioElement) {
      this.audioElement.volume = unit;
    }
    if (nativeAudioBridge.isNativeAndroid()) {
      void nativeAudioBridge.setMusicVolume(unit);
    }
  }

  public setMuted(muted: boolean) {
    this.updateState({ muted });
    const unit = muted ? 0 : this.state.volume / 100;
    if (this.audioElement) {
      this.audioElement.volume = unit;
    }
    if (nativeAudioBridge.isNativeAndroid()) {
      void nativeAudioBridge.setMusicVolume(unit);
    }
  }

  public subscribe(listener: SongRequestListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): SongRequestState {
    return this.state;
  }

  private recordSessionHistory(
    item: SongRequestItem,
    status: SongRequestHistoryEntry['status'],
    errorMessage: string | undefined,
    sessionId: string
  ) {
    if (!sessionId) return;
    const now = Date.now();
    const existingIndex = this.state.history.findIndex(
      (entry) => entry.sessionId === sessionId || entry.id === sessionId
    );

    if (existingIndex === -1) {
      // History entry is created only when a playback session actually starts playing.
      if (status !== 'playing') return;
      const snapshot = sanitizeHistoryTrackSnapshot(item);
      const entry: SongRequestHistoryEntry = {
        id: sessionId,
        sessionId,
        trackId: snapshot.id,
        title: snapshot.title,
        artist: snapshot.artist,
        ...(snapshot.album ? { album: snapshot.album } : {}),
        provider: snapshot.provider,
        ...(snapshot.providerTrackId ? { providerTrackId: snapshot.providerTrackId } : {}),
        sourceType: snapshot.sourceType,
        ...(snapshot.thumbnailUrl ? { thumbnailUrl: snapshot.thumbnailUrl } : {}),
        durationSec: snapshot.durationSec,
        ...(snapshot.externalUrl ? { externalUrl: snapshot.externalUrl } : {}),
        requester: snapshot.requester,
        startedAt: now,
        updatedAt: now,
        timestamp: now,
        status: 'playing',
        trackSnapshot: snapshot,
      };
      this.updateState({
        history: sanitizeSongRequestHistoryEntries([entry, ...this.state.history]),
      });
      return;
    }

    const updatedHistory = this.state.history.map((entry, idx) => {
      if (idx !== existingIndex) return entry;
      return {
        ...entry,
        status,
        updatedAt: now,
        ...(status === 'error' && errorMessage ? { errorMessage } : { errorMessage: undefined }),
      };
    });
    this.updateState({
      history: sanitizeSongRequestHistoryEntries(updatedHistory),
    });
  }

  public destroy() {
    this.stopNativePositionPoll();
    if (this.busUnsubscribe) {
      this.busUnsubscribe();
      this.busUnsubscribe = null;
    }
    this.listeners.clear();
  }

  private updateState(partial: Partial<SongRequestState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (err) {
        console.error('SongRequest listener error:', err);
      }
    });
  }
}

export async function hydrateSongRequestHistoryWithGuard(params: {
  readHistory: () => Promise<SongRequestHistoryEntry[]>;
  hydrateHistory: (entries: SongRequestHistoryEntry[]) => SongRequestHistoryEntry[];
  syncReadyRef: { current: boolean };
  lastPersistedJsonRef: { current: string };
}): Promise<{ hydrated: boolean; entries: SongRequestHistoryEntry[]; error?: unknown }> {
  try {
    const savedHistory = await params.readHistory();
    const hydratedEntries = params.hydrateHistory(savedHistory);
    params.lastPersistedJsonRef.current = JSON.stringify(hydratedEntries);
    params.syncReadyRef.current = true;
    return { hydrated: true, entries: hydratedEntries };
  } catch (error) {
    return { hydrated: false, entries: [], error };
  }
}

export function persistSongRequestHistoryIfReady(params: {
  history: SongRequestHistoryEntry[];
  syncReadyRef: { current: boolean };
  lastPersistedJsonRef: { current: string };
  saveHistory: (history: SongRequestHistoryEntry[]) => Promise<void>;
  onError?: (err: unknown) => void;
}): Promise<boolean> | null {
  if (!params.syncReadyRef.current) return null;
  const serialized = JSON.stringify(params.history);
  if (serialized === params.lastPersistedJsonRef.current) return null;
  return params.saveHistory(params.history)
    .then(() => {
      params.lastPersistedJsonRef.current = serialized;
      return true;
    })
    .catch((err) => {
      params.onError?.(err);
      return false;
    });
}

export const songRequestEngine = new SongRequestEngine();
