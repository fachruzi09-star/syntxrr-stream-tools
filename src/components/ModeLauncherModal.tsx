import React from 'react';
import { OperatingMode, AppSettings } from '../types';
import {
  X,
  Layers,
  Radio,
  Check,
  Video,
  Mic,
  Monitor,
  Flame,
  Battery,
  Cpu,
  Info,
} from 'lucide-react';

interface ModeLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: OperatingMode;
  settings: AppSettings;
  onSelectMode: (mode: OperatingMode) => void;
}

export const ModeLauncherModal: React.FC<ModeLauncherModalProps> = ({
  isOpen,
  onClose,
  currentMode,
  settings,
  onSelectMode,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mode-launcher-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl bg-[#0e1626] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h2 id="mode-launcher-title" className="text-base font-bold text-white flex items-center gap-2">
              Operating Mode Architecture
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select or test the active Android companion runtime mode
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Mode Selector Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mode A */}
            <div
              onClick={() => onSelectMode('MODE_A_OVERLAY')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                currentMode === 'MODE_A_OVERLAY'
                  ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-950/50 ring-1 ring-blue-500'
                  : 'bg-[#131f36] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <Layers className="w-5 h-5" />
                </div>
                {currentMode === 'MODE_A_OVERLAY' && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded-full border border-blue-800">
                    <Check className="w-3 h-3" /> Active Mode
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-white mt-3">
                Mode A: Floating Overlay
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Render lightweight transparent HUD on top of Android games and third-party apps via system overlay window permission.
              </p>

              <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-[11px] text-slate-400">
                <div className="flex items-center justify-between">
                  <span>RAM Overhead</span>
                  <span className="font-mono text-emerald-400 font-semibold">~45 MB (Low)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Battery Impact</span>
                  <span className="font-mono text-emerald-400 font-semibold">Minimal (&lt;1.8%/hr)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Target Use Case</span>
                  <span className="text-slate-300">Gaming &amp; Chat Monitoring</span>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMode('MODE_A_OVERLAY');
                }}
                className={`mt-4 w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  currentMode === 'MODE_A_OVERLAY'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {currentMode === 'MODE_A_OVERLAY' ? 'Mode A Active' : 'Switch to Mode A'}
              </button>
            </div>

            {/* Mode B */}
            <div
              onClick={() => onSelectMode('MODE_B_ENCODER')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                currentMode === 'MODE_B_ENCODER'
                  ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-950/50 ring-1 ring-blue-500'
                  : 'bg-[#131f36] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                  <Radio className="w-5 h-5" />
                </div>
                {currentMode === 'MODE_B_ENCODER' && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded-full border border-sky-800">
                    <Check className="w-3 h-3" /> Active Mode
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-white mt-3">
                Mode B: Streaming Encoder
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Full streaming engine packaging Camera, Mic, Screen Capture, and RTMP/RTMPS broadcast at 1080p resolution.
              </p>

              <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-[11px] text-slate-400">
                <div className="flex items-center justify-between">
                  <span>RAM Overhead</span>
                  <span className="font-mono text-amber-400 font-semibold">~135 MB (Balanced)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Encoder Profile</span>
                  <span className="font-mono text-sky-400 font-semibold">1080p @ {settings.frameRate} FPS</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Target Protocol</span>
                  <span className="text-slate-300">RTMP / RTMPS Broadcast</span>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMode('MODE_B_ENCODER');
                }}
                className={`mt-4 w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  currentMode === 'MODE_B_ENCODER'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {currentMode === 'MODE_B_ENCODER' ? 'Mode B Active' : 'Switch to Mode B'}
              </button>
            </div>
          </div>

          {/* Runtime Mode Preview Simulation Box */}
          <div className="bg-[#080c16] rounded-xl border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Monitor className="w-4 h-4 text-blue-400" />
                {currentMode === 'MODE_A_OVERLAY'
                  ? 'Mode A: Floating Overlay HUD Preview'
                  : 'Mode B: 1080p Encoder Pipeline Preview'}
              </span>
              <span className="text-[11px] text-amber-400 bg-amber-950/60 border border-amber-900/60 px-2 py-0.5 rounded">
                Prototype Stage
              </span>
            </div>

            {currentMode === 'MODE_A_OVERLAY' ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-[#0e1626] border border-blue-900/40 text-xs text-slate-300 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5">
                    <span>Android SYSTEM_ALERT_WINDOW Status</span>
                    <span className="text-blue-400 font-medium">Ready for native intent</span>
                  </div>
                  <p className="leading-relaxed">
                    When running on an Android device with the native companion service, SYNTXRR renders a floating pill that stays pinned over MLBB, PUBG, or TikTok.
                  </p>
                  {/* Floating Pill Mockup */}
                  <div className="my-2 p-2.5 rounded-lg bg-blue-950/80 border border-blue-500/60 flex items-center justify-between max-w-sm mx-auto shadow-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                      <span className="text-xs font-semibold text-white">SYNTXRR HUD</span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-mono">
                      Queue: 3 · Chat: Active
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-[#0e1626] border border-slate-800">
                    <Video className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                    <div className="font-semibold text-white">Video Source</div>
                    <div className="text-[10px] text-slate-400">Camera / Screen</div>
                  </div>
                  <div className="p-2 rounded bg-[#0e1626] border border-slate-800">
                    <Mic className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                    <div className="font-semibold text-white">Audio Source</div>
                    <div className="text-[10px] text-slate-400">Mic + Internal</div>
                  </div>
                  <div className="p-2 rounded bg-[#0e1626] border border-slate-800">
                    <Cpu className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                    <div className="font-semibold text-white">Hardware Muxer</div>
                    <div className="text-[10px] text-slate-400">H.264 / AAC</div>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[#0e1626] border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                  <span>RTMP Target:</span>
                  <span className="font-mono text-slate-400 truncate max-w-[240px]">
                    {settings.rtmpServer}
                  </span>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-950/30 border border-blue-900/50 text-xs text-blue-300/90">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Development Rule Verified: Real live broadcast connections remain disconnected. In Stage 1, all controls, configurations, and mock streams operate locally in IndexedDB.
              </p>
            </div>
          </div>

          {/* Device Profile Specs */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[#131f36] border border-slate-800 flex items-center gap-2.5">
              <Battery className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-400">Battery Drain</div>
                <div className="font-bold text-white">~4.2%/hr Target</div>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#131f36] border border-slate-800 flex items-center gap-2.5">
              <Flame className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-400">Device Temp</div>
                <div className="font-bold text-white">&lt;38°C Balanced</div>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#131f36] border border-slate-800 flex items-center gap-2.5">
              <Cpu className="w-4 h-4 text-sky-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-400">Resolution</div>
                <div className="font-bold text-white">{settings.targetResolution}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-[#080c16]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
          >
            Apply &amp; Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
