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
  Volume2,
  VolumeX,
  ExternalLink,
  ShieldCheck,
  Info,
} from 'lucide-react';

interface MusicCenterViewProps {
  // Stage 1 Backwards-Compatible Props
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

  // Stage 2 Upgraded Props
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
  songRequests,
  nowPlayingSong,
  isPlaying,
  onTogglePlay,
  onNextTrack,
  onPrevTrack,
  onAddSongRequest,
  onDeleteRequest,
  onLoadPresetPack,
  onSetNowPlaying,
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

  useEffect(() => {
    const unsub = audioEngine.subscribe(setAudioState);
    return () => unsub();
  }, []);

  // Handle adding from YouTube
  const handleAddYouTubeResult = (item: YouTubeSearchResult) => {
    // Check duplicate
    const exists = unifiedQueue.some((q) => q.externalUrl === item.videoUrl || q.title.toLowerCase() === item.title.toLowerCase());
    if (exists) {
      alert(`"${item.title}" is already in the queue!`);
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

  // Handle adding from Spotify
  const handleAddSpotifyResult = (item: SpotifySearchResult) => {
    const exists = unifiedQueue.some((q) => q.externalUrl === item.spotifyUrl || q.title.toLowerCase() === item.title.toLowerCase());
    if (exists) {
      alert(`"${item.title}" is already in the queue!`);
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

  // Handle adding local track to queue
  const handleAddLocalToQueue = (track: LocalAudioTrackMeta) => {
    const exists = unifiedQueue.some((q) => q.localFileKey === track.id || (q.title === track.title && q.source === 'local'));
    if (exists) {
      alert(`"${track.title}" is already in the queue!`);
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

  // Handle viewer submission
  const handleViewerSubmit = (request: Omit<UnifiedQueueItem, 'id' | 'addedAt'>): { success: boolean; message: string } => {
    // Check duplicates
    const duplicate = unifiedQueue.some(
      (q) =>
        (request.externalUrl && q.externalUrl === request.externalUrl) ||
        (q.title.toLowerCase() === request.title.toLowerCase() && q.artist.toLowerCase() === request.artist.toLowerCase())
    );

    if (duplicate) {
      return { success: false, message: 'This song or link is already queued on this stream!' };
    }

    const newItem: UnifiedQueueItem = {
      ...request,
      id: `req_${Date.now()}`,
      addedAt: Date.now(),
    };

    onUpdateUnifiedQueue([...unifiedQueue, newItem]);
    return { success: true, message: `Request for "${request.title}" submitted successfully!` };
  };

  // Play local item from unified queue
  const handlePlayLocalQueueItem = async (item: UnifiedQueueItem) => {
    const trackId = item.localFileKey || item.id.replace('local_', '').split('_')[0];
    const file = localFilesMap.get(trackId);

    if (file) {
      if (songRequestState?.currentTrack || songRequestEngine.getState().isPlaying) {
        await songRequestEngine.stop();
      }
      await audioEngine.loadAndPlayFile(item.id, item.title, item.artist, file);
      // Mark as playing in queue
      const updated = unifiedQueue.map((q) => ({
        ...q,
        status: (q.id === item.id ? 'playing' : q.status === 'playing' ? 'approved' : q.status) as any,
      }));
      onUpdateUnifiedQueue(updated);
    } else {
      alert(`Local file for "${item.title}" is not available in the current browser session. Re-select the file under Local Audio.`);
    }
  };

  // Determine current Now Playing display
  const activeQueuePlaying = unifiedQueue.find((q) => q.status === 'playing');
  const isSongRequestActive = Boolean(songRequestState?.currentTrack);
  const displayTitle = isSongRequestActive
    ? songRequestState!.currentTrack!.title
    : audioState.currentTrackId
    ? audioState.title
    : activeQueuePlaying?.title || nowPlayingSong?.title || 'No Active Track';
  const displayArtist = isSongRequestActive
    ? songRequestState!.currentTrack!.artist
    : audioState.currentTrackId
    ? audioState.artist
    : activeQueuePlaying?.artist || nowPlayingSong?.artist || 'Select a track to start';
  const isLocalEngineActive = Boolean(audioState.currentTrackId) && !isSongRequestActive;
  const isPlayingNow = isSongRequestActive ? !!songRequestState?.isPlaying : (audioState.isPlaying || isPlaying);

  const pendingCount = unifiedQueue.filter((q) => q.status === 'pending').length;

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-blue-400 uppercase">
            <span>Stage 2</span>
            <span className="text-slate-500">·</span>
            <span>Hybrid Music Architecture</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2 mt-0.5">
            <Disc3 className="w-6 h-6 text-blue-400" />
            Music Center
          </h1>
          <p className="text-xs text-slate-400">
            Real HTML5 local audio playback, YouTube and Spotify catalog search, and unified request queue
          </p>
        </div>

        {/* Integration Status Badges */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto text-[11px]">
          <span className="px-2 py-1 rounded-md bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Local: Ready
          </span>
          <span
            className={`px-2 py-1 rounded-md border font-semibold ${
              settings.youtubeApiKey?.trim()
                ? 'bg-red-950/80 border-red-800 text-red-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            YT: {settings.youtubeApiKey?.trim() ? 'Configured' : 'Key Needed'}
          </span>
          <span
            className={`px-2 py-1 rounded-md border font-semibold ${
              settings.spotifyAccessToken?.trim()
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            Spotify: {settings.spotifyAccessToken?.trim() ? 'Connected' : 'Auth Needed'}
          </span>
        </div>
      </div>

      {/* Now Playing Studio Showcase Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-blue-950/80 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isPlayingNow ? 'bg-blue-400 animate-pulse' : 'bg-slate-600'}`} />
            Now Playing on Stream
          </span>
          <span className="text-[11px] font-mono text-slate-400">
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

        <div className="flex flex-col md:flex-row md:items-center gap-5">
          {/* Vinyl / Cover Art */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-tr from-blue-950 to-slate-900 border border-blue-700/50 flex items-center justify-center shrink-0 shadow-lg mx-auto md:mx-0 overflow-hidden">
            {activeQueuePlaying?.thumbnailUrl ? (
              <img
                src={activeQueuePlaying.thumbnailUrl}
                alt={displayTitle}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Disc3
                className={`w-14 h-14 text-blue-400 transition-transform ${
                  isPlayingNow ? 'animate-spin' : ''
                }`}
                style={{ animationDuration: '8s' }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end justify-center pb-1.5">
              <span className="text-[9px] font-bold text-blue-300 tracking-wider uppercase">
                {isLocalEngineActive ? 'LOCAL ENGINE' : activeQueuePlaying?.source || 'SYNTXRR BEATS'}
              </span>
            </div>
          </div>

          {/* Track Info & Visualizer */}
          <div className="flex-1 min-w-0 text-center md:text-left space-y-2">
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">
              {displayTitle}
            </h2>
            <p className="text-sm text-slate-300 font-medium truncate">
              {displayArtist}
            </p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-xs text-slate-400 pt-0.5">
              <span>Origin:</span>
              <span className="font-semibold text-slate-200">
                {activeQueuePlaying?.requesterName || nowPlayingSong?.requesterName || 'Streamer'}
              </span>
              <span className="text-slate-600">·</span>
              <span className="px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800/50 text-blue-400 text-[10px] font-bold uppercase">
                {activeQueuePlaying?.platform || nowPlayingSong?.platform || 'Local'}
              </span>
              {activeQueuePlaying?.externalUrl && (
                <button
                  onClick={() => window.open(activeQueuePlaying.externalUrl, '_blank', 'noopener,noreferrer')}
                  className="text-xs text-blue-400 hover:underline flex items-center gap-1 ml-1"
                >
                  <ExternalLink className="w-3 h-3" /> View Source
                </button>
              )}
            </div>

            {/* Live Audio Visualizer Bars */}
            <div className="h-7 flex items-end justify-center md:justify-start gap-1 pt-1">
              <span className={`w-1.5 rounded-full bg-blue-400 ${isPlayingNow ? 'animate-bar-1' : 'h-1.5'}`} />
              <span className={`w-1.5 rounded-full bg-sky-400 ${isPlayingNow ? 'animate-bar-2' : 'h-2'}`} />
              <span className={`w-1.5 rounded-full bg-blue-500 ${isPlayingNow ? 'animate-bar-3' : 'h-1.5'}`} />
              <span className={`w-1.5 rounded-full bg-cyan-400 ${isPlayingNow ? 'animate-bar-4' : 'h-3'}`} />
              <span className={`w-1.5 rounded-full bg-blue-400 ${isPlayingNow ? 'animate-bar-5' : 'h-1.5'}`} />
              <span className={`w-1.5 rounded-full bg-sky-300 ${isPlayingNow ? 'animate-bar-2' : 'h-2'}`} />
              <span className={`w-1.5 rounded-full bg-blue-600 ${isPlayingNow ? 'animate-bar-3' : 'h-1'}`} />
              <span className={`w-1.5 rounded-full bg-cyan-300 ${isPlayingNow ? 'animate-bar-1' : 'h-2'}`} />
            </div>
          </div>
        </div>

        {/* Song Request Error / Status Notice */}
        {(songRequestState?.lastError || songRequestState?.playbackStatus === 'preparing') && (
          <div
            className={`px-3 py-2 rounded-xl border text-xs ${
              songRequestState?.lastError
                ? 'bg-rose-950/50 border-rose-800/70 text-rose-300'
                : 'bg-blue-950/40 border-blue-800/60 text-blue-300'
            }`}
          >
            {songRequestState?.lastError || 'Memuat dan menyiapkan pemutaran lagu...'}
          </div>
        )}

        {/* Global Player Controls Bar */}
        <div className="flex items-center justify-between border-t border-slate-800/80 pt-3">
          <div className="text-xs text-slate-400">
            {isSongRequestActive ? (
              <span className={isPlayingNow ? 'text-emerald-400 font-semibold' : 'text-amber-300 font-semibold'}>
                {songRequestState?.audioPlaybackMode === 'native_android_media'
                  ? `Native Media (${songRequestState?.playbackStatus})`
                  : `Song Request (${songRequestState?.playbackStatus})`}
              </span>
            ) : isLocalEngineActive ? (
              <span className="text-emerald-400 font-semibold">HTML5 Engine Active</span>
            ) : (
              <span>Queue Standby</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onPrevTrack}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors"
              title="Previous Track"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                if (isSongRequestActive) {
                  onTogglePlay();
                } else if (isLocalEngineActive) {
                  audioEngine.togglePlay();
                } else {
                  onTogglePlay();
                }
              }}
              className="min-h-[48px] min-w-[48px] rounded-2xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-transform active:scale-95 shadow-lg shadow-blue-600/30"
              aria-label={isPlayingNow ? 'Pause' : 'Play'}
            >
              {isPlayingNow ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            <button
              onClick={onNextTrack}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors"
              title="Next Track"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-slate-400 block">Queue Remaining</span>
            <span className="text-xs font-bold text-white font-mono">
              {unifiedQueue.length} Tracks
            </span>
          </div>
        </div>
      </div>

      {/* Preset Packs Quick Loader */}
      <div className="p-4 rounded-xl bg-[#0e1626] border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            Stream Presets (Stage 1 Backwards Compatible):
          </span>
          <span className="text-[11px] text-slate-500">Quick load to queue</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onLoadPresetPack('synthwave')}
            className="px-3 py-1.5 rounded-lg bg-[#131f36] hover:bg-blue-900/40 border border-slate-700 hover:border-blue-700 text-xs text-slate-200 transition-colors"
          >
            ⚡ Synthwave Stream Pack
          </button>
          <button
            onClick={() => onLoadPresetPack('lofi')}
            className="px-3 py-1.5 rounded-lg bg-[#131f36] hover:bg-blue-900/40 border border-slate-700 hover:border-blue-700 text-xs text-slate-200 transition-colors"
          >
            ☕ Chill Lo-Fi Session
          </button>
          <button
            onClick={() => onLoadPresetPack('gaming')}
            className="px-3 py-1.5 rounded-lg bg-[#131f36] hover:bg-blue-900/40 border border-slate-700 hover:border-blue-700 text-xs text-slate-200 transition-colors"
          >
            🎮 High-Energy Esports
          </button>
        </div>
      </div>

      {/* 5-Tab Segmented Source Navigation */}
      <div className="flex overflow-x-auto gap-2 p-1 bg-[#080c16] rounded-xl border border-slate-800 scrollbar-none">
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'queue'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ListMusic className="w-4 h-4" /> Unified Queue
          {pendingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[10px] font-bold">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('local_audio')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'local_audio'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileAudio className="w-4 h-4" /> Local Audio Engine
          {localTracksMeta.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px]">
              {localTracksMeta.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('youtube')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'youtube'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="w-3.5 h-3.5 rounded bg-white text-red-600 font-black text-[9px] flex items-center justify-center">
            YT
          </span>
          YouTube Catalog
        </button>

        <button
          onClick={() => setActiveTab('spotify')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'spotify'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="w-3.5 h-3.5 rounded-full bg-white text-emerald-600 font-black text-[9px] flex items-center justify-center">
            SP
          </span>
          Spotify Catalog
        </button>

        <button
          onClick={() => setActiveTab('viewer_portal')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'viewer_portal'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Send className="w-4 h-4" /> Viewer Request Portal
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
        <ViewerRequestPortal
          queue={unifiedQueue}
          onSubmitRequest={handleViewerSubmit}
        />
      )}
    </div>
  );
};
