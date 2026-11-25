// Dedicated Mode A Song Request Engine — SYNTXRR STREAM
// Integrates with streamEventBus (!play, !sr, !songrequest, !queue, !np, !nowplaying),
// official YouTube Data API v3 & Spotify Web API metadata catalogs,
// Android NativeMusicPlayer (MediaPlayer + MediaSession inside CompanionService), and HTML5 Audio fallback on Web
// strictly for authorized direct playback sources.
// All Now Playing / isPlaying / progress / error states reflect actual playback engine state.

import { streamEventBus } from './eventBus';
import { nativeAudioBridge, type MusicStateEvent } from './nativeAudioBridge';
import { YouTubeService } from './youtubeService';
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

export function isPersistentAuthorizedAudioUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(blob|data):/i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
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

export function isAuthorizedPlaybackAudioUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || /^(blob|data):/i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
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
  const provider = normalizeSongRequestProvider(
    item.provider,
    item.sourceType === 'youtube_metadata' || item.sourceType === 'spotify_metadata' || item.sourceType === 'remote_url'
      ? item.sourceType
      : undefined
  );
  const sourceType = normalizeSongRequestSourceType(item.sourceType, provider);
  const safeAudioUrl =
    sourceType === 'remote_url' && item.playable === true && isPersistentAuthorizedAudioUrl(item.audioUrl)
      ? item.audioUrl.trim()
      : undefined;
  const safeExternalUrl = sanitizeReferenceUrl(item.externalUrl);
  const safeThumbnailUrl = sanitizeReferenceUrl(item.thumbnailUrl);

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
    ...(typeof item.providerTrackId === 'string' && item.providerTrackId.trim()
      ? { providerTrackId: item.providerTrackId.trim() }
      : {}),
    playable: sourceType === 'remote_url' && Boolean(safeAudioUrl) && item.playable === true,
    ...(safeAudioUrl ? { audioUrl: safeAudioUrl } : {}),
    ...(safeExternalUrl ? { externalUrl: safeExternalUrl } : {}),
    ...(safeThumbnailUrl ? { thumbnailUrl: safeThumbnailUrl } : {}),
    ...(typeof item.mimeType === 'string' && item.mimeType.trim() ? { mimeType: item.mimeType.trim() } : {}),
    ...(item.platform ? { platform: item.platform } : {}),
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
        if (!this.state.currentTrack) return;
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
          audioRoutedToStream: true,
          lastError: null,
        });
      });

      audio.addEventListener('pause', () => {
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
        if (!this.state.currentTrack) return;
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
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          this.updateState({ durationSec: Math.round(audio.duration) });
        }
      });

      audio.addEventListener('ended', () => {
        void this.handleTrackEnded();
      });

      audio.addEventListener('error', () => {
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
          audioPlaybackMode: 'idle',
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
          audioPlaybackMode: 'idle',
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

    // 1. Check YouTube Data API v3 catalog (metadata only — zero audio extraction)
    if (this.youtubeApiKey.trim()) {
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
      if (!ytRes.success && ytRes.error) {
        errors.push(`YouTube: ${ytRes.error}`);
      }
    }

    // 2. Check Spotify Web API catalog (metadata only — zero audio extraction)
    if (this.spotifyAccessToken.trim()) {
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
      if (!spRes.success && spRes.error) {
        errors.push(`Spotify: ${spRes.error}`);
      }
    }

    if (errors.length > 0) {
      return { error: errors.join(' | ') };
    }

    const hasRemoteProvider = Boolean(this.youtubeApiKey.trim() || this.spotifyAccessToken.trim());
    return {
      error: hasRemoteProvider
        ? `Lagu "${cleanQuery}" tidak ditemukan di katalog metadata YouTube/Spotify.`
        : `Sumber metadata Song Request (YouTube Data API Key / token Spotify) belum dikonfigurasi.`,
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
    this.userLastRequestTime.set(username, Date.now());

    const isIdle =
      !this.state.currentTrack ||
      this.state.playbackStatus === 'idle' ||
      this.state.playbackStatus === 'stopped' ||
      this.state.playbackStatus === 'completed' ||
      this.state.playbackStatus === 'error';

    if (isIdle) {
      const started = await this.playItem(item);
      this.updateState({
        audioSourceResolved: item.playable,
        lastTestPipelineResult: this.buildPipelineResult(cleanQuery, username, isSimulation, policyCheck, {
          resolved: true,
          resolveSummary: item.playable
            ? `Sumber playback berizin ditemukan: "${item.title}"`
            : `Metadata katalog ditemukan (${item.sourceType}): "${item.title}" — sumber playback berizin belum tersedia`,
          resolveDetail: `Provider: ${item.provider} | SourceType: ${item.sourceType} | Playable: ${item.playable}`,
          playbackStarted: started,
          playbackSummary: started
            ? `Pemutaran dimulai melalui ${nativeAudioBridge.isNativeAndroid() ? 'NativeMusicPlayer (MediaPlayer)' : 'HTML5 Audio'}`
            : this.state.lastError || 'Sumber playback berizin belum tersedia untuk metadata ini.',
        }),
      });
      if (started) {
        this.announce(`🎵 [${isSimulation ? 'SIMULASI' : 'LIVE'}] @${username} memutar "${item.title}"`);
      } else {
        this.announce(`⚠️ [${isSimulation ? 'SIMULASI' : 'LIVE'}] @${username}: ${this.state.lastError || 'Sumber playback belum tersedia.'}`);
      }
      return { success: started, item, error: started ? undefined : this.state.lastError || undefined };
    }

    const newQueue = [...this.state.queue, item];
    this.updateState({
      queue: newQueue,
      audioSourceResolved: item.playable,
      lastTestPipelineResult: this.buildPipelineResult(cleanQuery, username, isSimulation, policyCheck, {
        resolved: true,
        resolveSummary: `Ditambahkan ke antrean #${newQueue.length}: "${item.title}" (${item.sourceType})`,
        resolveDetail: `Queue length: ${newQueue.length}`,
        playbackStarted: this.state.isPlaying,
        playbackSummary: 'Lagu masuk antrean; menunggu giliran pemutaran.',
      }),
    });
    this.announce(
      `🎵 [${isSimulation ? 'SIMULASI' : 'LIVE'}] @${username} menambahkan "${item.title}" ke antrean (#${newQueue.length}).`
    );
    return { success: true, item };
  }

  public async enqueueAndPlayItem(item: SongRequestItem): Promise<boolean> {
    const isIdle =
      !this.state.currentTrack ||
      this.state.playbackStatus === 'idle' ||
      this.state.playbackStatus === 'stopped' ||
      this.state.playbackStatus === 'completed' ||
      this.state.playbackStatus === 'error';
    if (isIdle) {
      return this.playItem(item);
    }
    this.updateState({ queue: [...this.state.queue, item] });
    return true;
  }

  public async playItem(item: SongRequestItem): Promise<boolean> {
    const gen = ++this.playbackGeneration;
    this.activePlaybackSessionId = null;
    await this.stopActivePlaybackOnly();
    if (gen !== this.playbackGeneration) return false;

    if (!item.playable || item.sourceType !== 'remote_url') {
      const platformLabel =
        item.provider === 'youtube_music'
          ? 'YouTube Music'
          : item.sourceType === 'youtube_metadata' || item.provider === 'youtube'
          ? 'YouTube'
          : item.sourceType === 'spotify_metadata' || item.provider === 'spotify'
          ? 'Spotify'
          : 'Katalog';
      const errMsg = `Lagu "${item.title}" hanya metadata ${platformLabel} (sumber playback berizin belum tersedia).`;
      this.updateState({
        currentTrack: item,
        isPlaying: false,
        playbackStatus: 'error',
        currentTimeSec: 0,
        durationSec: item.durationSec || 0,
        audioPlaybackMode: 'pending_source',
        audioSourceResolved: false,
        audioRoutedToStream: false,
        lastError: errMsg,
      });
      return false;
    }

    const authorizedUrl = isAuthorizedPlaybackAudioUrl(item.audioUrl) ? item.audioUrl.trim() : '';
    if (!authorizedUrl) {
      const msg = `Sumber playback berizin untuk "${item.title}" belum tersedia.`;
      this.updateState({
        currentTrack: item,
        isPlaying: false,
        playbackStatus: 'error',
        currentTimeSec: 0,
        durationSec: item.durationSec || 0,
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
        currentTrack: item,
        isPlaying: false,
        playbackStatus: 'preparing',
        currentTimeSec: 0,
        durationSec: item.durationSec || 0,
        audioPlaybackMode: 'native_android_media',
        audioSourceResolved: true,
        audioRoutedToStream: false,
        lastError: null,
      });

      const res = await nativeAudioBridge.playMusicTrack({
        trackId: item.id,
        title: item.title,
        artist: item.artist,
        sourceUri: authorizedUrl,
        mimeType: item.mimeType || 'audio/mpeg',
        volume: this.effectiveVolumeUnit(),
      });

      if (gen !== this.playbackGeneration) return false;
      if (!res.success) {
        const msg = res.message || 'Gagal memulai pemutaran di Android MediaPlayer.';
        this.activePlaybackSessionId = null;
        this.updateState({
          isPlaying: false,
          playbackStatus: 'error',
          audioPlaybackMode: 'idle',
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
        currentTrack: item,
        isPlaying: false,
        playbackStatus: 'error',
        audioPlaybackMode: 'idle',
        lastError: msg,
      });
      return false;
    }

    this.updateState({
      currentTrack: item,
      isPlaying: false,
      playbackStatus: 'preparing',
      currentTimeSec: 0,
      durationSec: item.durationSec || 0,
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
          : item.durationSec || 0;
      if (this.activePlaybackSessionId === sessionId) {
        this.recordSessionHistory(item, 'playing', undefined, sessionId);
      }
      this.updateState({
        isPlaying: true,
        playbackStatus: 'playing',
        durationSec: actualDur,
        audioPlaybackMode: 'real_html5_audio',
        audioRoutedToStream: true,
        lastError: null,
      });
      return true;
    } catch (err: any) {
      if (gen !== this.playbackGeneration) return false;
      const msg = err?.message || 'Pemutaran audio ditolak oleh browser atau format tidak didukung.';
      this.recordSessionHistory(item, 'error', msg, sessionId);
      if (this.activePlaybackSessionId === sessionId) {
        this.activePlaybackSessionId = null;
      }
      this.updateState({
        isPlaying: false,
        playbackStatus: 'error',
        audioPlaybackMode: 'idle',
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
      try {
        this.audioElement.pause();
        this.audioElement.removeAttribute('src');
        this.audioElement.load();
      } catch {
        // ignore cleanup errors
      }
    }
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
        audioRoutedToStream: false,
        lastError: null,
      });
      this.announce(
        `⏭️ [${isSimulation ? 'SIMULASI' : 'LIVE'}] @${username}: Antrean kosong — pemutaran dihentikan.`
      );
      return false;
    }

    const nextTrack = this.state.queue[0];
    const remaining = this.state.queue.slice(1);
    this.updateState({
      queue: remaining,
      currentTimeSec: 0,
      lastError: null,
    });

    const started = await this.playItem(nextTrack);
    if (started) {
      this.announce(
        `⏭️ [${isSimulation ? 'SIMULASI' : 'LIVE'}] Di-skip oleh @${username}. Memutar: "${nextTrack.title}".`
      );
    } else {
      this.announce(
        `⚠️ [${isSimulation ? 'SIMULASI' : 'LIVE'}] Di-skip oleh @${username}, tetapi gagal memutar "${nextTrack.title}": ${this.state.lastError || 'Error'}`
      );
    }
    return started;
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
        const next = this.state.queue[0];
        const remaining = this.state.queue.slice(1);
        this.updateState({
          queue: remaining,
          currentTimeSec: 0,
        });
        const started = await this.playItem(next);
        if (started) {
          this.announce(`🎶 Otomatis memutar lagu berikutnya: "${next.title}" (@${next.requester})`);
        } else {
          this.announce(`⚠️ Gagal memutar lagu berikutnya "${next.title}": ${this.state.lastError || 'Error'}`);
        }
      } else {
        await this.stopActivePlaybackOnly();
        this.updateState({
          currentTrack: null,
          isPlaying: false,
          playbackStatus: 'completed',
          currentTimeSec: 0,
          durationSec: 0,
          audioPlaybackMode: 'idle',
          audioRoutedToStream: false,
        });
        this.announce('Antrean Song Request selesai.');
      }
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

    return this.buildPipelineResult(cleanQuery, requester, isSimulation, policyCheck, {
      resolved: hasRemoteConfig,
      resolveSummary: hasRemoteConfig
        ? `Siap mencari metadata di katalog terkonfigurasi (${[
            this.youtubeApiKey.trim() ? 'YouTube' : '',
            this.spotifyAccessToken.trim() ? 'Spotify' : '',
          ]
            .filter(Boolean)
            .join(' & ')})`
        : 'API YouTube/Spotify belum dikonfigurasi untuk pencarian metadata Song Request',
      resolveDetail: `YTKey: ${!!this.youtubeApiKey.trim()} | SpotifyToken: ${!!this.spotifyAccessToken.trim()}`,
      playbackStarted: false,
      playbackSummary: hasRemoteConfig
        ? 'Tahap pencarian metadata aktif; playback otomatis membutuhkan sumber audio berizin'
        : 'Konfigurasikan YouTube Data API Key atau token Spotify di Settings',
    });
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
      status: policyCheck.passed && outcome.resolved ? (outcome.playbackStarted ? 'success' : 'warning') : 'failed',
      summary: outcome.playbackSummary,
      technicalDetail: nativeAudioBridge.isNativeAndroid()
        ? 'Engine: Android MediaPlayer + MediaSession (CompanionService foreground)'
        : 'Engine: HTML5 Audio Element',
    };

    const stage7: SongRequestTestStage = {
      name: 'Audio Routed to Stream Output',
      stageNumber: 7,
      status: outcome.playbackStarted ? 'success' : 'warning',
      summary: outcome.playbackStarted
        ? 'Status playback dan output audio disinkronkan ke Studio & Floating HUD'
        : 'Belum ada pemutaran aktif untuk dirutekan ke overlay/HUD',
      technicalDetail: `PlaybackStatus: ${this.state.playbackStatus} | NativeAndroid: ${nativeAudioBridge.isNativeAndroid()}`,
    };

    const overallSuccess =
      policyCheck.passed &&
      stage5.status === 'success' &&
      (stage6.status === 'success' || stage6.status === 'warning');

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
        const next = this.state.queue[0];
        this.updateState({ queue: this.state.queue.slice(1) });
        await this.playItem(next);
      }
      return;
    }

    if (!this.state.currentTrack.playable) {
      await this.playItem(this.state.currentTrack);
      return;
    }

    if (nativeAudioBridge.isNativeAndroid()) {
      const res = await nativeAudioBridge.resumeMusicTrack();
      if (res.success) {
        this.startNativePositionPoll();
        this.updateState({
          isPlaying: true,
          playbackStatus: 'playing',
          lastError: null,
        });
      } else {
        await this.playItem(this.state.currentTrack);
      }
      return;
    }

    if (this.audioElement && this.audioElement.src) {
      try {
        await this.audioElement.play();
        this.updateState({ isPlaying: true, playbackStatus: 'playing', lastError: null });
      } catch (err: any) {
        this.updateState({
          isPlaying: false,
          playbackStatus: 'error',
          lastError: err?.message || 'Gagal melanjutkan pemutaran audio.',
        });
      }
    } else {
      await this.playItem(this.state.currentTrack);
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
    this.activePlaybackSessionId = null;
    this.playbackGeneration++;
    await this.stopActivePlaybackOnly();
    this.updateState({
      currentTrack: null,
      isPlaying: false,
      playbackStatus: 'stopped',
      currentTimeSec: 0,
      durationSec: 0,
      audioPlaybackMode: 'idle',
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
    this.updateState({ queue: [...items] });
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

    if (this.state.queue.length >= this.state.policy.maxQueueSize) {
      const errMsg = `Antrean penuh (${this.state.queue.length}/${this.state.policy.maxQueueSize} lagu).`;
      return {
        success: false,
        error: errMsg,
      };
    }

    const snapshot = sanitizeHistoryTrackSnapshot(sourceEntry.trackSnapshot);
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
  params.lastPersistedJsonRef.current = serialized;
  return params.saveHistory(params.history)
    .then(() => true)
    .catch((err) => {
      params.onError?.(err);
      return false;
    });
}

export const songRequestEngine = new SongRequestEngine();
