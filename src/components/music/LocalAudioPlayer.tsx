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
  CheckCircle2,
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
      {/* Real Local Audio Player Box */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-blue-950/80 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                audioState.isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              HTML5 Local Audio Engine · {audioState.isPlaying ? 'Active Playback' : 'Idle'}
            </span>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[40px] px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md"
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
          <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-900/60 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Audio Engine Error:</strong> {audioState.error}
            </div>
          </div>
        )}

        {/* Current Track Info */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-bold text-white truncate">
              {audioState.title || (localTracksMeta.length > 0 ? 'Select a track to play' : 'No local audio loaded')}
            </div>
            <div className="text-xs text-slate-400 truncate mt-0.5">
              {audioState.artist || (localTracksMeta.length > 0 ? 'Ready for playback' : 'Pick MP3/WAV/FLAC files from device storage')}
            </div>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 bg-[#080c16] px-3 py-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => audioEngine.toggleMute()}
              className="text-slate-400 hover:text-white transition-colors"
              title={audioState.isMuted ? 'Unmute' : 'Mute'}
            >
              {audioState.isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-slate-300" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioState.isMuted ? 0 : audioState.volume}
              onChange={(e) => audioEngine.setVolume(parseFloat(e.target.value))}
              className="w-20 accent-blue-500 h-1.5"
            />
            <span className="text-[10px] font-mono text-slate-400 w-7 text-right">
              {Math.round((audioState.isMuted ? 0 : audioState.volume) * 100)}%
            </span>
          </div>
        </div>

        {/* Interactive Seek Bar */}
        <div className="space-y-1 pt-1">
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
              className="w-full accent-blue-500 h-2 bg-slate-900 rounded-lg cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>{formatSeconds(seekVal)}</span>
            <span>{formatSeconds(totalDuration)}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            onClick={handlePrevInPlaylist}
            disabled={localTracksMeta.length === 0}
            className="min-h-[44px] min-w-[44px] rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 flex items-center justify-center transition-colors disabled:opacity-40"
            title="Previous Local Track"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={() => audioEngine.togglePlay()}
            disabled={!audioState.currentTrackId && localTracksMeta.length === 0}
            className="min-h-[52px] min-w-[52px] rounded-2xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-transform active:scale-95 shadow-lg shadow-blue-600/30 disabled:opacity-40"
            aria-label={audioState.isPlaying ? 'Pause' : 'Play'}
          >
            {audioState.isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </button>

          <button
            onClick={handleNextInPlaylist}
            disabled={localTracksMeta.length === 0}
            className="min-h-[44px] min-w-[44px] rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 flex items-center justify-center transition-colors disabled:opacity-40"
            title="Next Local Track"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Local Files Playlist Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileMusic className="w-4 h-4 text-blue-400" />
              Device Audio Playlist ({localTracksMeta.length})
            </h3>
            <p className="text-xs text-slate-400">
              Offline browser playback engine for your royalty-free stream music
            </p>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 min-h-[36px]"
          >
            + Add Files
          </button>
        </div>

        {localTracksMeta.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#0e1626] border border-slate-800 text-center space-y-3">
            <FileAudio className="w-10 h-10 text-slate-600 mx-auto" />
            <div className="text-sm font-semibold text-slate-300">
              No Local Audio Files Loaded
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              Select MP3, WAV, OGG, or FLAC audio files from your Android phone storage. Files play directly through your browser with zero server uploads.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
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
                      ? 'bg-blue-950/40 border-blue-500/80 shadow-md ring-1 ring-blue-500/40'
                      : 'bg-[#0e1626] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => handlePlayLocalTrack(track)}
                      className={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                        isCurrent && audioState.isPlaying
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#080c16] text-blue-400 hover:bg-blue-600 hover:text-white border border-slate-800'
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
                      <div className="text-xs font-bold text-white truncate flex items-center gap-2">
                        <span>{track.title}</span>
                        {isCurrent && (
                          <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800">
                            Now Playing
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {track.artist} · <span className="font-mono">{formatSeconds(track.duration)}</span> ·{' '}
                        <span>{(track.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onAddTrackToQueue(track)}
                      className="min-h-[36px] px-2.5 rounded-lg bg-[#080c16] hover:bg-blue-900/40 border border-slate-800 hover:border-blue-700 text-xs font-semibold text-slate-300 hover:text-blue-300 flex items-center gap-1 transition-colors"
                      title="Add this local track to the unified stream queue"
                    >
                      <ListPlus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Queue</span>
                    </button>

                    <button
                      onClick={() => onRemoveTrack(track.id)}
                      className="min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 flex items-center justify-center transition-colors"
                      title="Remove from local list"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Audio Engine Transparency Box */}
      <div className="p-3.5 rounded-xl bg-[#0a1120] border border-blue-900/40 flex items-start gap-2.5 text-xs text-slate-300">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Local Audio Security:</strong> Playback runs exclusively inside your device&apos;s HTML5 audio subsystem. Audio files remain on your local device and are not uploaded to any remote servers.
        </p>
      </div>
    </div>
  );
};
