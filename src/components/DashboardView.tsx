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
  Layers,
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
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  PauseCircle,
} from 'lucide-react';
import {
  isNativeAndroid,
  checkOverlayPermission,
  requestOverlayPermission,
  checkNotificationPermission,
  checkMicPermission,
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

type CheckedPermissionState = 'unchecked' | 'granted' | 'denied' | 'web_only';

const toneTextClass = (tone?: 'ok' | 'warn' | 'error' | 'off' | 'neutral') => {
  switch (tone) {
    case 'ok':
      return 'text-emerald-400';
    case 'warn':
      return 'text-amber-300';
    case 'error':
      return 'text-rose-400';
    case 'off':
      return 'text-slate-400';
    default:
      return 'text-slate-300';
  }
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  settings,
  activePreset,
  integrations: _integrations,
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

  const isNative = isNativeAndroid();
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

  // Native Floating HUD State (Mode A)
  const [isHudVisible, setIsHudVisible] = useState(false);
  const [isOverlayGranted, setIsOverlayGranted] = useState(false);
  const [overlayChecked, setOverlayChecked] = useState(false);
  const [isHudActionPending, setIsHudActionPending] = useState(false);
  const [hudFeedback, setHudFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [lastHudClickTime, setLastHudClickTime] = useState<string | null>(null);

  // Real Android Device Permission Readiness State (honest: unchecked until explicitly checked)
  const [notifPermission, setNotifPermission] = useState<CheckedPermissionState>('unchecked');
  const [micPermission, setMicPermission] = useState<CheckedPermissionState>('unchecked');
  const [isReadinessChecking, setIsReadinessChecking] = useState(false);
  const [mobileReadinessOpen, setMobileReadinessOpen] = useState(false);

  const refreshHudStatus = useCallback(async () => {
    try {
      const [hudRes, overlayRes] = await Promise.all([
        isFloatingHudVisible(),
        checkOverlayPermission(),
      ]);
      setIsHudVisible(!!hudRes?.isVisible);
      setIsOverlayGranted(!!overlayRes?.granted);
      setOverlayChecked(true);
    } catch (err) {
      console.warn('Gagal membaca status HUD:', err);
    }
  }, []);

  const handleRunReadinessCheck = useCallback(async () => {
    setIsReadinessChecking(true);
    try {
      if (!isNativeAndroid()) {
        setOverlayChecked(true);
        setIsOverlayGranted(false);
        setNotifPermission('web_only');
        setMicPermission('web_only');
        return;
      }

      const [overlayRes, notifRes, micRes, hudRes] = await Promise.all([
        checkOverlayPermission(),
        checkNotificationPermission(),
        checkMicPermission(),
        isFloatingHudVisible(),
      ]);
      setOverlayChecked(true);
      setIsOverlayGranted(!!overlayRes?.granted);
      setNotifPermission(notifRes?.granted ? 'granted' : 'denied');
      setMicPermission(micRes?.granted ? 'granted' : 'denied');
      setIsHudVisible(!!hudRes?.isVisible);
    } catch (err) {
      console.warn('Gagal memeriksa kesiapan izin perangkat:', err);
    } finally {
      setIsReadinessChecking(false);
    }
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    if (isModeA) {
      void refreshHudStatus();
    }

    let listenerHandle: { remove?: () => Promise<void> | void } | null = null;

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
          window.setTimeout(() => {
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
      void setupClickListener();
    }

    return () => {
      isSubscribed = false;
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        void listenerHandle.remove();
      }
    };
  }, [isModeA, refreshHudStatus]);

  const handleShowHud = async () => {
    setIsHudActionPending(true);
    setHudFeedback(null);
    try {
      const permRes = await checkOverlayPermission();
      setIsOverlayGranted(!!permRes.granted);
      setOverlayChecked(true);

      if (!permRes.granted && isNativeAndroid()) {
        setHudFeedback({
          type: 'error',
          message:
            'Izin Tampilkan di Atas Aplikasi Lain (SYSTEM_ALERT_WINDOW) belum aktif. Buka pengaturan izin overlay terlebih dahulu.',
        });
        setIsHudActionPending(false);
        return;
      }

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
    } catch (err: unknown) {
      setHudFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Terjadi kesalahan saat memanggil Floating HUD.',
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
    } catch (err: unknown) {
      setHudFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Gagal menyembunyikan Floating HUD.',
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
          message:
            'Aktifkan toggle "Izinkan ditampilkan di atas aplikasi lain", lalu kembali ke SYNTXRR STREAM.',
        });
      } else if (res.message) {
        setHudFeedback({
          type: 'info',
          message: res.message,
        });
      }
    } catch (err: unknown) {
      setHudFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Gagal membuka halaman pengaturan izin.',
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

  // Mode A derived honest states
  const isModeASessionActive = companionRunning || modeASessionMode !== 'inactive';
  const isLiveTransportConnected =
    tiktokStatus.state === 'connected_direct' || tiktokStatus.state === 'connected_euler';
  const hasLiveRoomNumbers = isLiveTransportConnected && tiktokStatus.roomStatus === 'live';

  // Mode B derived honest states
  const modeBRtmpCheck = validateModeBRtmpConfig(settings.rtmpServer, settings.streamKey);
  const modeBAudioSource: ModeBAudioSource =
    settings.modeBAudioSource === 'internal' || settings.modeBAudioSource === 'microphone'
      ? settings.modeBAudioSource
      : 'mix';
  const isModeBLiveVerified = modeBStatus.status === 'live' && modeBStatus.isStreaming;
  const isModeBBusy = isModeBSessionActive(modeBStatus);
  const needsModeBReshare =
    modeBStatus.status === 'capture_lost' || modeBStatus.status === 'reshare_waiting';

  const modeBBitrateDisplay =
    modeBStatus.bitrateKbps > 0 &&
    (modeBStatus.isStreaming ||
      modeBStatus.status === 'live' ||
      modeBStatus.status === 'host_wait' ||
      modeBStatus.status === 'reshare_waiting')
      ? `${modeBStatus.bitrateKbps.toLocaleString('en-US')} kbps`
      : '—';

  const heroStatusTone: 'ok' | 'warn' | 'error' | 'neutral' = isModeA
    ? isLiveTransportConnected
      ? 'ok'
      : tiktokStatus.state === 'error'
      ? 'error'
      : isModeASessionActive ||
        tiktokStatus.state === 'waiting_for_live' ||
        tiktokStatus.state === 'reconnecting'
      ? 'warn'
      : 'neutral'
    : isModeBLiveVerified
    ? 'ok'
    : modeBStatus.status === 'error' ||
      modeBStatus.status === 'capture_lost' ||
      modeBStatus.status === 'disconnected'
    ? 'error'
    : isModeBBusy
    ? 'warn'
    : 'neutral';

  const heroStatusHeadline = isModeA
    ? isLiveTransportConnected
      ? `${honestStatus.modeASession.label} · ${honestStatus.eventTransport.label}`
      : isModeASessionActive
      ? `${honestStatus.modeASession.label} · ${honestStatus.eventTransport.label}`
      : t('dash.statusNotConnected')
    : isModeBLiveVerified
    ? `RTMP LIVE${modeBStatus.bitrateKbps > 0 ? ` · ${modeBStatus.bitrateKbps} kbps` : ''}`
    : modeBStatus.status === 'host_wait'
    ? 'LIVE · Layar Tunggu Host'
    : modeBStatus.status === 'reshare_waiting'
    ? 'LIVE · Menunggu Share Layar'
    : modeBStatus.status === 'resharing'
    ? 'Menyambungkan Share Layar…'
    : modeBStatus.status === 'starting' || modeBStatus.status === 'connecting'
    ? 'Menghubungkan Encoder RTMP…'
    : modeBStatus.status === 'stopping'
    ? 'Menghentikan Encoder…'
    : modeBStatus.status === 'capture_lost'
    ? 'Capture Layar Terputus'
    : modeBStatus.status === 'error'
    ? 'Encoder Error'
    : modeBStatus.status === 'disconnected'
    ? 'RTMP Terputus'
    : modeBStatus.status === 'stopped'
    ? 'Siaran Berhenti'
    : isEnglish
    ? 'Encoder Standby'
    : 'Mode B Standby';

  // Contextual Recovery Banner calculation (C): hidden when healthy/standby
  const recoveryItem: {
    severity: 'error' | 'warn';
    title: string;
    detail: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null = (() => {
    if (isModeA) {
      if (sessionValidationError) {
        return {
          severity: 'error',
          title: isEnglish ? 'Target Username Required' : 'Target Username Diperlukan',
          detail: sessionValidationError,
          actionLabel: isEnglish ? 'Set in Connections' : 'Atur TikTok',
          onAction: () => onOpenTikTokConnection?.(),
        };
      }
      if (tiktokStatus.state === 'error') {
        return {
          severity: 'error',
          title: isEnglish ? 'TikTok Transport Error' : 'Kendala Koneksi Event TikTok',
          detail: tiktokStatus.message || 'Gagal menyambung ke room LIVE TikTok.',
          actionLabel: isEnglish ? 'Check Connection' : 'Periksa Koneksi',
          onAction: () => onOpenTikTokConnection?.(),
        };
      }
      if (isNative && overlayChecked && !isOverlayGranted) {
        return {
          severity: 'warn',
          title: t('dash.overlayWarningTitle'),
          detail: t('dash.overlayWarningDesc'),
          actionLabel: t('dash.openOverlayPerm'),
          onAction: () => void handleRequestOverlay(),
        };
      }
      if (modeASessionMode === 'without_live_connection') {
        return {
          severity: 'warn',
          title: isEnglish
            ? 'Companion Active Without LIVE Connection'
            : 'Sesi Mode A Aktif Tanpa Koneksi LIVE',
          detail: isEnglish
            ? 'Local overlay controls remain available, but TikTok LIVE chat, gift, and follow events are not connected.'
            : 'Event LIVE (chat, gift, follow) belum masuk. Overlay lokal dan kontrol HUD tetap berjalan.',
          actionLabel: hasValidTargetUsername ? undefined : isEnglish ? 'Set Target' : 'Atur Target',
          onAction: hasValidTargetUsername ? undefined : () => onOpenTikTokConnection?.(),
        };
      }
      return null;
    }

    // Mode B contextual recovery
    if (needsModeBReshare) {
      return {
        severity: modeBStatus.status === 'capture_lost' ? 'error' : 'warn',
        title:
          modeBStatus.status === 'capture_lost'
            ? isEnglish
              ? 'Screen Capture Stopped'
              : 'Capture Layar Android Terputus'
            : isEnglish
            ? 'Waiting for Screen Reshare'
            : 'Menunggu Persetujuan Share Layar',
        detail:
          modeBStatus.status === 'capture_lost'
            ? modeBStatus.message ||
              (isEnglish
                ? 'Screen capture ended by Android or user. Grant screen capture permission again to resume.'
                : 'Capture layar dihentikan oleh sistem atau pengguna. Minta ulang share layar untuk memulihkan tampilan.')
            : isEnglish
            ? 'RTMP session remains active. Tap Share Screen Again to restore video frames.'
            : 'Sesi RTMP masih tersambung. Ketuk Bagikan Layar Lagi untuk memulihkan visual.',
        actionLabel:
          modeBStatus.status === 'reshare_waiting' || modeBStatus.isStreaming
            ? isEnglish
              ? 'Share Screen Again'
              : 'Bagikan Layar Lagi'
            : isEnglish
            ? 'Reshare & Restart'
            : 'Bagikan Layar & Mulai Ulang',
        onAction: () => {
          if (modeBStatus.status === 'reshare_waiting' || modeBStatus.isStreaming) {
            void onRequestModeBReshare?.();
          } else {
            void onStartModeBStream?.();
          }
        },
      };
    }

    if (modeBStatus.status === 'error' || modeBStatus.status === 'disconnected') {
      return {
        severity: 'error',
        title:
          modeBStatus.status === 'error'
            ? isEnglish
              ? 'Encoder Error'
              : 'Kesalahan Encoder RTMP'
            : isEnglish
            ? 'RTMP Disconnected'
            : 'Koneksi RTMP Terputus',
        detail:
          modeBStatus.message ||
          (isEnglish
            ? 'Check RTMP endpoint, stream key, and network connection before retrying.'
            : 'Periksa alamat server RTMP, Stream Key, dan jaringan sebelum memulai ulang.'),
        actionLabel: isEnglish ? 'RTMP Settings' : 'Pengaturan RTMP',
        onAction: () => onNavigate('settings'),
      };
    }

    if (!modeBRtmpCheck.valid) {
      return {
        severity: 'warn',
        title: isEnglish ? 'RTMP Configuration Incomplete' : 'Konfigurasi RTMP Belum Lengkap',
        detail:
          modeBRtmpCheck.summaryError ||
          (isEnglish
            ? 'Configure RTMP server URL and stream key before starting broadcast.'
            : 'Lengkapi URL server RTMP dan Stream Key sebelum memulai siaran.'),
        actionLabel: isEnglish ? 'Configure RTMP' : 'Atur RTMP',
        onAction: () => onNavigate('settings'),
      };
    }

    if (modeBNotificationWarning) {
      return {
        severity: 'warn',
        title: isEnglish ? 'Android Notification Permission' : 'Izin Notifikasi Android',
        detail: modeBNotificationWarning,
        actionLabel: isEnglish ? 'Manage Permissions' : 'Kelola Izin',
        onAction: () => onNavigate('settings'),
      };
    }

    return null;
  })();

  const readinessRows: Array<{
    id: string;
    label: string;
    value: string;
    tone: 'ok' | 'warn' | 'error' | 'neutral';
  }> = [
    {
      id: 'overlay',
      label: isEnglish ? 'Floating Overlay (Mode A)' : 'Floating Overlay (Mode A)',
      value: !isNative
        ? isEnglish
          ? 'Android APK only'
          : 'Khusus APK Android'
        : !overlayChecked
        ? isEnglish
          ? 'Not checked'
          : 'Belum diperiksa'
        : isOverlayGranted
        ? isEnglish
          ? 'Granted'
          : 'Diizinkan'
        : isEnglish
        ? 'Not granted'
        : 'Belum diizinkan',
      tone: !isNative
        ? 'neutral'
        : !overlayChecked
        ? 'neutral'
        : isOverlayGranted
        ? 'ok'
        : 'warn',
    },
    {
      id: 'notifications',
      label: isEnglish ? 'Notifications (Android 13+)' : 'Notifikasi (Android 13+)',
      value: !isNative
        ? isEnglish
          ? 'Android APK only'
          : 'Khusus APK Android'
        : modeBNotificationWarning
        ? isEnglish
          ? 'Denied'
          : 'Belum diizinkan'
        : notifPermission === 'unchecked'
        ? isEnglish
          ? 'Not checked'
          : 'Belum diperiksa'
        : notifPermission === 'granted'
        ? isEnglish
          ? 'Granted'
          : 'Diizinkan'
        : isEnglish
        ? 'Required'
        : 'Diperlukan',
      tone: !isNative
        ? 'neutral'
        : modeBNotificationWarning || notifPermission === 'denied'
        ? 'warn'
        : notifPermission === 'granted'
        ? 'ok'
        : 'neutral',
    },
    {
      id: 'mic',
      label: isEnglish ? 'Microphone (RECORD_AUDIO)' : 'Mikrofon (RECORD_AUDIO)',
      value: !isNative
        ? isEnglish
          ? 'Android APK only'
          : 'Khusus APK Android'
        : micPermission === 'unchecked'
        ? isEnglish
          ? 'Not checked'
          : 'Belum diperiksa'
        : micPermission === 'granted'
        ? isEnglish
          ? 'Granted'
          : 'Diizinkan'
        : isEnglish
        ? 'Not granted'
        : 'Belum diizinkan',
      tone: !isNative
        ? 'neutral'
        : micPermission === 'granted'
        ? 'ok'
        : micPermission === 'denied'
        ? 'warn'
        : 'neutral',
    },
    {
      id: 'screen',
      label: isEnglish ? 'Screen Capture (Mode B)' : 'Capture Layar (Mode B)',
      value: needsModeBReshare
        ? isEnglish
          ? 'Reshare required'
          : 'Perlu share ulang'
        : isModeBLiveVerified
        ? isEnglish
          ? 'Active session'
          : 'Aktif di sesi'
        : isEnglish
        ? 'Prompt on broadcast start'
        : 'Prompt saat mulai siaran',
      tone: needsModeBReshare ? 'warn' : isModeBLiveVerified ? 'ok' : 'neutral',
    },
  ];

  return (
    <div className="space-y-5 pb-20 md:pb-8">
      {/* Dialog Mulai Sesi Mode A — Kondisi A (Target Username Belum Diatur) */}
      {startSessionDialog === 'unlinked' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mode-a-unlinked-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#0e1626] border border-slate-700 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3
                  id="mode-a-unlinked-title"
                  className="text-base font-bold text-white font-['Bricolage_Grotesque','Plus_Jakarta_Sans',sans-serif]"
                >
                  Target username LIVE belum diatur
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStartSessionDialog(null)}
                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Overlay dan Floating HUD tetap tampil, tetapi gift, chat, dan follow tidak akan masuk sebelum target{' '}
              <span className="font-mono text-white">@username</span> LIVE TikTok diisi di Koneksi (tanpa perlu login OAuth).
            </p>

            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setStartSessionDialog(null);
                  onOpenTikTokConnection?.();
                }}
                className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-[#F2C230] hover:bg-[#f6cf58] text-[#111317] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Link2 className="w-4 h-4" />
                <span>Atur Target di Koneksi</span>
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmStartWithoutConnection()}
                className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors"
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
          <div className="bg-[#0e1626] border border-slate-700 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="mode-a-linked-title"
                  className="text-base font-bold text-white font-['Bricolage_Grotesque','Plus_Jakarta_Sans',sans-serif]"
                >
                  Siap memulai sesi Mode A?
                </h3>
                <div className="text-xs text-[#F2C230] mt-0.5 font-mono">
                  Target LIVE: @{targetUsername}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStartSessionDialog(null)}
                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => void handleConfirmConnectAndStart()}
                className="w-full text-left p-3.5 rounded-xl bg-[#F2C230] hover:bg-[#f6cf58] text-[#111317] transition-colors space-y-1"
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" />
                  <span>Sambungkan &amp; mulai</span>
                </div>
                <p className="text-[11px] text-[#111317]/80 leading-relaxed font-medium">
                  Hubungkan SYNTXRR ke room LIVE publik @{targetUsername}. Kalau belum LIVE di aplikasi TikTok, konektor menunggu sampai LIVE dimulai.
                </p>
              </button>

              <button
                type="button"
                onClick={() => void handleConfirmStartWithoutConnection()}
                className="w-full text-left p-3.5 rounded-xl bg-[#080c16] hover:bg-slate-800 border border-slate-700 text-slate-200 transition-colors space-y-1"
              >
                <div className="text-xs font-bold">Mulai tanpa koneksi</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Companion dan Floating HUD tetap aktif tanpa menghubungkan event LIVE.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* A. Header Ringkas & Satu Selector Mode A / Mode B */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-baseline justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-slate-400 tracking-wide">
              <span>{isEnglish ? 'Broadcast Control Center' : 'Pusat Kendali Siaran'}</span>
              <span aria-hidden="true"> · </span>
              <span className="font-mono tabular-nums text-slate-300">
                {settings.targetResolution} · {settings.frameRate} FPS
              </span>
            </div>
            <h1
              className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5 truncate font-['Bricolage_Grotesque','Plus_Jakarta_Sans',sans-serif]"
            >
              SYNTXRR STREAM
            </h1>
          </div>

          <button
            type="button"
            onClick={onOpenModeModal}
            className="sm:hidden shrink-0 text-xs font-medium text-slate-300 hover:text-[#F2C230] inline-flex items-center gap-1 min-h-[36px]"
          >
            <span>{t('dash.modeArchitecture')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <div
            className="grid grid-cols-2 sm:inline-flex flex-1 sm:flex-initial p-1 rounded-xl bg-[#080c16] border border-slate-800"
            role="tablist"
            aria-label="Pilih mode operasi"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isModeA}
              aria-controls="mode-a-details"
              onClick={() => onSelectMode('MODE_A_TIKTOK_COMPANION')}
              className={`min-h-[42px] px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                isModeA
                  ? 'bg-[#0e1626] text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <span className={isModeA ? 'text-[#F2C230]' : ''}>Mode A</span>
              <span className="hidden sm:inline text-slate-400 font-normal"> · Companion</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isModeA}
              aria-controls="mode-b-details"
              onClick={() => onSelectMode('MODE_B_STREAMING_ENCODER')}
              className={`min-h-[42px] px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                !isModeA
                  ? 'bg-[#0e1626] text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <span className={!isModeA ? 'text-[#F2C230]' : ''}>Mode B</span>
              <span className="hidden sm:inline text-slate-400 font-normal"> · Encoder RTMP</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenModeModal}
            className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-[#F2C230] transition-colors whitespace-nowrap min-h-[36px]"
          >
            <span>{t('dash.modeArchitecture')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* C. Contextual Recovery (Hanya tampil saat benar-benar ada masalah atau tindakan diperlukan) */}
      {recoveryItem && (
        <section
          role="alert"
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            recoveryItem.severity === 'error'
              ? 'bg-rose-950/35 border-rose-700/70'
              : 'bg-amber-950/30 border-amber-600/60'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                recoveryItem.severity === 'error' ? 'text-rose-400' : 'text-amber-300'
              }`}
            />
            <div className="min-w-0 space-y-0.5">
              <div
                className={`text-xs font-bold ${
                  recoveryItem.severity === 'error' ? 'text-rose-200' : 'text-amber-200'
                }`}
              >
                {recoveryItem.title}
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{recoveryItem.detail}</p>
            </div>
          </div>

          {recoveryItem.actionLabel && recoveryItem.onAction && (
            <button
              type="button"
              onClick={recoveryItem.onAction}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F2C230] hover:bg-[#f6cf58] text-[#111317] text-xs font-bold whitespace-nowrap shrink-0 self-start sm:self-center transition-colors"
            >
              {recoveryItem.actionLabel}
            </button>
          )}
        </section>
      )}

      {/* Adaptive 8 / 4 Desktop Layout & Priority Single-Column Android Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Main Operational Column (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* B. Hero Control Deck */}
          <section className="rounded-2xl bg-[#0e1626] border border-slate-800 p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-400">
                  <span className="text-[#F2C230] font-semibold">
                    {isModeA
                      ? 'Mode A · TikTok LIVE Companion'
                      : isEnglish
                      ? 'Mode B · Native RTMP Encoder'
                      : 'Mode B · Encoder RTMP Mandiri'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className={toneTextClass(heroStatusTone)}>{heroStatusHeadline}</span>
                </div>

                <h2
                  className="text-2xl sm:text-[26px] font-bold text-white tracking-tight font-['Bricolage_Grotesque','Plus_Jakarta_Sans',sans-serif]"
                >
                  {isModeA
                    ? hasValidTargetUsername
                      ? `@${targetUsername}`
                      : isEnglish
                      ? 'TikTok Companion Ready'
                      : 'Companion TikTok Siap'
                    : isModeBLiveVerified
                    ? isEnglish
                      ? 'RTMP Broadcast Active'
                      : 'Siaran RTMP Aktif'
                    : isEnglish
                    ? 'Standalone RTMP Output'
                    : 'Output Siaran RTMP'}
                </h2>

                <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                  {isModeA
                    ? isEnglish
                      ? 'Runs alongside the official TikTok app to manage your Floating HUD, comment TTS, and live room event feed without replacing TikTok Go Live.'
                      : 'Berjalan bersama aplikasi TikTok resmi untuk mengelola Floating HUD, TTS komentar, dan event room LIVE tanpa menggantikan proses Go Live TikTok.'
                    : isEnglish
                    ? 'Hardware-accelerated Android MediaProjection & H.264/AAC pipeline streaming directly to your configured RTMP ingest server.'
                    : 'Encoder native Android (MediaProjection + H.264/AAC) yang mengirim komposisi Studio langsung ke endpoint RTMP.'}
                </p>
              </div>
            </div>

            {/* Primary Operational Action Row */}
            {isModeA ? (
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 pt-1">
                {!isModeASessionActive ? (
                  <button
                    type="button"
                    disabled={isSessionActionPending}
                    onClick={handlePressStartSession}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F2C230] hover:bg-[#f6cf58] text-[#111317] text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                  >
                    {isSessionActionPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    <span>{isEnglish ? 'Start Companion Session' : 'Mulai Sesi Companion'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSessionActionPending}
                    onClick={() => void handleStopSession()}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 border border-rose-600/80 text-rose-100 text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                  >
                    {isSessionActionPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    <span>{isEnglish ? 'Stop Companion Session' : 'Hentikan Sesi'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onOpenTikTokConnection?.()}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#080c16] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Link2 className="w-3.5 h-3.5 text-[#F2C230]" />
                  <span>{isEnglish ? 'Configure TikTok' : 'Atur TikTok'}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 pt-1">
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
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F2C230] hover:bg-[#f6cf58] text-[#111317] text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                >
                  {isModeBActionPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Radio className="w-4 h-4" />
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
                  onClick={() => void onStopModeBStream?.()}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/80 text-rose-100 text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>{isEnglish ? 'Stop Broadcast' : 'Hentikan'}</span>
                </button>

                {['live', 'host_wait'].includes(modeBStatus.status) && (
                  <button
                    type="button"
                    disabled={isModeBActionPending}
                    onClick={() => void onToggleModeBHostWait?.()}
                    className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40 transition-colors ${
                      modeBStatus.status === 'host_wait'
                        ? 'bg-amber-950/50 border-amber-500/70 text-amber-200 hover:bg-amber-900/60'
                        : 'bg-[#080c16] border-slate-700 text-slate-200 hover:border-slate-600'
                    }`}
                  >
                    <PauseCircle className="w-3.5 h-3.5" />
                    <span>
                      {modeBStatus.status === 'host_wait'
                        ? 'Lanjutkan Tampilan LIVE'
                        : 'Layar Tunggu Host'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#080c16] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                >
                  RTMP Settings
                </button>
              </div>
            )}
          </section>

          {/* D. Panel Operasional — Strictly Isolated to Selected Mode */}
          {isModeA ? (
            <div id="mode-a-details" role="tabpanel" className="space-y-5">
              {/* 4 Status Jujur & Metrik LIVE */}
              <section className="rounded-2xl bg-[#0e1626] border border-slate-800 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white font-['Bricolage_Grotesque','Plus_Jakarta_Sans',sans-serif]">
                      {isEnglish
                        ? 'Companion Session & TikTok LIVE Status'
                        : 'Status Sesi Companion & Koneksi TikTok LIVE'}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {isEnglish
                        ? 'Companion service, public target, LIVE room state, and event transport are tracked separately.'
                        : 'Sesi companion, target LIVE, status room, dan transport event dilaporkan terpisah secara jujur.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
                    <div className="text-[11px] text-slate-400">Target LIVE</div>
                    <div className="font-bold text-white mt-1 font-mono truncate">
                      {hasValidTargetUsername ? `@${targetUsername}` : 'Belum diatur'}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {tiktokAccount.isLinked
                        ? `OAuth: ${honestStatus.accountLinked.label}`
                        : 'OAuth opsional'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
                    <div className="text-[11px] text-slate-400">Sesi Mode A</div>
                    <div
                      className={`font-bold mt-1 truncate ${toneTextClass(
                        honestStatus.modeASession.tone
                      )}`}
                    >
                      {honestStatus.modeASession.label}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {honestStatus.modeASession.detail}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
                    <div className="text-[11px] text-slate-400">Room Status</div>
                    <div
                      className={`font-bold mt-1 truncate ${toneTextClass(
                        honestStatus.roomStatus.tone
                      )}`}
                    >
                      {honestStatus.roomStatus.label}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {tiktokAccount.connectionMethod === 'euler'
                        ? 'Via EulerStream'
                        : 'Direct TikTok WS'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
                    <div className="text-[11px] text-slate-400">Event Transport</div>
                    <div
                      className={`font-bold mt-1 truncate ${toneTextClass(
                        honestStatus.eventTransport.tone
                      )}`}
                    >
                      {honestStatus.eventTransport.label}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {honestStatus.eventTransport.detail}
                    </div>
                  </div>
                </div>

                {/* Live Room Readout Hairline Row */}
                <div className="pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-400">
                      {isEnglish ? 'LIVE Viewers' : 'Penonton LIVE'}
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
                      {hasLiveRoomNumbers
                        ? tiktokStatus.viewerCount.toLocaleString('en-US')
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">
                      {isEnglish ? 'Total Likes' : 'Total Like'}
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
                      {hasLiveRoomNumbers
                        ? tiktokStatus.totalLikeCount.toLocaleString('en-US')
                        : '—'}
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <div className="text-[11px] text-slate-400">Room ID</div>
                    <div className="text-xs font-mono tabular-nums text-slate-300 mt-1 truncate">
                      {hasLiveRoomNumbers && tiktokStatus.roomId
                        ? tiktokStatus.roomId
                        : isEnglish
                        ? 'Unavailable'
                        : 'Tidak tersedia'}
                    </div>
                  </div>
                </div>
              </section>

              {/* Kontrol Native Floating HUD */}
              <section className="rounded-2xl bg-[#0e1626] border border-slate-800 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3
                      className="text-sm font-bold text-white flex items-center gap-2 font-['Bricolage_Grotesque','Plus_Jakarta_Sans',sans-serif]"
                    >
                      <Layers className="w-4 h-4 text-[#F2C230]" />
                      <span>{t('dash.hudTitle')}</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">{t('dash.hudSubtitle')}</p>
                  </div>
                  <span
                    className={`text-xs font-semibold shrink-0 ${
                      isHudVisible ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {isHudVisible ? t('dash.hudActive') : t('dash.hudInactive')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleShowHud()}
                    disabled={isHudActionPending || isHudVisible}
                    className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors ${
                      isHudVisible
                        ? 'bg-[#080c16] border border-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-[#F2C230] hover:bg-[#f6cf58] text-[#111317]'
                    }`}
                  >
                    {isHudActionPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                    <span>{t('dash.showHud')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleHideHud()}
                    disabled={isHudActionPending || !isHudVisible}
                    className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors ${
                      !isHudVisible
                        ? 'bg-[#080c16] border border-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/80 text-rose-200'
                    }`}
                  >
                    {isHudActionPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                    <span>{t('dash.hideHud')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void refreshHudStatus()}
                    disabled={isHudActionPending}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#080c16] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4 text-slate-400" />
                    <span>{t('dash.checkNativeStatus')}</span>
                  </button>
                </div>

                {!isOverlayGranted && isNative && (
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-amber-300">
                      Izin SYSTEM_ALERT_WINDOW belum aktif untuk overlay di atas TikTok.
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRequestOverlay()}
                      className="text-xs font-semibold text-[#F2C230] hover:underline inline-flex items-center gap-1"
                    >
                      <span>{t('dash.openOverlayPerm')}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {hudFeedback && (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      hudFeedback.type === 'success'
                        ? 'bg-emerald-950/45 border-emerald-700/70 text-emerald-200'
                        : hudFeedback.type === 'error'
                        ? 'bg-rose-950/45 border-rose-700/70 text-rose-200'
                        : 'bg-[#080c16] border-slate-700 text-slate-200'
                    }`}
                  >
                    {hudFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : hudFeedback.type === 'error' ? (
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    ) : (
                      <Smartphone className="w-4 h-4 shrink-0 text-[#F2C230]" />
                    )}
                    <span className="flex-1">{hudFeedback.message}</span>
                  </div>
                )}

                <div className="pt-2.5 border-t border-slate-800 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-slate-400">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      {lastHudClickTime
                        ? `Sentuhan bubble terdeteksi pada HP (${lastHudClickTime})`
                        : 'Ketuk bubble floating di HP untuk menguji respons klik bridge'}
                    </span>
                  </div>
                  {!isNative && (
                    <span className="text-slate-500 text-[10px]">
                      Browser preview: jalankan di APK untuk overlay native di atas TikTok
                    </span>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div id="mode-b-details" role="tabpanel" className="space-y-5">
              {/* Encoder Telemetry & Status Native */}
              <section className="rounded-2xl bg-[#0e1626] border border-slate-800 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white font-['Bricolage_Grotesque','Plus_Jakarta_Sans',sans-serif]">
                      {isEnglish ? 'Native Encoder Status' : 'Status Encoder Native RTMP'}
                    </h3>
                    <p
                      className="text-xs text-slate-300 mt-0.5 leading-relaxed"
                      role="status"
                      aria-live="polite"
                    >
                      {modeBStatus.status === 'capture_lost'
                        ? isEnglish
                          ? 'Screen capture stopped by Android or user. Start again or reshare to grant fresh screen permission.'
                          : modeBStatus.message ||
                            'Capture layar dihentikan oleh sistem atau pengguna. Mulai ulang siaran untuk izin layar baru.'
                        : modeBStatus.status === 'reshare_waiting'
                        ? isEnglish
                          ? 'RTMP session remains active. Tap Share Screen Again to restore video frames.'
                          : 'Koneksi RTMP tetap aktif. Ketuk Bagikan Layar Lagi untuk memulihkan tampilan video.'
                        : modeBStatus.message}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
                    <div className="text-[11px] text-slate-400">
                      {isEnglish ? 'Live Bitrate' : 'Bitrate Aktual'}
                    </div>
                    <div className="text-base font-bold font-mono tabular-nums text-white mt-1">
                      {modeBBitrateDisplay}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Target: {settings.videoBitrateKbps} kbps
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
                    <div className="text-[11px] text-slate-400">
                      {isEnglish ? 'RTMP Ingest' : 'Konfigurasi RTMP'}
                    </div>
                    <div
                      className={`font-bold mt-1 truncate ${
                        modeBRtmpCheck.valid ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {modeBRtmpCheck.valid
                        ? isEnglish
                          ? 'Server & Key Ready'
                          : 'Server & Key Siap'
                        : isEnglish
                        ? 'Incomplete'
                        : 'Belum Lengkap'}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                      {settings.rtmpServer?.trim() || 'Belum diisi'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#080c16] border border-slate-800">
                    <div className="text-[11px] text-slate-400">
                      {isEnglish ? 'Output Profile' : 'Profil Output'}
                    </div>
                    <div className="font-bold font-mono tabular-nums text-white mt-1">
                      {settings.targetResolution} · {settings.frameRate} FPS
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">H.264 HW · AAC</div>
                  </div>
                </div>
              </section>

              {/* Pemilihan Sumber Audio Mode B */}
              <section className="rounded-2xl bg-[#0e1626] border border-slate-800 p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3
                      className="text-sm font-bold text-white flex items-center gap-2 font-['Bricolage_Grotesque','Plus_Jakarta_Sans',sans-serif]"
                    >
                      <Sliders className="w-4 h-4 text-[#F2C230]" />
                      <span>
                        {isEnglish ? 'Broadcast Audio Source' : 'Sumber Audio Siaran Mode B'}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {isEnglish
                        ? 'Internal audio requires Android 10+ and RECORD_AUDIO permission. Mixed captures both device playback and microphone where supported.'
                        : 'Audio internal memerlukan Android 10+ dan izin RECORD_AUDIO. Campuran menangkap audio sistem dan mikrofon bila didukung perangkat.'}
                    </p>
                  </div>
                </div>

                <div
                  className="grid grid-cols-3 gap-2"
                  role="group"
                  aria-label={
                    isEnglish ? 'Select Mode B audio source' : 'Pilih sumber audio Mode B'
                  }
                >
                  {[
                    {
                      value: 'mix' as const,
                      label: isEnglish ? 'Mixed' : 'Campuran',
                      detail: isEnglish ? 'System + Mic' : 'Sistem + Mic',
                    },
                    {
                      value: 'internal' as const,
                      label: 'Internal',
                      detail: 'Android 10+',
                    },
                    {
                      value: 'microphone' as const,
                      label: isEnglish ? 'Microphone' : 'Mikrofon',
                      detail: isEnglish ? 'Mic only' : 'Mic saja',
                    },
                  ].map((option) => {
                    const selected = modeBAudioSource === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        disabled={isModeBActionPending || isModeBBusy}
                        onClick={() =>
                          void onUpdateSettings?.({
                            ...settings,
                            modeBAudioSource: option.value,
                          })
                        }
                        className={`min-h-[48px] rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                          selected
                            ? 'bg-[#080c16] border-[#F2C230] text-white'
                            : 'bg-[#080c16] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <span
                          className={`block text-xs font-bold ${
                            selected ? 'text-[#F2C230]' : ''
                          }`}
                        >
                          {option.label}
                        </span>
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          {option.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {activePreset?.backgroundUri && (
                  <p
                    className="pt-2 border-t border-slate-800 text-[11px] leading-relaxed text-slate-300"
                    role="note"
                  >
                    Mode B menampilkan background lokal di bawah layer Tangkapan Layar. Pastikan
                    elemen Tangkapan Layar berada pada layer paling bawah di Studio (Crop Fit &amp;
                    rotasi 0°/90°/180°/270°).
                  </p>
                )}
              </section>
            </div>
          )}
        </div>

        {/* E. Panel Konteks & Kesiapan Perangkat (4 cols Desktop / Stacked Mobile) */}
        <aside className="lg:col-span-4 space-y-5">
          {/* Active Studio Preset Card */}
          <section className="rounded-2xl bg-[#0e1626] border border-slate-800 p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-slate-400">{t('dash.activePreset')}</div>
              <button
                type="button"
                onClick={() => onNavigate('studio')}
                className="text-xs font-semibold text-[#F2C230] hover:underline inline-flex items-center gap-1"
              >
                <span>{t('dash.openStudioBtn')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="w-full text-left p-3.5 rounded-xl bg-[#080c16] border border-slate-800 hover:border-slate-700 transition-colors space-y-1"
            >
              <div
                className="text-base font-bold text-white truncate font-['Bricolage_Grotesque','Plus_Jakarta_Sans',sans-serif]"
              >
                {activePreset ? activePreset.name : 'Mobile Gaming (9:16)'}
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-400">
                {activePreset?.canvasOrientation || settings.canvasOrientation || '9:16'} ·{' '}
                {visibleElementsCount} {isEnglish ? 'active elements' : 'elemen aktif'}
              </div>
            </button>
          </section>

          {/* Real Device & Android Permission Readiness */}
          <section className="rounded-2xl bg-[#0e1626] border border-slate-800 p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMobileReadinessOpen((v) => !v)}
                className="lg:cursor-default text-left flex items-center gap-1.5 min-w-0"
              >
                <ShieldAlert className="w-4 h-4 text-[#F2C230] shrink-0" />
                <span className="text-sm font-bold text-white truncate font-['Bricolage_Grotesque','Plus_Jakarta_Sans',sans-serif]">
                  {t('dash.hardwareStatus')}
                </span>
                <span className="lg:hidden text-slate-400">
                  {mobileReadinessOpen ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </span>
              </button>

              <button
                type="button"
                disabled={isReadinessChecking}
                onClick={() => void handleRunReadinessCheck()}
                className="px-2.5 py-1.5 rounded-lg bg-[#080c16] hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-200 inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50 transition-colors"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isReadinessChecking ? 'animate-spin' : ''}`}
                />
                <span>{isEnglish ? 'Check' : 'Periksa'}</span>
              </button>
            </div>

            {/* Mobile collapsed summary */}
            {!mobileReadinessOpen && (
              <div className="lg:hidden text-xs text-slate-400">
                {!isNative
                  ? isEnglish
                    ? 'Android permission checks run inside installed APK. Tap to view details.'
                    : 'Pemeriksaan izin native berjalan di APK Android. Ketuk judul untuk detail.'
                  : overlayChecked && notifPermission !== 'unchecked' && micPermission !== 'unchecked'
                  ? isEnglish
                    ? 'Device permissions checked. Tap title to inspect.'
                    : 'Status izin telah diperiksa. Ketuk judul untuk detail.'
                  : isEnglish
                  ? 'Permissions not yet checked. Tap Check or expand.'
                  : 'Izin perangkat belum seluruhnya diperiksa. Ketuk Periksa.'}
              </div>
            )}

            <div
              className={`${
                mobileReadinessOpen ? 'block' : 'hidden lg:block'
              } space-y-3`}
            >
              <div className="divide-y divide-slate-800 text-xs">
                {readinessRows.map((row) => (
                  <div
                    key={row.id}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2"
                  >
                    <span className="text-slate-300 truncate">{row.label}</span>
                    <span
                      className={`font-mono text-[11px] font-medium shrink-0 ${toneTextClass(
                        row.tone
                      )}`}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400 leading-snug">
                  {isEnglish
                    ? 'No unverified device metrics are displayed.'
                    : 'Hanya menampilkan status izin & konfigurasi aktual.'}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className="text-xs font-semibold text-[#F2C230] hover:underline shrink-0"
                >
                  {t('dash.managePerm')}
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
