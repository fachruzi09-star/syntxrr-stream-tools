// HTML5 Real Audio Engine for SYNTXRR STREAM TOOLS (Local Audio Playback)

export interface AudioEngineState {
  currentTrackId: string | null;
  title: string;
  artist: string;
  duration: number; // in seconds
  currentTime: number; // in seconds
  volume: number; // 0 to 1
  isMuted: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
}

type AudioStateListener = (state: AudioEngineState) => void;

class LocalAudioEngine {
  private audio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private listeners: Set<AudioStateListener> = new Set();
  private state: AudioEngineState = {
    currentTrackId: null,
    title: '',
    artist: '',
    duration: 0,
    currentTime: 0,
    volume: 0.85,
    isMuted: false,
    isPlaying: false,
    isLoading: false,
    error: null,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.preload = 'metadata';
      this.audio.volume = this.state.volume;

      this.audio.addEventListener('play', () => {
        this.updateState({ isPlaying: true, isLoading: false, error: null });
      });

      this.audio.addEventListener('pause', () => {
        this.updateState({ isPlaying: false });
      });

      this.audio.addEventListener('timeupdate', () => {
        if (this.audio) {
          this.updateState({ currentTime: this.audio.currentTime });
        }
      });

      this.audio.addEventListener('durationchange', () => {
        if (this.audio && !isNaN(this.audio.duration)) {
          this.updateState({ duration: this.audio.duration });
        }
      });

      this.audio.addEventListener('ended', () => {
        this.updateState({ isPlaying: false, currentTime: 0 });
        this.emitEnded();
      });

      this.audio.addEventListener('error', () => {
        const errorMsg = this.audio?.error
          ? `Audio Playback Error (code ${this.audio.error.code}): File may be corrupt or format unsupported.`
          : 'Unable to decode audio stream.';
        this.updateState({ isPlaying: false, isLoading: false, error: errorMsg });
      });
    }
  }

  private onEndedCallback: (() => void) | null = null;

  setOnEnded(callback: (() => void) | null) {
    this.onEndedCallback = callback;
  }

  private emitEnded() {
    if (this.onEndedCallback) {
      this.onEndedCallback();
    }
  }

  subscribe(listener: AudioStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(partial: Partial<AudioEngineState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener(this.state));
  }

  getState(): AudioEngineState {
    return { ...this.state };
  }

  async loadAndPlayFile(id: string, title: string, artist: string, file: File): Promise<boolean> {
    if (!this.audio) return false;

    try {
      this.updateState({
        isLoading: true,
        error: null,
        currentTrackId: id,
        title,
        artist,
        currentTime: 0,
        duration: 0,
      });

      // Revoke previous object URL to prevent memory leaks
      if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = null;
      }

      this.currentObjectUrl = URL.createObjectURL(file);
      this.audio.src = this.currentObjectUrl;
      this.audio.load();

      await this.audio.play();
      this.updateState({ isPlaying: true, isLoading: false });
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Playback failed. Format may not be supported by your browser.';
      this.updateState({ isPlaying: false, isLoading: false, error: msg });
      return false;
    }
  }

  async loadAndPlayUrl(id: string, title: string, artist: string, url: string): Promise<boolean> {
    if (!this.audio) return false;

    try {
      this.updateState({
        isLoading: true,
        error: null,
        currentTrackId: id,
        title,
        artist,
        currentTime: 0,
        duration: 0,
      });

      if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = null;
      }

      this.audio.src = url;
      this.audio.load();

      await this.audio.play();
      this.updateState({ isPlaying: true, isLoading: false });
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Playback failed. Format or URL may not be supported.';
      this.updateState({ isPlaying: false, isLoading: false, error: msg });
      return false;
    }
  }

  async play(): Promise<void> {
    if (!this.audio || !this.audio.src) return;
    try {
      await this.audio.play();
      this.updateState({ isPlaying: true, error: null });
    } catch (err: any) {
      this.updateState({ isPlaying: false, error: err?.message || 'Playback blocked or failed.' });
    }
  }

  pause(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.updateState({ isPlaying: false });
  }

  togglePlay(): void {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(seconds: number): void {
    if (!this.audio) return;
    const clamped = Math.max(0, Math.min(seconds, this.audio.duration || seconds));
    this.audio.currentTime = clamped;
    this.updateState({ currentTime: clamped });
  }

  setVolume(vol: number): void {
    if (!this.audio) return;
    const clamped = Math.max(0, Math.min(1, vol));
    this.audio.volume = clamped;
    this.updateState({ volume: clamped, isMuted: clamped === 0 });
  }

  setLoop(loop: boolean): void {
    if (this.audio) {
      this.audio.loop = loop;
    }
  }

  isLoop(): boolean {
    return this.audio?.loop || false;
  }

  stop(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.updateState({ isPlaying: false, currentTime: 0 });
  }

  toggleMute(): void {
    if (!this.audio) return;
    const newMuted = !this.state.isMuted;
    this.audio.muted = newMuted;
    this.updateState({ isMuted: newMuted });
  }

  cleanup(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
    }
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    this.updateState({
      currentTrackId: null,
      title: '',
      artist: '',
      duration: 0,
      currentTime: 0,
      isPlaying: false,
      isLoading: false,
      error: null,
    });
  }
}

export const audioEngine = new LocalAudioEngine();
