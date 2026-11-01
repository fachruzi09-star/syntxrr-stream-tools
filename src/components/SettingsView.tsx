import React, { useState, useRef } from 'react';
import { AppSettings, ResolutionTarget, FrameRate, PerformanceProfile } from '../types';
import {
  Settings,
  Monitor,
  Cpu,
  Battery,
  Database,
  Download,
  Upload,
  RotateCcw,
  ShieldAlert,
  Info,
  Check,
  Eye,
  EyeOff,
  Flame,
  Radio,
  FileCode,
  Music2,
  KeyRound,
  ExternalLink,
} from 'lucide-react';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onExportData: () => Promise<void>;
  onImportData: (json: string) => Promise<boolean>;
  onResetDefaults: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onExportData,
  onImportData,
  onResetDefaults,
}) => {
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [showYouTubeKey, setShowYouTubeKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpdate = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    onUpdateSettings(updated);
    setSaveStatus('Saved to IndexedDB');
    setTimeout(() => setSaveStatus(null), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = await onImportData(content);
        if (success) {
          setSaveStatus('Backup restored successfully!');
          setTimeout(() => setSaveStatus(null), 2500);
        } else {
          alert('Failed to parse backup JSON file.');
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-400" />
            Studio Settings
          </h1>
          <p className="text-xs text-slate-400">
            Performance governors, broadcast resolution targets, music API keys, and local persistence
          </p>
        </div>

        {saveStatus && (
          <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5 self-start sm:self-auto">
            <Check className="w-4 h-4" /> {saveStatus}
          </span>
        )}
      </div>

      {/* Stage 2: Music Catalog & API Integrations Section */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-blue-900/60 shadow-lg space-y-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-blue-400 uppercase">
            <span>Stage 2 Feature</span>
            <span className="text-slate-500">·</span>
            <span>Music Center Connectors</span>
          </div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 mt-0.5">
            <Music2 className="w-4 h-4 text-blue-400" />
            Music Catalog &amp; API Integrations
          </h2>
          <p className="text-xs text-slate-400">
            Configure official YouTube Data API and Spotify Developer credentials for metadata searches
          </p>
        </div>

        <div className="space-y-4 text-xs">
          {/* YouTube Data API Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-red-600 text-white font-black text-[8px] flex items-center justify-center">
                  YT
                </span>
                YouTube Data API v3 Key
              </label>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
              >
                Get API Key <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="relative">
              <input
                type={showYouTubeKey ? 'text' : 'password'}
                value={settings.youtubeApiKey || ''}
                onChange={(e) => handleUpdate('youtubeApiKey', e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white font-mono focus:outline-none focus:border-red-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowYouTubeKey(!showYouTubeKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                title={showYouTubeKey ? 'Hide key' : 'Show key'}
              >
                {showYouTubeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Stored locally in IndexedDB. Used exclusively for searching video titles and thumbnails.
            </p>
          </div>

          {/* Spotify Client ID */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-black font-black text-[8px] flex items-center justify-center">
                  ●
                </span>
                Spotify Developer Client ID
              </label>
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
              >
                Spotify Dashboard <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <input
              type="text"
              value={settings.spotifyClientId || ''}
              onChange={(e) => handleUpdate('spotifyClientId', e.target.value)}
              placeholder="e.g. 7d8f9a0c2e..."
              className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Redirect URI to configure in Spotify Developer Dashboard: <code className="text-blue-300">{typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback'}</code>
            </p>
          </div>

          {/* Local Audio Engine Preferences */}
          <div className="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Local Audio Default Volume ({Math.round((settings.audioVolume ?? 0.85) * 100)}%)
              </label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={settings.audioVolume ?? 0.85}
                onChange={(e) => handleUpdate('audioVolume', parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[#080c16] border border-slate-800">
              <div>
                <span className="font-semibold text-white block">Auto-Play Next Local Track</span>
                <span className="text-[10px] text-slate-400">Play next file in playlist upon track completion</span>
              </div>
              <input
                type="checkbox"
                checked={settings.audioAutoplayNext ?? true}
                onChange={(e) => handleUpdate('audioAutoplayNext', e.target.checked)}
                className="rounded accent-blue-500 w-4 h-4 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Target Resolution & Broadcast Pipeline (Stage 1 Preserved) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <Monitor className="w-4 h-4 text-blue-400" />
            Stream Target Resolution &amp; Framerate
          </h2>
          <p className="text-xs text-slate-400">
            Target streaming resolution calibrated for mobile Android hardware encoders
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-2">
              Target Resolution
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['720p', '1080p', '1440p'] as ResolutionTarget[]).map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => handleUpdate('targetResolution', res)}
                  className={`min-h-[44px] rounded-xl border font-bold text-xs transition-all ${
                    settings.targetResolution === res
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                      : 'bg-[#080c16] text-slate-300 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {res}
                  {res === '1080p' && (
                    <span className="block text-[9px] font-normal text-blue-200">
                      Standard
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-2">
              Frame Rate (FPS)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([30, 60] as FrameRate[]).map((fps) => (
                <button
                  key={fps}
                  type="button"
                  onClick={() => handleUpdate('frameRate', fps)}
                  className={`min-h-[44px] rounded-xl border font-bold text-xs transition-all ${
                    settings.frameRate === fps
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                      : 'bg-[#080c16] text-slate-300 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {fps} FPS
                  <span className="block text-[9px] font-normal text-blue-200">
                    {fps === 60 ? 'Smooth Gaming' : 'Battery Saver'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Video Bitrate Slider */}
        <div className="pt-2 border-t border-slate-800 text-xs">
          <div className="flex justify-between text-slate-300 mb-1">
            <span>Video Bitrate Target:</span>
            <span className="font-mono text-blue-400 font-bold">
              {settings.videoBitrateKbps} kbps ({Math.round(settings.videoBitrateKbps / 1000)} Mbps)
            </span>
          </div>
          <input
            type="range"
            min="2500"
            max="9000"
            step="250"
            value={settings.videoBitrateKbps}
            onChange={(e) => handleUpdate('videoBitrateKbps', parseInt(e.target.value, 10))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
            <span>2500 kbps (720p Low)</span>
            <span>6000 kbps (1080p Balanced)</span>
            <span>9000 kbps (High Quality)</span>
          </div>
        </div>
      </div>

      {/* Performance Profile Governor (Stage 1 Preserved) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            Device Performance Profile
          </h2>
          <p className="text-xs text-slate-400">
            Balancing RAM usage, battery drain, and thermal throttling on Android
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              {
                id: 'battery_saver' as PerformanceProfile,
                title: 'Battery Saver',
                icon: Battery,
                desc: 'Limits background polling, caps overlay FPS, <2% battery/hr',
                badge: 'Coolest (<34°C)',
              },
              {
                id: 'balanced' as PerformanceProfile,
                title: 'Balanced (Recommended)',
                icon: Cpu,
                desc: 'Target 1080p stream with balanced thermals and stable 60 FPS',
                badge: 'Balanced (~36°C)',
              },
              {
                id: 'performance' as PerformanceProfile,
                title: 'High Performance',
                icon: Flame,
                desc: 'Max hardware encoder priority, instant overlay responsiveness',
                badge: 'Warm (~39°C)',
              },
            ] as const
          ).map((prof) => {
            const Icon = prof.icon;
            const isSelected = settings.performanceProfile === prof.id;

            return (
              <div
                key={prof.id}
                onClick={() => handleUpdate('performanceProfile', prof.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-blue-950/50 border-blue-500 ring-1 ring-blue-500 shadow-lg'
                    : 'bg-[#080c16] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className="text-[10px] font-mono text-slate-400">{prof.badge}</span>
                  </div>
                  <h3 className="text-xs font-bold text-white mt-2">{prof.title}</h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    {prof.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RTMP & Ingest Settings Card (Stage 1 Preserved) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-400" />
            RTMP / Broadcast Credentials
          </h2>
          <p className="text-xs text-slate-400">
            Streaming server configuration saved locally in IndexedDB
          </p>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              RTMP Ingest Server URL
            </label>
            <input
              type="text"
              value={settings.rtmpServer}
              onChange={(e) => handleUpdate('rtmpServer', e.target.value)}
              placeholder="rtmp://live.twitch.tv/app or rtmp://a.rtmp.youtube.com/live2"
              className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Stream Key
            </label>
            <div className="relative">
              <input
                type={showStreamKey ? 'text' : 'password'}
                value={settings.streamKey}
                onChange={(e) => handleUpdate('streamKey', e.target.value)}
                placeholder="live_..."
                className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white font-mono focus:outline-none focus:border-blue-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowStreamKey(!showStreamKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showStreamKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Prototype Connection Status Notice */}
        <div className="p-3 rounded-xl bg-[#080c16] border border-amber-900/50 flex items-start gap-2 text-xs text-slate-300">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Streaming status is <strong>Not Connected</strong>. RTMP keys are safely stored in your local browser sandbox and will authenticate when the Android MediaProjection encoder service is compiled.
          </p>
        </div>
      </div>

      {/* Local IndexedDB Data Management Card (Stage 1 Preserved) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            Local Data &amp; IndexedDB Management
          </h2>
          <p className="text-xs text-slate-400">
            Export, import, or reset all scene setups and studio configurations
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <button
            onClick={onExportData}
            className="min-h-[44px] p-3 rounded-xl bg-[#080c16] hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 text-blue-400" />
            Export Backup (.json)
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] p-3 rounded-xl bg-[#080c16] hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Upload className="w-4 h-4 text-sky-400" />
            Import Backup (.json)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            onClick={onResetDefaults}
            className="min-h-[44px] p-3 rounded-xl bg-[#080c16] hover:bg-rose-950/40 border border-slate-700 hover:border-rose-800 text-slate-200 hover:text-rose-300 font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw className="w-4 h-4 text-rose-400" />
            Reset Factory Scenes
          </button>
        </div>
      </div>

      {/* About Application & Android Kotlin Integration Notes */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <FileCode className="w-4 h-4 text-blue-400" />
            About SYNTXRR STREAM TOOLS
          </h2>
          <p className="text-xs text-slate-400">
            Version 1.2.0 (Stage 2 Hybrid Music Center &amp; Android Foundation)
          </p>
        </div>

        <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
          <p>
            SYNTXRR STREAM TOOLS is engineered from the ground up for modern mobile content creators and esports gamers who stream directly from Android devices.
          </p>

          <div className="p-3.5 rounded-xl bg-[#080c16] border border-slate-800 space-y-2">
            <div className="font-bold text-blue-400">
              Future Kotlin Android Companion Integration Blueprint:
            </div>
            <ul className="list-disc pl-4 space-y-1 text-slate-300">
              <li>
                <strong>Mode A (Overlay):</strong> Powered by Android <code>SYSTEM_ALERT_WINDOW</code> permission and a dedicated <code>ForegroundService</code> to maintain overlay widgets with zero frame drops during heavy gameplay.
              </li>
              <li>
                <strong>Mode B (Encoder):</strong> Connects to Android&apos;s <code>MediaProjection</code> API, hardware <code>MediaCodec</code> (H.264/HEVC), and <code>AudioRecord</code> for internal audio mixing.
              </li>
              <li>
                <strong>Hybrid Music Engine (Stage 2):</strong> Decouples catalog search metadata (YouTube/Spotify) from internal local audio decoding (HTML5 Audio), ensuring full copyright and terms compliance.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
