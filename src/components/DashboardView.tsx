import React from 'react';
import {
  AppSettings,
  OperatingMode,
  Scene,
  SongRequest,
  ActiveNav,
} from '../types';
import {
  Layers,
  Radio,
  Play,
  Pause,
  ArrowRight,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Battery,
  Thermometer,
  Disc3,
  ExternalLink,
} from 'lucide-react';

interface DashboardViewProps {
  settings: AppSettings;
  activeScene: Scene | null;
  nowPlayingSong: SongRequest | null;
  isPlayingMusic: boolean;
  queuedSongs: SongRequest[];
  onTogglePlayMusic: () => void;
  onSelectMode: (mode: OperatingMode) => void;
  onNavigate: (nav: ActiveNav) => void;
  onOpenModeModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  settings,
  activeScene,
  nowPlayingSong,
  isPlayingMusic,
  queuedSongs,
  onTogglePlayMusic,
  onSelectMode,
  onNavigate,
  onOpenModeModal,
}) => {
  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Hero / Studio Header Card */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0e1626] via-[#111c30] to-[#0a1120] border border-blue-950/80 p-5 md:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-blue-400 uppercase">
              <span>Android Streaming Companion</span>
              <span className="text-slate-500">·</span>
              <span>Stage 1 Foundation</span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1">
              SYNTXRR STREAM TOOLS
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-xl leading-relaxed">
              Mobile-first streaming control dashboard engineered for high-performance Android mobile broadcasting, low thermal footprint, and responsive overlay management.
            </p>
          </div>

          {/* Quick Hardware Status */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
            <div className="px-3 py-2 rounded-xl bg-[#080c16]/90 border border-slate-800 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <div className="text-left">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Broadcast State
                </div>
                <div className="text-xs font-bold text-amber-300">
                  Not Connected
                </div>
              </div>
            </div>

            <div className="px-3 py-2 rounded-xl bg-[#080c16]/90 border border-slate-800 flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <div className="text-left">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Target Ingest
                </div>
                <div className="text-xs font-bold text-white font-mono">
                  {settings.targetResolution} · {settings.frameRate}fps
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Operating Mode Selection Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Operating Mode Architecture
            </h2>
            <p className="text-xs text-slate-400">
              Select runtime configuration for Android companion execution
            </p>
          </div>
          <button
            onClick={onOpenModeModal}
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors min-h-[36px]"
          >
            Mode Details <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mode A Card */}
          <div
            onClick={() => onSelectMode('MODE_A_OVERLAY')}
            className={`relative p-5 rounded-2xl border transition-all cursor-pointer ${
              settings.operatingMode === 'MODE_A_OVERLAY'
                ? 'bg-[#101b33] border-blue-500/80 shadow-lg shadow-blue-950/40 ring-1 ring-blue-500'
                : 'bg-[#0e1626] border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Layers className="w-6 h-6" />
              </div>
              {settings.operatingMode === 'MODE_A_OVERLAY' ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-blue-400 bg-blue-950/90 border border-blue-700 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Current Selected
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 hover:text-slate-200">
                  Tap to Activate
                </span>
              )}
            </div>

            <h3 className="text-base font-bold text-white mt-4">
              Mode A: Floating Overlay
            </h3>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              Designed for in-game streaming (MLBB, PUBG Mobile, Free Fire). Renders a floating HUD window on top of Android games with minimal RAM impact.
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400">Memory Profile:</span>
                <span className="ml-1 text-emerald-400 font-semibold font-mono">~45 MB</span>
              </div>
              <div>
                <span className="text-slate-400">Overlay Window:</span>
                <span className="ml-1 text-slate-200 font-semibold">Pip &amp; HUD</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMode('MODE_A_OVERLAY');
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  settings.operatingMode === 'MODE_A_OVERLAY'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {settings.operatingMode === 'MODE_A_OVERLAY' ? 'Active Mode' : 'Select Mode A'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate('overlay');
                }}
                className="py-2.5 px-3 rounded-xl bg-[#080c16] border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
                title="Configure Overlay Studio"
              >
                Configure
              </button>
            </div>
          </div>

          {/* Mode B Card */}
          <div
            onClick={() => onSelectMode('MODE_B_ENCODER')}
            className={`relative p-5 rounded-2xl border transition-all cursor-pointer ${
              settings.operatingMode === 'MODE_B_ENCODER'
                ? 'bg-[#101b33] border-blue-500/80 shadow-lg shadow-blue-950/40 ring-1 ring-blue-500'
                : 'bg-[#0e1626] border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-xl bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                <Radio className="w-6 h-6" />
              </div>
              {settings.operatingMode === 'MODE_B_ENCODER' ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-sky-400 bg-sky-950/90 border border-sky-700 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Current Selected
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 hover:text-slate-200">
                  Tap to Activate
                </span>
              )}
            </div>

            <h3 className="text-base font-bold text-white mt-4">
              Mode B: Streaming Encoder
            </h3>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              Standalone streaming engine. Captures Camera, Internal Audio, Microphone, and Screen with RTMP/RTMPS push at 1080p 60fps.
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400">Pipeline:</span>
                <span className="ml-1 text-sky-400 font-semibold font-mono">1080p H.264</span>
              </div>
              <div>
                <span className="text-slate-400">RAM Est:</span>
                <span className="ml-1 text-amber-400 font-semibold font-mono">~130 MB</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMode('MODE_B_ENCODER');
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  settings.operatingMode === 'MODE_B_ENCODER'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {settings.operatingMode === 'MODE_B_ENCODER' ? 'Active Mode' : 'Select Mode B'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate('settings');
                }}
                className="py-2.5 px-3 rounded-xl bg-[#080c16] border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
                title="Configure RTMP & Encoder settings"
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Device Health & Balanced Performance Telemetry */}
      <section className="bg-[#0e1626] rounded-2xl border border-slate-800/90 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-blue-400" />
              Thermal &amp; Performance Telemetry
            </h2>
            <p className="text-xs text-slate-400">
              Balanced Android performance target: 1080p without thermal throttling
            </p>
          </div>
          <span className="text-[11px] font-semibold text-blue-300 bg-blue-950/60 border border-blue-900/60 px-2.5 py-1 rounded-md">
            Profile: Balanced
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Battery className="w-3.5 h-3.5 text-emerald-400" />
              <span>Est. Battery Drain</span>
            </div>
            <div className="text-base font-bold text-white font-mono">
              ~4.2%/hr
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Optimized governor</div>
          </div>

          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Thermometer className="w-3.5 h-3.5 text-amber-400" />
              <span>Target Temp</span>
            </div>
            <div className="text-base font-bold text-white font-mono">
              36.4°C
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5">Below 40°C threshold</div>
          </div>

          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>RAM Allocation</span>
            </div>
            <div className="text-base font-bold text-white font-mono">
              {settings.operatingMode === 'MODE_A_OVERLAY' ? '45 MB' : '128 MB'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Low memory impact</div>
          </div>

          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span>Ingest Target</span>
            </div>
            <div className="text-base font-bold text-white font-mono">
              {settings.targetResolution} @ {settings.frameRate}fps
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">6000 kbps CBR</div>
          </div>
        </div>
      </section>

      {/* Quick Access Grid: Music Center & Overlay Studio */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Music Center Quick Card */}
        <div className="p-5 rounded-2xl bg-[#0e1626] border border-slate-800/90 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <Disc3 className={`w-4 h-4 ${isPlayingMusic ? 'animate-spin' : ''}`} />
                Music Center Glance
              </span>
              <button
                onClick={() => onNavigate('music')}
                className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1"
              >
                Open Center <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            {nowPlayingSong ? (
              <div className="mt-4 p-3.5 rounded-xl bg-[#080c16] border border-slate-800 flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-blue-900/30 border border-blue-700/50 flex items-center justify-center text-blue-400 shrink-0">
                  <Disc3 className={`w-6 h-6 ${isPlayingMusic ? 'text-blue-400 animate-spin' : 'text-slate-400'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">
                    {nowPlayingSong.title}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {nowPlayingSong.artist}
                  </div>
                  <div className="text-[10px] text-blue-400 mt-1">
                    Req by: {nowPlayingSong.requesterName} ({nowPlayingSong.platform})
                  </div>
                </div>
                <button
                  onClick={onTogglePlayMusic}
                  className="min-h-[44px] min-w-[44px] rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-colors shrink-0"
                  aria-label={isPlayingMusic ? 'Pause track' : 'Play track'}
                >
                  {isPlayingMusic ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
              </div>
            ) : (
              <div className="mt-4 p-4 rounded-xl bg-[#080c16] border border-slate-800 text-center text-xs text-slate-400">
                No active track loaded
              </div>
            )}

            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>Upcoming Queue:</span>
              <span className="font-semibold text-slate-200">
                {queuedSongs.length} track{queuedSongs.length === 1 ? '' : 's'} waiting
              </span>
            </div>
          </div>

          <button
            onClick={() => onNavigate('music')}
            className="mt-4 w-full py-2.5 px-4 rounded-xl bg-[#131f36] hover:bg-[#182744] border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
          >
            Manage Music Requests &amp; Audio
          </button>
        </div>

        {/* Overlay Studio Quick Card */}
        <div className="p-5 rounded-2xl bg-[#0e1626] border border-slate-800/90 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                Overlay Studio Glance
              </span>
              <button
                onClick={() => onNavigate('overlay')}
                className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1"
              >
                Open Studio <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            {activeScene ? (
              <div className="mt-4 p-3.5 rounded-xl bg-[#080c16] border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    {activeScene.name}
                  </div>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-900/60 px-2 py-0.5 rounded">
                    Active Scene
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>Now Playing:</span>
                    <span className={activeScene.overlayConfig.nowPlaying.enabled ? 'text-blue-400' : 'text-slate-500'}>
                      {activeScene.overlayConfig.nowPlaying.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Live Chat:</span>
                    <span className={activeScene.overlayConfig.liveChat.enabled ? 'text-blue-400' : 'text-slate-500'}>
                      {activeScene.overlayConfig.liveChat.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Event Alerts:</span>
                    <span className={activeScene.overlayConfig.eventAlert.enabled ? 'text-blue-400' : 'text-slate-500'}>
                      {activeScene.overlayConfig.eventAlert.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Music Request:</span>
                    <span className={activeScene.overlayConfig.musicRequest.enabled ? 'text-blue-400' : 'text-slate-500'}>
                      {activeScene.overlayConfig.musicRequest.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <button
            onClick={() => onNavigate('overlay')}
            className="mt-4 w-full py-2.5 px-4 rounded-xl bg-[#131f36] hover:bg-[#182744] border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
          >
            Edit Overlay Canvas &amp; Positioning
          </button>
        </div>
      </section>

      {/* Realistic Stage 1 Architecture Transparency Notice */}
      <section className="p-4 rounded-xl bg-[#0a1120] border border-blue-900/40 text-xs text-slate-300 space-y-2">
        <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span>Stage 1 Android Companion Prototype Note</span>
        </div>
        <p className="text-[12px] text-slate-300 leading-relaxed">
          All settings, overlay layers, and scenes are persistently stored in your browser's local <strong>IndexedDB</strong>. Broadcast encoders and platform event listeners (RTMP/TikTok LIVE/Twitch) will attach through the future Kotlin Android Native Service bridge. No fake streaming connections are claimed.
        </p>
      </section>
    </div>
  );
};
