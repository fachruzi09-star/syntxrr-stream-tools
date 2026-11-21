import React, { useState, useEffect } from 'react';
import {
  DeckTelemetry,
  DeckButton,
  DeckPage,
  DeckPairingData,
  ConnectedRemoteDevice,
  AppSettings,
  StudioPreset,
  OperatingMode,
  isModeAOperatingMode,
} from '../types';
import {
  streamDeckService,
  DEFAULT_DECK_PAGES,
  DEFAULT_DECK_BUTTONS,
} from '../services/streamDeckService';
import { showInAppNotice } from '../services/uiNotice';
import {
  Smartphone,
  Tv,
  Radio,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipForward,
  ShieldAlert,
  Layers,
  Sparkles,
  Megaphone,
  Bell,
  BellRing,
  Gift,
  Heart,
  QrCode,
  Wifi,
  WifiOff,
  CheckCircle2,
  Copy,
  RefreshCw,
  Sliders,
  Monitor,
  Activity,
  Battery,
  Flame,
  MessageSquare,
  Gamepad2,
  Eye,
  X,
} from 'lucide-react';

interface StreamDeckViewProps {
  settings: AppSettings;
  activePreset: StudioPreset | null;
  presets: StudioPreset[];
  operatingMode: OperatingMode;
  onSelectPreset: (presetId: string) => void;
  onSelectMode: (mode: OperatingMode) => void;
  onTriggerEvent?: (type: string, detail: string, amount?: number) => void;
  onPlaySound?: (soundId: string) => void;
  onToggleMusic?: () => void;
  onSkipMusic?: () => void;
}

export const StreamDeckView: React.FC<StreamDeckViewProps> = ({
  settings,
  activePreset,
  operatingMode,
  onSelectPreset,
  onSelectMode,
  onTriggerEvent,
  onPlaySound,
  onToggleMusic,
  onSkipMusic,
}) => {
  const [role, setRole] = useState<'host' | 'remote'>('host');
  const [pairingData, setPairingData] = useState<DeckPairingData | null>(null);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedRemoteDevice[]>([]);
  const [telemetry, setTelemetry] = useState<DeckTelemetry>({
    isStreaming: false,
    streamDurationSec: 0,
    fps: settings.frameRate,
    bitrateKbps: settings.videoBitrateKbps,
    cpuPercent: 28,
    batteryPercent: 86,
    deviceTempC: 37.2,
    activePresetName: activePreset?.name || 'Studio Layout',
    micMuted: false,
    audioMuted: false,
    musicNowPlaying: 'Belum memutar musik',
    musicIsPlaying: false,
    viewerCount: 0,
  });

  const [pages] = useState<DeckPage[]>(DEFAULT_DECK_PAGES);
  const [activePageId, setActivePageId] = useState<string>('page_main');
  const [buttons] = useState<DeckButton[]>(DEFAULT_DECK_BUTTONS);

  const [remoteConnected, setRemoteConnected] = useState(false);
  const [remoteStatusMessage, setRemoteStatusMessage] = useState<string | null>(null);
  const [lastActionStatus, setLastActionStatus] = useState<{
    id: string;
    status: 'pending' | 'success' | 'error';
    label?: string;
  } | null>(null);

  const [hostLogs, setHostLogs] = useState<
    { id: string; time: string; text: string; success: boolean }[]
  >([]);

  // Mobile sheet drawers so keycaps always appear right above the fold
  const [mobileSheet, setMobileSheet] = useState<'pairing' | 'logs' | null>(null);

  useEffect(() => {
    if (role === 'host') {
      const data = streamDeckService.startHost('Android Streaming Master');
      setPairingData(data);

      const unsubDevices = streamDeckService.onRemoteDevicesChange((devices) => {
        setConnectedDevices(devices);
      });

      streamDeckService.updateTelemetry({
        activePresetName: activePreset?.name || 'Studio Layout',
        bitrateKbps: settings.videoBitrateKbps,
        fps: settings.frameRate,
      });

      const unsubCommand = streamDeckService.onCommand((packet, reply) => {
        const timeStr = new Date().toLocaleTimeString('id-ID');
        let success = true;
        let logMessage = `Eksekusi '${packet.command}'`;

        try {
          switch (packet.command) {
            case 'toggle_live':
            case 'start_live':
            case 'stop_live':
              logMessage = 'Toggle Siaran Langsung';
              break;
            case 'mute_mic':
              logMessage = 'Toggle Mute Mikrofon';
              setTelemetry((prev) => {
                const updated = { ...prev, micMuted: !prev.micMuted };
                streamDeckService.updateTelemetry(updated);
                return updated;
              });
              break;
            case 'mute_audio':
              logMessage = 'Toggle Mute Master Audio';
              setTelemetry((prev) => {
                const updated = { ...prev, audioMuted: !prev.audioMuted };
                streamDeckService.updateTelemetry(updated);
                return updated;
              });
              break;
            case 'music_play_pause':
              logMessage = 'Musik Play/Pause';
              if (onToggleMusic) onToggleMusic();
              setTelemetry((prev) => {
                const updated = { ...prev, musicIsPlaying: !prev.musicIsPlaying };
                streamDeckService.updateTelemetry(updated);
                return updated;
              });
              break;
            case 'music_skip':
              logMessage = 'Skip Lagu Musik';
              if (onSkipMusic) onSkipMusic();
              break;
            case 'switch_scene':
              if (packet.payload?.presetId) {
                logMessage = `Pindah ke Preset: ${packet.payload.name || packet.payload.presetId}`;
                onSelectPreset(packet.payload.presetId);
              }
              break;
            case 'switch_mode': {
              const nextMode = isModeAOperatingMode(operatingMode)
                ? 'MODE_B_STREAMING_ENCODER'
                : 'MODE_A_TIKTOK_COMPANION';
              logMessage = `Beralih ke mode: ${nextMode}`;
              onSelectMode(nextMode);
              break;
            }
            case 'play_soundboard':
              logMessage = `Putar SFX: ${packet.payload?.name || packet.payload?.soundId}`;
              if (onPlaySound && packet.payload?.soundId) {
                onPlaySound(packet.payload.soundId);
              }
              break;
            case 'trigger_event':
              logMessage = `Simulasi Event: ${packet.payload?.type}`;
              if (onTriggerEvent && packet.payload?.type) {
                onTriggerEvent(
                  packet.payload.type,
                  packet.payload.detail || '',
                  packet.payload.amount
                );
              }
              break;
            case 'emergency_blank':
              logMessage = 'BLACKOUT DARURAT DIAKTIFKAN';
              break;
            default:
              logMessage = `Perintah: ${packet.command}`;
              break;
          }

          reply({
            messageId: packet.messageId,
            status: 'SUCCESS',
            timestamp: Date.now(),
          });
        } catch (err: unknown) {
          success = false;
          const message =
            err instanceof Error ? err.message : 'Gagal mengeksekusi perintah di host';
          reply({
            messageId: packet.messageId,
            status: 'FAILED',
            timestamp: Date.now(),
            error: message,
          });
        }

        setHostLogs((prev) => [
          { id: packet.messageId, time: timeStr, text: logMessage, success },
          ...prev.slice(0, 19),
        ]);
      });

      return () => {
        unsubDevices();
        unsubCommand();
      };
    } else {
      const unsubTelemetry = streamDeckService.onTelemetry((t) => {
        setTelemetry(t);
        setRemoteConnected(true);
      });
      return () => {
        unsubTelemetry();
        streamDeckService.disconnectRemote();
      };
    }
  }, [
    role,
    activePreset,
    operatingMode,
    settings,
    onPlaySound,
    onSelectMode,
    onSelectPreset,
    onSkipMusic,
    onToggleMusic,
    onTriggerEvent,
  ]);

  const handleExecuteButton = async (btn: DeckButton) => {
    setLastActionStatus({ id: btn.id, status: 'pending', label: btn.label });

    try {
      if (role === 'remote') {
        const ack = await streamDeckService.sendCommand(btn.command, btn.payload);
        if (ack.status === 'SUCCESS') {
          setLastActionStatus({ id: btn.id, status: 'success', label: btn.label });
        } else {
          setLastActionStatus({ id: btn.id, status: 'error', label: ack.error || 'Ditolak' });
        }
      } else {
        if (btn.command === 'mute_mic') {
          setTelemetry((prev) => {
            const updated = { ...prev, micMuted: !prev.micMuted };
            streamDeckService.updateTelemetry(updated);
            return updated;
          });
        }
        if (btn.command === 'mute_audio') {
          setTelemetry((prev) => {
            const updated = { ...prev, audioMuted: !prev.audioMuted };
            streamDeckService.updateTelemetry(updated);
            return updated;
          });
        }
        if (btn.command === 'music_play_pause') {
          if (onToggleMusic) onToggleMusic();
          setTelemetry((prev) => {
            const updated = { ...prev, musicIsPlaying: !prev.musicIsPlaying };
            streamDeckService.updateTelemetry(updated);
            return updated;
          });
        }
        if (btn.command === 'music_skip' && onSkipMusic) onSkipMusic();
        if (btn.command === 'switch_scene' && btn.payload?.presetId)
          onSelectPreset(btn.payload.presetId);
        if (btn.command === 'switch_mode') {
          onSelectMode(
            isModeAOperatingMode(operatingMode)
              ? 'MODE_B_STREAMING_ENCODER'
              : 'MODE_A_TIKTOK_COMPANION'
          );
        }
        if (btn.command === 'play_soundboard' && onPlaySound && btn.payload?.soundId) {
          onPlaySound(btn.payload.soundId);
        }
        if (btn.command === 'trigger_event' && onTriggerEvent) {
          onTriggerEvent(btn.payload?.type, btn.payload?.detail || '', btn.payload?.amount);
        }
        setHostLogs((prev) => [
          {
            id: `local_${Date.now()}`,
            time: new Date().toLocaleTimeString('id-ID'),
            text: `Deck: ${btn.label}`,
            success: true,
          },
          ...prev.slice(0, 19),
        ]);
        setLastActionStatus({ id: btn.id, status: 'success', label: btn.label });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mengirim';
      setLastActionStatus({ id: btn.id, status: 'error', label: message });
    }

    window.setTimeout(() => {
      setLastActionStatus(null);
    }, 1000);
  };

  const handleConnectRemoteDirect = () => {
    if (pairingData) {
      streamDeckService.connectAsRemote(pairingData.pairingToken, 'HP Remote Sekunder');
      setRemoteConnected(true);
      setRemoteStatusMessage('Terhubung ke Host melalui saluran sinkronisasi lokal.');
    } else {
      streamDeckService.connectAsRemote('tok_demo_syntxrr', 'HP Remote Sekunder');
      setRemoteConnected(true);
      setRemoteStatusMessage('Terhubung ke saluran uji lokal.');
    }
  };

  const handleCopyPairingToken = () => {
    const token = pairingData?.pairingToken;
    if (!token) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(token)
        .then(() => {
          showInAppNotice({
            tone: 'success',
            title: 'Token Disalin',
            message: 'Token pairing berhasil disalin ke clipboard.',
          });
        })
        .catch(() => {
          showInAppNotice({
            tone: 'warn',
            title: 'Gagal Menyalin',
            message: 'Browser menolak akses clipboard. Salin token secara manual.',
          });
        });
    } else {
      showInAppNotice({
        tone: 'warn',
        title: 'Clipboard Tidak Tersedia',
        message: 'Salin token pairing secara manual dari layar.',
      });
    }
  };

  const activePageButtons = buttons.filter((b) => b.pageId === activePageId);

  const renderIcon = (iconName: string, className = 'w-5 h-5') => {
    switch (iconName) {
      case 'Radio':
        return <Radio className={className} />;
      case 'Mic':
        return telemetry.micMuted ? (
          <MicOff className={`${className} text-rose-400`} />
        ) : (
          <Mic className={className} />
        );
      case 'VolumeX':
        return telemetry.audioMuted ? (
          <VolumeX className={`${className} text-rose-400`} />
        ) : (
          <Volume2 className={className} />
        );
      case 'Play':
        return telemetry.musicIsPlaying ? (
          <Pause className={className} />
        ) : (
          <Play className={className} />
        );
      case 'SkipForward':
        return <SkipForward className={className} />;
      case 'ShieldAlert':
        return <ShieldAlert className={className} />;
      case 'Monitor':
        return <Monitor className={className} />;
      case 'Eye':
        return <Eye className={className} />;
      case 'Gamepad2':
        return <Gamepad2 className={className} />;
      case 'MessageSquare':
        return <MessageSquare className={className} />;
      case 'Music2':
        return <Sparkles className={className} />;
      case 'Layers':
        return <Layers className={className} />;
      case 'Megaphone':
        return <Megaphone className={className} />;
      case 'Bell':
        return <Bell className={className} />;
      case 'BellRing':
        return <BellRing className={className} />;
      case 'Gift':
        return <Gift className={className} />;
      case 'Heart':
        return <Heart className={className} />;
      default:
        return <Sparkles className={className} />;
    }
  };

  const renderPairingStationContent = () => (
    <div className="space-y-4">
      {/* Crisp Vector QR Matrix */}
      <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl max-w-[220px] mx-auto">
        <div className="relative w-40 h-40 bg-white flex flex-col justify-between p-1">
          <div className="flex justify-between">
            <div className="w-10 h-10 border-4 border-neutral-900 rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 bg-neutral-900 rounded-xs" />
            </div>
            <div className="w-10 h-10 border-4 border-neutral-900 rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 bg-neutral-900 rounded-xs" />
            </div>
          </div>

          <div className="my-auto mx-auto w-24 h-12 grid grid-cols-6 gap-1 p-1">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className={`rounded-xs ${
                  (i * 7 + 3) % 2 === 0 ? 'bg-neutral-900' : 'bg-transparent'
                }`}
              />
            ))}
          </div>

          <div className="flex justify-between items-end">
            <div className="w-10 h-10 border-4 border-neutral-900 rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 bg-neutral-900 rounded-xs" />
            </div>
            <div className="px-2 py-0.5 bg-[#14171D] rounded text-[9px] font-black text-[#F2C230] uppercase tracking-wider">
              SYNTXRR
            </div>
          </div>
        </div>
        <div className="text-xs font-mono-num font-bold text-neutral-900 mt-1.5">
          PIN: {pairingData?.pairingPin || '689231'}
        </div>
      </div>

      <div className="divide-y divide-[var(--app-border)] rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="text-[var(--app-text-muted)]">Alamat Host</span>
          <span className="font-mono-num font-bold text-[var(--app-accent-text)]">
            {pairingData?.hostIp || '192.168.1.105'}:{pairingData?.port || 8080}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 pl-3 pr-1.5 py-1">
          <span className="text-[var(--app-text-muted)]">Token Pairing</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono-num text-[11px] text-[var(--app-text)] truncate max-w-[130px]">
              {pairingData?.pairingToken || 'tok_syn_99824'}
            </span>
            <button
              type="button"
              onClick={handleCopyPairingToken}
              className="btn-press min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:text-[var(--app-accent-text)] hover:bg-[var(--app-surface-hover)]"
              aria-label="Salin token pairing"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Connected Remotes */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5 text-[var(--app-accent-text)]" />
          <span>Perangkat Terhubung ({connectedDevices.length})</span>
        </div>

        {connectedDevices.length === 0 ? (
          <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-dashed border-[var(--app-border-strong)] text-center text-[11px] text-[var(--app-text-muted)] leading-relaxed">
            Belum ada remote terhubung. Pindai QR atau buka tab Remote Kontrol pada HP kedua.
          </div>
        ) : (
          <div className="space-y-1.5">
            {connectedDevices.map((dev) => (
              <div
                key={dev.deviceId}
                className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-[var(--app-ok)] shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-[var(--app-text)] truncate">
                      {dev.deviceName}
                    </div>
                    <div className="text-[10px] font-mono-num text-[var(--app-text-muted)]">
                      {new Date(dev.connectedAt).toLocaleTimeString('id-ID')}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => streamDeckService.revokeDevice(dev.deviceId)}
                  className="btn-press min-h-[44px] px-3 rounded-xl bg-rose-950/60 border border-rose-700/60 text-xs font-semibold text-rose-200 hover:bg-rose-900/80 shrink-0"
                >
                  Putuskan
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderAckLogContent = () => (
    <div className="space-y-2.5">
      {hostLogs.length === 0 ? (
        <div className="text-center py-6 text-xs text-[var(--app-text-muted)]">
          Belum ada perintah yang dieksekusi. Tekan salah satu keycap Deck di atas.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto font-mono-num text-[11px]">
          {hostLogs.map((log) => (
            <div
              key={log.id}
              className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[var(--app-text-muted)] shrink-0">[{log.time}]</span>
                <span
                  className={`truncate ${
                    log.success ? 'text-[var(--app-ok)]' : 'text-[var(--app-error)]'
                  }`}
                >
                  {log.text}
                </span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-secondary)] shrink-0">
                {log.success ? 'ACK' : 'ERR'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderKeycapGrid = (isRemoteMode: boolean) => (
    <section
      className="rounded-2xl bg-[var(--app-surface)] border-2 border-[var(--app-border-strong)] p-3.5 sm:p-5 space-y-3.5"
      style={{ boxShadow: 'var(--app-shadow)' }}
    >
      {/* Deck Chassis Header + Page Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--app-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <Sliders className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
          <h2 className="font-display text-sm font-bold text-[var(--app-text)] truncate">
            {isRemoteMode ? 'Stream Deck Touch Pad' : 'Matriks Keycap Deck'}
          </h2>
        </div>

        <div className="flex items-center gap-1 p-0.5 bg-[var(--app-surface-muted)] rounded-xl border border-[var(--app-border)] text-xs overflow-x-auto no-scrollbar max-w-full">
          {pages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActivePageId(p.id)}
              className={`btn-press min-h-[40px] px-3 rounded-[9px] font-bold whitespace-nowrap shrink-0 ${
                activePageId === p.id
                  ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Hardware Tactile 4x2 Keycaps (2x4 on mobile) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {activePageButtons.map((btn) => {
          const isPending =
            lastActionStatus?.id === btn.id && lastActionStatus.status === 'pending';
          const isSuccess =
            lastActionStatus?.id === btn.id && lastActionStatus.status === 'success';
          const isLiveActiveToggle =
            (btn.command === 'mute_mic' && telemetry.micMuted) ||
            (btn.command === 'mute_audio' && telemetry.audioMuted) ||
            (btn.command === 'music_play_pause' && telemetry.musicIsPlaying);

          return (
            <button
              key={btn.id}
              type="button"
              onClick={() => void handleExecuteButton(btn)}
              disabled={isRemoteMode && !remoteConnected}
              className={`btn-press relative min-h-[92px] sm:min-h-[104px] p-3 rounded-2xl border text-left flex flex-col justify-between select-none disabled:opacity-40 disabled:cursor-not-allowed shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_0_rgba(0,0,0,0.42)] ${btn.color} ${
                isPending ? 'ring-2 ring-[var(--app-accent)]' : ''
              } ${isSuccess ? 'ring-2 ring-emerald-400' : ''} ${
                isLiveActiveToggle ? 'ring-2 ring-[var(--app-accent-border)]' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/15 flex items-center justify-center text-white">
                  {renderIcon(btn.icon)}
                </div>
                <span className="text-[10px] font-mono-num text-white/75">#{btn.order}</span>
              </div>

              <div className="mt-2">
                <div className="text-xs sm:text-[13px] font-bold text-white leading-snug line-clamp-2">
                  {btn.label}
                </div>
              </div>

              {isSuccess && (
                <div className="anim-pop-in absolute inset-0 bg-emerald-500/25 rounded-2xl flex items-center justify-center backdrop-blur-[1px]">
                  <CheckCircle2 className="w-7 h-7 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="space-y-3 sm:space-y-4 pb-2">
      {/* Compact Header & Role Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--app-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <Smartphone className="w-5 h-5 text-[var(--app-accent-text)] shrink-0" />
          <h1 className="font-display text-lg sm:text-xl font-bold text-[var(--app-text)] tracking-tight truncate">
            Remote Stream Deck
          </h1>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="grid grid-cols-2 flex-1 sm:flex-initial p-0.5 bg-[var(--app-surface-muted)] rounded-xl border border-[var(--app-border)]">
            <button
              type="button"
              onClick={() => setRole('host')}
              className={`btn-press min-h-[44px] px-3 rounded-[9px] text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                role === 'host'
                  ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
              }`}
            >
              <Tv className="w-3.5 h-3.5 shrink-0" />
              <span>Host Siaran</span>
            </button>
            <button
              type="button"
              onClick={() => setRole('remote')}
              className={`btn-press min-h-[44px] px-3 rounded-[9px] text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                role === 'remote'
                  ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                  : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span>Remote</span>
            </button>
          </div>

          {role === 'host' && (
            <div className="flex lg:hidden items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setMobileSheet('pairing')}
                className="btn-press min-h-[44px] px-2.5 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-xs font-semibold text-[var(--app-text)] inline-flex items-center gap-1.5"
                title="Pairing QR & PIN"
              >
                <QrCode className="w-4 h-4 text-[var(--app-accent-text)]" />
                <span className="font-mono-num text-[11px]">{connectedDevices.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileSheet('logs')}
                className="btn-press min-h-[44px] px-2.5 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-xs font-semibold text-[var(--app-text)] inline-flex items-center gap-1.5"
                title="Log ACK"
              >
                <Activity className="w-4 h-4 text-[var(--app-accent-text)]" />
                <span className="font-mono-num text-[11px]">{hostLogs.length}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Single-Line Telemetry Ribbon (replaces 6 stacked telemetry boxes so keypads stay immediately visible) */}
      <div className="px-3 py-2 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-mono-num">
        <div className="flex flex-wrap items-center gap-2.5 text-[var(--app-text-secondary)] min-w-0">
          <span className="inline-flex items-center gap-1.5 font-bold text-[var(--app-text)]">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: telemetry.isStreaming ? 'var(--app-ok)' : 'var(--app-warn)',
              }}
            />
            {telemetry.isStreaming ? 'LIVE' : 'Standby'}
          </span>
          <span className="text-[var(--app-border-strong)]">·</span>
          <span className="text-[var(--app-accent-text)] font-semibold">
            {telemetry.fps}fps / {telemetry.bitrateKbps}k
          </span>
          <span className="text-[var(--app-border-strong)]">·</span>
          <span className="truncate max-w-[130px]">
            {activePreset?.name || telemetry.activePresetName}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className={telemetry.micMuted ? 'text-rose-400 font-bold' : 'text-[var(--app-ok)]'}>
            {telemetry.micMuted ? 'Mic Off' : 'Mic On'}
          </span>
          <span className={telemetry.audioMuted ? 'text-rose-400 font-bold' : 'text-[var(--app-ok)]'}>
            {telemetry.audioMuted ? 'Muted' : 'Audio On'}
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[var(--app-text-muted)]">
            <Battery className="w-3 h-3 text-[var(--app-accent-text)]" />
            {telemetry.batteryPercent}%
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[var(--app-text-muted)]">
            <Flame className="w-3 h-3 text-amber-400" />
            {telemetry.deviceTempC}°C
          </span>
        </div>
      </div>

      {/* HOST WORKSPACE: Keypads FIRST on mobile, 7/5 Split on Desktop */}
      {role === 'host' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* LEFT/TOP: Tactile 4x2 Keycaps + Desktop ACK Log */}
          <div className="lg:col-span-7 space-y-4 min-w-0">
            {renderKeycapGrid(false)}

            {/* Desktop ACK Log */}
            <section className="hidden lg:block rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--app-text)] border-b border-[var(--app-border)] pb-2">
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--app-accent-text)]" />
                  <span>Log Perintah &amp; ACK</span>
                </span>
                <button
                  type="button"
                  onClick={() => setHostLogs([])}
                  className="btn-press min-h-[36px] px-3 rounded-lg text-xs font-semibold text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-muted)]"
                >
                  Bersihkan
                </button>
              </div>
              {renderAckLogContent()}
            </section>
          </div>

          {/* RIGHT (Desktop only — Mobile accesses via compact header sheet buttons): Pairing Station */}
          <div className="hidden lg:block lg:col-span-5 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--app-border)] pb-3">
              <div>
                <h2 className="font-display text-sm font-bold text-[var(--app-text)] flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-[var(--app-accent-text)]" />
                  <span>Pairing Remote Kontrol</span>
                </h2>
                <p className="text-[11px] text-[var(--app-text-muted)] mt-0.5">
                  Pindai QR atau masukkan PIN di jaringan LAN
                </p>
              </div>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold shrink-0"
                style={{
                  backgroundColor: 'var(--app-ok-soft)',
                  borderColor: 'color-mix(in srgb, var(--app-ok) 40%, transparent)',
                  color: 'var(--app-ok)',
                }}
              >
                <Wifi className="w-3 h-3" /> Siap
              </span>
            </div>
            {renderPairingStationContent()}
          </div>
        </div>
      )}

      {/* REMOTE WORKSPACE */}
      {role === 'remote' && (
        <div className="space-y-3.5">
          <div className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
                style={
                  remoteConnected
                    ? {
                        backgroundColor: 'var(--app-ok-soft)',
                        borderColor: 'color-mix(in srgb, var(--app-ok) 40%, transparent)',
                        color: 'var(--app-ok)',
                      }
                    : {
                        backgroundColor: 'var(--app-warn-soft)',
                        borderColor: 'color-mix(in srgb, var(--app-warn) 42%, transparent)',
                        color: 'var(--app-warn)',
                      }
                }
              >
                {remoteConnected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[var(--app-text)] flex flex-wrap items-center gap-1.5">
                  <span>Status Remote:</span>
                  <span style={{ color: remoteConnected ? 'var(--app-ok)' : 'var(--app-warn)' }}>
                    {remoteConnected ? 'TERHUBUNG KE HOST' : 'MENUNGGU KONEKSI'}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--app-text-muted)] truncate">
                  {remoteStatusMessage ||
                    'Hubungkan ke Host untuk mengirim perintah kontrol secara nirkabel.'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!remoteConnected ? (
                <button
                  type="button"
                  onClick={handleConnectRemoteDirect}
                  className="btn-press w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Hubungkan ke Host Ini</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRemoteConnected(false);
                    setRemoteStatusMessage('Koneksi remote diputus.');
                  }}
                  className="btn-press w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-700/70 text-rose-200 text-xs font-bold"
                >
                  Putus Koneksi
                </button>
              )}
            </div>
          </div>

          {renderKeycapGrid(true)}
        </div>
      )}

      {/* Mobile Bottom Sheet Drawer (Pairing QR / ACK Logs) */}
      {mobileSheet && (
        <div
          role="dialog"
          aria-modal="true"
          className="lg:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end justify-center p-2.5"
          onClick={() => setMobileSheet(null)}
        >
          <div
            className="anim-sheet-up w-full max-w-md rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border-strong)] p-4 space-y-3 max-h-[82vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--app-border)]">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--app-text)] font-display">
                {mobileSheet === 'pairing' ? (
                  <>
                    <QrCode className="w-4 h-4 text-[var(--app-accent-text)]" />
                    <span>Pairing Remote Kontrol</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4 text-[var(--app-accent-text)]" />
                    <span>Log Perintah &amp; ACK</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                {mobileSheet === 'logs' && hostLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHostLogs([])}
                    className="btn-press min-h-[44px] px-2.5 rounded-xl text-xs font-semibold text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                  >
                    Bersihkan
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMobileSheet(null)}
                  className="btn-press min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                  aria-label="Tutup panel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {mobileSheet === 'pairing' ? renderPairingStationContent() : renderAckLogContent()}
          </div>
        </div>
      )}
    </div>
  );
};
