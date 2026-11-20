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

import { Button } from './ui/Button';
import { ModeSelector } from './dashboard/ModeSelector';
import { ModeAPanel } from './dashboard/ModeAPanel';
import { ModeBPanel } from './dashboard/ModeBPanel';
import { SectionHeading, ShortcutTile } from './dashboard/parts';

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

  const rtmpCheck = modeBRtmpCheck as unknown as {
    valid?: boolean;
    ok?: boolean;
    message?: string;
    reason?: string;
  };
  const rtmpIssue: string | null =
    rtmpCheck && (rtmpCheck.valid === false || rtmpCheck.ok === false)
      ? rtmpCheck.message ||
        rtmpCheck.reason ||
        (isEnglish ? 'RTMP server or stream key is not valid yet.' : 'Server RTMP atau stream key belum valid.')
      : null;
  const hasStreamKey = Boolean((settings.streamKey || '').trim());
  const isCompanionActive = companionRunning || modeASessionMode !== 'inactive';

  return (
    <div className="space-y-3.5 pb-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[21px] font-semibold leading-tight tracking-tight text-sx-text">
            {isEnglish ? 'Dashboard' : 'Dasbor'}
          </h1>
          <p className="mt-0.5 text-sx-caption leading-relaxed text-sx-text-muted">
            {isModeA
              ? isEnglish
                ? 'Companion control for an official TikTok LIVE session.'
                : 'Kontrol kompanion untuk sesi TikTok LIVE resmi.'
              : isEnglish
                ? 'Encoder control for your own RTMP destination.'
                : 'Kontrol encoder untuk tujuan RTMP Anda sendiri.'}
          </p>
        </div>
      </div>

      <ModeSelector isModeA={isModeA} onSelect={onSelectMode} onOpenInfo={onOpenModeModal} />

      {isModeA ? (
        <ModeAPanel
          isEnglish={isEnglish}
          honestStatus={honestStatus}
          targetUsername={targetUsername}
          hasValidTargetUsername={hasValidTargetUsername}
          isLiveTransportConnected={isLiveTransportConnected}
          isCompanionActive={isCompanionActive}
          viewerCount={tiktokStatus.viewerCount}
          likeCount={tiktokStatus.totalLikeCount}
          presetName={activePreset?.name ?? null}
          visibleElementsCount={visibleElementsCount}
          isHudVisible={isHudVisible}
          isOverlayGranted={isOverlayGranted}
          isHudActionPending={isHudActionPending}
          isSessionActionPending={isSessionActionPending}
          hudFeedback={hudFeedback}
          lastHudClickTime={lastHudClickTime}
          sessionValidationError={sessionValidationError}
          onPressStartSession={handlePressStartSession}
          onStopSession={() => {
            void handleStopSession();
          }}
          onOpenTikTokConnection={onOpenTikTokConnection}
          onShowHud={() => {
            void handleShowHud();
          }}
          onHideHud={() => {
            void handleHideHud();
          }}
          onRefreshHud={() => {
            void refreshHudStatus();
          }}
          onRequestOverlay={() => {
            void handleRequestOverlay();
          }}
        />
      ) : (
        <ModeBPanel
          isEnglish={isEnglish}
          settings={{ ...settings, modeBAudioSource }}
          modeBStatus={modeBStatus}
          isModeBActionPending={isModeBActionPending}
          modeBNotificationWarning={modeBNotificationWarning}
          rtmpIssue={rtmpIssue}
          hasStreamKey={hasStreamKey}
          onStartStream={onStartModeBStream}
          onStopStream={onStopModeBStream}
          onRequestReshare={onRequestModeBReshare}
          onToggleHostWait={onToggleModeBHostWait}
          onUpdateSettings={onUpdateSettings}
        />
      )}

      <div className="space-y-2">
        <SectionHeading
          title={isEnglish ? 'Go to' : 'Buka'}
          description={
            isEnglish
              ? 'Every module stays reachable from here and from the drawer.'
              : 'Semua modul tetap dapat dibuka dari sini dan dari drawer.'
          }
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ShortcutTile
            icon={Layers}
            label="Studio"
            hint={isEnglish ? 'Canvas, elements, presets' : 'Kanvas, elemen, preset'}
            onClick={() => onNavigate('studio')}
          />
          <ShortcutTile
            icon={Camera}
            label={isEnglish ? 'Sources' : 'Sumber'}
            hint={isEnglish ? 'Camera, mic, screen' : 'Kamera, mik, layar'}
            onClick={() => onNavigate('sources')}
          />
          <ShortcutTile
            icon={Radio}
            label={isEnglish ? 'Live Center' : 'Pusat LIVE'}
            hint={isEnglish ? 'Chat, gifts, TTS' : 'Chat, gift, TTS'}
            onClick={() => onNavigate('live_center')}
          />
          <ShortcutTile
            icon={Link2}
            label={isEnglish ? 'Integrations' : 'Integrasi'}
            hint={`${integrations.length} ${isEnglish ? 'providers' : 'penyedia'}`}
            onClick={() => onNavigate('integrations')}
          />
          <ShortcutTile
            icon={Sliders}
            label={isEnglish ? 'Settings' : 'Pengaturan'}
            hint={isEnglish ? 'Audio, HUD, performance' : 'Audio, HUD, performa'}
            onClick={() => onNavigate('settings')}
          />
        </div>
      </div>

      {startSessionDialog ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-session-title"
            className="w-full max-w-sm rounded-t-sx-lg border border-sx-border bg-sx-bg p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-sx-overlay sm:rounded-sx-lg sm:pb-4"
          >
            <h3 id="start-session-title" className="text-[15px] font-semibold tracking-tight text-sx-text">
              {isEnglish ? 'Activate companion' : 'Aktifkan kompanion'}
            </h3>
            <p className="mt-1 text-sx-caption leading-relaxed text-sx-text-secondary">
              {startSessionDialog === 'linked'
                ? isEnglish
                  ? 'SYNTXRR will connect to TikTok with the linked account and start the companion tools. Broadcasting stays in the official TikTok app.'
                  : 'SYNTXRR akan terhubung ke TikTok dengan akun tertaut dan menjalankan alat kompanion. Siaran tetap di aplikasi TikTok resmi.'
                : isEnglish
                  ? 'No TikTok account is linked. You can activate the companion tools without a live connection, or connect first.'
                  : 'Belum ada akun TikTok tertaut. Anda dapat mengaktifkan alat kompanion tanpa koneksi langsung, atau menghubungkan dulu.'}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {startSessionDialog === 'linked' ? (
                <Button
                  variant="primary"
                  fullWidth
                  loading={isSessionActionPending}
                  onClick={() => {
                    void handleConfirmConnectAndStart().finally(() => setStartSessionDialog(null));
                  }}
                >
                  {isEnglish ? 'Connect and activate' : 'Hubungkan dan aktifkan'}
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    fullWidth
                    loading={isSessionActionPending}
                    onClick={() => {
                      void handleConfirmStartWithoutConnection().finally(() => setStartSessionDialog(null));
                    }}
                  >
                    {isEnglish ? 'Activate without connection' : 'Aktifkan tanpa koneksi'}
                  </Button>
                  <Button
                    variant="secondary"
                    fullWidth
                    disabled={isSessionActionPending}
                    onClick={() => {
                      setStartSessionDialog(null);
                      onOpenTikTokConnection?.();
                    }}
                  >
                    {isEnglish ? 'Connect TikTok first' : 'Hubungkan TikTok dulu'}
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                fullWidth
                disabled={isSessionActionPending}
                onClick={() => setStartSessionDialog(null)}
              >
                {isEnglish ? 'Cancel' : 'Batal'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
