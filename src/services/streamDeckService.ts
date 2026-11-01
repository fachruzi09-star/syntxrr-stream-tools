import {
  DeckCommandPacket,
  DeckCommandAck,
  DeckCommandType,
  DeckTelemetry,
  DeckButton,
  DeckPage,
  DeckPairingData,
  ConnectedRemoteDevice,
} from '../types';

export const DEFAULT_DECK_PAGES: DeckPage[] = [
  {
    id: 'page_main',
    name: 'Siaran & Audio',
    icon: 'Radio',
    buttonIds: ['btn_live', 'btn_mic', 'btn_audio', 'btn_overlay', 'btn_play', 'btn_skip', 'btn_mode', 'btn_emergency'],
  },
  {
    id: 'page_scenes',
    name: 'Preset Scene',
    icon: 'Layers',
    buttonIds: ['btn_sc_gaming', 'btn_sc_chat', 'btn_sc_music', 'btn_sc_blank', 'btn_sc_prev', 'btn_sc_next'],
  },
  {
    id: 'page_sfx',
    name: 'Soundboard & SFX',
    icon: 'Music2',
    buttonIds: ['btn_sfx_horn', 'btn_sfx_cheer', 'btn_sfx_bell', 'btn_sfx_tada', 'btn_evt_gift', 'btn_evt_saweria'],
  },
];

export const DEFAULT_DECK_BUTTONS: DeckButton[] = [
  // Page 1
  {
    id: 'btn_live',
    label: 'Mulai / Stop Siaran',
    command: 'toggle_live',
    icon: 'Radio',
    color: 'bg-red-600 hover:bg-red-500 border-red-500/50',
    order: 1,
    pageId: 'page_main',
  },
  {
    id: 'btn_mic',
    label: 'Mute Mikrofon',
    command: 'mute_mic',
    icon: 'Mic',
    color: 'bg-amber-600 hover:bg-amber-500 border-amber-500/50',
    order: 2,
    pageId: 'page_main',
  },
  {
    id: 'btn_audio',
    label: 'Mute Master Audio',
    command: 'mute_audio',
    icon: 'VolumeX',
    color: 'bg-purple-600 hover:bg-purple-500 border-purple-500/50',
    order: 3,
    pageId: 'page_main',
  },
  {
    id: 'btn_overlay',
    label: 'Toggle Overlay HUD',
    command: 'toggle_overlay',
    icon: 'Eye',
    color: 'bg-blue-600 hover:bg-blue-500 border-blue-500/50',
    order: 4,
    pageId: 'page_main',
  },
  {
    id: 'btn_play',
    label: 'Play / Jeda Musik',
    command: 'music_play_pause',
    icon: 'Play',
    color: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500/50',
    order: 5,
    pageId: 'page_main',
  },
  {
    id: 'btn_skip',
    label: 'Lagu Berikutnya',
    command: 'music_skip',
    icon: 'SkipForward',
    color: 'bg-cyan-600 hover:bg-cyan-500 border-cyan-500/50',
    order: 6,
    pageId: 'page_main',
  },
  {
    id: 'btn_mode',
    label: 'Ganti Mode A / B',
    command: 'switch_mode',
    icon: 'Monitor',
    color: 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500/50',
    order: 7,
    pageId: 'page_main',
  },
  {
    id: 'btn_emergency',
    label: 'Blackout Darurat',
    command: 'emergency_blank',
    icon: 'ShieldAlert',
    color: 'bg-rose-700 hover:bg-rose-600 border-rose-600/50',
    order: 8,
    pageId: 'page_main',
  },

  // Page 2 - Presets
  {
    id: 'btn_sc_gaming',
    label: 'Preset Gaming 9:16',
    command: 'switch_scene',
    payload: { presetId: 'preset_gaming_916', name: 'TikTok Gaming Pro' },
    icon: 'Gamepad2',
    color: 'bg-blue-600 hover:bg-blue-500 border-blue-500/50',
    order: 1,
    pageId: 'page_scenes',
  },
  {
    id: 'btn_sc_chat',
    label: 'Preset Ngobrol / Just Chat',
    command: 'switch_scene',
    payload: { presetId: 'preset_chat_916', name: 'Just Chatting & QnA' },
    icon: 'MessageSquare',
    color: 'bg-sky-600 hover:bg-sky-500 border-sky-500/50',
    order: 2,
    pageId: 'page_scenes',
  },
  {
    id: 'btn_sc_music',
    label: 'Preset Music Session',
    command: 'switch_scene',
    payload: { presetId: 'preset_music_916', name: 'Music Showcase' },
    icon: 'Music2',
    color: 'bg-violet-600 hover:bg-violet-500 border-violet-500/50',
    order: 3,
    pageId: 'page_scenes',
  },
  {
    id: 'btn_sc_blank',
    label: 'Canvas Polos (Blank)',
    command: 'switch_scene',
    payload: { presetId: 'preset_blank', name: 'Blank Canvas' },
    icon: 'Layers',
    color: 'bg-slate-700 hover:bg-slate-600 border-slate-600/50',
    order: 4,
    pageId: 'page_scenes',
  },

  // Page 3 - SFX & Events
  {
    id: 'btn_sfx_horn',
    label: 'Air Horn (Hype)',
    command: 'play_soundboard',
    payload: { soundId: 'sb_horn', synthType: 'horn', name: 'Air Horn' },
    icon: 'Megaphone',
    color: 'bg-amber-600 hover:bg-amber-500 border-amber-500/50',
    order: 1,
    pageId: 'page_sfx',
  },
  {
    id: 'btn_sfx_cheer',
    label: 'Sorakan Penonton',
    command: 'play_soundboard',
    payload: { soundId: 'sb_cheer', synthType: 'cheer', name: 'Cheering Crowd' },
    icon: 'Sparkles',
    color: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500/50',
    order: 2,
    pageId: 'page_sfx',
  },
  {
    id: 'btn_sfx_tada',
    label: 'Tada! Berhasil',
    command: 'play_soundboard',
    payload: { soundId: 'sb_tada', synthType: 'tada', name: 'Tada Fanfare' },
    icon: 'Bell',
    color: 'bg-purple-600 hover:bg-purple-500 border-purple-500/50',
    order: 3,
    pageId: 'page_sfx',
  },
  {
    id: 'btn_sfx_bell',
    label: 'Bel Ringing',
    command: 'play_soundboard',
    payload: { soundId: 'sb_bell', synthType: 'bell', name: 'Service Bell' },
    icon: 'BellRing',
    color: 'bg-blue-600 hover:bg-blue-500 border-blue-500/50',
    order: 4,
    pageId: 'page_sfx',
  },
  {
    id: 'btn_evt_gift',
    label: 'Simulasi Paus TikTok',
    command: 'trigger_event',
    payload: { type: 'gift', detail: 'Mengirimkan Paus Biru (Whale)', amount: 2150 },
    icon: 'Gift',
    color: 'bg-pink-600 hover:bg-pink-500 border-pink-500/50',
    order: 5,
    pageId: 'page_sfx',
  },
  {
    id: 'btn_evt_saweria',
    label: 'Simulasi Saweria Rp50k',
    command: 'trigger_event',
    payload: { type: 'donation', detail: 'Donasi Saweria: Semangat Bang!', amount: 50000, currency: 'IDR' },
    icon: 'Heart',
    color: 'bg-red-600 hover:bg-red-500 border-red-500/50',
    order: 6,
    pageId: 'page_sfx',
  },
];

// Command Allowlist for security & protocol governance
export const DECK_COMMAND_ALLOWLIST: Set<DeckCommandType> = new Set([
  'start_live',
  'stop_live',
  'toggle_live',
  'switch_scene',
  'toggle_overlay',
  'mute_mic',
  'mute_audio',
  'music_play_pause',
  'music_skip',
  'music_prev',
  'play_soundboard',
  'trigger_event',
  'switch_mode',
  'emergency_blank',
]);

class StreamDeckService {
  private channel: BroadcastChannel | null = null;
  private pairingData: DeckPairingData | null = null;
  private connectedRemotes: Map<string, ConnectedRemoteDevice> = new Map();
  private commandListeners: Set<(packet: DeckCommandPacket, reply: (ack: DeckCommandAck) => void) => void> = new Set();
  private telemetryListeners: Set<(telemetry: DeckTelemetry) => void> = new Set();
  private ackListeners: Set<(ack: DeckCommandAck) => void> = new Set();
  private remoteDeviceListListeners: Set<(devices: ConnectedRemoteDevice[]) => void> = new Set();
  private heartbeatInterval: any = null;
  private currentRole: 'idle' | 'host' | 'remote' = 'idle';
  private remotePairingToken: string = '';
  private currentTelemetry: DeckTelemetry = {
    isStreaming: false,
    streamDurationSec: 0,
    fps: 60,
    bitrateKbps: 4500,
    cpuPercent: 24,
    batteryPercent: 88,
    deviceTempC: 36.4,
    activePresetName: 'TikTok Gaming Pro',
    micMuted: false,
    audioMuted: false,
    musicNowPlaying: 'Lofi Chill Beat - Syntxrr',
    musicIsPlaying: false,
    viewerCount: 1420,
  };

  constructor() {
    this.initChannel();
  }

  private initChannel() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('syntxrr_stream_deck_bus');
        this.channel.onmessage = (event) => {
          this.handleIncomingMessage(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel not supported or error:', e);
      }
    }
  }

  private handleIncomingMessage(data: any) {
    if (!data || typeof data !== 'object') return;

    switch (data.type) {
      case 'DECK_COMMAND':
        this.onReceiveCommand(data.packet as DeckCommandPacket);
        break;
      case 'DECK_ACK':
        this.ackListeners.forEach((fn) => fn(data.ack as DeckCommandAck));
        break;
      case 'DECK_TELEMETRY':
        this.currentTelemetry = data.telemetry as DeckTelemetry;
        this.telemetryListeners.forEach((fn) => fn(this.currentTelemetry));
        break;
      case 'DECK_PING':
        if (this.currentRole === 'host') {
          this.handleRemotePing(data.deviceId, data.deviceName, data.token);
        }
        break;
    }
  }

  // --- HOST ROLE METHODS ---
  public startHost(hostDeviceName = 'Android Streaming Phone'): DeckPairingData {
    this.currentRole = 'host';
    const pairingPin = Math.floor(100000 + Math.random() * 900000).toString();
    const token = `tok_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const sessionId = `ses_${Date.now()}`;

    // Host LAN address simulated or window.location.hostname
    const hostIp = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
      ? window.location.hostname
      : '192.168.1.105';

    this.pairingData = {
      hostIp,
      port: 8080,
      pairingPin,
      pairingToken: token,
      sessionId,
      hostDeviceName,
      createdAt: Date.now(),
    };

    // Start Telemetry Broadcast Heartbeat
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      this.broadcastTelemetry(this.currentTelemetry);
    }, 1500);

    return this.pairingData;
  }

  public stopHost() {
    this.currentRole = 'idle';
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.connectedRemotes.clear();
    this.notifyRemoteListChange();
  }

  public getPairingData(): DeckPairingData | null {
    return this.pairingData;
  }

  public updateTelemetry(partial: Partial<DeckTelemetry>) {
    this.currentTelemetry = { ...this.currentTelemetry, ...partial };
    if (this.currentRole === 'host') {
      this.broadcastTelemetry(this.currentTelemetry);
    }
  }

  public broadcastTelemetry(telemetry: DeckTelemetry) {
    if (this.channel) {
      this.channel.postMessage({
        type: 'DECK_TELEMETRY',
        telemetry,
      });
    }
  }

  private handleRemotePing(deviceId: string, deviceName: string, token: string) {
    if (!this.pairingData || this.pairingData.pairingToken !== token) {
      return;
    }

    const existing = this.connectedRemotes.get(deviceId);
    if (!existing) {
      const newDev: ConnectedRemoteDevice = {
        deviceId,
        deviceName: deviceName || 'HP Remote Pengendali',
        connectedAt: Date.now(),
        lastPing: Date.now(),
        isApproved: true,
      };
      this.connectedRemotes.set(deviceId, newDev);
      this.notifyRemoteListChange();
    } else {
      existing.lastPing = Date.now();
    }
  }

  public revokeDevice(deviceId: string) {
    this.connectedRemotes.delete(deviceId);
    this.notifyRemoteListChange();
  }

  private notifyRemoteListChange() {
    const list = Array.from(this.connectedRemotes.values());
    this.remoteDeviceListListeners.forEach((fn) => fn(list));
  }

  public onCommand(callback: (packet: DeckCommandPacket, reply: (ack: DeckCommandAck) => void) => void) {
    this.commandListeners.add(callback);
    return () => this.commandListeners.delete(callback);
  }

  private onReceiveCommand(packet: DeckCommandPacket) {
    if (this.currentRole !== 'host') return;

    // Validate Allowlist
    if (!DECK_COMMAND_ALLOWLIST.has(packet.command)) {
      this.sendAck({
        messageId: packet.messageId,
        status: 'REJECTED',
        timestamp: Date.now(),
        error: `Perintah '${packet.command}' tidak masuk dalam daftar yang diizinkan (Allowlist).`,
      });
      return;
    }

    // Validate Token if host configured
    if (this.pairingData && packet.token !== this.pairingData.pairingToken) {
      this.sendAck({
        messageId: packet.messageId,
        status: 'REJECTED',
        timestamp: Date.now(),
        error: 'Token otentikasi remote tidak cocok dengan Host.',
      });
      return;
    }

    // Send RECEIVED ACK
    this.sendAck({
      messageId: packet.messageId,
      status: 'RECEIVED',
      timestamp: Date.now(),
    });

    // Dispatch to registered host command listeners
    this.commandListeners.forEach((listener) => {
      listener(packet, (ack) => {
        this.sendAck(ack);
      });
    });
  }

  private sendAck(ack: DeckCommandAck) {
    if (this.channel) {
      this.channel.postMessage({
        type: 'DECK_ACK',
        ack: {
          ...ack,
          hostTelemetry: this.currentTelemetry,
        },
      });
    }
  }

  // --- REMOTE ROLE METHODS ---
  public connectAsRemote(token: string, deviceName = 'Remote Phone HP2') {
    this.currentRole = 'remote';
    this.remotePairingToken = token;
    const deviceId = `remote_${Math.random().toString(36).substring(2, 8)}`;

    // Send Ping every 2 seconds
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.channel) {
        this.channel.postMessage({
          type: 'DECK_PING',
          deviceId,
          deviceName,
          token: this.remotePairingToken,
        });
      }
    }, 2000);
  }

  public disconnectRemote() {
    this.currentRole = 'idle';
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public sendCommand(command: DeckCommandType, payload?: any): Promise<DeckCommandAck> {
    return new Promise((resolve, reject) => {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const packet: DeckCommandPacket = {
        messageId,
        command,
        payload,
        timestamp: Date.now(),
        sessionId: 'syntxrr_session',
        senderDeviceId: 'remote_client',
        token: this.remotePairingToken,
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Waktu tunggu balasan dari Host habis (Timeout 4s). Pastikan Host aktif di jaringan LAN yang sama.'));
      }, 4000);

      const cleanup = () => {
        clearTimeout(timeout);
        this.ackListeners.delete(handleAck);
      };

      const handleAck = (ack: DeckCommandAck) => {
        if (ack.messageId === messageId) {
          if (ack.status === 'SUCCESS' || ack.status === 'REJECTED' || ack.status === 'FAILED') {
            cleanup();
            resolve(ack);
          }
        }
      };

      this.ackListeners.add(handleAck);

      if (this.channel) {
        this.channel.postMessage({
          type: 'DECK_COMMAND',
          packet,
        });
      } else {
        cleanup();
        reject(new Error('Kanal komunikasi browser tidak tersedia.'));
      }
    });
  }

  public onTelemetry(callback: (telemetry: DeckTelemetry) => void) {
    this.telemetryListeners.add(callback);
    callback(this.currentTelemetry);
    return () => this.telemetryListeners.delete(callback);
  }

  public onRemoteDevicesChange(callback: (devices: ConnectedRemoteDevice[]) => void) {
    this.remoteDeviceListListeners.add(callback);
    callback(Array.from(this.connectedRemotes.values()));
    return () => this.remoteDeviceListListeners.delete(callback);
  }
}

export const streamDeckService = new StreamDeckService();
