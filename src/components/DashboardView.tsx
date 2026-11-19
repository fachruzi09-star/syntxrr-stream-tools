import React, { useState, useEffect, useCallback } from 'react';
import {
  AppSettings,
  OperatingMode,
  isModeAOperatingMode,
  StudioPreset,
  NavigationTab,
  IntegrationProvider,
  TikTokAccountState,
  TikTokConnectorStatus,
  ModeASessionMode,
  ModeBAudioSource,
} from '../types';
import {
  buildModeAHonestStatus,
  isValidTikTokTargetUsername,
  resolveTikTokTargetUsername,
} from '../services/tiktokLiveConnector';
import type { ModeBStreamSnapshot } from '../services/nativeStreamingBridge';
import {
  isModeBSessionActive,
  isModeBStoppableStatus,
  validateModeBRtmpConfig,
} from '../services/modeBController';
import { useTranslation } from '../i18n/I18nContext';
import {
  Radio,
  Tv,
  ArrowRight,
  Layers,
  Camera,
  Mic,
  Cpu,
  Thermometer,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  ExternalLink,
  Sliders,
  Eye,
  EyeOff,
  Loader2,
  Smartphone,
  Link2,
  X,
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
  tiktokAccount?: TikTokAccountState;
  tiktokStatus?: TikTokConnectorStatus;
  companionRunning?: boolean;
  modeASessionMode?: ModeASessionMode;
  modeBStatus?: ModeBStreamSnapshot;
  isModeBActionPending?: boolean;
  modeBNotificationWarning?: string | null;
  onStartModeBStream?: () => Promise<void> | void;
  onStopModeBStream?: () => Promise<void> | void;
  onRequestModeBReshare?: () => Promise<void> | void;
  onToggleModeBHostWait?: () => Promise<void> | void;
  onUpdateSettings?: (settings: AppSettings) => Promise<boolean> | void;
  onStartModeAWithConnection?: () => Promise<void> | void;
  onStartModeAWithoutConnection?: () => Promise<void> | void;
  onStopModeASession?: () => Promise<void> | void;
  onOpenTikTokConnection?: () => void;
  onSelectMode: (mode: OperatingMode) => void;
  onNavigate: (nav: NavigationTab) => void;
  onOpenModeModal: () => void;
}

const DEFAULT_ACCOUNT: TikTokAccountState = {
  isLinked: false,
  connectionMethod: 'direct',
  fallbackEnabled: true,
  accountLinkStatus: 'unlinked',
};

const DEFAULT_STATUS: TikTokConnectorStatus = {
  state: 'disconnected',
  transport: 'none',
  connectionMethod: 'direct',
  roomStatus: 'unknown',
  username: '',
  roomId: '',
  viewerCount: 0,
  totalLikeCount: 0,
  message: 'Belum terhubung ke TikTok LIVE.',
  updatedAt: 0,
};

const DEFAULT_MODE_B_STATUS: ModeBStreamSnapshot = {
  status: 'idle',
  message: 'Encoder Mode B siap dikonfigurasi.',
  isStreaming: false,
  bitrateKbps: 0,
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  settings,
  activePreset,
  integrations,
  tiktokAccount = DEFAULT_ACCOUNT,
  tiktokStatus = DEFAULT_STATUS,
  companionRunning = false,
  modeASessionMode = 'inactive',
  modeBStatus = DEFAULT_MODE_B_STATUS,
  isModeBActionPending = false,
  modeBNotificationWarning = null,
  onStartModeBStream,
  onStopModeBStream,
  onRequestModeBReshare,
  onToggleModeBHostWait,
  onUpdateSettings,
  onStartModeAWithConnection,
  onStartModeAWithoutConnection,
  onStopModeASession,
  onOpenTikTokConnection,
  onSelectMode,
  onNavigate,
  onOpenModeModal,
}) => {
  const { t, isEnglish } = useTranslation();

  const isModeA = isModeAOperatingMode(settings.operatingMode);
  const targetUsername = resolveTikTokTargetUsername(settings, tiktokAccount);
  const hasValidTargetUsername = isValidTikTokTargetUsername(targetUsername);
  const honestStatus = buildModeAHonestStatus({
    account: tiktokAccount,
    connector: tiktokStatus,
    companionRunning,
    sessionMode: modeASessionMode,
  });

  const visibleElementsCount = activePreset?.elements.filter((e) => e.visible).length || 0;
  const [startSessionDialog, setStartSessionDialog] = useState<'unlinked' | 'linked' | null>(null);
  const [isSessionActionPending, setIsSessionActionPending] = useState(false);
  const [sessionValidationError, setSessionValidationError] = useState<string | null>(null);

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

      // 2. Call showFloatingHud with saved appearance preferences
      const res = await showFloatingHud({
        sizeDp: settings.hudButtonSize ?? 48,
        opacity: settings.hudOpacity ?? 92,
        position: settings.hudPosition === 'left' ? 'left' : 'right',
      });
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

  const handlePressStartSession = () => {
    setSessionValidationError(null);
    if (hasValidTargetUsername) {
      setStartSessionDialog('linked');
    } else {
      setStartSessionDialog('unlinked');
    }
  };

  const handleConfirmConnectAndStart = async () => {
    setStartSessionDialog(null);
    if (!hasValidTargetUsername) {
      setSessionValidationError(
        'Target @username TikTok belum diisi atau tidak valid. Atur target username di halaman Koneksi terlebih dahulu.'
      );
      return;
    }
    setSessionValidationError(null);
    setIsSessionActionPending(true);
    try {
      await onStartModeAWithConnection?.();
      await refreshHudStatus();
    } finally {
      setIsSessionActionPending(false);
    }
  };

  const handleConfirmStartWithoutConnection = async () => {
    setStartSessionDialog(null);
    setSessionValidationError(null);
    setIsSessionActionPending(true);
    try {
      await onStartModeAWithoutConnection?.();
      await refreshHudStatus();
    } finally {
      setIsSessionActionPending(false);
    }
  };

  const handleStopSession = async () => {
    setIsSessionActionPending(true);
    try {
      await onStopModeASession?.();
      await refreshHudStatus();
    } finally {
      setIsSessionActionPending(false);
    }
  };

  const isLiveTransportConnected =
    tiktokStatus.state === 'connected_direct' || tiktokStatus.state === 'connected_euler';
  const modeBRtmpCheck = validateModeBRtmpConfig(settings.rtmpServer, settings.streamKey);
  const modeBAudioSource: ModeBAudioSource =
    settings.modeBAudioSource === 'internal' || settings.modeBAudioSource === 'microphone'
      ? settings.modeBAudioSource
      : 'mix';
  const isModeBLiveVerified = modeBStatus.status === 'live' && modeBStatus.isStreaming;
  const isModeBBusy = isModeBSessionActive(modeBStatus);

  const heroBroadcastDotColor = isModeA
    ? isLiveTransportConnected
      ? 'bg-emerald-400'
      : tiktokStatus.state === 'error'
      ? 'bg-rose-400'
      : 'bg-amber-400'
    : isModeBLiveVerified
    ? 'bg-emerald-400'
    : modeBStatus.status === 'error' || modeBStatus.status === 'capture_lost'
    ? 'bg-rose-400'
    : isModeBBusy
    ? 'bg-amber-400'
    : 'bg-slate-500';

  const heroBroadcastTextColor = isModeA
    ? isLiveTransportConnected
      ? 'text-emerald-300'
      : tiktokStatus.state === 'error'
      ? 'text-rose-300'
      : 'text-amber-300'
    : isModeBLiveVerified
    ? 'text-emerald-300'
    : modeBStatus.status === 'error' || modeBStatus.status === 'capture_lost'
    ? 'text-rose-300'
    : isModeBBusy
    ? 'text-amber-300'
    : 'text-slate-300';

  const heroBroadcastLabel = isModeA
    ? isLiveTransportConnected
      ? honestStatus.eventTransport.label
      : modeASessionMode === 'without_live_connection'
      ? 'Tanpa Koneksi LIVE'
      : tiktokStatus.state === 'waiting_for_live'
      ? 'Menunggu LIVE'
      : tiktokStatus.state === 'resolving_room' ||
        tiktokStatus.state === 'connecting_direct' ||
        tiktokStatus.state === 'connecting_euler' ||
        tiktokStatus.state === 'reconnecting'
      ? honestStatus.eventTransport.label
      : t('dash.statusNotConnected')
    : isModeBLiveVerified
    ? `LIVE${modeBStatus.bitrateKbps > 0 ? ` · ${modeBStatus.bitrateKbps} kbps` : ''}`
    : modeBStatus.status === 'host_wait'
    ? 'LIVE · Layar Tunggu'
    : modeBStatus.status === 'reshare_waiting'
    ? 'LIVE · Menunggu Layar'
    : modeBStatus.status === 'resharing'
    ? 'Menyambungkan Layar…'
    : modeBStatus.status === 'starting' || modeBStatus.status === 'connecting'
    ? 'Memulai Encoder…'
    : modeBStatus.status === 'stopping'
    ? 'Menghentikan…'
    : modeBStatus.status === 'capture_lost'
    ? 'Capture Terputus'
    : modeBStatus.status === 'error'
    ? 'Encoder Error'
    : modeBStatus.status === 'disconnected'
    ? 'RTMP Terputus'
    : modeBStatus.status === 'stopped'
    ? 'Siaran Berhenti'
    : 'Mode B Standby';

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Dialog Mulai Sesi Mode A — Kondisi A (Target Username Belum Diatur) */}
      {startSessionDialog === 'unlinked' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mode-a-unlinked-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#0e172a] border border-slate-700 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 id="mode-a-unlinked-title" className="text-base font-bold text-white">
                  Target username LIVE belum diatur
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStartSessionDialog(null)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Overlay tetap tampil, tetapi gift, chat, dan follow tidak akan masuk sebelum target <span className="font-mono text-white">@username</span> LIVE TikTok diisi di Koneksi (tanpa perlu login OAuth).
            </p>

            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setStartSessionDialog(null);
                  onOpenTikTokConnection?.();
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/25"
              >
                <Link2 className="w-4 h-4" />
                <span>Atur Target di Koneksi</span>
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmStartWithoutConnection()}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold"
              >
                Mulai tanpa koneksi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Mulai Sesi Mode A — Kondisi B (Target Username Siap) */}
      {startSessionDialog === 'linked' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mode-a-linked-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#0e172a] border border-blue-500/40 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="mode-a-linked-title" className="text-base font-bold text-white">
                  Siap memulai sesi Mode A?
                </h3>
                <div className="text-xs text-blue-300 mt-0.5 font-mono">
                  Target LIVE: @{targetUsername}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStartSessionDialog(null)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => void handleConfirmConnectAndStart()}
                className="w-full text-left p-3.5 rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white transition shadow-lg shadow-blue-600/25 space-y-1"
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" />
                  <span>Sambungkan &amp; mulai</span>
                </div>
                <p className="text-[11px] text-blue-100 leading-relaxed">
                  Hubungkan SYNTXRR ke room LIVE publik @{targetUsername}. Kalau belum LIVE, koneksi akan menunggu sampai LIVE dimulai.
                </p>
              </button>

              <button
                type="button"
                onClick={() => void handleConfirmStartWithoutConnection()}
                className="w-full text-left p-3.5 rounded-xl bg-[#080c16] hover:bg-slate-800/80 border border-slate-700 text-slate-200 transition space-y-1"
              >
                <div className="text-xs font-bold">Mulai tanpa koneksi</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Overlay tetap aktif tanpa menerima event LIVE.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero / Studio Header Card */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0e1626] via-[#111c30] to-[#0a1120] border border-blue-950/80 p-5 md:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-blue-400 uppercase">
              <span>Mobile Streaming Studio</span>
              <span className="text-slate-500">·</span>
              <span>{isEnglish ? 'Broadcast Control Center' : 'Pusat Kendali Siaran'}</span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-1">
              SYNTXRR STREAM
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-xl leading-relaxed">
              {t('dash.heroDesc')}
            </p>
          </div>

          {/* Quick Hardware & Broadcast Readiness strip */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
            <div className="px-3 py-2 rounded-xl bg-[#080c16]/90 border border-slate-800 flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${heroBroadcastDotColor}`} />
              <div className="text-left">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  {t('dash.broadcastStatus')}
                </div>
                <div className={`text-xs font-bold ${heroBroadcastTextColor}`}>
                  {heroBroadcastLabel}
                </div>
              </div>
            </div>

            <div className="px-3 py-2 rounded-xl bg-[#080c16]/90 border border-slate-800 flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <div className="text-left">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  {t('dash.targetEncoder')}
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
              {t('dash.modeSectionTitle')}
            </h2>
            <p className="text-xs text-slate-400">
              {t('dash.modeSectionDesc')}
            </p>
          </div>
          <button
            onClick={onOpenModeModal}
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors min-h-[36px]"
          >
            {t('dash.modeArchitecture')} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#080c16] border border-slate-800 p-1" role="tablist" aria-label="Pilih mode operasi">
          <button
            type="button"
            role="tab"
            aria-selected={isModeA}
            aria-controls="mode-a-details"
            aria-pressed={isModeA}
            onClick={() => onSelectMode('MODE_A_TIKTOK_COMPANION')}
            className={`min-h-[42px] rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              isModeA ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Mode A
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isModeA}
            aria-controls="mode-b-details"
            aria-pressed={!isModeA}
            onClick={() => onSelectMode('MODE_B_STREAMING_ENCODER')}
            className={`min-h-[42px] rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              !isModeA ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Mode B
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Mode A Card */}
          <div
            id="mode-a-details"
            role="tabpanel"
            aria-hidden={!isModeA}
            onClick={() => onSelectMode('MODE_A_TIKTOK_COMPANION')}
            className={`${isModeA ? '' : 'hidden'} relative p-5 rounded-2xl border transition-all cursor-pointer ${
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
                  <CheckCircle2 className="w-3.5 h-3.5" /> {t('dash.modeSelected')}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 hover:text-slate-200">
                  {t('dash.tapToSelect')}
                </span>
              )}
            </div>

            <h3 className="text-base font-bold text-white mt-4">
              {isEnglish ? 'Mode A: TikTok LIVE Companion' : 'Mode A: TikTok LIVE Companion'}
            </h3>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              {isEnglish
                ? 'Assists streamers in managing companion overlays, comment TTS, and floating controls during TikTok LIVE. No stream key required.'
                : 'Membantu streamer mengelola overlay pendamping, Text-to-Speech (TTS) komentar, dan floating control saat live streaming berjalan di aplikasi TikTok. Tidak memerlukan stream key.'}
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400">{isEnglish ? 'RAM Usage:' : 'Penggunaan RAM:'}</span>
                <span className="ml-1 text-emerald-400 font-semibold font-mono">~45 MB ({isEnglish ? 'Low' : 'Rendah'})</span>
              </div>
              <div>
                <span className="text-slate-400">{isEnglish ? 'Floating Window:' : 'Jendela Floating:'}</span>
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
                {isModeA ? (isEnglish ? 'Mode A Active' : 'Mode A Aktif') : (isEnglish ? 'Select Mode A' : 'Pilih Mode A')}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate('studio');
                }}
                className="py-2.5 px-3 rounded-xl bg-[#080c16] border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
              >
                {t('dash.openStudioBtn')}
              </button>
            </div>
          </div>

          {/* Mode B Card */}
          <div
            id="mode-b-details"
            role="tabpanel"
            aria-hidden={isModeA}
            onClick={() => onSelectMode('MODE_B_STREAMING_ENCODER')}
            className={`${isModeA ? 'hidden' : ''} relative p-5 rounded-2xl border transition-all cursor-pointer ${
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
                  <CheckCircle2 className="w-3.5 h-3.5" /> {t('dash.modeSelected')}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 hover:text-slate-200">
                  {t('dash.tapToSelect')}
                </span>
              )}
            </div>

            <h3 className="text-base font-bold text-white mt-4">
              {isEnglish ? 'Mode B: Standalone Streaming Encoder' : 'Mode B: Streaming Encoder Mandiri'}
            </h3>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              {isEnglish
                ? 'Standalone native MediaProjection capture, H.264/AAC encoding, selectable audio source, and RTMP/RTMPS broadcast output.'
                : 'Encoder siaran mandiri dengan capture layar native (MediaProjection), encoding H.264/AAC, pilihan sumber audio, dan output RTMP/RTMPS.'}
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400">{isEnglish ? 'Encoder Pipe:' : 'Pipa Encoder:'}</span>
                <span className="ml-1 text-sky-400 font-semibold font-mono">{settings.targetResolution} · {settings.frameRate} FPS</span>
              </div>
              <div>
                <span className="text-slate-400">{isEnglish ? 'Bitrate Target:' : 'Target Bitrate:'}</span>
                <span className="ml-1 text-amber-400 font-semibold font-mono">{settings.videoBitrateKbps} kbps</span>
              </div>
            </div>

            {/* Sumber Audio Mode B & Status Real Encoder */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-4 rounded-xl border border-slate-700/80 bg-[#080c16] p-3.5 space-y-3 cursor-default"
            >
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-300">
                  {isEnglish ? 'Broadcast Audio Source' : 'Sumber Audio Siaran Mode B'}
                </div>
                <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={isEnglish ? 'Select Mode B audio source' : 'Pilih sumber audio Mode B'}>
                  {[
                    { value: 'mix' as const, label: isEnglish ? 'Mixed' : 'Campuran', detail: isEnglish ? 'System + Mic' : 'Sistem + Mic' },
                    { value: 'internal' as const, label: isEnglish ? 'Internal' : 'Internal', detail: 'Android 10+' },
                    { value: 'microphone' as const, label: isEnglish ? 'Microphone' : 'Mikrofon', detail: isEnglish ? 'Mic only' : 'Mic saja' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={modeBAudioSource === option.value}
                      disabled={isModeBActionPending || isModeBBusy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void onUpdateSettings?.({ ...settings, modeBAudioSource: option.value });
                      }}
                      className={`rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-50 ${
                        modeBAudioSource === option.value
                          ? 'border-sky-500 bg-sky-950/60 text-sky-200'
                          : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="block text-[11px] font-bold">{option.label}</span>
                      <span className="block text-[9px] mt-0.5 opacity-80">{option.detail}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] leading-relaxed text-slate-500">
                  {isEnglish
                    ? 'Internal audio requires Android 10+ and RECORD_AUDIO permission. Mixed captures both device playback and microphone where supported.'
                    : 'Audio internal memerlukan Android 10+ dan izin RECORD_AUDIO. Campuran menangkap audio sistem dan mikrofon bila didukung perangkat.'}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    {isEnglish ? 'Native Encoder Status' : 'Status Encoder Native'}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide ${
                      isModeBLiveVerified || modeBStatus.status === 'host_wait'
                        ? 'text-emerald-400'
                        : modeBStatus.status === 'error' || modeBStatus.status === 'capture_lost'
                        ? 'text-rose-400'
                        : isModeBBusy
                        ? 'text-amber-300'
                        : 'text-slate-400'
                    }`}
                  >
                    {modeBStatus.status === 'live'
                      ? 'LIVE'
                      : modeBStatus.status === 'host_wait'
                      ? 'LIVE · LAYAR TUNGGU'
                      : modeBStatus.status === 'reshare_waiting'
                      ? 'LIVE · MENUNGGU LAYAR'
                      : modeBStatus.status === 'resharing'
                      ? 'LIVE · MENYAMBUNGKAN LAYAR'
                      : modeBStatus.status.replaceAll('_', ' ')}
                    {modeBStatus.bitrateKbps > 0 ? ` · ${modeBStatus.bitrateKbps} kbps` : ''}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300" role="status" aria-live="polite">
                  {modeBStatus.status === 'capture_lost'
                    ? isEnglish
                      ? 'Screen capture stopped by Android or user. RTMP session ended. Start again to grant fresh screen permission.'
                      : modeBStatus.message || 'Capture layar dihentikan oleh sistem atau pengguna. Mulai ulang siaran untuk izin layar baru.'
                    : modeBStatus.status === 'reshare_waiting'
                    ? isEnglish
                      ? 'RTMP session remains active. Tap Share Screen Again to restore video frames.'
                      : 'Koneksi RTMP tetap aktif. Ketuk Bagikan Layar Lagi untuk memulihkan tampilan video.'
                    : modeBStatus.message}
                </p>
              </div>

              {!modeBRtmpCheck.valid && (
                <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-700/50 text-[11px] text-amber-200 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>{modeBRtmpCheck.summaryError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('settings')}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 text-black font-bold text-[10px] shrink-0"
                  >
                    Atur RTMP
                  </button>
                </div>
              )}

              {modeBNotificationWarning && (
                <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-700/50 text-[11px] text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{modeBNotificationWarning}</span>
                </div>
              )}

              {activePreset?.backgroundUri && (
                <p className="text-[10px] leading-relaxed text-sky-300/90" role="note">
                  Mode B menampilkan background lokal di bawah layer Tangkapan Layar. Pastikan elemen Tangkapan Layar berada pada layer paling bawah di Studio (Crop Fit &amp; rotasi 0°/90°/180°/270°).
                </p>
              )}
            </div>

            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2 cursor-default"
            >
              <button
                type="button"
                disabled={
                  isModeBActionPending ||
                  modeBStatus.status === 'live' ||
                  modeBStatus.status === 'host_wait' ||
                  ['starting', 'connecting', 'stopping', 'resharing'].includes(modeBStatus.status)
                }
                onClick={() => {
                  if (
                    modeBStatus.status === 'reshare_waiting' ||
                    (modeBStatus.status === 'capture_lost' && modeBStatus.isStreaming)
                  ) {
                    void onRequestModeBReshare?.();
                  } else {
                    void onStartModeBStream?.();
                  }
                }}
                className="flex-1 min-w-[160px] py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isModeBActionPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>
                  {isModeBActionPending
                    ? 'Memproses…'
                    : modeBStatus.status === 'live'
                    ? 'Siaran LIVE Aktif'
                    : modeBStatus.status === 'reshare_waiting'
                    ? 'Bagikan Layar Lagi'
                    : modeBStatus.status === 'resharing'
                    ? 'Menyambungkan Layar…'
                    : modeBStatus.status === 'capture_lost'
                    ? 'Bagikan Layar Lagi & Mulai Ulang'
                    : 'Mulai Siaran RTMP (Go Live)'}
                </span>
              </button>

              <button
                type="button"
                disabled={isModeBActionPending || !isModeBStoppableStatus(modeBStatus.status)}
                onClick={() => {
                  void onStopModeBStream?.();
                }}
                className="py-2.5 px-3.5 rounded-xl bg-rose-950/60 border border-rose-700/80 text-xs font-bold text-rose-100 hover:bg-rose-900/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Hentikan</span>
              </button>

              {['live', 'host_wait'].includes(modeBStatus.status) && (
                <button
                  type="button"
                  disabled={isModeBActionPending}
                  onClick={() => {
                    void onToggleModeBHostWait?.();
                  }}
                  className={`py-2.5 px-3.5 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-40 ${
                    modeBStatus.status === 'host_wait'
                      ? 'bg-cyan-950/60 border-cyan-600 text-cyan-200 hover:bg-cyan-900/70'
                      : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-cyan-600 hover:text-cyan-200'
                  }`}
                >
                  {modeBStatus.status === 'host_wait' ? 'Lanjutkan Tampilan LIVE' : 'Layar Tunggu Host'}
                </button>
              )}

              <button
                type="button"
                onClick={() => onNavigate('settings')}
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
                {t('dash.hudTitle')}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 max-w-xl">
                {t('dash.hudSubtitle')}
              </p>
            </div>

            {/* Live Status Badge */}
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              {isHudVisible ? (
                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-950/90 text-emerald-400 border border-emerald-600/60 flex items-center gap-2 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  {t('dash.hudActive')}
                </span>
              ) : (
                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-900/90 text-slate-400 border border-slate-700 flex items-center gap-2 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                  {t('dash.hudInactive')}
                </span>
              )}
            </div>
          </div>

          {/* Alur Mulai Sesi Mode A + 4 Status Jujur */}
          <div className="p-4 rounded-xl bg-[#080c16]/90 border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-white flex flex-wrap items-center gap-2">
                  <span>Sesi Mode A &amp; Status Koneksi</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                      hasValidTargetUsername
                        ? 'bg-blue-950/70 text-blue-300 border-blue-700/60'
                        : 'bg-slate-900 text-slate-400 border-slate-700'
                    }`}
                  >
                    {hasValidTargetUsername ? `Target: @${targetUsername}` : 'Target: Belum diatur'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Status akun, target LIVE publik, sesi companion, room LIVE, dan transport event dilaporkan terpisah secara jujur.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!companionRunning && modeASessionMode === 'inactive' ? (
                  <button
                    type="button"
                    disabled={isSessionActionPending}
                    onClick={handlePressStartSession}
                    className="py-2.5 px-4 rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/30 active:scale-[0.98]"
                  >
                    {isSessionActionPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    <span>Mulai Sesi</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSessionActionPending}
                    onClick={() => void handleStopSession()}
                    className="py-2.5 px-4 rounded-xl bg-rose-900/70 hover:bg-rose-800/80 border border-rose-600 text-rose-100 text-xs font-bold flex items-center gap-2 active:scale-[0.98]"
                  >
                    {isSessionActionPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    <span>Hentikan Sesi</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onOpenTikTokConnection?.()}
                  className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Link2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Atur TikTok</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-[11px]">
              <div className="p-2.5 rounded-lg bg-[#0e172a] border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Target LIVE</div>
                <div className="font-bold text-white mt-0.5 font-mono truncate">
                  {hasValidTargetUsername ? `@${targetUsername}` : 'Belum diatur'}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {tiktokAccount.isLinked ? `OAuth: ${honestStatus.accountLinked.label}` : 'OAuth opsional'}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0e172a] border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Mode A Session</div>
                <div className="font-bold text-white mt-0.5">{honestStatus.modeASession.label}</div>
                <div className="text-[10px] text-slate-400 truncate">{honestStatus.modeASession.detail}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0e172a] border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Room Status</div>
                <div className="font-bold text-white mt-0.5">{honestStatus.roomStatus.label}</div>
                <div className="text-[10px] text-slate-400">
                  {tiktokAccount.connectionMethod === 'euler' ? 'Via EulerStream' : 'Direct TikTok'}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0e172a] border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Event Transport</div>
                <div className="font-bold text-white mt-0.5">{honestStatus.eventTransport.label}</div>
                <div className="text-[10px] text-slate-400 truncate">{honestStatus.eventTransport.detail}</div>
              </div>
            </div>

            {sessionValidationError && (
              <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-700/60 text-[11px] text-rose-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{sessionValidationError}</span>
              </div>
            )}

            {modeASessionMode === 'without_live_connection' && (
              <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-700/50 text-[11px] text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Sesi Mode A aktif tanpa koneksi LIVE: event LIVE (chat, gift, follow) belum tersedia. Elemen overlay lokal tetap dapat digunakan.
                </span>
              </div>
            )}

            {tiktokStatus.state === 'error' && (
              <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-700/50 text-[11px] text-rose-200">
                <span className="font-bold">Status Transport: </span>
                <span>{tiktokStatus.message}</span>
              </div>
            )}
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
              <span>{t('dash.showHud')}</span>
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
              <span>{t('dash.hideHud')}</span>
            </button>

            <button
              type="button"
              onClick={refreshHudStatus}
              disabled={isHudActionPending}
              className="py-3 px-4 rounded-xl bg-[#080c16] hover:bg-slate-800/80 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center gap-2 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 text-slate-400" />
              <span>{t('dash.checkNativeStatus')}</span>
            </button>
          </div>

          {/* Overlay Permission Warning if not granted on native Android */}
          {!isOverlayGranted && isNativeAndroid() && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-600/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-300">{t('dash.overlayWarningTitle')}</div>
                  <div className="text-slate-300 text-[11px] leading-relaxed">
                    {t('dash.overlayWarningDesc')}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRequestOverlay}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shrink-0 self-start sm:self-auto transition-colors flex items-center gap-1.5"
              >
                <span>{t('dash.openOverlayPerm')}</span>
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
              {t('dash.hardwareTitle')}
            </h2>
            <p className="text-xs text-slate-400">
              {t('dash.hardwareDesc')}
            </p>
          </div>
          <span className="text-[11px] font-semibold text-blue-300 bg-blue-950/60 border border-blue-900/60 px-2.5 py-1 rounded-md">
            {isEnglish ? 'Profile: Balanced' : 'Profil: Seimbang (Balanced)'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Camera className="w-3.5 h-3.5 text-blue-400" />
              <span>{isEnglish ? 'Video Camera' : 'Kamera Video'}</span>
            </div>
            <div className="text-sm font-bold text-emerald-400">{isEnglish ? 'Ready (Front/Back)' : 'Siap (Kamera Depan/Belakang)'}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{isEnglish ? 'Supports 9:16 portrait' : 'Mendukung orientasi 9:16'}</div>
          </div>

          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isEnglish ? 'Microphone & Audio' : 'Mikrofon & Audio'}</span>
            </div>
            <div className="text-sm font-bold text-emerald-400">{isEnglish ? 'Mic Active + SFX' : 'Mic Aktif + SFX'}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{isEnglish ? 'Internal audio supported' : 'Audio internal didukung'}</div>
          </div>

          <div
            onClick={() => onNavigate('studio')}
            className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80 hover:border-blue-500/60 transition-colors cursor-pointer"
            title={isEnglish ? 'Open Preset in Studio Editor' : 'Buka Preset di Studio Editor'}
          >
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Tv className="w-3.5 h-3.5 text-purple-400" />
              <span>{isEnglish ? 'Studio Scene Status' : 'Status Scene Studio'}</span>
            </div>
            <div className="text-sm font-bold text-white font-mono truncate">
              {activePreset ? activePreset.name : 'Mobile Gaming (9:16)'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {visibleElementsCount} {isEnglish ? 'active elements' : 'elemen aktif'} ({activePreset?.canvasOrientation || '9:16'})
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <Thermometer className="w-3.5 h-3.5 text-amber-400" />
              <span>{isEnglish ? 'Thermal & Battery' : 'Suhu & Baterai'}</span>
            </div>
            <div className="text-sm font-bold text-white font-mono">
              36.2°C · ~4.1%/jam
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5">{isEnglish ? 'Thermal safe (Cool)' : 'Suhu aman (Dingin)'}</div>
          </div>
        </div>
      </section>

      {/* Peringatan Izin Android System */}
      <section className="p-4 rounded-xl bg-[#0a1120] border border-blue-900/40 text-xs text-slate-300 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-400 font-bold">
            <ShieldAlert className="w-4 h-4 text-blue-400" />
            <span>{t('dash.permCheckTitle')}</span>
          </div>
          <button
            onClick={() => onNavigate('settings')}
            className="text-xs text-blue-400 hover:underline"
          >
            {t('dash.managePerm')}
          </button>
        </div>
        <p className="leading-relaxed text-[11px] text-slate-300">
          Izin <code>SYSTEM_ALERT_WINDOW</code> (Jendela Mengambang) diperlukan untuk Mode A (TikTok Companion). Izin <code>POST_NOTIFICATIONS</code> diperlukan Android 13+ untuk status foreground service Mode A dan Mode B. Izin <code>READ_MEDIA_AUDIO</code> dan <code>RECORD_AUDIO</code> diperlukan untuk audio lokal, capture audio internal/mikrofon, serta MediaProjection untuk Mode B.
        </p>
      </section>
    </div>
  );
};
