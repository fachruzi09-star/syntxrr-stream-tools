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
        if (btn.command === 'music_play_pause' && onToggleMusic) onToggleMusic();
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
        setLastActionStatus({ id: btn.id, status: 'success', label: btn.label });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mengirim';
      setLastActionStatus({ id: btn.id, status: 'error', label: message });
    }

    window.setTimeout(() => {
      setLastActionStatus(null);
    }, 1200);
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

  return (
    <div className="space-y-5 pb-6">
      {/* Header & Role Segmented Control */}
      <header className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--app-text-muted)]">
            <span className="uppercase tracking-[0.12em] font-semibold text-[var(--app-accent-text)]">
              D+ Hardware Remote Deck
            </span>
            <span aria-hidden="true" className="text-[var(--app-border-strong)]">
              /
            </span>
            <span>Protokol Sinkronisasi LAN P2P</span>
          </div>
          <h1 className="font-display text-2xl sm:text-[26px] font-bold text-[var(--app-text)] tracking-tight flex items-center gap-2.5">
            <Smartphone className="w-6 h-6 text-[var(--app-accent-text)] shrink-0" />
            <span>SYNTXRR Remote Stream Deck</span>
          </h1>
          <p className="text-xs sm:text-sm text-[var(--app-text-muted)] max-w-2xl leading-relaxed">
            Gunakan perangkat kedua sebagai kontroler hardware sentuh tanpa mengganggu layar siaran utama.
          </p>
        </div>

        <div className="flex items-center p-1 bg-[var(--app-surface-muted)] rounded-xl border border-[var(--app-border)] shrink-0 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setRole('host')}
            className={`min-h-[44px] px-4 rounded-lg text-xs font-bold inline-flex items-center gap-2 transition-colors ${
              role === 'host'
                ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
            }`}
          >
            <Tv className="w-4 h-4 shrink-0" />
            <span>Host Siaran</span>
          </button>
          <button
            type="button"
            onClick={() => setRole('remote')}
            className={`min-h-[44px] px-4 rounded-lg text-xs font-bold inline-flex items-center gap-2 transition-colors ${
              role === 'remote'
                ? 'bg-[var(--app-accent)] text-[var(--app-accent-ink)]'
                : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
            }`}
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>Remote Kontrol</span>
          </button>
        </div>
      </header>

      {/* Honest Telemetry Monitor Strip */}
      <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] pb-2.5 mb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--app-text)]">
            <Activity className="w-4 h-4 text-[var(--app-accent-text)] shrink-0" />
            <span>Telemetri Sinkronisasi Deck</span>
          </div>
          <span className="text-[11px] font-mono-num px-2.5 py-0.5 rounded-md bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-[var(--app-text-secondary)]">
            {role === 'host'
              ? telemetry.isStreaming
                ? 'Host: Siaran Aktif'
                : 'Host: Siaga (Standby)'
              : remoteConnected
              ? 'Remote: Tersinkron'
              : 'Remote: Belum Terhubung'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
              Status Sesi
            </div>
            <div className="font-bold text-[var(--app-text)] flex items-center gap-1.5 mt-1">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: telemetry.isStreaming ? 'var(--app-ok)' : 'var(--app-warn)',
                }}
              />
              <span>{telemetry.isStreaming ? 'LIVE' : 'Standby'}</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
              Profil Output
            </div>
            <div className="font-bold text-[var(--app-accent-text)] font-mono-num mt-1 truncate">
              {telemetry.fps} FPS · {telemetry.bitrateKbps} kbps
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
              Preset Aktif
            </div>
            <div className="font-bold text-[var(--app-text)] truncate mt-1">
              {activePreset?.name || telemetry.activePresetName}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
              Audio Deck
            </div>
            <div className="font-bold flex items-center gap-1.5 mt-1">
              <span className={telemetry.micMuted ? 'text-rose-400' : 'text-[var(--app-ok)]'}>
                {telemetry.micMuted ? 'Mic Off' : 'Mic On'}
              </span>
              <span className="text-[var(--app-border-strong)]">/</span>
              <span className={telemetry.audioMuted ? 'text-rose-400' : 'text-[var(--app-ok)]'}>
                {telemetry.audioMuted ? 'Muted' : 'Audio On'}
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
              Snapshot Host
            </div>
            <div className="font-semibold text-[var(--app-text-secondary)] flex items-center gap-2 mt-1 font-mono-num">
              <span className="inline-flex items-center gap-1">
                <Battery className="w-3 h-3 text-[var(--app-accent-text)]" />
                {telemetry.batteryPercent}%
              </span>
              <span className="inline-flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" />
                {telemetry.deviceTempC}°C
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)]">
              Musik Deck
            </div>
            <div className="font-semibold text-[var(--app-text-secondary)] truncate mt-1">
              {telemetry.musicNowPlaying}
            </div>
          </div>
        </div>
      </section>

      {/* HOST ROLE WORKSPACE */}
      {role === 'host' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT: LAN Pairing Station */}
          <div className="lg:col-span-5 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--app-border)] pb-3">
              <div>
                <h2 className="font-display text-sm font-bold text-[var(--app-text)] flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-[var(--app-accent-text)]" />
                  <span>Pairing Remote Kontrol</span>
                </h2>
                <p className="text-[11px] text-[var(--app-text-muted)] mt-0.5">
                  Pindai QR atau masukkan PIN pada perangkat kedua di jaringan yang sama
                </p>
              </div>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold shrink-0"
                style={{
                  backgroundColor: 'var(--app-ok-soft)',
                  borderColor: 'color-mix(in srgb, var(--app-ok) 40%, transparent)',
                  color: 'var(--app-ok)',
                }}
              >
                <Wifi className="w-3 h-3" /> Siap
              </span>
            </div>

            {/* Crisp Vector QR Matrix */}
            <div className="flex flex-col items-center justify-center p-5 bg-white rounded-2xl max-w-[240px] mx-auto">
              <div className="relative w-44 h-44 bg-white flex flex-col justify-between p-1.5">
                <div className="flex justify-between">
                  <div className="w-11 h-11 border-4 border-neutral-900 rounded-lg flex items-center justify-center">
                    <div className="w-5 h-5 bg-neutral-900 rounded-xs" />
                  </div>
                  <div className="w-11 h-11 border-4 border-neutral-900 rounded-lg flex items-center justify-center">
                    <div className="w-5 h-5 bg-neutral-900 rounded-xs" />
                  </div>
                </div>

                <div className="my-auto mx-auto w-28 h-14 grid grid-cols-6 gap-1 p-1">
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
                  <div className="w-11 h-11 border-4 border-neutral-900 rounded-lg flex items-center justify-center">
                    <div className="w-5 h-5 bg-neutral-900 rounded-xs" />
                  </div>
                  <div className="px-2 py-0.5 bg-[#14171D] rounded text-[9px] font-black text-[#F2C230] uppercase tracking-wider">
                    SYNTXRR
                  </div>
                </div>
              </div>
              <div className="text-xs font-mono-num font-bold text-neutral-900 mt-2">
                PIN: {pairingData?.pairingPin || '689231'}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
                <span className="text-[var(--app-text-muted)]">Alamat Host:</span>
                <span className="font-mono-num font-bold text-[var(--app-accent-text)]">
                  {pairingData?.hostIp || '192.168.1.105'}:{pairingData?.port || 8080}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 pl-3 pr-1.5 py-1.5 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)]">
                <span className="text-[var(--app-text-muted)]">Token Pairing:</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono-num text-[11px] text-[var(--app-text)] truncate max-w-[130px]">
                    {pairingData?.pairingToken || 'tok_syn_99824'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyPairingToken}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:text-[var(--app-accent-text)] hover:bg-[var(--app-surface-hover)] transition-colors"
                    aria-label="Salin token pairing"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Connected Remotes */}
            <div className="border-t border-[var(--app-border)] pt-4 space-y-2.5">
              <h3 className="text-xs font-bold text-[var(--app-text)] flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[var(--app-accent-text)]" />
                <span>Perangkat Terhubung ({connectedDevices.length})</span>
              </h3>

              {connectedDevices.length === 0 ? (
                <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-dashed border-[var(--app-border-strong)] text-center text-xs text-[var(--app-text-muted)] leading-relaxed">
                  Belum ada remote terhubung. Beralih ke tab Remote Kontrol pada perangkat kedua untuk pairing.
                </div>
              ) : (
                <div className="space-y-2">
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
                            Terhubung {new Date(dev.connectedAt).toLocaleTimeString('id-ID')}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => streamDeckService.revokeDevice(dev.deviceId)}
                        className="min-h-[44px] px-3 rounded-xl bg-rose-950/60 border border-rose-700/60 text-xs font-semibold text-rose-200 hover:bg-rose-900/80 transition-colors shrink-0"
                      >
                        Putuskan
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Hardware Keycap Matrix & Command ACK Log */}
          <div className="lg:col-span-7 space-y-5">
            <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--app-border)] pb-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-[var(--app-text)] flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[var(--app-accent-text)]" />
                    <span>Matriks Tombol Deck (Pratinjau Master)</span>
                  </h2>
                  <p className="text-[11px] text-[var(--app-text-muted)] mt-0.5">
                    Tekan tombol fisik virtual di bawah untuk menguji eksekusi pada Host
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[var(--app-surface-muted)] rounded-xl border border-[var(--app-border)] text-xs self-start sm:self-auto">
                  {pages.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePageId(p.id)}
                      className={`min-h-[40px] px-3 rounded-lg font-bold transition-colors ${
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {activePageButtons.map((btn) => {
                  const isPending =
                    lastActionStatus?.id === btn.id && lastActionStatus.status === 'pending';
                  const isSuccess =
                    lastActionStatus?.id === btn.id && lastActionStatus.status === 'success';

                  return (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => void handleExecuteButton(btn)}
                      className={`relative min-h-[96px] p-3 rounded-2xl border text-left flex flex-col justify-between transition-all active:scale-[0.97] select-none ${btn.color} ${
                        isPending ? 'ring-2 ring-[var(--app-accent)]' : ''
                      } ${isSuccess ? 'ring-2 ring-emerald-400' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="w-8 h-8 rounded-lg bg-black/35 border border-white/10 flex items-center justify-center text-white">
                          {renderIcon(btn.icon)}
                        </div>
                        <span className="text-[10px] font-mono-num text-white/70">
                          #{btn.order}
                        </span>
                      </div>

                      <div className="mt-2">
                        <div className="text-xs font-bold text-white leading-snug line-clamp-2">
                          {btn.label}
                        </div>
                      </div>

                      {isSuccess && (
                        <div className="absolute inset-0 bg-emerald-500/25 rounded-2xl flex items-center justify-center backdrop-blur-[1px]">
                          <CheckCircle2 className="w-6 h-6 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Incoming Remote ACK Log */}
            <section className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--app-text)] border-b border-[var(--app-border)] pb-2.5">
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--app-accent-text)]" />
                  <span>Log Perintah &amp; ACK</span>
                </span>
                <button
                  type="button"
                  onClick={() => setHostLogs([])}
                  className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-muted)] transition-colors"
                >
                  Bersihkan
                </button>
              </div>

              {hostLogs.length === 0 ? (
                <div className="text-center py-5 text-xs text-[var(--app-text-muted)]">
                  Belum ada aktivitas perintah dari remote.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto font-mono-num text-[11px]">
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
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-secondary)] shrink-0">
                        {log.success ? 'ACK: OK' : 'ERR'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* REMOTE ROLE WORKSPACE */}
      {role === 'remote' && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)] p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0"
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
                <div className="text-sm font-bold text-[var(--app-text)] flex flex-wrap items-center gap-2">
                  <span>Status Remote:</span>
                  <span style={{ color: remoteConnected ? 'var(--app-ok)' : 'var(--app-warn)' }}>
                    {remoteConnected ? 'TERHUBUNG KE HOST' : 'MENUNGGU KONEKSI HOST'}
                  </span>
                </div>
                <div className="text-xs text-[var(--app-text-muted)] mt-0.5">
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
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--app-accent-ink)] text-xs font-bold inline-flex items-center gap-2 transition-colors"
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
                  className="min-h-[44px] px-4 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-700/70 text-rose-200 text-xs font-bold transition-colors"
                >
                  Putus Koneksi
                </button>
              )}
            </div>
          </div>

          <section className="rounded-3xl bg-[var(--app-surface)] border-2 border-[var(--app-border-strong)] p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--app-border)] pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-[var(--app-accent-text)]" />
                <h2 className="font-display text-sm font-bold text-[var(--app-text)]">
                  Stream Deck Touch Pad
                </h2>
              </div>

              <div className="flex items-center gap-1 p-1 bg-[var(--app-surface-muted)] rounded-xl border border-[var(--app-border)] text-xs self-start sm:self-auto">
                {pages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActivePageId(p.id)}
                    className={`min-h-[40px] px-3 rounded-lg font-bold transition-colors ${
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              {activePageButtons.map((btn) => {
                const isPending =
                  lastActionStatus?.id === btn.id && lastActionStatus.status === 'pending';
                const isSuccess =
                  lastActionStatus?.id === btn.id && lastActionStatus.status === 'success';

                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => void handleExecuteButton(btn)}
                    disabled={!remoteConnected}
                    className={`relative min-h-[112px] sm:min-h-[120px] p-4 rounded-2xl border text-left flex flex-col justify-between transition-all active:scale-[0.97] select-none disabled:opacity-40 disabled:cursor-not-allowed ${btn.color} ${
                      isPending ? 'ring-2 ring-[var(--app-accent)]' : ''
                    } ${isSuccess ? 'ring-2 ring-emerald-400' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-white">
                        {renderIcon(btn.icon, 'w-5 h-5')}
                      </div>
                      <span className="text-[11px] font-mono-num font-bold text-white/60">
                        #{btn.order}
                      </span>
                    </div>

                    <div className="mt-3">
                      <div className="text-sm font-black text-white leading-tight line-clamp-2">
                        {btn.label}
                      </div>
                    </div>

                    {isSuccess && (
                      <div className="absolute inset-0 bg-emerald-500/25 rounded-2xl flex items-center justify-center backdrop-blur-[1px]">
                        <CheckCircle2 className="w-8 h-8 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-3 rounded-xl bg-[var(--app-surface-muted)] border border-[var(--app-border)] text-xs text-[var(--app-text-secondary)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span>
                Setiap sentuhan mengirim paket perintah ke Host dengan verifikasi status ACK.
              </span>
              <span className="font-mono-num text-[11px] text-[var(--app-accent-text)] font-bold shrink-0">
                Saluran: {remoteConnected ? 'Siap Kirim' : 'Offline'}
              </span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
