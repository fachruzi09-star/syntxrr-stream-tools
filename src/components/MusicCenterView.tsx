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
    <div className="space-y-3.5 pb-2">
      {/* Compact Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--app-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <Disc3 className="w-5 h-5 text-[var(--app-accent-text)] shrink-0" />
          <h1 className="font-display text-lg sm:text-xl font-bold text-[var(--app-text)] tracking-tight truncate">
            Music Center
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono-num">
          <span
            className="px-2 py-0.5 rounded-md border font-semibold inline-flex items-center gap-1"
            style={{
              backgroundColor: 'var(--app-ok-soft)',
              borderColor: 'color-mix(in srgb, var(--app-ok) 40%, transparent)',
              color: 'var(--app-ok)',
            }}
          >
            <ShieldCheck className="w-3 h-3" /> Local
          </span>
          <span
            className={`px-2 py-0.5 rounded-md border font-semibold ${
              settings.youtubeApiKey?.trim()
                ? 'bg-rose-950/60 border-rose-700/60 text-rose-200'
                : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)]'
            }`}
          >
            YT {settings.youtubeApiKey?.trim() ? 'OK' : 'Key?'}
          </span>
          <span
            className={`px-2 py-0.5 rounded-md border font-semibold ${
              settings.spotifyAccessToken?.trim()
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-200'
                : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)]'
            }`}
          >
            Spotify {settings.spotifyAccessToken?.trim() ? 'OK' : 'Auth?'}
          </span>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="anim-pop-in flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border text-xs"
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
            className="btn-press min-w-[44px] min-h-[44px] -my-2 -mr-2 flex items-center justify-center rounded-xl hover:bg-[var(--app-surface-hover)] shrink-0"
            aria-label="Tutup pemberitahuan"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Compact Horizontal Now Playing Deck */}
      <section className="p-3.5 sm:p-4 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border-strong)] space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-accent-border)] flex items-center justify-center shrink-0 overflow-hidden">
              {activeQueuePlaying?.thumbnailUrl ? (
                <img
                  src={activeQueuePlaying.thumbnailUrl}
                  alt={displayTitle}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Disc3
                  className={`w-8 h-8 text-[var(--app-accent-text)] ${
                    isPlayingNow ? 'animate-spin motion-reduce:animate-none' : ''
                  }`}
                  style={{ animationDuration: '8s' }}
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] font-mono-num text-[var(--app-accent-text)] uppercase font-bold">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: isPlayingNow ? 'var(--app-accent)' : 'var(--app-border-strong)',
                  }}
                />
                <span className="truncate">
                  {isSongRequestActive
                    ? `Song Request (${songRequestState?.playbackStatus || 'idle'})`
                    : isLocalEngineActive
                    ? 'Local Audio'
                    : activeQueuePlaying?.source?.toUpperCase() || 'Standby'}
                </span>
                <span className="text-[var(--app-border-strong)]">·</span>
                <span className="text-[var(--app-text-muted)]">{unifiedQueue.length} Antrean</span>
              </div>
              <h2 className="font-display text-sm sm:text-base font-bold text-[var(--app-text)] truncate mt-0.5">
                {displayTitle}
              </h2>
              <div className="flex items-center gap-2 text-xs text-[var(--app-text-secondary)] truncate">
                <span className="truncate">{displayArtist}</span>
                {activeQueuePlaying?.externalUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      window.open(activeQueuePlaying.externalUrl, '_blank', 'noopener,noreferrer')
                    }
                    className="text-[11px] text-[var(--app-accent-text)] hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    <ExternalLink className="w-3 h-3" /> Tautan
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onPrevTrack}
              className="btn-press min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
              aria-label="Lagu sebelumnya"
            >
              <SkipBack className="w-4 h-4" />
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
              className="btn-press min-h-[44px] min-w-[44px] rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] flex items-center justify-center"
              aria-label={isPlayingNow ? 'Jeda musik' : 'Putar musik'}
            >
              {isPlayingNow ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={onNextTrack}
              className="btn-press min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
              aria-label="Lagu berikutnya"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>

        {(songRequestState?.lastError || songRequestState?.playbackStatus === 'preparing') && (
          <div
            className={`px-3 py-2 rounded-xl border text-xs ${
              songRequestState?.lastError
                ? 'bg-rose-950/45 border-rose-700/60 text-rose-200'
                : 'bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] text-[var(--app-accent-text)]'
            }`}
          >
            {songRequestState?.lastError || 'Memuat dan menyiapkan pemutaran lagu...'}
          </div>
        )}

        {/* Preset Packs Inline Row */}
        <div className="pt-2.5 border-t border-[var(--app-border)] flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-[var(--app-text-muted)] inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[var(--app-accent-text)]" />
            <span>Paket Musik:</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onLoadPresetPack('synthwave')}
              className="btn-press min-h-[36px] px-2.5 rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-[11px] font-semibold text-[var(--app-text)]"
            >
              Synthwave
            </button>
            <button
              type="button"
              onClick={() => onLoadPresetPack('lofi')}
              className="btn-press min-h-[36px] px-2.5 rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-[11px] font-semibold text-[var(--app-text)]"
            >
              Lo-Fi
            </button>
            <button
              type="button"
              onClick={() => onLoadPresetPack('gaming')}
              className="btn-press min-h-[36px] px-2.5 rounded-lg bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-[11px] font-semibold text-[var(--app-text)]"
            >
              Esports
            </button>
          </div>
        </div>
      </section>

      {/* 5-Tab Segmented Navigation */}
      <div className="flex overflow-x-auto gap-1 p-1 bg-[var(--app-surface)] rounded-xl border border-[var(--app-border)] no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`btn-press min-h-[44px] px-3.5 rounded-[9px] text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 shrink-0 ${
            activeTab === 'queue'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <ListMusic className="w-3.5 h-3.5 shrink-0" />
          <span>Queue</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-black/25 text-[10px] font-mono-num font-bold">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('local_audio')}
          className={`btn-press min-h-[44px] px-3.5 rounded-[9px] text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 shrink-0 ${
            activeTab === 'local_audio'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <FileAudio className="w-3.5 h-3.5 shrink-0" />
          <span>Local ({localTracksMeta.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('youtube')}
          className={`btn-press min-h-[44px] px-3.5 rounded-[9px] text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 shrink-0 ${
            activeTab === 'youtube'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <span className="px-1 py-0.5 rounded bg-rose-600 text-white font-black text-[9px]">YT</span>
          <span>YouTube</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('spotify')}
          className={`btn-press min-h-[44px] px-3.5 rounded-[9px] text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 shrink-0 ${
            activeTab === 'spotify'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <span className="px-1 py-0.5 rounded bg-emerald-600 text-white font-black text-[9px]">
            SP
          </span>
          <span>Spotify</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('viewer_portal')}
          className={`btn-press min-h-[44px] px-3.5 rounded-[9px] text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 shrink-0 ${
            activeTab === 'viewer_portal'
              ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
              : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
          }`}
        >
          <Send className="w-3.5 h-3.5 shrink-0" />
          <span>Request</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div key={activeTab} className="anim-tab-panel">
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
    </div>
  );
};
