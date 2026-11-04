import React, { useState, useEffect, useCallback } from 'react';
import {
  AppSettings,
  OperatingMode,
  StudioPreset,
  NavigationTab,
  IntegrationProvider,
} from '../types';
import {
  Radio,
  Tv,
  Monitor,
  ArrowRight,
  Layers,
  Sparkles,
  Camera,
  Mic,
  Cpu,
  Battery,
  Thermometer,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Play,
  Share2,
  ExternalLink,
  Sliders,
  Eye,
  EyeOff,
  Loader2,
  Smartphone,
} from 'lucide-react';
import {
  isNativeAndroid,
  checkOverlayPermission,
  requestOverlayPermission,
  showFloatingHud,
  hideFloatingHud,
  isFloatingHudVisible,
  onFloatingHudClick,
} from '../services/nativeCompanionBridge';

interface DashboardViewProps {
  settings: AppSettings;
  activePreset: StudioPreset | null;
  integrations: IntegrationProvider[];
  onSelectMode: (mode: OperatingMode) => void;
  onNavigate: (nav: NavigationTab) => void;
  onOpenModeModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  settings,
  activePreset,
  integrations,
  onSelectMode,
  onNavigate,
  onOpenModeModal,
}) => {
  const isModeA =
    settings.operatingMode === 'MODE_A_TIKTOK_COMPANION' ||
    settings.operatingMode === 'MODE_A_OVERLAY';

  const connectedCount = integrations.filter((i) => i.status === 'ACTIVE').length;
  const elementsCount = activePreset?.elements.length || 0;
  const visibleElementsCount = activePreset?.elements.filter((e) => e.visible).length || 0;

  // Native Floating HUD State (Phase 4.3C)
  const [isHudVisible, setIsHudVisible] = useState(false);
  const [isOverlayGranted, setIsOverlayGranted] = useState(false);
  const [isHudActionPending, setIsHudActionPending] = useState(false);
  const [hudFeedback, setHudFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [lastHudClickTime, setLastHudClickTime] = useState<string | null>(null);

  // Check initial HUD status and overlay permission when Mode A is active
  const refreshHudStatus = useCallback(async () => {
    try {
      const [hudRes, overlayRes] = await Promise.all([
        isFloatingHudVisible(),
        checkOverlayPermission(),
      ]);
      setIsHudVisible(!!hudRes?.isVisible);
      setIsOverlayGranted(!!overlayRes?.granted);
    } catch (err: any) {
      console.warn('Gagal membaca status HUD:', err);
    }
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    if (isModeA) {
      refreshHudStatus();
    }

    // Subscribe to native floating HUD click events
    let listenerHandle: any = null;

    async function setupClickListener() {
      try {
        listenerHandle = await onFloatingHudClick((data) => {
          if (!isSubscribed) return;
          const timeStr = new Date(data.timestamp || Date.now()).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          setLastHudClickTime(timeStr);
          setHudFeedback({
            type: 'info',
            message: `Bubble HUD disentuh pada layar HP (${timeStr}).`,
          });
          setTimeout(() => {
            if (isSubscribed) {
              setHudFeedback(null);
            }
          }, 4000);
        });
      } catch (err) {
        console.warn('Error setting up HUD click listener:', err);
      }
    }

    if (isModeA) {
      setupClickListener();
    }

    return () => {
      isSubscribed = false;
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        listenerHandle.remove();
      }
    };
  }, [isModeA, refreshHudStatus]);

  const handleShowHud = async () => {
    setIsHudActionPending(true);
    setHudFeedback(null);
    try {
      // 1. Check overlay permission first
      const permRes = await checkOverlayPermission();
      setIsOverlayGranted(!!permRes.granted);

      if (!permRes.granted && isNativeAndroid()) {
        setHudFeedback({
          type: 'error',
          message: 'Izin Tampilkan di Atas Aplikasi Lain (SYSTEM_ALERT_WINDOW) belum aktif. Silakan buka izin terlebih dahulu.',
        });
        setIsHudActionPending(false);
        return;
      }

      // 2. Call showFloatingHud
      const res = await showFloatingHud();
      if (res.success || res.isVisible) {
        setIsHudVisible(true);
        setHudFeedback({
          type: 'success',
          message: res.message || 'Floating HUD berhasil ditampilkan di atas layar.',
        });
      } else {
        setHudFeedback({
          type: 'error',
          message: res.message || 'Gagal menampilkan Floating HUD.',
        });
      }
    } catch (err: any) {
      setHudFeedback({
        type: 'error',
        message: err?.message || 'Terjadi kesalahan saat memanggil Floating HUD.',
      });
    } finally {
      setIsHudActionPending(false);
    }
  };

  const handleHideHud = async () => {
    setIsHudActionPending(true);
    setHudFeedback(null);
    try {
      const res = await hideFloatingHud();
      setIsHudVisible(false);
      setHudFeedback({
        type: 'success',
        message: res.message || 'Floating HUD telah disembunyikan.',
      });
    } catch (err: any) {
      setHudFeedback({
        type: 'error',
        message: err?.message || 'Gagal menyembunyikan Floating HUD.',
      });
    } finally {
      setIsHudActionPending(false);
    }
  };

  const handleRequestOverlay = async () => {
    try {
      setHudFeedback({
        type: 'info',
        message: 'Membuka pengaturan izin sistem Android...',
      });
      const res = await requestOverlayPermission();
      if (res.openedSettings) {
        setHudFeedback({
          type: 'info',
          message: 'Aktifkan toggle "Izinkan ditampilkan di atas aplikasi lain", lalu kembali ke aplikasi SYNTXRR STREAM.',
        });
      }
    } catch (err: any) {
      setHudFeedback({
        type: 'error',
        message: err?.message || 'Gagal membuka halaman pengaturan izin.',
      });
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Hero / Studio Header Card */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0e1626] via-[#111c30] to-[#0a1120] border border-blue-950/80 p-5 md:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-blue-400 uppercase">
              <span>Mobile Streaming Studio</span>
              <span className="text-slate-500">·</span>
              <span>Pusat Kendali Siaran</span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1">
              SYNTXRR STREAM
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-xl leading-relaxed">
              Studio produksi siaran langsung Android mandiri. Kelola overlay visual, event interaktif penonton, song request, dan encoder streaming dalam satu aplikasi.
            </p>
          </div>

          {/* Quick Hardware & Broadcast Readiness strip */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
            <div className="px-3 py-2 rounded-xl bg-[#080c16]/90 border border-slate-800 flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <div className="text-left">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Status Siaran
                </div>
                <div className="text-xs font-bold text-amber-300">
                  Belum Terhubung
                </div>
              </div>
            </div>

            <div className="px-3 py-2 rounded-xl bg-[#080c16]/90 border border-slate-800 flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <div className="text-left">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Target Encoder
                </div>
                <div className="text-xs font-bold text-white font-mono">
                  {settings.targetResolution} · {settings.frameRate} FPS
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mode A vs Mode B Selection Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Pilihan Mode Operasi Siaran
            </h2>
            <p className="text-xs text-slate-400">
              Pilih alur kerja sesuai jenis siaran yang Anda jalankan di HP Android
            </p>
          </div>
          <button
            onClick={onOpenModeModal}
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors min-h-[36px]"
          >
            Arsitektur Mode <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mode A Card */}
          <div
            onClick={() => onSelectMode('MODE_A_TIKTOK_COMPANION')}
            className={`relative p-5 rounded-2xl border transition-all cursor-pointer ${
              isModeA
                ? 'bg-[#101b33] border-blue-500/80 shadow-lg shadow-blue-950/40 ring-1 ring-blue-500'
                : 'bg-[#0e1626] border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Layers className="w-6 h-6" />
              </div>
              {isModeA ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-blue-400 bg-blue-950/90 border border-blue-700 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mode Terpilih
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 hover:text-slate-200">
                  Ketuk untuk Pilih
                </span>
              )}
            </div>

            <h3 className="text-base font-bold text-white mt-4">
              Mode A: TikTok LIVE Companion
            </h3>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              Membantu streamer mengelola overlay pendamping, Text-to-Speech (TTS) komentar, dan floating control saat live streaming berjalan di aplikasi TikTok. Tidak memerlukan stream key.
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400">Penggunaan RAM:</span>
                <span className="ml-1 text-emerald-400 font-semibold font-mono">~45 MB (Rendah)</span>
              </div>
              <div>
                <span className="text-slate-400">Jendela Floating:</span>
                <span className="ml-1 text-slate-200 font-semibold">Overlay HUD</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMode('MODE_A_TIKTOK_COMPANION');
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  isModeA
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {isModeA ? 'Mode A Aktif' : 'Pilih Mode A'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate('studio');
                }}
                className="py-2.5 px-3 rounded-xl bg-[#080c16] border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
              >
                Buka Studio
              </button>
            </div>
          </div>

          {/* Mode B Card */}
          <div
            onClick={() => onSelectMode('MODE_B_STREAMING_ENCODER')}
            className={`relative p-5 rounded-2xl border transition-all cursor-pointer ${
              !isModeA
                ? 'bg-[#101b33] border-blue-500/80 shadow-lg shadow-blue-950/40 ring-1 ring-blue-500'
                : 'bg-[#0e1626] border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-xl bg-sky-600/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                <Radio className="w-6 h-6" />
              </div>
              {!isModeA ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-sky-400 bg-sky-950/90 border border-sky-700 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mode Terpilih
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 hover:text-slate-200">
                  Ketuk untuk Pilih
                </span>
              )}
            </div>

            <h3 className="text-base font-bold text-white mt-4">
              Mode B: Streaming Encoder Mandiri
            </h3>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              Encoder siaran mandiri dengan input RTMP/RTMPS, penangkapan layar (MediaProjection), kamera, mikrofon, dan komposisi overlay langsung menjadi video stream 1080p.
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400">Pipa Encoder:</span>
                <span className="ml-1 text-sky-400 font-semibold font-mono">1080p H.264</span>
              </div>
              <div>
                <span className="text-slate-400">Alokasi RAM:</span>
                <span className="ml-1 text-amber-400 font-semibold font-mono">~130 MB</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMode('MODE_B_STREAMING_ENCODER');
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  !isModeA
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {!isModeA ? 'Mode B Aktif' : 'Pilih Mode B'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate('settings');
                }}
                className="py-2.5 px-3 rounded-xl bg-[#080c16] border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
              >
                RTMP Settings
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Mode A: Native Floating HUD Companion Controller (Visible only in Mode A) */}
      {isModeA && (
        <section className="bg-gradient-to-br from-[#0e172a] via-[#0f1b35] to-[#0a1120] rounded-2xl border border-blue-500/40 p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-blue-400 uppercase">
                <span>Mode A Companion</span>
                <span className="text-slate-500">·</span>
                <span>Native Android WindowManager</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 mt-0.5">
                <Layers className="w-5 h-5 text-blue-400" />
                Kontroler Native Floating HUD
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 max-w-xl">
                Bubble mengambang 56dp di atas aplikasi TikTok LIVE untuk kontrol cepat dan pemantauan siaran.
              </p>
            </div>

            {/* Live Status Badge */}
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              {isHudVisible ? (
                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-950/90 text-emerald-400 border border-emerald-600/60 flex items-center gap-2 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  HUD Aktif di Layar
                </span>
              ) : (
                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-900/90 text-slate-400 border border-slate-700 flex items-center gap-2 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                  HUD Nonaktif
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            <button
              type="button"
              onClick={handleShowHud}
              disabled={isHudActionPending || isHudVisible}
              className={`py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                isHudVisible
                  ? 'bg-slate-900/60 border border-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 active:scale-[0.98]'
              }`}
            >
              {isHudActionPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4 text-blue-200" />
              )}
              <span>Tampilkan Floating HUD</span>
            </button>

            <button
              type="button"
              onClick={handleHideHud}
              disabled={isHudActionPending || !isHudVisible}
              className={`py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                !isHudVisible
                  ? 'bg-slate-900/60 border border-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-rose-900/60 hover:bg-rose-800/80 border border-rose-600 text-rose-200 shadow-lg shadow-rose-950/40 active:scale-[0.98]'
              }`}
            >
              {isHudActionPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <EyeOff className="w-4 h-4 text-rose-300" />
              )}
              <span>Sembunyikan Floating HUD</span>
            </button>

            <button
              type="button"
              onClick={refreshHudStatus}
              disabled={isHudActionPending}
              className="py-3 px-4 rounded-xl bg-[#080c16] hover:bg-slate-800/80 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center gap-2 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 text-slate-400" />
              <span>Cek Status Native</span>
            </button>
          </div>

          {/* Overlay Permission Warning if not granted on native Android */}
          {!isOverlayGranted && isNativeAndroid() && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-600/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-300">Izin Overlay Belum Diaktifkan</div>
                  <div className="text-slate-300 text-[11px] leading-relaxed">
                    Android memerlukan izin "Tampilkan di atas aplikasi lain" agar bubble dapat melayang di atas TikTok.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRequestOverlay}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shrink-0 self-start sm:self-auto transition-colors flex items-center gap-1.5"
              >
                <span>Buka Izin Overlay</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Feedback Banner */}
          {hudFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 transition-all ${
                hudFeedback.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-600/70 text-emerald-200'
                  : hudFeedback.type === 'error'
                  ? 'bg-rose-950/60 border-rose-600/70 text-rose-200'
                  : 'bg-blue-950/60 border-blue-600/70 text-blue-200'
              }`}
            >
              {hudFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : hudFeedback.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              ) : (
                <Smartphone className="w-4 h-4 shrink-0 text-blue-400" />
              )}
              <span className="flex-1">{hudFeedback.message}</span>
            </div>
          )}

          {/* Touch Interaction Feedback Strip */}
          <div className="p-3 rounded-xl bg-[#080c16]/90 border border-slate-800 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-400">
              <Smartphone className="w-3.5 h-3.5 text-blue-400" />
              <span>Respon Interaksi Native:</span>
              <span className="text-slate-200 font-medium">
                {lastHudClickTime
                  ? `Sentuhan bubble terdeteksi pada HP (${lastHudClickTime})`
                  : 'Ketuk bubble floating di HP untuk menguji respons klik bridge'}
              </span>
            </div>
            {!isNativeAndroid() && (
              <span className="text-slate-500 text-[10px]">
                Simulasi web: Aktifkan di APK untuk overlay di atas TikTok nyata
              </span>
            )}
          </div>
        </section>
      )}

      {/* Status Kesiapan Hardware & Pipa Produksi */}
      <section className="bg-[#0e1626] rounded-2xl border border-slate-800/90 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-400" />
              Status Kesiapan Komponen Produksi
            </h2>
            <p className="text-xs text-slate-400">
              Pemeriksaan hardware kamera, mikrofon, audio, dan encoder perangkat
            </p>
          </div>
          <span className="text-[11px] font-semibold text-blue-300 bg-blue-950/60 border border-blue-900/60 px-2.5 py-1 rounded-md">
            Profil: Seimbang (Balanced)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Camera className="w-3.5 h-3.5 text-blue-400" />
              <span>Kamera Video</span>
            </div>
            <div className="text-sm font-bold text-emerald-400">Siap (Kamera Depan/Belakang)</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Mendukung orientasi 9:16</div>
          </div>

          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mikrofon &amp; Audio</span>
            </div>
            <div className="text-sm font-bold text-emerald-400">Mic Aktif + SFX</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Audio internal didukung</div>
          </div>

          <div
            onClick={() => onNavigate('studio')}
            className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80 hover:border-blue-500/60 transition-colors cursor-pointer"
            title="Buka Preset di Studio Editor"
          >
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Tv className="w-3.5 h-3.5 text-purple-400" />
              <span>Status Scene Studio</span>
            </div>
            <div className="text-sm font-bold text-white font-mono truncate">
              {activePreset ? activePreset.name : 'Mobile Gaming (9:16)'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {visibleElementsCount} elemen aktif ({activePreset?.canvasOrientation || '9:16'})
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Thermometer className="w-3.5 h-3.5 text-amber-400" />
              <span>Suhu &amp; Baterai</span>
            </div>
            <div className="text-sm font-bold text-white font-mono">
              36.2°C · ~4.1%/jam
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5">Suhu aman (Dingin)</div>
          </div>
        </div>
      </section>

      {/* Peringatan Izin Android System */}
      <section className="p-4 rounded-xl bg-[#0a1120] border border-blue-900/40 text-xs text-slate-300 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-400 font-bold">
            <ShieldAlert className="w-4 h-4 text-blue-400" />
            <span>Pemeriksaan Izin Sistem Android (Capacitor Ready)</span>
          </div>
          <button
            onClick={() => onNavigate('settings')}
            className="text-xs text-blue-400 hover:underline"
          >
            Kelola Izin
          </button>
        </div>
        <p className="leading-relaxed text-[11px] text-slate-300">
          Izin <code>SYSTEM_ALERT_WINDOW</code> (Jendela Mengambang) diperlukan untuk Mode A (TikTok Companion). Izin <code>READ_MEDIA_AUDIO</code> dan <code>RECORD_AUDIO</code> diperlukan untuk pemutar lagu lokal dan penangkapan mikrofon siaran.
        </p>
      </section>
    </div>
  );
};
