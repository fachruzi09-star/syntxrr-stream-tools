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
  Settings2,
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
type SemanticTone = 'ok' | 'warn' | 'error' | 'off' | 'neutral';

const getToneStyle = (tone?: SemanticTone) => {
  switch (tone) {
    case 'ok':
      return {
        color: 'var(--app-ok)',
        backgroundColor: 'var(--app-ok-soft)',
        borderColor: 'color-mix(in srgb, var(--app-ok) 36%, transparent)',
        dotColor: 'var(--app-ok)',
      };
    case 'warn':
      return {
        color: 'var(--app-warn)',
        backgroundColor: 'var(--app-warn-soft)',
        borderColor: 'color-mix(in srgb, var(--app-warn) 42%, transparent)',
        dotColor: 'var(--app-warn)',
      };
    case 'error':
      return {
        color: 'var(--app-error)',
        backgroundColor: 'var(--app-error-soft)',
        borderColor: 'color-mix(in srgb, var(--app-error) 45%, transparent)',
        dotColor: 'var(--app-error)',
      };
    case 'off':
      return {
        color: 'var(--app-text-muted)',
        backgroundColor: 'var(--app-surface-muted)',
        borderColor: 'var(--app-border)',
        dotColor: 'var(--app-text-muted)',
      };
    default:
      return {
        color: 'var(--app-text-secondary)',
        backgroundColor: 'var(--app-surface-muted)',
        borderColor: 'var(--app-border)',
        dotColor: 'var(--app-text-muted)',
      };
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

  const heroTonePalette = getToneStyle(heroStatusTone);

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

  // Contextual Recovery Banner calculation: hidden when healthy/standby
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
      label: 'Floating Overlay (Mode A)',
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

  const isPortraitPreset =
    (activePreset?.canvasOrientation || settings.canvasOrientation || '9:16') !== '16:9';

  return (
    <div className="space-y-4 sm:space-y-5 pb-2">
      {/* Dialog Mulai Sesi Mode A — Kondisi A (Target Username Belum Diatur) */}
      {startSessionDialog === 'unlinked' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mode-a-unlinked-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[var(--app-surface)] border border-[var(--app-border-strong)] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'var(--app-warn-soft)',
                    borderColor: 'color-mix(in srgb, var(--app-warn) 45%, transparent)',
                    color: 'var(--app-warn)',
                  }}
                >
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3
                  id="mode-a-unlinked-title"
                  className="font-display text-base font-bold text-[var(--app-text)] leading-snug"
                >
                  Target username LIVE belum diatur
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStartSessionDialog(null)}
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-elevated)] transition-colors shrink-0"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[var(--app-text-secondary)] leading-relaxed">
              Overlay dan Floating HUD tetap tampil, tetapi gift, chat, dan follow tidak akan masuk sebelum target{' '}
              <span className="font-mono-num text-[var(--app-text)] font-semibold">@username</span> LIVE TikTok diisi di Koneksi (tanpa perlu login OAuth).
            </p>

            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setStartSessionDialog(null);
                  onOpenTikTokConnection?.();
                }}
                className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Link2 className="w-4 h-4 shrink-0" />
                <span>Atur Target di Koneksi</span>
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmStartWithoutConnection()}
                className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[var(--app-text)] text-xs font-semibold transition-colors"
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
          <div className="bg-[var(--app-surface)] border border-[var(--app-border-strong)] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="mode-a-linked-title"
                  className="font-display text-base font-bold text-[var(--app-text)] leading-snug"
                >
                  Siap memulai sesi Mode A?
                </h3>
                <div className="text-xs text-[var(--app-accent-text)] mt-1 font-mono-num truncate">
                  Target LIVE: @{targetUsername}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStartSessionDialog(null)}
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-elevated)] transition-colors shrink-0"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => void handleConfirmConnectAndStart()}
                className="w-full min-h-[44px] text-left p-3.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] transition-colors space-y-1"
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 shrink-0" />
                  <span>Sambungkan &amp; mulai</span>
                </div>
                <p className="text-[11px] opacity-85 leading-relaxed font-medium">
                  Hubungkan SYNTXRR ke room LIVE publik @{targetUsername}. Kalau belum LIVE di aplikasi TikTok, konektor menunggu sampai LIVE dimulai.
                </p>
              </button>

              <button
                type="button"
                onClick={() => void handleConfirmStartWithoutConnection()}
                className="w-full min-h-[44px] text-left p-3.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[var(--app-text)] transition-colors space-y-1"
              >
                <div className="text-xs font-bold">Mulai tanpa koneksi</div>
                <p className="text-[11px] text-[var(--app-text-muted)] leading-relaxed">
                  Companion dan Floating HUD tetap aktif tanpa menghubungkan event LIVE.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* C.1 Command Header — Page identity without duplicating global SYNTXRR header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-1 border-b border-[var(--app-border)]/70">
        <div className="flex items-start sm:items-center justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-[var(--app-text-muted)] tracking-wide">
              <span className="uppercase tracking-[0.12em] font-semibold text-[var(--app-accent-text)]">
                {isEnglish ? 'Broadcast Command Center' : 'Pusat Kendali Siaran'}
              </span>
              <span aria-hidden="true" className="text-[var(--app-border-strong)]">
                /
              </span>
              <span className="font-mono-num text-[var(--app-text-secondary)]">
                {settings.targetResolution} · {settings.frameRate} FPS
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-[28px] font-bold text-[var(--app-text)] tracking-tight mt-0.5 truncate">
              {t('nav.dashboard', 'Dashboard')}
            </h1>
          </div>

          <button
            type="button"
            onClick={onOpenModeModal}
            className="md:hidden shrink-0 min-h-[44px] px-3 rounded-xl bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] text-xs font-semibold text-[var(--app-text-secondary)] hover:text-[var(--app-accent-text)] inline-flex items-center gap-1.5 transition-colors"
          >
            <span>{t('dash.modeArchitecture')}</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-2.5 shrink-0 pb-2 md:pb-0">
          <div
            className="grid grid-cols-2 md:inline-flex flex-1 md:flex-initial p-1 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]"
            role="tablist"
            aria-label="Pilih mode operasi"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isModeA}
              aria-controls="mode-a-details"
              onClick={() => onSelectMode('MODE_A_TIKTOK_COMPANION')}
              className={`relative min-h-[44px] px-3.5 py-2 rounded-[10px] text-xs font-semibold whitespace-nowrap transition-colors min-w-0 flex items-center justify-center gap-1.5 ${
                isModeA
                  ? 'bg-[var(--app-surface-elevated)] text-[var(--app-text)] border border-[var(--app-accent-border)] shadow-sm'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] border border-transparent'
              }`}
            >
              <span className={isModeA ? 'text-[var(--app-accent-text)] font-bold' : ''}>
                Mode A
              </span>
              <span className="hidden sm:inline text-[var(--app-text-muted)] font-normal">
                · Companion
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isModeA}
              aria-controls="mode-b-details"
              onClick={() => onSelectMode('MODE_B_STREAMING_ENCODER')}
              className={`relative min-h-[44px] px-3.5 py-2 rounded-[10px] text-xs font-semibold whitespace-nowrap transition-colors min-w-0 flex items-center justify-center gap-1.5 ${
                !isModeA
                  ? 'bg-[var(--app-surface-elevated)] text-[var(--app-text)] border border-[var(--app-accent-border)] shadow-sm'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] border border-transparent'
              }`}
            >
              <span className={!isModeA ? 'text-[var(--app-accent-text)] font-bold' : ''}>
                Mode B
              </span>
              <span className="hidden sm:inline text-[var(--app-text-muted)] font-normal">
                · Encoder RTMP
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenModeModal}
            className="hidden md:inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] text-xs font-semibold text-[var(--app-text-secondary)] hover:text-[var(--app-accent-text)] transition-colors whitespace-nowrap"
          >
            <span>{t('dash.modeArchitecture')}</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      </header>

      {/* Contextual Recovery Banner (only rendered when action/warning applies) */}
      {recoveryItem && (() => {
        const alertPalette = getToneStyle(recoveryItem.severity);
        return (
          <section
            role="alert"
            className="p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{
              backgroundColor: alertPalette.backgroundColor,
              borderColor: alertPalette.borderColor,
            }}
          >
            <div className="flex items-start gap-3 min-w-0">
              <AlertTriangle
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: alertPalette.color }}
              />
              <div className="min-w-0 space-y-0.5">
                <div
                  className="text-xs font-bold leading-snug"
                  style={{ color: alertPalette.color }}
                >
                  {recoveryItem.title}
                </div>
                <p className="text-xs text-[var(--app-text-secondary)] leading-relaxed">
                  {recoveryItem.detail}
                </p>
              </div>
            </div>

            {recoveryItem.actionLabel && recoveryItem.onAction && (
              <button
                type="button"
                onClick={recoveryItem.onAction}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold whitespace-nowrap shrink-0 self-stretch sm:self-center inline-flex items-center justify-center transition-colors"
              >
                {recoveryItem.actionLabel}
              </button>
            )}
          </section>
        );
      })()}

      {/* Adaptive 8 / 4 Desktop Layout & Priority Single-Column Android Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
        {/* Main Operational Column (8 cols Desktop) */}
        <div className="lg:col-span-8 space-y-4 sm:space-y-5 min-w-0">
          {/* C.2 Broadcast Status Command — Flagship Command Centerpiece */}
          <section
            className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] overflow-hidden"
            style={{ boxShadow: 'var(--app-shadow)' }}
          >
            {/* Top Status Telemetry Bar */}
            <div className="px-4 sm:px-6 py-3 bg-[var(--app-surface-muted)] border-b border-[var(--app-border)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold"
                  style={{
                    color: heroTonePalette.color,
                    backgroundColor: heroTonePalette.backgroundColor,
                    borderColor: heroTonePalette.borderColor,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: heroTonePalette.dotColor }}
                  />
                  <span className="truncate">{heroStatusHeadline}</span>
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono-num text-[var(--app-text-muted)]">
                <span className="text-[var(--app-accent-text)] font-semibold">
                  {isModeA ? 'MODE A' : 'MODE B'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {isModeA
                    ? hasValidTargetUsername
                      ? `@${targetUsername}`
                      : isEnglish
                      ? 'No target'
                      : 'Tanpa target'
                    : modeBBitrateDisplay !== '—'
                    ? modeBBitrateDisplay
                    : `Target ${settings.videoBitrateKbps} kbps`}
                </span>
              </div>
            </div>

            {/* Command Body */}
            <div className="p-4 sm:p-6 space-y-5">
              <div className="space-y-1.5 min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--app-text-muted)]">
                  {isModeA
                    ? 'Mode A · TikTok LIVE Companion'
                    : isEnglish
                    ? 'Mode B · Native RTMP Encoder'
                    : 'Mode B · Encoder RTMP Mandiri'}
                </div>

                <h2 className="font-display text-2xl sm:text-[28px] font-bold text-[var(--app-text)] tracking-tight leading-tight break-words">
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

                <p className="text-xs sm:text-[13px] text-[var(--app-text-secondary)] leading-relaxed max-w-2xl">
                  {isModeA
                    ? isEnglish
                      ? 'Runs alongside the official TikTok app to manage your Floating HUD, comment TTS, and live room event feed without replacing TikTok Go Live.'
                      : 'Berjalan bersama aplikasi TikTok resmi untuk mengelola Floating HUD, TTS komentar, dan event room LIVE tanpa menggantikan proses Go Live TikTok.'
                    : isEnglish
                    ? 'Hardware-accelerated Android MediaProjection & H.264/AAC pipeline streaming directly to your configured RTMP ingest server.'
                    : 'Encoder native Android (MediaProjection + H.264/AAC) yang mengirim komposisi Studio langsung ke endpoint RTMP.'}
                </p>
              </div>

              {/* Compact Hairline State Summary Strip */}
              <div className="pt-3.5 border-t border-[var(--app-border)] grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {isModeA ? (
                  <>
                    <div className="min-w-0">
                      <div className="text-[11px] text-[var(--app-text-muted)]">
                        {isEnglish ? 'Companion Session' : 'Sesi Companion'}
                      </div>
                      <div
                        className="font-semibold mt-0.5 truncate"
                        style={{ color: getToneStyle(honestStatus.modeASession.tone).color }}
                      >
                        {honestStatus.modeASession.label}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-[var(--app-text-muted)]">
                        Event Transport
                      </div>
                      <div
                        className="font-semibold mt-0.5 truncate"
                        style={{ color: getToneStyle(honestStatus.eventTransport.tone).color }}
                      >
                        {honestStatus.eventTransport.label}
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-1 min-w-0">
                      <div className="text-[11px] text-[var(--app-text-muted)]">Floating HUD</div>
                      <div
                        className="font-semibold mt-0.5 truncate"
                        style={{
                          color: isHudVisible ? 'var(--app-ok)' : 'var(--app-text-secondary)',
                        }}
                      >
                        {isHudVisible ? t('dash.hudActive') : t('dash.hudInactive')}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="min-w-0">
                      <div className="text-[11px] text-[var(--app-text-muted)]">
                        {isEnglish ? 'Encoder Status' : 'Status Encoder'}
                      </div>
                      <div
                        className="font-semibold mt-0.5 truncate"
                        style={{ color: heroTonePalette.color }}
                      >
                        {heroStatusHeadline}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-[var(--app-text-muted)]">
                        {isEnglish ? 'Live Bitrate' : 'Bitrate Aktual'}
                      </div>
                      <div className="font-mono-num font-semibold text-[var(--app-text)] mt-0.5 truncate">
                        {modeBBitrateDisplay}
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-1 min-w-0">
                      <div className="text-[11px] text-[var(--app-text-muted)]">
                        {isEnglish ? 'RTMP Ingest' : 'Ingest RTMP'}
                      </div>
                      <div
                        className="font-semibold mt-0.5 truncate"
                        style={{
                          color: modeBRtmpCheck.valid ? 'var(--app-ok)' : 'var(--app-warn)',
                        }}
                      >
                        {modeBRtmpCheck.valid
                          ? isEnglish
                            ? 'Ready'
                            : 'Siap'
                          : isEnglish
                          ? 'Incomplete'
                          : 'Belum Lengkap'}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Primary Operational Action Row (all >= 44px touch target) */}
              {isModeA ? (
                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 pt-1">
                  {!isModeASessionActive ? (
                    <button
                      type="button"
                      disabled={isSessionActionPending}
                      onClick={handlePressStartSession}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                    >
                      {isSessionActionPending ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      ) : (
                        <Play className="w-4 h-4 shrink-0" />
                      )}
                      <span>
                        {isEnglish ? 'Start Companion Session' : 'Mulai Sesi Companion'}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSessionActionPending}
                      onClick={() => void handleStopSession()}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                      style={{
                        backgroundColor: 'var(--app-error-soft)',
                        borderColor: 'color-mix(in srgb, var(--app-error) 55%, transparent)',
                        color: 'var(--app-error)',
                      }}
                    >
                      {isSessionActionPending ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{isEnglish ? 'Stop Companion Session' : 'Hentikan Sesi'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenTikTokConnection?.()}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[var(--app-text)] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <Link2 className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
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
                      ['starting', 'connecting', 'stopping', 'resharing'].includes(
                        modeBStatus.status
                      )
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
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                  >
                    {isModeBActionPending ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <Radio className="w-4 h-4 shrink-0" />
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
                    className="min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{
                      backgroundColor: 'var(--app-error-soft)',
                      borderColor: 'color-mix(in srgb, var(--app-error) 50%, transparent)',
                      color: 'var(--app-error)',
                    }}
                  >
                    <Square className="w-3.5 h-3.5 shrink-0" />
                    <span>{isEnglish ? 'Stop Broadcast' : 'Hentikan'}</span>
                  </button>

                  {['live', 'host_wait'].includes(modeBStatus.status) && (
                    <button
                      type="button"
                      disabled={isModeBActionPending}
                      onClick={() => void onToggleModeBHostWait?.()}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
                      style={
                        modeBStatus.status === 'host_wait'
                          ? {
                              backgroundColor: 'var(--app-warn-soft)',
                              borderColor:
                                'color-mix(in srgb, var(--app-warn) 55%, transparent)',
                              color: 'var(--app-warn)',
                            }
                          : {
                              backgroundColor: 'var(--app-surface-elevated)',
                              borderColor: 'var(--app-border-strong)',
                              color: 'var(--app-text)',
                            }
                      }
                    >
                      <PauseCircle className="w-3.5 h-3.5 shrink-0" />
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
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[var(--app-text)] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <Settings2 className="w-3.5 h-3.5 text-[var(--app-text-muted)] shrink-0" />
                    <span>RTMP Settings</span>
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* C.3 Mode-Specific Control Area (Strictly Isolated Tabpanel) */}
          {isModeA ? (
            <div id="mode-a-details" role="tabpanel" className="space-y-4 sm:space-y-5">
              {/* 4 Honest Status Readouts & Live Room Metrics */}
              <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-bold text-[var(--app-text)]">
                      {isEnglish
                        ? 'Companion Session & TikTok LIVE Status'
                        : 'Status Sesi Companion & Koneksi TikTok LIVE'}
                    </h3>
                    <p className="text-[11px] text-[var(--app-text-muted)] mt-0.5 leading-relaxed">
                      {isEnglish
                        ? 'Companion service, public target, LIVE room state, and event transport are tracked separately.'
                        : 'Sesi companion, target LIVE, status room, dan transport event dilaporkan terpisah secara jujur.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                    <div className="text-[11px] text-[var(--app-text-muted)]">Target LIVE</div>
                    <div className="font-bold text-[var(--app-text)] mt-1 font-mono-num truncate">
                      {hasValidTargetUsername ? `@${targetUsername}` : 'Belum diatur'}
                    </div>
                    <div className="text-[11px] text-[var(--app-text-muted)] truncate mt-0.5">
                      {tiktokAccount.isLinked
                        ? `OAuth: ${honestStatus.accountLinked.label}`
                        : 'OAuth opsional'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                    <div className="text-[11px] text-[var(--app-text-muted)]">Sesi Mode A</div>
                    <div
                      className="font-bold mt-1 truncate"
                      style={{ color: getToneStyle(honestStatus.modeASession.tone).color }}
                    >
                      {honestStatus.modeASession.label}
                    </div>
                    <div className="text-[11px] text-[var(--app-text-muted)] truncate mt-0.5">
                      {honestStatus.modeASession.detail}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                    <div className="text-[11px] text-[var(--app-text-muted)]">Room Status</div>
                    <div
                      className="font-bold mt-1 truncate"
                      style={{ color: getToneStyle(honestStatus.roomStatus.tone).color }}
                    >
                      {honestStatus.roomStatus.label}
                    </div>
                    <div className="text-[11px] text-[var(--app-text-muted)] truncate mt-0.5">
                      {tiktokAccount.connectionMethod === 'euler'
                        ? 'Via EulerStream'
                        : 'Direct TikTok WS'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                    <div className="text-[11px] text-[var(--app-text-muted)]">Event Transport</div>
                    <div
                      className="font-bold mt-1 truncate"
                      style={{ color: getToneStyle(honestStatus.eventTransport.tone).color }}
                    >
                      {honestStatus.eventTransport.label}
                    </div>
                    <div className="text-[11px] text-[var(--app-text-muted)] truncate mt-0.5">
                      {honestStatus.eventTransport.detail}
                    </div>
                  </div>
                </div>

                {/* Live Room Readout Hairline Row */}
                <div className="pt-3.5 border-t border-[var(--app-border)] grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                  <div className="min-w-0">
                    <div className="text-[11px] text-[var(--app-text-muted)]">
                      {isEnglish ? 'LIVE Viewers' : 'Penonton LIVE'}
                    </div>
                    <div className="text-base font-bold font-mono-num text-[var(--app-text)] mt-0.5">
                      {hasLiveRoomNumbers
                        ? tiktokStatus.viewerCount.toLocaleString('en-US')
                        : '—'}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-[var(--app-text-muted)]">
                      {isEnglish ? 'Total Likes' : 'Total Like'}
                    </div>
                    <div className="text-base font-bold font-mono-num text-[var(--app-text)] mt-0.5">
                      {hasLiveRoomNumbers
                        ? tiktokStatus.totalLikeCount.toLocaleString('en-US')
                        : '—'}
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <div className="text-[11px] text-[var(--app-text-muted)]">Room ID</div>
                    <div className="text-xs font-mono-num text-[var(--app-text-secondary)] mt-1 truncate">
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
              <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-bold text-[var(--app-text)] flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                      <span className="truncate">{t('dash.hudTitle')}</span>
                    </h3>
                    <p className="text-[11px] text-[var(--app-text-muted)] mt-0.5 leading-relaxed">
                      {t('dash.hudSubtitle')}
                    </p>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold shrink-0 self-start sm:self-center"
                    style={
                      isHudVisible
                        ? {
                            color: 'var(--app-ok)',
                            backgroundColor: 'var(--app-ok-soft)',
                            borderColor: 'color-mix(in srgb, var(--app-ok) 36%, transparent)',
                          }
                        : {
                            color: 'var(--app-text-muted)',
                            backgroundColor: 'var(--app-surface-muted)',
                            borderColor: 'var(--app-border)',
                          }
                    }
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: isHudVisible
                          ? 'var(--app-ok)'
                          : 'var(--app-text-muted)',
                      }}
                    />
                    <span>{isHudVisible ? t('dash.hudActive') : t('dash.hudInactive')}</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleShowHud()}
                    disabled={isHudActionPending || isHudVisible}
                    className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors ${
                      isHudVisible
                        ? 'bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-muted)] cursor-not-allowed'
                        : 'bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)]'
                    }`}
                  >
                    {isHudActionPending ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <Eye className="w-4 h-4 shrink-0" />
                    )}
                    <span>{t('dash.showHud')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleHideHud()}
                    disabled={isHudActionPending || !isHudVisible}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed"
                    style={
                      !isHudVisible
                        ? {
                            backgroundColor: 'var(--app-surface-muted)',
                            borderColor: 'var(--app-border)',
                            color: 'var(--app-text-muted)',
                          }
                        : {
                            backgroundColor: 'var(--app-error-soft)',
                            borderColor:
                              'color-mix(in srgb, var(--app-error) 50%, transparent)',
                            color: 'var(--app-error)',
                          }
                    }
                  >
                    {isHudActionPending ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <EyeOff className="w-4 h-4 shrink-0" />
                    )}
                    <span>{t('dash.hideHud')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void refreshHudStatus()}
                    disabled={isHudActionPending}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-xs font-semibold text-[var(--app-text)] inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[var(--app-text-muted)] shrink-0" />
                    <span>{t('dash.checkNativeStatus')}</span>
                  </button>
                </div>

                {!isOverlayGranted && isNative && (
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span style={{ color: 'var(--app-warn)' }}>
                      Izin SYSTEM_ALERT_WINDOW belum aktif untuk overlay di atas TikTok.
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRequestOverlay()}
                      className="min-h-[44px] px-2 text-xs font-semibold text-[var(--app-accent-text)] hover:underline inline-flex items-center gap-1"
                    >
                      <span>{t('dash.openOverlayPerm')}</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                )}

                {hudFeedback && (() => {
                  const fbStyle =
                    hudFeedback.type === 'success'
                      ? getToneStyle('ok')
                      : hudFeedback.type === 'error'
                      ? getToneStyle('error')
                      : getToneStyle('neutral');
                  return (
                    <div
                      role="status"
                      aria-live="polite"
                      className="p-3 rounded-xl border text-xs flex items-center gap-2"
                      style={{
                        backgroundColor: fbStyle.backgroundColor,
                        borderColor: fbStyle.borderColor,
                        color:
                          hudFeedback.type === 'info'
                            ? 'var(--app-text-secondary)'
                            : fbStyle.color,
                      }}
                    >
                      {hudFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : hudFeedback.type === 'error' ? (
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                      ) : (
                        <Smartphone className="w-4 h-4 shrink-0 text-[var(--app-accent-text)]" />
                      )}
                      <span className="flex-1 min-w-0 break-words">{hudFeedback.message}</span>
                    </div>
                  );
                })()}

                <div className="pt-2.5 border-t border-[var(--app-border)] text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[var(--app-text-muted)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Smartphone className="w-3.5 h-3.5 text-[var(--app-text-muted)] shrink-0" />
                    <span className="min-w-0 break-words">
                      {lastHudClickTime
                        ? `Sentuhan bubble terdeteksi pada HP (${lastHudClickTime})`
                        : 'Ketuk bubble floating di HP untuk menguji respons klik bridge'}
                    </span>
                  </div>
                  {!isNative && (
                    <span className="text-[10px] text-[var(--app-text-muted)]">
                      Browser preview: jalankan di APK untuk overlay native di atas TikTok
                    </span>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div id="mode-b-details" role="tabpanel" className="space-y-4 sm:space-y-5">
              {/* Encoder Telemetry & Status Native */}
              <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-bold text-[var(--app-text)]">
                      {isEnglish ? 'Native Encoder Status' : 'Status Encoder Native RTMP'}
                    </h3>
                    <p
                      className="text-xs text-[var(--app-text-secondary)] mt-0.5 leading-relaxed"
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
                  <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                    <div className="text-[11px] text-[var(--app-text-muted)]">
                      {isEnglish ? 'Live Bitrate' : 'Bitrate Aktual'}
                    </div>
                    <div className="text-base font-bold font-mono-num text-[var(--app-text)] mt-1 truncate">
                      {modeBBitrateDisplay}
                    </div>
                    <div className="text-[11px] text-[var(--app-text-muted)] font-mono-num mt-0.5 truncate">
                      Target: {settings.videoBitrateKbps} kbps
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                    <div className="text-[11px] text-[var(--app-text-muted)]">
                      {isEnglish ? 'RTMP Ingest' : 'Konfigurasi RTMP'}
                    </div>
                    <div
                      className="font-bold mt-1 truncate"
                      style={{
                        color: modeBRtmpCheck.valid ? 'var(--app-ok)' : 'var(--app-warn)',
                      }}
                    >
                      {modeBRtmpCheck.valid
                        ? isEnglish
                          ? 'Server & Key Ready'
                          : 'Server & Key Siap'
                        : isEnglish
                        ? 'Incomplete'
                        : 'Belum Lengkap'}
                    </div>
                    <div className="text-[11px] text-[var(--app-text-muted)] font-mono-num truncate mt-0.5">
                      {settings.rtmpServer?.trim() || 'Belum diisi'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] min-w-0">
                    <div className="text-[11px] text-[var(--app-text-muted)]">
                      {isEnglish ? 'Output Profile' : 'Profil Output'}
                    </div>
                    <div className="font-bold font-mono-num text-[var(--app-text)] mt-1 truncate">
                      {settings.targetResolution} · {settings.frameRate} FPS
                    </div>
                    <div className="text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">
                      H.264 HW · AAC
                    </div>
                  </div>
                </div>
              </section>

              {/* Pemilihan Sumber Audio Mode B */}
              <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-bold text-[var(--app-text)] flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                      <span className="truncate">
                        {isEnglish ? 'Broadcast Audio Source' : 'Sumber Audio Siaran Mode B'}
                      </span>
                    </h3>
                    <p className="text-[11px] text-[var(--app-text-muted)] mt-0.5 leading-relaxed">
                      {isEnglish
                        ? 'Internal audio requires Android 10+ and RECORD_AUDIO permission. Mixed captures both device playback and microphone where supported.'
                        : 'Audio internal memerlukan Android 10+ dan izin RECORD_AUDIO. Campuran menangkap audio sistem dan mikrofon bila didukung perangkat.'}
                    </p>
                  </div>
                </div>

                <div
                  className="grid grid-cols-1 min-[360px]:grid-cols-3 gap-2"
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
                        className={`min-h-[52px] min-w-0 rounded-xl border px-2.5 sm:px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                          selected
                            ? 'bg-[var(--app-surface-elevated)] border-[var(--app-accent-border)] text-[var(--app-text)]'
                            : 'bg-[var(--app-surface-muted)] border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)]'
                        }`}
                      >
                        <span
                          className={`flex items-center justify-between gap-1 text-xs font-bold truncate ${
                            selected ? 'text-[var(--app-accent-text)]' : ''
                          }`}
                        >
                          <span className="truncate">{option.label}</span>
                          {selected && (
                            <span
                              aria-hidden="true"
                              className="w-1.5 h-1.5 rounded-full bg-[var(--app-accent)] shrink-0"
                            />
                          )}
                        </span>
                        <span className="block text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">
                          {option.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {activePreset?.backgroundUri && (
                  <p
                    className="pt-2.5 border-t border-[var(--app-border)] text-[11px] leading-relaxed text-[var(--app-text-secondary)]"
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

        {/* C.4 & C.5 Context & Device Readiness Sidebar (4 cols Desktop / Stacked Mobile) */}
        <aside className="lg:col-span-4 space-y-4 sm:space-y-5 min-w-0">
          {/* C.4 Active Studio Preset Summary */}
          <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--app-text-muted)]">
                {t('dash.activePreset')}
              </div>
              <button
                type="button"
                onClick={() => onNavigate('studio')}
                className="min-h-[44px] px-2.5 -mr-2 rounded-lg text-xs font-semibold text-[var(--app-accent-text)] hover:bg-[var(--app-accent-soft)] inline-flex items-center gap-1 transition-colors shrink-0"
              >
                <span>{t('dash.openStudioBtn')}</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="w-full min-h-[44px] text-left p-3.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-hover)] transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="font-display text-base font-bold text-[var(--app-text)] truncate">
                  {activePreset ? activePreset.name : 'Mobile Gaming (9:16)'}
                </div>
                <div className="text-xs font-mono-num text-[var(--app-text-muted)] truncate">
                  {activePreset?.canvasOrientation || settings.canvasOrientation || '9:16'} ·{' '}
                  {visibleElementsCount} {isEnglish ? 'active elements' : 'elemen aktif'}
                </div>
              </div>
              <span
                aria-hidden="true"
                className={`shrink-0 rounded-[4px] border border-[var(--app-accent-border)] bg-[var(--app-accent-soft)] ${
                  isPortraitPreset ? 'w-4 h-6' : 'w-6 h-4'
                }`}
              />
            </button>
          </section>

          {/* C.5 Real Device & Android Permission Readiness */}
          <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMobileReadinessOpen((v) => !v)}
                aria-expanded={mobileReadinessOpen}
                className="lg:cursor-default min-h-[44px] text-left flex items-center gap-2 min-w-0 flex-1 pr-1 rounded-lg"
              >
                <ShieldAlert className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
                <span className="font-display text-sm font-bold text-[var(--app-text)] truncate">
                  {t('dash.hardwareStatus')}
                </span>
                <span className="lg:hidden text-[var(--app-text-muted)] shrink-0">
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
                className="min-h-[44px] px-3 py-2 rounded-xl bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] text-[11px] font-semibold text-[var(--app-text)] inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50 transition-colors"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 ${isReadinessChecking ? 'animate-spin' : ''}`}
                />
                <span>{isEnglish ? 'Check' : 'Periksa'}</span>
              </button>
            </div>

            {/* Mobile collapsed summary */}
            {!mobileReadinessOpen && (
              <div className="lg:hidden text-xs text-[var(--app-text-muted)] leading-relaxed">
                {!isNative
                  ? isEnglish
                    ? 'Android permission checks run inside installed APK. Tap title to view details.'
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
              <div className="divide-y divide-[var(--app-border)] text-xs">
                {readinessRows.map((row) => (
                  <div
                    key={row.id}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 min-w-0"
                  >
                    <span className="text-[var(--app-text-secondary)] truncate">{row.label}</span>
                    <span
                      className="font-mono-num text-[11px] font-semibold shrink-0"
                      style={{ color: getToneStyle(row.tone).color }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2.5 border-t border-[var(--app-border)] flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--app-text-muted)] leading-snug min-w-0">
                  {isEnglish
                    ? 'No unverified device metrics are displayed.'
                    : 'Hanya menampilkan status izin & konfigurasi aktual.'}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className="min-h-[44px] px-2.5 -mr-2 rounded-lg text-xs font-semibold text-[var(--app-accent-text)] hover:bg-[var(--app-accent-soft)] inline-flex items-center shrink-0 transition-colors"
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
