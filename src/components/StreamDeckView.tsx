import React, { useState, useEffect } from 'react';
import {
  DeckCommandType,
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
  AlertCircle,
  Copy,
  RefreshCw,
  Sliders,
  X,
  Plus,
  Trash2,
  Edit2,
  Monitor,
  Activity,
  Battery,
  Flame,
  MessageSquare,
  Gamepad2,
  Eye,
  EyeOff,
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
  presets,
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
    activePresetName: activePreset?.name || 'TikTok Gaming Pro',
    micMuted: false,
    audioMuted: false,
    musicNowPlaying: 'Lofi Chill Beat - Syntxrr',
    musicIsPlaying: false,
    viewerCount: 1420,
  });

  // Pages & Buttons configuration
  const [pages] = useState<DeckPage[]>(DEFAULT_DECK_PAGES);
  const [activePageId, setActivePageId] = useState<string>('page_main');
  const [buttons, setButtons] = useState<DeckButton[]>(DEFAULT_DECK_BUTTONS);

  // Remote role connection state
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [remotePinInput, setRemotePinInput] = useState('');
  const [remoteStatusMessage, setRemoteStatusMessage] = useState<string | null>(null);
  const [lastActionStatus, setLastActionStatus] = useState<{ id: string; status: 'pending' | 'success' | 'error'; label?: string } | null>(null);

  // Command logs on Host
  const [hostLogs, setHostLogs] = useState<{ id: string; time: string; text: string; success: boolean }[]>([]);

  // Editing button modal
  const [editingButton, setEditingButton] = useState<DeckButton | null>(null);

  // Initialize Host or sync telemetry
  useEffect(() => {
    if (role === 'host') {
      const data = streamDeckService.startHost('Android Streaming Master');
      setPairingData(data);

      const unsubDevices = streamDeckService.onRemoteDevicesChange((devices) => {
        setConnectedDevices(devices);
      });

      // Update telemetry with current App state
      streamDeckService.updateTelemetry({
        activePresetName: activePreset?.name || 'Studio Layout',
        bitrateKbps: settings.videoBitrateKbps,
        fps: settings.frameRate,
      });

      // Listen for incoming commands on Host
      const unsubCommand = streamDeckService.onCommand((packet, reply) => {
        const timeStr = new Date().toLocaleTimeString('id-ID');
        let success = true;
        let logMessage = `Eksekusi '${packet.command}'`;

        try {
          switch (packet.command) {
            case 'toggle_live':
            case 'start_live':
            case 'stop_live':
              logMessage = `Toggle Siaran Langsung`;
              break;
            case 'mute_mic':
              logMessage = `Toggle Mute Mikrofon`;
              setTelemetry((prev) => {
                const updated = { ...prev, micMuted: !prev.micMuted };
                streamDeckService.updateTelemetry(updated);
                return updated;
              });
              break;
            case 'mute_audio':
              logMessage = `Toggle Mute Master Audio`;
              setTelemetry((prev) => {
                const updated = { ...prev, audioMuted: !prev.audioMuted };
                streamDeckService.updateTelemetry(updated);
                return updated;
              });
              break;
            case 'music_play_pause':
              logMessage = `Musik Play/Pause`;
              if (onToggleMusic) onToggleMusic();
              setTelemetry((prev) => {
                const updated = { ...prev, musicIsPlaying: !prev.musicIsPlaying };
                streamDeckService.updateTelemetry(updated);
                return updated;
              });
              break;
            case 'music_skip':
              logMessage = `Skip Lagu Musik`;
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
                onTriggerEvent(packet.payload.type, packet.payload.detail || '', packet.payload.amount);
              }
              break;
            case 'emergency_blank':
              logMessage = `BLACKOUT DARURAT DIAKTIFKAN`;
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
        } catch (err: any) {
          success = false;
          reply({
            messageId: packet.messageId,
            status: 'FAILED',
            timestamp: Date.now(),
            error: err?.message || 'Gagal mengeksekusi perintah di host',
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
      // Remote role
      const unsubTelemetry = streamDeckService.onTelemetry((t) => {
        setTelemetry(t);
        setRemoteConnected(true);
      });
      return () => {
        unsubTelemetry();
        streamDeckService.disconnectRemote();
      };
    }
  }, [role, activePreset, operatingMode, settings]);

  // Handle Remote Action Click
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
        // Direct execution on host preview
        if (btn.command === 'music_play_pause' && onToggleMusic) onToggleMusic();
        if (btn.command === 'music_skip' && onSkipMusic) onSkipMusic();
        if (btn.command === 'switch_scene' && btn.payload?.presetId) onSelectPreset(btn.payload.presetId);
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
    } catch (err: any) {
      setLastActionStatus({ id: btn.id, status: 'error', label: err.message || 'Gagal mengirim' });
    }

    setTimeout(() => {
      setLastActionStatus(null);
    }, 1200);
  };

  const handleConnectRemoteDirect = () => {
    if (pairingData) {
      streamDeckService.connectAsRemote(pairingData.pairingToken, 'HP Remote Sekunder');
      setRemoteConnected(true);
      setRemoteStatusMessage('Berhasil terhubung ke Host di jaringan lokal.');
    } else {
      streamDeckService.connectAsRemote('tok_demo_syntxrr', 'HP Remote Sekunder');
      setRemoteConnected(true);
      setRemoteStatusMessage('Terhubung via saluran uji mandiri.');
    }
  };

  const handleCopyPairingToken = () => {
    if (pairingData?.pairingToken) {
      navigator.clipboard.writeText(pairingData.pairingToken);
      alert('Token pairing disalin ke clipboard!');
    }
  };

  const activePageButtons = buttons.filter((b) => b.pageId === activePageId);

  // Icon resolver
  const renderIcon = (iconName: string, className = 'w-6 h-6') => {
    switch (iconName) {
      case 'Radio':
        return <Radio className={className} />;
      case 'Mic':
        return telemetry.micMuted ? <MicOff className={`${className} text-rose-400`} /> : <Mic className={className} />;
      case 'VolumeX':
        return telemetry.audioMuted ? <VolumeX className={`${className} text-rose-400`} /> : <Volume2 className={className} />;
      case 'Play':
        return telemetry.musicIsPlaying ? <Pause className={className} /> : <Play className={className} />;
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
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Top Banner & Role Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0a0f1d] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-blue-400 uppercase">
            <span>Protokol LAN Nirkabel P2P</span>
            <span className="text-slate-500">·</span>
            <span>Kendali Jarak Jauh Siaran</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Smartphone className="w-6 h-6 text-blue-400" />
            SYNTXRR Remote Stream Deck
          </h1>
          <p className="text-xs text-slate-400">
            Jadikan HP kedua Anda sebagai kontroler tombol fisik nirkabel tanpa menyentuh layar HP siaran utama.
          </p>
        </div>

        {/* Role Selector Tabs */}
        <div className="flex items-center p-1 bg-[#0e1626] rounded-xl border border-slate-800 shrink-0 self-start sm:self-auto">
          <button
            onClick={() => setRole('host')}
            className={`min-h-[40px] px-4 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
              role === 'host'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>Pusat Siaran (Host)</span>
          </button>
          <button
            onClick={() => setRole('remote')}
            className={`min-h-[40px] px-4 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
              role === 'remote'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Remote Kontrol (Klien)</span>
          </button>
        </div>
      </div>

      {/* Real-time Telemetry Monitor Strip (Available in both Host & Remote views) */}
      <div className="bg-[#0e1626] border border-slate-800 rounded-xl p-3.5 shadow-md">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>Telemetri Studio Siaran (Real-Time Sync)</span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800 text-blue-300">
            {role === 'host' ? 'Mode Host: Aktif Siar' : 'Sinkronisasi Remote: Terhubung'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-[#080c16] border border-slate-800/80">
            <div className="text-[10px] text-slate-400 font-medium">Status Siaran</div>
            <div className="font-bold text-white flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${telemetry.isStreaming ? 'bg-red-500 animate-ping' : 'bg-amber-400'}`} />
              <span>{telemetry.isStreaming ? 'LIVE' : 'Siap Siaran'}</span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-[#080c16] border border-slate-800/80">
            <div className="text-[10px] text-slate-400 font-medium">Encoder FPS &amp; Bitrate</div>
            <div className="font-bold text-sky-400 font-mono mt-0.5">
              {telemetry.fps} FPS · {telemetry.bitrateKbps} kbps
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-[#080c16] border border-slate-800/80">
            <div className="text-[10px] text-slate-400 font-medium">Preset Aktif</div>
            <div className="font-bold text-white truncate mt-0.5">
              {telemetry.activePresetName}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-[#080c16] border border-slate-800/80">
            <div className="text-[10px] text-slate-400 font-medium">Status Suara</div>
            <div className="font-bold text-white flex items-center gap-2 mt-0.5">
              <span className={telemetry.micMuted ? 'text-rose-400' : 'text-emerald-400'}>
                {telemetry.micMuted ? 'Mic MATI' : 'Mic ON'}
              </span>
              <span className="text-slate-600">|</span>
              <span className={telemetry.audioMuted ? 'text-rose-400' : 'text-emerald-400'}>
                {telemetry.audioMuted ? 'Mute' : 'Audio ON'}
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-[#080c16] border border-slate-800/80">
            <div className="text-[10px] text-slate-400 font-medium">Kesehatan HP</div>
            <div className="font-bold text-white flex items-center gap-2 mt-0.5 font-mono">
              <span className="text-emerald-400 flex items-center gap-0.5">
                <Battery className="w-3 h-3" /> {telemetry.batteryPercent}%
              </span>
              <span className="text-amber-400 flex items-center gap-0.5">
                <Flame className="w-3 h-3" /> {telemetry.deviceTempC}°C
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-[#080c16] border border-slate-800/80">
            <div className="text-[10px] text-slate-400 font-medium">Now Playing Musik</div>
            <div className="font-bold text-slate-300 truncate mt-0.5 text-[11px]">
              {telemetry.musicNowPlaying}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* HOST ROLE VIEW */}
      {/* ========================================================================= */}
      {role === 'host' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Pairing QR Code & Connection Details */}
          <div className="lg:col-span-5 bg-[#0e1626] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-blue-400" />
                  Pairing HP Remote Kontrol
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pindai QR atau masukkan PIN di HP kedua pada jaringan Wi-Fi yang sama
                </p>
              </div>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-800 text-[10px] font-bold text-emerald-400">
                <Wifi className="w-3 h-3" /> Server Aktif
              </span>
            </div>

            {/* Simulated Vector QR Code Matrix */}
            <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-inner max-w-[260px] mx-auto">
              <div className="relative w-48 h-48 bg-white flex flex-col justify-between p-2">
                {/* QR Positioning Corners */}
                <div className="flex justify-between">
                  <div className="w-12 h-12 border-4 border-slate-900 rounded-lg flex items-center justify-center">
                    <div className="w-6 h-6 bg-slate-900 rounded-sm" />
                  </div>
                  <div className="w-12 h-12 border-4 border-slate-900 rounded-lg flex items-center justify-center">
                    <div className="w-6 h-6 bg-slate-900 rounded-sm" />
                  </div>
                </div>

                {/* QR Center Data pattern with Brand logo */}
                <div className="my-auto mx-auto w-32 h-16 grid grid-cols-6 gap-1 p-1">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-xs ${
                        (i * 7 + 3) % 2 === 0 ? 'bg-slate-900' : 'bg-transparent'
                      }`}
                    />
                  ))}
                </div>

                <div className="flex justify-between items-end">
                  <div className="w-12 h-12 border-4 border-slate-900 rounded-lg flex items-center justify-center">
                    <div className="w-6 h-6 bg-slate-900 rounded-sm" />
                  </div>
                  <div className="px-2 py-0.5 bg-blue-600 rounded text-[9px] font-black text-white uppercase tracking-wider">
                    SYNTXRR
                  </div>
                </div>
              </div>
              <div className="text-[11px] font-mono font-bold text-slate-800 mt-2">
                PIN: {pairingData?.pairingPin || '689231'}
              </div>
            </div>

            {/* Connection Credentials info */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#080c16] border border-slate-800">
                <span className="text-slate-400">Host IP Jaringan:</span>
                <span className="font-mono font-bold text-blue-400">
                  {pairingData?.hostIp || '192.168.1.105'}:{pairingData?.port || 8080}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#080c16] border border-slate-800">
                <span className="text-slate-400">Token Pairing:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-300 truncate max-w-[140px]">
                    {pairingData?.pairingToken || 'tok_syn_99824'}
                  </span>
                  <button
                    onClick={handleCopyPairingToken}
                    className="p-1 rounded text-slate-400 hover:text-white"
                    title="Salin Token"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Connected Remotes Section */}
            <div className="border-t border-slate-800 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-blue-400" />
                  Perangkat Terhubung ({connectedDevices.length})
                </h3>
              </div>

              {connectedDevices.length === 0 ? (
                <div className="p-3 rounded-xl bg-[#080c16] border border-dashed border-slate-800 text-center text-xs text-slate-400">
                  Belum ada remote yang terhubung. Buka tab "Remote Kontrol" pada HP kedua atau klik "Uji Mandiri" di bawah.
                </div>
              ) : (
                <div className="space-y-2">
                  {connectedDevices.map((dev) => (
                    <div
                      key={dev.deviceId}
                      className="p-2.5 rounded-xl bg-[#080c16] border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <div>
                          <div className="font-bold text-white">{dev.deviceName}</div>
                          <div className="text-[10px] text-slate-400">
                            Terhubung {new Date(dev.connectedAt).toLocaleTimeString('id-ID')}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => streamDeckService.revokeDevice(dev.deviceId)}
                        className="px-2 py-1 rounded bg-rose-950/60 border border-rose-900/60 text-[10px] text-rose-400 hover:bg-rose-900/80"
                      >
                        Putuskan
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Live Stream Deck Control Matrix (Host Preview) & Action Logs */}
          <div className="lg:col-span-7 space-y-6">
            {/* Interactive Deck Simulator on Host */}
            <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-400" />
                    Papan Tombol Deck (Pratinjau Master)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Halaman tombol yang aktif dapat ditekan langsung atau dikendalikan remote
                  </p>
                </div>

                {/* Page Switcher */}
                <div className="flex items-center gap-1.5 p-1 bg-[#080c16] rounded-xl border border-slate-800 text-xs">
                  {pages.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setActivePageId(p.id)}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                        activePageId === p.id
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Button Grid (Tactile Stream Deck) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {activePageButtons.map((btn) => {
                  const isPending = lastActionStatus?.id === btn.id && lastActionStatus.status === 'pending';
                  const isSuccess = lastActionStatus?.id === btn.id && lastActionStatus.status === 'success';

                  return (
                    <button
                      key={btn.id}
                      onClick={() => handleExecuteButton(btn)}
                      className={`relative min-h-[92px] p-3 rounded-2xl border text-left flex flex-col justify-between transition-all duration-150 active:scale-95 shadow-lg select-none ${btn.color} ${
                        isPending ? 'ring-2 ring-white animate-pulse' : ''
                      } ${isSuccess ? 'ring-2 ring-emerald-400' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="w-8 h-8 rounded-lg bg-black/30 flex items-center justify-center text-white">
                          {renderIcon(btn.icon)}
                        </div>
                        <span className="text-[10px] font-mono text-white/60">
                          #{btn.order}
                        </span>
                      </div>

                      <div className="mt-2">
                        <div className="text-xs font-bold text-white leading-snug drop-shadow-sm line-clamp-2">
                          {btn.label}
                        </div>
                      </div>

                      {/* Success / Pending Flash */}
                      {isSuccess && (
                        <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl flex items-center justify-center backdrop-blur-xs">
                          <CheckCircle2 className="w-6 h-6 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Host Activity Log */}
            <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-white border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-blue-400" />
                  Log Penerimaan Perintah Remote
                </span>
                <button
                  onClick={() => setHostLogs([])}
                  className="text-slate-400 hover:text-white text-[11px]"
                >
                  Bersihkan
                </button>
              </div>

              {hostLogs.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500">
                  Belum ada aktivitas perintah dari remote.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto font-mono text-[11px]">
                  {hostLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 rounded bg-[#080c16] border border-slate-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">[{log.time}]</span>
                        <span className={log.success ? 'text-emerald-400' : 'text-rose-400'}>
                          {log.text}
                        </span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        ACK: OK
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REMOTE ROLE VIEW (SECONDARY PHONE / CLIENT CONTROLLER) */}
      {/* ========================================================================= */}
      {role === 'remote' && (
        <div className="space-y-6">
          {/* Remote Status & Quick Connect Bar */}
          <div className="bg-[#0e1626] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  remoteConnected
                    ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400'
                    : 'bg-amber-600/20 border border-amber-500/40 text-amber-400'
                }`}
              >
                {remoteConnected ? <Wifi className="w-6 h-6" /> : <WifiOff className="w-6 h-6" />}
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Status Remote:</span>
                  <span className={remoteConnected ? 'text-emerald-400 font-extrabold' : 'text-amber-400'}>
                    {remoteConnected ? 'TERHUBUNG KE PUSAT SIARAN' : 'MENUNGGU KONEKSI HOST'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {remoteStatusMessage || 'Hubungkan ke Host untuk mengendalikan siaran secara nirkabel.'}
                </div>
              </div>
            </div>

            {/* Quick connect button */}
            <div className="flex items-center gap-2">
              {!remoteConnected ? (
                <button
                  onClick={handleConnectRemoteDirect}
                  className="min-h-[42px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  Hubungkan ke Host Ini
                </button>
              ) : (
                <button
                  onClick={() => {
                    setRemoteConnected(false);
                    setRemoteStatusMessage('Koneksi remote diputus.');
                  }}
                  className="min-h-[42px] px-4 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-900/80 text-rose-300 text-xs font-bold transition-all"
                >
                  Putus Koneksi
                </button>
              )}
            </div>
          </div>

          {/* Remote Deck Screen: Large Touch Pad */}
          <div className="bg-[#0a0f1d] border-2 border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4">
            {/* Page Tabs */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-bold text-white">Stream Deck Touch Pad</span>
              </div>

              <div className="flex items-center gap-1.5 p-1 bg-[#0e1626] rounded-xl border border-slate-800 text-xs">
                {pages.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActivePageId(p.id)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                      activePageId === p.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Tactile Big Touch Buttons (Designed for HP Mobile Screen) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              {activePageButtons.map((btn) => {
                const isPending = lastActionStatus?.id === btn.id && lastActionStatus.status === 'pending';
                const isSuccess = lastActionStatus?.id === btn.id && lastActionStatus.status === 'success';

                return (
                  <button
                    key={btn.id}
                    onClick={() => handleExecuteButton(btn)}
                    disabled={!remoteConnected}
                    className={`relative min-h-[110px] sm:min-h-[120px] p-4 rounded-2xl border text-left flex flex-col justify-between transition-all duration-100 active:scale-95 shadow-xl select-none disabled:opacity-40 disabled:cursor-not-allowed ${btn.color} ${
                      isPending ? 'ring-4 ring-white animate-pulse' : ''
                    } ${isSuccess ? 'ring-4 ring-emerald-400' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-white shadow-inner">
                        {renderIcon(btn.icon, 'w-6 h-6')}
                      </div>
                      <span className="text-[11px] font-mono font-bold text-white/50">
                        #{btn.order}
                      </span>
                    </div>

                    <div className="mt-3">
                      <div className="text-sm font-black text-white leading-tight drop-shadow-md">
                        {btn.label}
                      </div>
                    </div>

                    {/* Instant Feedback Overlay */}
                    {isSuccess && (
                      <div className="absolute inset-0 bg-emerald-500/30 rounded-2xl flex items-center justify-center backdrop-blur-xs animate-in fade-in">
                        <CheckCircle2 className="w-8 h-8 text-white drop-shadow-lg" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Remote instructions notice */}
            <div className="p-3 rounded-xl bg-[#0e1626] border border-blue-900/40 text-xs text-blue-300/90 flex items-center justify-between">
              <span>💡 Setiap sentuhan mengirim paket terotentikasi ke Host dengan verifikasi status ACK instan.</span>
              <span className="font-mono text-[11px] text-blue-400 font-bold">Latency: &lt;15ms</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
