/**
 * micMonitor.ts
 *
 * Meter level mikrofon NYATA untuk panel Audio Mixer pada Floating HUD.
 *
 * Batasan yang dijaga secara sengaja:
 * - Monitor hanya aktif selama panel mixer dibuka, lalu seluruh track/context dilepas.
 * - Mute di sini hanya mematikan track mikrofon yang dimiliki SYNTXRR (jalur preview
 *   di dalam WebView). Mikrofon milik aplikasi TikTok TIDAK dapat dikendalikan dari sini.
 * - Tidak ada nilai level palsu: bila izin ditolak atau AudioContext tetap suspended,
 *   status dilaporkan apa adanya (available/metering = false) dan level = 0.
 */

export interface MicMonitorState {
  /** getUserMedia berhasil dan track mikrofon hidup. */
  available: boolean;
  /** Analyser benar-benar menghasilkan level (AudioContext berjalan). */
  metering: boolean;
  muted: boolean;
  /** 0..100 */
  level: number;
  /** Alasan teknis bila tidak tersedia / tidak metering. */
  reason?: string;
}

type Listener = (state: MicMonitorState) => void;

const IDLE_STATE: MicMonitorState = {
  available: false,
  metering: false,
  muted: false,
  level: 0,
};

const POLL_INTERVAL_MS = 120;

class MicMonitor {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Uint8Array | null = null;
  private timer: number | null = null;
  private listeners = new Set<Listener>();
  private state: MicMonitorState = { ...IDLE_STATE };
  private starting: Promise<MicMonitorState> | null = null;

  getState(): MicMonitorState {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(patch: Partial<MicMonitorState>) {
    this.state = { ...this.state, ...patch };
    const snapshot = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
        // listener yang gagal tidak boleh menghentikan monitor
      }
    });
  }

  /** Mulai monitor mikrofon. Aman dipanggil berulang kali. */
  async start(): Promise<MicMonitorState> {
    if (this.stream && this.context) {
      return this.getState();
    }
    if (this.starting) {
      return this.starting;
    }

    this.starting = this.doStart().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async doStart(): Promise<MicMonitorState> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.emit({
        available: false,
        metering: false,
        level: 0,
        reason: 'Perangkat tidak mendukung akses mikrofon',
      });
      return this.getState();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.stream = stream;

      const Ctor: typeof AudioContext | undefined =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) {
        this.emit({
          available: true,
          metering: false,
          level: 0,
          reason: 'AudioContext tidak tersedia',
        });
        return this.getState();
      }

      const context = new Ctor();
      this.context = context;

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      this.analyser = analyser;
      this.buffer = new Uint8Array(analyser.fftSize);

      let metering = context.state === 'running';
      if (!metering) {
        try {
          await context.resume();
        } catch {
          // diabaikan: status dilaporkan di bawah
        }
        metering = context.state === 'running';
      }

      this.emit({
        available: true,
        metering,
        level: 0,
        reason: metering ? undefined : 'Meter menunggu interaksi di aplikasi SYNTXRR',
      });

      this.startPolling();
      return this.getState();
    } catch (error: any) {
      const name: string = error?.name || '';
      let reason = 'Mikrofon tidak tersedia';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        reason = 'Izin mikrofon ditolak';
      } else if (name === 'NotFoundError') {
        reason = 'Tidak ada mikrofon terdeteksi';
      } else if (name === 'NotReadableError') {
        reason = 'Mikrofon sedang dipakai aplikasi lain';
      }
      this.cleanup();
      this.emit({ available: false, metering: false, level: 0, reason });
      return this.getState();
    }
  }

  private startPolling() {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.sample(), POLL_INTERVAL_MS);
  }

  private sample() {
    const analyser = this.analyser;
    const buffer = this.buffer;
    if (!analyser || !buffer) return;

    if (this.state.muted) {
      if (this.state.level !== 0) this.emit({ level: 0 });
      return;
    }

    analyser.getByteTimeDomainData(buffer as unknown as Uint8Array<ArrayBuffer>);

    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const deviation = (buffer[i] - 128) / 128;
      sumSquares += deviation * deviation;
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    // Skala 0..100 dengan sedikit boost agar input wajar tetap terlihat.
    const level = Math.max(0, Math.min(100, Math.round(rms * 260)));

    if (Math.abs(level - this.state.level) >= 2 || (level === 0 && this.state.level !== 0)) {
      this.emit({ level });
    }
  }

  /** Mute hanya mematikan track milik SYNTXRR, bukan mikrofon aplikasi lain. */
  setMuted(muted: boolean) {
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.emit({ muted, level: muted ? 0 : this.state.level });
  }

  /** Lepas semua resource. Dipanggil saat panel mixer ditutup. */
  stop() {
    this.cleanup();
    this.emit({ ...IDLE_STATE });
  }

  private cleanup() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.stream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // diabaikan
      }
    });
    this.stream = null;
    this.analyser = null;
    this.buffer = null;

    if (this.context) {
      try {
        void this.context.close();
      } catch {
        // diabaikan
      }
      this.context = null;
    }
  }
}

export const micMonitor = new MicMonitor();
