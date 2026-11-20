import React, { useState, useEffect, useRef } from 'react';
import { LocalAudioTrackMeta } from '../../types';
import { audioEngine, AudioEngineState } from '../../services/localAudioEngine';
import { showInAppNotice } from '../../services/uiNotice';
import {
  FileAudio,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Trash2,
  ListPlus,
  AlertCircle,
  FileMusic,
  Info,
} from 'lucide-react';

interface LocalAudioPlayerProps {
  localTracksMeta: LocalAudioTrackMeta[];
  localFilesMap: Map<string, File>;
  onAddLocalFiles: (files: File[]) => void;
  onRemoveTrack: (id: string) => void;
  onAddTrackToQueue: (track: LocalAudioTrackMeta) => void;
}

export const LocalAudioPlayer: React.FC<LocalAudioPlayerProps> = ({
  localTracksMeta,
  localFilesMap,
  onAddLocalFiles,
  onRemoveTrack,
  onAddTrackToQueue,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [audioState, setAudioState] = useState<AudioEngineState>(audioEngine.getState());
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekVal, setSeekVal] = useState(0);

  // Subscribe to real audio engine events
  useEffect(() => {
    const unsubscribe = audioEngine.subscribe((state) => {
      setAudioState(state);
      if (!isSeeking) {
        setSeekVal(state.currentTime);
      }
    });
    return () => unsubscribe();
  }, [isSeeking]);

  // Handle file input selection
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onAddLocalFiles(Array.from(files));
      e.target.value = '';
    }
  };

  const handlePlayLocalTrack = async (trackMeta: LocalAudioTrackMeta) => {
    const file = localFilesMap.get(trackMeta.id);
    if (!file) {
      showInAppNotice({
        tone: 'warn',
        title: 'Berkas Perlu Dipilih Ulang',
        message: `File "${trackMeta.filename}" perlu dipilih ulang karena browser membatasi akses otomatis path lokal antar sesi.`,
      });
      return;
    }
    await audioEngine.loadAndPlayFile(trackMeta.id, trackMeta.title, trackMeta.artist, file);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setSeekVal(val);
  };

  const handleSeekCommit = () => {
    audioEngine.seek(seekVal);
    setIsSeeking(false);
  };

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '0:00';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleNextInPlaylist = () => {
    if (localTracksMeta.length === 0) return;
    const currentIndex = localTracksMeta.findIndex((t) => t.id === audioState.currentTrackId);
    const nextIndex = (currentIndex + 1) % localTracksMeta.length;
    handlePlayLocalTrack(localTracksMeta[nextIndex]);
  };

  const handlePrevInPlaylist = () => {
    if (localTracksMeta.length === 0) return;
    const currentIndex = localTracksMeta.findIndex((t) => t.id === audioState.currentTrackId);
    const prevIndex = (currentIndex - 1 + localTracksMeta.length) % localTracksMeta.length;
    handlePlayLocalTrack(localTracksMeta[prevIndex]);
  };

  const activeTrackMeta = localTracksMeta.find((t) => t.id === audioState.currentTrackId);
  const totalDuration = audioState.duration || activeTrackMeta?.duration || 0;
  const progressPercent = totalDuration > 0 ? Math.min(100, (seekVal / totalDuration) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Real Local Audio Player Deck */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                audioState.isPlaying ? 'bg-[var(--app-ok)]' : 'bg-[var(--app-text-muted)]'
              }`}
            />
            <span
              className={`text-[11px] font-bold uppercase tracking-wider ${
                audioState.isPlaying ? 'text-[var(--app-ok)]' : 'text-[var(--app-text-secondary)]'
              }`}
            >
              HTML5 Local Audio Engine · {audioState.isPlaying ? 'Active Playback' : 'Idle'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <FileAudio className="w-4 h-4" /> Pick Audio Files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.aac,.m4a,.flac,.webm"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>

        {/* Playback Error Alert */}
        {audioState.error && (
          <div className="p-3.5 rounded-xl bg-[var(--app-error-soft)] border border-rose-500/35 text-xs text-[var(--app-error)] flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Audio Engine Error:</strong> {audioState.error}
            </div>
          </div>
        )}

        {/* Current Track Info & Volume */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-display font-bold text-[var(--app-text)] truncate">
              {audioState.title || (localTracksMeta.length > 0 ? 'Select a track to play' : 'No local audio loaded')}
            </div>
            <div className="text-xs text-[var(--app-text-secondary)] truncate mt-0.5">
              {audioState.artist ||
                (localTracksMeta.length > 0
                  ? 'Ready for playback'
                  : 'Pick MP3/WAV/FLAC files from device storage')}
            </div>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 bg-[var(--app-surface-muted)] px-2.5 py-1 rounded-xl border border-[var(--app-border)]">
            <button
              type="button"
              onClick={() => audioEngine.toggleMute()}
              className="min-h-[44px] min-w-[44px] -ml-1.5 rounded-lg text-[var(--app-text-secondary)] hover:text-[var(--app-text)] flex items-center justify-center transition-colors"
              title={audioState.isMuted ? 'Unmute' : 'Mute'}
            >
              {audioState.isMuted ? (
                <VolumeX className="w-4 h-4 text-[var(--app-error)]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[var(--app-accent-text)]" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioState.isMuted ? 0 : audioState.volume}
              onChange={(e) => audioEngine.setVolume(parseFloat(e.target.value))}
              aria-label="Local audio volume"
              className="w-20 accent-[var(--app-accent)] h-2 cursor-pointer"
            />
            <span className="text-[11px] font-mono-num text-[var(--app-text-secondary)] w-9 text-right">
              {Math.round((audioState.isMuted ? 0 : audioState.volume) * 100)}%
            </span>
          </div>
        </div>

        {/* Interactive Seek Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="h-1.5 w-full rounded-full bg-[var(--app-surface-muted)] overflow-hidden">
            <div
              className="h-full bg-[var(--app-accent)] transition-[width] duration-150"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="relative flex items-center">
            <input
              type="range"
              min="0"
              max={totalDuration || 100}
              step="0.5"
              value={seekVal}
              onMouseDown={() => setIsSeeking(true)}
              onTouchStart={() => setIsSeeking(true)}
              onChange={handleSeekChange}
              onMouseUp={handleSeekCommit}
              onTouchEnd={handleSeekCommit}
              disabled={totalDuration === 0}
              aria-label="Seek track position"
              className="w-full accent-[var(--app-accent)] h-2 bg-[var(--app-surface-muted)] rounded-lg cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-[11px] font-mono-num text-[var(--app-text-muted)]">
            <span>{formatSeconds(seekVal)}</span>
            <span>{formatSeconds(totalDuration)}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-4 pt-1">
          <button
            type="button"
            onClick={handlePrevInPlaylist}
            disabled={localTracksMeta.length === 0}
            className="min-h-[44px] min-w-[44px] rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)] flex items-center justify-center transition-colors disabled:opacity-40"
            title="Previous Local Track"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => audioEngine.togglePlay()}
            disabled={!audioState.currentTrackId && localTracksMeta.length === 0}
            className="min-h-[52px] min-w-[52px] rounded-2xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] flex items-center justify-center transition-transform active:scale-95 shadow-sm disabled:opacity-40"
            aria-label={audioState.isPlaying ? 'Pause' : 'Play'}
          >
            {audioState.isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleNextInPlaylist}
            disabled={localTracksMeta.length === 0}
            className="min-h-[44px] min-w-[44px] rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)] flex items-center justify-center transition-colors disabled:opacity-40"
            title="Next Local Track"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Local Files Playlist Section */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-display font-bold text-[var(--app-text)] flex items-center gap-2">
              <FileMusic className="w-4 h-4 text-[var(--app-accent-text)]" />
              Device Audio Playlist ({localTracksMeta.length})
            </h3>
            <p className="text-xs text-[var(--app-text-secondary)]">
              Offline browser playback engine for your royalty-free stream music
            </p>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] hover:border-[var(--app-accent-border)] text-xs font-semibold text-[var(--app-accent-text)] flex items-center gap-1 transition-colors"
          >
            + Add Files
          </button>
        </div>

        {localTracksMeta.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] text-center space-y-3">
            <FileAudio className="w-10 h-10 text-[var(--app-text-muted)] mx-auto" />
            <div className="text-sm font-display font-bold text-[var(--app-text)]">
              No Local Audio Files Loaded
            </div>
            <p className="text-xs text-[var(--app-text-secondary)] max-w-sm mx-auto leading-relaxed">
              Select MP3, WAV, OGG, or FLAC audio files from your Android phone storage. Files play directly through your browser with zero server uploads.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <FileAudio className="w-4 h-4" /> Pick Audio Files
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {localTracksMeta.map((track) => {
              const isCurrent = audioState.currentTrackId === track.id;
              const hasFileInSession = localFilesMap.has(track.id);

              return (
                <div
                  key={track.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                    isCurrent
                      ? 'bg-[var(--app-accent-soft)] border-[var(--app-accent-border)] shadow-sm'
                      : 'bg-[var(--app-surface)] border-[var(--app-border)] hover:border-[var(--app-border-strong)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => handlePlayLocalTrack(track)}
                      className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                        isCurrent && audioState.isPlaying
                          ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                          : 'bg-[var(--app-surface-muted)] text-[var(--app-accent-text)] hover:bg-[var(--app-accent)] hover:text-[var(--app-accent-ink)] border border-[var(--app-border)]'
                      }`}
                      title={isCurrent && audioState.isPlaying ? 'Pause track' : 'Play track'}
                    >
                      {isCurrent && audioState.isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--app-text)] truncate flex items-center gap-2">
                        <span className="truncate">{track.title}</span>
                        {isCurrent && (
                          <span className="shrink-0 text-[10px] font-bold text-[var(--app-ok)] bg-[var(--app-ok-soft)] px-1.5 py-0.5 rounded border border-emerald-500/30">
                            Now Playing
                          </span>
                        )}
                        {!hasFileInSession && (
                          <span className="shrink-0 text-[10px] font-semibold text-[var(--app-warn)] bg-[var(--app-warn-soft)] px-1.5 py-0.5 rounded border border-amber-500/30">
                            Pilih Ulang
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--app-text-secondary)] truncate mt-0.5">
                        {track.artist} · <span className="font-mono-num">{formatSeconds(track.duration)}</span> ·{' '}
                        <span className="font-mono-num">{(track.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAddTrackToQueue(track)}
                      className="min-h-[44px] px-3 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-accent-soft)] border border-[var(--app-border)] hover:border-[var(--app-accent-border)] text-xs font-semibold text-[var(--app-text-secondary)] hover:text-[var(--app-accent-text)] flex items-center gap-1.5 transition-colors"
                      title="Add this local track to the unified stream queue"
                    >
                      <ListPlus className="w-4 h-4" />
                      <span className="hidden sm:inline">Queue</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onRemoveTrack(track.id)}
                      className="min-h-[44px] min-w-[44px] rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-error)] hover:bg-[var(--app-error-soft)] flex items-center justify-center transition-colors"
                      title="Remove from local list"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Audio Engine Transparency Box */}
      <div className="p-4 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-start gap-2.5 text-xs text-[var(--app-text-secondary)]">
        <Info className="w-4 h-4 text-[var(--app-accent-text)] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-[var(--app-text)]">Local Audio Security:</strong> Playback runs exclusively inside your device&apos;s HTML5 audio subsystem. Audio files remain on your local device and are not uploaded to any remote servers.
        </p>
      </div>
    </div>
  );
};
