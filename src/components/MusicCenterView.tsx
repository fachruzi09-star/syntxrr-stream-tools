import React, { useState, useEffect } from 'react';
import {
  SongRequest,
  UnifiedQueueItem,
  LocalAudioTrackMeta,
  AppSettings,
  YouTubeSearchResult,
  SpotifySearchResult,
} from '../types';
import { audioEngine, AudioEngineState } from '../services/localAudioEngine';
import { songRequestEngine, type SongRequestState } from '../services/songRequestEngine';
import { LocalAudioPlayer } from './music/LocalAudioPlayer';
import { YouTubeConnector } from './music/YouTubeConnector';
import { SpotifyConnector } from './music/SpotifyConnector';
import { UnifiedQueueManager } from './music/UnifiedQueueManager';
import { ViewerRequestPortal } from './music/ViewerRequestPortal';
import {
  Disc3,
  FileAudio,
  ListMusic,
  Send,
  Sparkles,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  X,
} from 'lucide-react';

interface MusicCenterViewProps {
  songRequests: SongRequest[];
  nowPlayingSong: SongRequest | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  onAddSongRequest: (request: Omit<SongRequest, 'id' | 'requestedAt'>) => void;
  onDeleteRequest: (id: string) => void;
  onLoadPresetPack: (packName: string) => void;
  onSetNowPlaying: (song: SongRequest) => void;
  unifiedQueue: UnifiedQueueItem[];
  onUpdateUnifiedQueue: (queue: UnifiedQueueItem[]) => void;
  localTracksMeta: LocalAudioTrackMeta[];
  localFilesMap: Map<string, File>;
  onAddLocalFiles: (files: File[]) => void;
  onRemoveLocalTrack: (id: string) => void;
  settings: AppSettings;
  onNavigateToSettings: () => void;
  onUpdateSpotifyToken: (token: string) => void;
  songRequestState?: SongRequestState;
}

type ActiveTab = 'local_audio' | 'youtube' | 'spotify' | 'queue' | 'viewer_portal';

export const MusicCenterView: React.FC<MusicCenterViewProps> = ({
  nowPlayingSong,
  isPlaying,
  onTogglePlay,
  onNextTrack,
  onPrevTrack,
  onLoadPresetPack,
  unifiedQueue,
  onUpdateUnifiedQueue,
  localTracksMeta,
  localFilesMap,
  onAddLocalFiles,
  onRemoveLocalTrack,
  settings,
  onNavigateToSettings,
  onUpdateSpotifyToken,
  songRequestState,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('queue');
  const [audioState, setAudioState] = useState<AudioEngineState>(audioEngine.getState());
  const [notice, setNotice] = useState<{ text: string; tone: 'warn' | 'error' } | null>(null);

  useEffect(() => {
    const unsub = audioEngine.subscribe(setAudioState);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleAddYouTubeResult = (item: YouTubeSearchResult) => {
    const exists = unifiedQueue.some(
      (q) =>
        q.externalUrl === item.videoUrl || q.title.toLowerCase() === item.title.toLowerCase()
    );
    if (exists) {
      setNotice({ text: `"${item.title}" sudah ada di dalam antrean.`, tone: 'warn' });
      return;
    }

    const newQueueItem: UnifiedQueueItem = {
      id: `yt_${item.id}_${Date.now()}`,
      title: item.title,
      artist: item.channelTitle,
      source: 'youtube',
      externalUrl: item.videoUrl,
      thumbnailUrl: item.thumbnailUrl,
      requesterName: 'Stream Host',
      platform: 'YouTube',
      addedAt: Date.now(),
      status: 'approved',
    };

    onUpdateUnifiedQueue([...unifiedQueue, newQueueItem]);
  };

  const handleAddSpotifyResult = (item: SpotifySearchResult) => {
    const exists = unifiedQueue.some(
      (q) =>
        q.externalUrl === item.spotifyUrl || q.title.toLowerCase() === item.title.toLowerCase()
    );
    if (exists) {
      setNotice({ text: `"${item.title}" sudah ada di dalam antrean.`, tone: 'warn' });
      return;
    }

    const newQueueItem: UnifiedQueueItem = {
      id: `sp_${item.id}_${Date.now()}`,
      title: item.title,
      artist: item.artist,
      source: 'spotify',
      externalUrl: item.spotifyUrl,
      thumbnailUrl: item.thumbnailUrl,
      duration: Math.round(item.durationMs / 1000),
      requesterName: 'Stream Host',
      platform: 'Spotify',
      addedAt: Date.now(),
      status: 'approved',
    };

    onUpdateUnifiedQueue([...unifiedQueue, newQueueItem]);
  };

  const handleAddLocalToQueue = (track: LocalAudioTrackMeta) => {
    const exists = unifiedQueue.some(
      (q) => q.localFileKey === track.id || (q.title === track.title && q.source === 'local')
    );
    if (exists) {
      setNotice({ text: `"${track.title}" sudah ada di dalam antrean.`, tone: 'warn' });
      return;
    }

    const newQueueItem: UnifiedQueueItem = {
      id: `local_${track.id}_${Date.now()}`,
      title: track.title,
      artist: track.artist,
      source: 'local',
      duration: track.duration,
      requesterName: 'Local Storage',
      platform: 'Local',
      addedAt: Date.now(),
      status: 'approved',
      localFileKey: track.id,
    };

    onUpdateUnifiedQueue([...unifiedQueue, newQueueItem]);
  };

  const handleViewerSubmit = (
    request: Omit<UnifiedQueueItem, 'id' | 'addedAt'>
  ): { success: boolean; message: string } => {
    const duplicate = unifiedQueue.some(
      (q) =>
        (request.externalUrl && q.externalUrl === request.externalUrl) ||
        (q.title.toLowerCase() === request.title.toLowerCase() &&
          q.artist.toLowerCase() === request.artist.toLowerCase())
    );

    if (duplicate) {
      return { success: false, message: 'Lagu atau tautan ini sudah ada di antrean siaran.' };
    }

    const newItem: UnifiedQueueItem = {
      ...request,
      id: `req_${Date.now()}`,
      addedAt: Date.now(),
    };

    onUpdateUnifiedQueue([...unifiedQueue, newItem]);
    return { success: true, message: `Permintaan "${request.title}" ditambahkan.` };
  };

  const handlePlayLocalQueueItem = async (item: UnifiedQueueItem) => {
    const trackId = item.localFileKey || item.id.replace('local_', '').split('_')[0];
    const file = localFilesMap.get(trackId);

    if (file) {
      if (songRequestState?.currentTrack || songRequestEngine.getState().isPlaying) {
        await songRequestEngine.stop();
      }
      await audioEngine.loadAndPlayFile(item.id, item.title, item.artist, file);
      const updated = unifiedQueue.map((q) => ({
        ...q,
        status: (q.id === item.id
          ? 'playing'
          : q.status === 'playing'
          ? 'approved'
          : q.status) as UnifiedQueueItem['status'],
      }));
      onUpdateUnifiedQueue(updated);
    } else {
      setNotice({
        text: `File lokal untuk "${item.title}" belum dimuat di sesi saat ini. Pilih ulang file lewat tab Local Audio Engine.`,
        tone: 'error',
      });
    }
  };

  const activeQueuePlaying = unifiedQueue.find((q) => q.status === 'playing');
  const isSongRequestActive = Boolean(songRequestState?.currentTrack);
  const displayTitle = isSongRequestActive
    ? songRequestState!.currentTrack!.title
    : audioState.currentTrackId
    ? audioState.title
    : activeQueuePlaying?.title || nowPlayingSong?.title || 'Tidak Ada Lagu Aktif';
  const displayArtist = isSongRequestActive
    ? songRequestState!.currentTrack!.artist
    : audioState.currentTrackId
    ? audioState.artist
    : activeQueuePlaying?.artist || nowPlayingSong?.artist || 'Pilih lagu dari antrean atau perangkat';
  const isLocalEngineActive = Boolean(audioState.currentTrackId) && !isSongRequestActive;
  const isPlayingNow = isSongRequestActive
    ? !!songRequestState?.isPlaying
    : audioState.isPlaying || isPlaying;

  const pendingCount = unifiedQueue.filter((q) => q.status === 'pending').length;

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-[var(--app-accent-text)] uppercase">
            <span>Stage 2</span>
            <span className="text-[var(--app-border-strong)]">/</span>
            <span className="text-[var(--app-text-muted)]">Studio Audio Console</span>
          </div>
          <h1 className="font-display text-2xl sm:text-[26px] font-bold text-[var(--app-text)] tracking-tight flex items-center gap-2 mt-0.5">
            <Disc3 className="w-6 h-6 text-[var(--app-accent-text)]" />
            <span>Music Center</span>
          </h1>
          <p className="text-xs text-[var(--app-text-muted)] mt-0.5">
            Pemutaran audio lokal HTML5, katalog YouTube &amp; Spotify, dan manajemen antrean terpadu
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto text-[11px] font-mono-num">
          <span
            className="px-2.5 py-1 rounded-lg border font-semibold inline-flex items-center gap-1"
            style={{
              backgroundColor: 'var(--app-ok-soft)',
              borderColor: 'color-mix(in srgb, var(--app-ok) 40%, transparent)',
              color: 'var(--app-ok)',
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Local: Siap
          </span>
          <span
            className={`px-2.5 py-1 rounded-lg border font-semibold ${
              settings.youtubeApiKey?.trim()
                ? 'bg-rose-950/60 border-rose-700/60 text-rose-200'
                : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)]'
            }`}
          >
            YT: {settings.youtubeApiKey?.trim() ? 'Terkonfigurasi' : 'Butuh Key'}
          </span>
          <span
            className={`px-2.5 py-1 rounded-lg border font-semibold ${
              settings.spotifyAccessToken?.trim()
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-200'
                : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)]'
            }`}
          >
            Spotify: {settings.spotifyAccessToken?.trim() ? 'Terhubung' : 'Butuh Auth'}
          </span>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs"
          style={
            notice.tone === 'error'
              ? {
                  backgroundColor: 'var(--app-error-soft)',
                  borderColor: 'color-mix(in srgb, var(--app-error) 45%, transparent)',
                  color: 'var(--app-text)',
                }
              : {
                  backgroundColor: 'var(--app-warn-soft)',
                  borderColor: 'color-mix(in srgb, var(--app-warn) 45%, transparent)',
                  color: 'var(--app-text)',
                }
          }
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--app-accent-text)]" />
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="min-w-[44px] min-h-[44px] -my-2 -mr-2 flex items-center justify-center rounded-xl hover:bg-[var(--app-surface-hover)] transition-colors shrink-0"
            aria-label="Tutup pemberitahuan"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Now Playing Studio Deck Card */}
      <section className="p-4 sm:p-5 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border-strong)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--app-accent-text)] flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: isPlayingNow ? 'var(--app-accent)' : 'var(--app-border-strong)',
              }}
            />
            <span>Now Playing on Stream</span>
          </span>
          <span className="text-[11px] font-mono-num text-[var(--app-text-muted)]">
            {isSongRequestActive
              ? songRequestState?.audioPlaybackMode === 'native_android_media'
                ? 'Source: Song Request (Native Android)'
                : `Source: Song Request (${songRequestState?.playbackStatus || 'idle'})`
              : isLocalEngineActive
              ? 'Source: Local Device Audio'
              : activeQueuePlaying?.source
              ? `Source: ${activeQueuePlaying.source.toUpperCase()}`
              : 'Status: Standby'}
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-4 sm:gap-5">
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-[var(--app-surface-muted)] border border-[var(--app-accent-border)] flex items-center justify-center shrink-0 mx-auto md:mx-0 overflow-hidden">
            {activeQueuePlaying?.thumbnailUrl ? (
              <img
                src={activeQueuePlaying.thumbnailUrl}
                alt={displayTitle}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Disc3
                className={`w-12 h-12 text-[var(--app-accent-text)] transition-transform ${
                  isPlayingNow ? 'animate-spin motion-reduce:animate-none' : ''
                }`}
                style={{ animationDuration: '8s' }}
              />
            )}
            <div className="absolute inset-x-0 bottom-0 bg-black/75 py-1 text-center">
              <span className="text-[9px] font-mono-num font-bold text-[var(--app-accent-text)] tracking-wider uppercase">
                {isLocalEngineActive ? 'LOCAL ENGINE' : activeQueuePlaying?.source || 'SYNTXRR'}
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0 text-center md:text-left space-y-1.5">
            <h2 className="font-display text-lg sm:text-xl font-bold text-[var(--app-text)] truncate">
              {displayTitle}
            </h2>
            <p className="text-sm text-[var(--app-text-secondary)] font-medium truncate">
              {displayArtist}
            </p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-xs text-[var(--app-text-muted)] pt-0.5">
              <span>Origin:</span>
              <span className="font-semibold text-[var(--app-text)]">
                {activeQueuePlaying?.requesterName || nowPlayingSong?.requesterName || 'Streamer'}
              </span>
              <span className="text-[var(--app-border-strong)]">·</span>
              <span className="px-2 py-0.5 rounded-md bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] text-[var(--app-accent-text)] text-[10px] font-bold uppercase font-mono-num">
                {activeQueuePlaying?.platform || nowPlayingSong?.platform || 'Local'}
              </span>
              {activeQueuePlaying?.externalUrl && (
                <button
                  type="button"
                  onClick={() =>
                    window.open(activeQueuePlaying.externalUrl, '_blank', 'noopener,noreferrer')
                  }
                  className="text-xs text-[var(--app-accent-text)] hover:underline inline-flex items-center gap-1 ml-1"
                >
                  <ExternalLink className="w-3 h-3" /> Buka Tautan
                </button>
              )}
            </div>

            <div className="h-6 flex items-end justify-center md:justify-start gap-1 pt-1">
              <span className={`w-1.5 rounded-full bg-[var(--app-accent)] ${isPlayingNow ? 'animate-bar-1' : 'h-1.5'}`} />
              <span className={`w-1.5 rounded-full bg-[var(--app-accent-hover)] ${isPlayingNow ? 'animate-bar-2' : 'h-2.5'}`} />
              <span className={`w-1.5 rounded-full bg-[var(--app-accent)] ${isPlayingNow ? 'animate-bar-3' : 'h-1.5'}`} />
              <span className={`w-1.5 rounded-full bg-[var(--app-accent-text)] ${isPlayingNow ? 'animate-bar-4' : 'h-3'}`} />
              <span className={`w-1.5 rounded-full bg-[var(--app-accent)] ${isPlayingNow ? 'animate-bar-5' : 'h-1.5'}`} />
              <span className={`w-1.5 rounded-full bg-[var(--app-accent-hover)] ${isPlayingNow ? 'animate-bar-2' : 'h-2'}`} />
            </div>
          </div>
        </div>

        {(songRequestState?.lastError || songRequestState?.playbackStatus === 'preparing') && (
          <div
            className={`px-3.5 py-2.5 rounded-xl border text-xs ${
              songRequestState?.lastError
                ? 'bg-rose-950/45 border-rose-700/60 text-rose-200'
                : 'bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-text)]'
            }`}
          >
            {songRequestState?.lastError || 'Memuat dan menyiapkan pemutaran lagu...'}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-3">
          <div className="text-xs text-[var(--app-text-muted)]">
            {isSongRequestActive ? (
              <span
                className="font-semibold"
                style={{ color: isPlayingNow ? 'var(--app-ok)' : 'var(--app-warn)' }}
              >
                {songRequestState?.audioPlaybackMode === 'native_android_media'
                  ? `Native Media (${songRequestState?.playbackStatus})`
                  : `Song Request (${songRequestState?.playbackStatus})`}
              </span>
            ) : isLocalEngineActive ? (
              <span className="font-semibold" style={{ color: 'var(--app-ok)' }}>
                HTML5 Engine Aktif
              </span>
            ) : (
              <span>Antrean Siaga</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrevTrack}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] transition-colors"
              aria-label="Lagu sebelumnya"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (isSongRequestActive) {
                  onTogglePlay();
                } else if (isLocalEngineActive) {
                  audioEngine.togglePlay();
                } else {
                  onTogglePlay();
                }
              }}
              className="min-h-[48px] min-w-[48px] rounded-2xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] flex items-center justify-center transition-colors"
              aria-label={isPlayingNow ? 'Jeda musik' : 'Putar musik'}
            >
              {isPlayingNow ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={onNextTrack}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] transition-colors"
              aria-label="Lagu berikutnya"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-[var(--app-text-muted)] block">Antrean</span>
            <span className="text-xs font-bold text-[var(--app-text)] font-mono-num">
              {unifiedQueue.length} Lagu
            </span>
          </div>
        </div>
      </section>

      {/* Preset Packs Strip */}
      <div className="p-4 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--app-text-secondary)] inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[var(--app-accent-text)]" />
            <span>Paket Suasana Musik:</span>
          </span>
          <span className="text-[11px] text-[var(--app-text-muted)]">Muat ke antrean</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onLoadPresetPack('synthwave')}
            className="min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-xs font-semibold text-[var(--app-text)] transition-colors"
          >
            Synthwave Pack
          </button>
          <button
            type="button"
            onClick={() => onLoadPresetPack('lofi')}
            className="min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-xs font-semibold text-[var(--app-text)] transition-colors"
          >
            Chill Lo-Fi Session
          </button>
          <button
            type="button"
            onClick={() => onLoadPresetPack('gaming')}
            className="min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-xs font-semibold text-[var(--app-text)] transition-colors"
          >
            Esports Energy
          </button>
        </div>
      </div>

      {/* 5-Tab Segmented Navigation */}
      <div className="flex overflow-x-auto gap-1.5 p-1.5 bg-[var(--app-surface)] rounded-2xl border border-[var(--app-border)] no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`min-h-[44px] px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
            activeTab === 'queue'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <ListMusic className="w-4 h-4 shrink-0" />
          <span>Unified Queue</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-black/25 text-[10px] font-mono-num font-bold">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('local_audio')}
          className={`min-h-[44px] px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
            activeTab === 'local_audio'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <FileAudio className="w-4 h-4 shrink-0" />
          <span>Local Audio Engine</span>
          {localTracksMeta.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-black/20 text-[10px] font-mono-num">
              {localTracksMeta.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('youtube')}
          className={`min-h-[44px] px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
            activeTab === 'youtube'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-black text-[9px]">
            YT
          </span>
          <span>YouTube Catalog</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('spotify')}
          className={`min-h-[44px] px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
            activeTab === 'spotify'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-black text-[9px]">
            SP
          </span>
          <span>Spotify Catalog</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('viewer_portal')}
          className={`min-h-[44px] px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-colors inline-flex items-center gap-2 ${
            activeTab === 'viewer_portal'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <Send className="w-4 h-4 shrink-0" />
          <span>Viewer Portal</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'queue' && (
        <UnifiedQueueManager
          queue={unifiedQueue}
          onUpdateQueue={onUpdateUnifiedQueue}
          onPlayLocalItem={handlePlayLocalQueueItem}
          currentlyPlayingId={audioState.currentTrackId || activeQueuePlaying?.id}
        />
      )}

      {activeTab === 'local_audio' && (
        <LocalAudioPlayer
          localTracksMeta={localTracksMeta}
          localFilesMap={localFilesMap}
          onAddLocalFiles={onAddLocalFiles}
          onRemoveTrack={onRemoveLocalTrack}
          onAddTrackToQueue={handleAddLocalToQueue}
        />
      )}

      {activeTab === 'youtube' && (
        <YouTubeConnector
          apiKey={settings.youtubeApiKey}
          onAddToQueue={handleAddYouTubeResult}
          onNavigateToSettings={onNavigateToSettings}
        />
      )}

      {activeTab === 'spotify' && (
        <SpotifyConnector
          clientId={settings.spotifyClientId}
          accessToken={settings.spotifyAccessToken}
          onUpdateSpotifyToken={onUpdateSpotifyToken}
          onAddToQueue={handleAddSpotifyResult}
          onNavigateToSettings={onNavigateToSettings}
        />
      )}

      {activeTab === 'viewer_portal' && (
        <ViewerRequestPortal queue={unifiedQueue} onSubmitRequest={handleViewerSubmit} />
      )}
    </div>
  );
};
