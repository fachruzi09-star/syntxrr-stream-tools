import React, { useState, useRef, useEffect } from 'react';
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
  Volume2,
} from 'lucide-react';

type SaveStatusKind = 'pending' | 'success' | 'error';

interface SaveStatus {
  message: string;
  kind: SaveStatusKind;
}

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => Promise<boolean>;
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 2: status hanya ditampilkan setelah persistensi benar-benar selesai.
  const latestSettingsRef = useRef(settings);
  const statusTimerRef = useRef<number | null>(null);
  const saveRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    };
  }, []);

  const showSaveStatus = (message: string, kind: SaveStatusKind) => {
    if (!isMountedRef.current) return;
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = null;
    setSaveStatus({ message, kind });
    if (kind === 'pending') return;
    statusTimerRef.current = window.setTimeout(
      () => {
        statusTimerRef.current = null;
        if (isMountedRef.current) setSaveStatus(null);
      },
      kind === 'error' ? 6000 : 2000
    );
  };

  const persistSettings = async (next: AppSettings) => {
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    showSaveStatus('Menyimpan…', 'pending');
    const success = await onUpdateSettings(next);
    // Hasil dari permintaan yang sudah usang tidak boleh menimpa status terbaru.
    if (!isMountedRef.current || requestId !== saveRequestIdRef.current) return;
    if (success) {
      showSaveStatus('Tersimpan', 'success');
    } else {
      showSaveStatus('Gagal menyimpan — perubahan belum tersimpan di perangkat', 'error');
    }
  };

  const handleUpdate = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...latestSettingsRef.current, [key]: value };
    latestSettingsRef.current = updated;
    void persistSettings(updated);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) {
        showSaveStatus('File cadangan kosong atau tidak dapat dibaca', 'error');
        return;
      }
      const success = await onImportData(content);
      if (!isMountedRef.current) return;
      if (success) {
        showSaveStatus('Cadangan dipulihkan — kredensial perangkat ini dipertahankan', 'success');
      } else {
        showSaveStatus('Gagal memulihkan cadangan: format JSON tidak valid', 'error');
      }
    };
    reader.onerror = () => {
      showSaveStatus('Gagal membaca file cadangan', 'error');
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
            Pengaturan Studio (Settings)
          </h1>
          <p className="text-xs text-slate-400">
            Profil performa perangkat, target resolusi siaran, kunci API, dan pencadangan data lokal
          </p>
        </div>

        {saveStatus && (
          <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5 self-start sm:self-auto">
            <Check className="w-4 h-4" /> {saveStatus}
          </span>
        )}
      </div>

      {/* Music Catalog & API Integrations Section */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-blue-900/60 shadow-lg space-y-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-blue-400 uppercase">
            <span>Konektor Eksternal</span>
            <span className="text-slate-500">·</span>
            <span>Pencarian Metadata Musik</span>
          </div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 mt-0.5">
            <Music2 className="w-4 h-4 text-blue-400" />
            Katalog Musik &amp; Kunci API Resmi
          </h2>
          <p className="text-xs text-slate-400">
            Konfigurasi kredensial resmi YouTube Data API v3 dan Spotify Developer untuk pencarian judul lagu penonton
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
                Kunci API YouTube Data v3
              </label>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
              >
                Dapatkan Kunci API <ExternalLink className="w-3 h-3" />
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
                title={showYouTubeKey ? 'Sembunyikan' : 'Tampilkan'}
              >
                {showYouTubeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Digunakan murni untuk pencarian judul dan thumbnail video YouTube resmi.
            </p>
          </div>

          {/* Spotify Client ID */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-emerald-600 text-white font-black text-[8px] flex items-center justify-center">
                  SP
                </span>
                Client ID Spotify Developer
              </label>
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
              >
                Portal Spotify Developer <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <input
              type="text"
              value={settings.spotifyClientId || ''}
              onChange={(e) => handleUpdate('spotifyClientId', e.target.value)}
              placeholder="Masukkan Spotify Client ID 32-karakter..."
              className="w-full px-3 py-2.5 rounded-xl bg-[#080c16] border border-slate-700 text-white font-mono focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Memerlukan redirect URI yang diarahkan ke aplikasi ini untuk autentikasi PKCE.
            </p>
          </div>
        </div>
      </div>

      {/* Target Resolusi Siaran & Frame Rate */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <Monitor className="w-4 h-4 text-blue-400" />
            Resolusi Siaran &amp; Frame Rate
          </h2>
          <p className="text-xs text-slate-400">
            Target resolusi siaran standar 1080p dengan keseimbangan kompresi hardware
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Target Resolusi Video
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['720p', '1080p', '1440p'] as ResolutionTarget[]).map((res) => (
                <button
                  key={res}
                  onClick={() => handleUpdate('targetResolution', res)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition flex flex-col items-center gap-0.5 ${
                    settings.targetResolution === res
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400'
                      : 'bg-[#080c16] text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  <span>{res}</span>
                  {res === '1080p' && (
                    <span className="text-[9px] font-normal opacity-80">(Rekomendasi)</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Target Kecepatan Bingkai (FPS)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([30, 60] as FrameRate[]).map((fps) => (
                <button
                  key={fps}
                  onClick={() => handleUpdate('frameRate', fps)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition flex flex-col items-center gap-0.5 ${
                    settings.frameRate === fps
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400'
                      : 'bg-[#080c16] text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  <span>{fps} FPS</span>
                  <span className="text-[9px] font-normal opacity-80">
                    {fps === 60 ? 'Mulus (Gaming)' : 'Hemat Baterai'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Profil Performa Hardware */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            Manajemen Performa &amp; Suhu Perangkat
          </h2>
          <p className="text-xs text-slate-400">
            Pengaturan prioritas alokasi RAM, konsumsi baterai, dan temperatur CPU Android
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              {
                id: 'battery_saver',
                name: 'Hemat Baterai',
                desc: 'Alokasi RAM minimal, kompresi efisien, suhu stabil',
                icon: Battery,
              },
              {
                id: 'balanced',
                name: 'Seimbang (Direkomendasikan)',
                desc: 'Optimal untuk 1080p pada gameplay berdurasi panjang',
                icon: Cpu,
              },
              {
                id: 'performance',
                name: 'Performa Maksimal',
                desc: 'Prioritas bitrate tinggi, latensi kompresi terendah',
                icon: Flame,
              },
            ] as const
          ).map((profile) => {
            const Icon = profile.icon;
            const isSelected = settings.performanceProfile === profile.id;
            return (
              <button
                key={profile.id}
                onClick={() => handleUpdate('performanceProfile', profile.id as PerformanceProfile)}
                className={`p-3.5 rounded-xl text-left border transition ${
                  isSelected
                    ? 'bg-blue-950/60 border-blue-500 text-white shadow-lg shadow-blue-900/30'
                    : 'bg-[#080c16] border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold text-white">{profile.name}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{profile.desc}</p>
              </button>
            );
          })}
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-white">Akselerasi Hardware GPU</div>
            <div className="text-[11px] text-slate-400">
              Gunakan MediaCodec H.264 / HEVC hardware jika tersedia di Android
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.hardwareAcceleration}
            onChange={(e) => handleUpdate('hardwareAcceleration', e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 focus:ring-0 bg-[#080c16] border-slate-700 cursor-pointer"
          />
        </div>
      </div>

      {/* Konfigurasi Server RTMP Siaran Langsung */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-400" />
            Kredensial Server RTMP / RTMPS (Mode B)
          </h2>
          <p className="text-xs text-slate-400">
            Target endpoint ingest siaran untuk YouTube Live, Twitch, Kick, atau server kustom
          </p>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">URL Server RTMP</label>
            <input
              type="text"
              value={settings.rtmpServer}
              onChange={(e) => handleUpdate('rtmpServer', e.target.value)}
              placeholder="rtmp://live.twitch.tv/app"
              className="w-full px-3 py-2 rounded-xl bg-[#080c16] border border-slate-700 text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium">Stream Key / Kunci Siaran</label>
              <button
                type="button"
                onClick={() => setShowStreamKey(!showStreamKey)}
                className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
              >
                {showStreamKey ? (
                  <>
                    <EyeOff className="w-3 h-3" /> Sembunyikan
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" /> Tampilkan
                  </>
                )}
              </button>
            </div>
            <input
              type={showStreamKey ? 'text' : 'password'}
              value={settings.streamKey}
              onChange={(e) => handleUpdate('streamKey', e.target.value)}
              placeholder="live_..."
              className="w-full px-3 py-2 rounded-xl bg-[#080c16] border border-slate-700 text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Bitrate Video ({settings.videoBitrateKbps} Kbps)
              </label>
              <input
                type="range"
                min="2500"
                max="9000"
                step="500"
                value={settings.videoBitrateKbps}
                onChange={(e) => handleUpdate('videoBitrateKbps', Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Bitrate Audio ({settings.audioBitrateKbps} Kbps)
              </label>
              <input
                type="range"
                min="96"
                max="320"
                step="32"
                value={settings.audioBitrateKbps}
                onChange={(e) => handleUpdate('audioBitrateKbps', Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Pencadangan & Pemulihan Data IndexedDB */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1626] border border-slate-800 space-y-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            Penyimpanan Lokal &amp; Pencadangan JSON
          </h2>
          <p className="text-xs text-slate-400">
            Seluruh preset studio, adegan, widget, antrean lagu, dan kredensial tersimpan aman di IndexedDB perangkat
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={onExportData}
            className="p-3.5 rounded-xl bg-[#080c16] border border-slate-800 hover:border-blue-500 hover:bg-blue-950/20 text-white text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <Download className="w-4 h-4 text-blue-400" />
            <span>Ekspor Cadangan JSON</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3.5 rounded-xl bg-[#080c16] border border-slate-800 hover:border-emerald-500 hover:bg-emerald-950/20 text-white text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Pulihkan Cadangan JSON</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json,application/json"
            className="hidden"
          />

          <button
            onClick={onResetDefaults}
            className="p-3.5 rounded-xl bg-[#080c16] border border-slate-800 hover:border-red-500 hover:bg-red-950/20 text-red-400 text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <RotateCcw className="w-4 h-4 text-red-400" />
            <span>Atur Ulang Pengaturan</span>
          </button>
        </div>
      </div>

      {/* Informasi Versi & Arsitektur */}
      <div className="p-4 rounded-xl bg-[#080c16] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 gap-2">
        <div>
          <span className="font-bold text-slate-200">SYNTXRR STREAM</span>
          <span className="text-slate-500 mx-2">·</span>
          <span>Versi 3.0.0 (Master Release)</span>
          <span className="text-slate-500 mx-2">·</span>
          <span className="font-mono text-blue-400">com.syntxrr.streamtools</span>
        </div>
        <div className="text-slate-500">
          Mobile Streaming Studio &amp; TikTok LIVE Companion
        </div>
      </div>
    </div>
  );
};
