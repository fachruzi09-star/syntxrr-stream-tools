// Layanan Text-to-Speech (TTS) — SYNTXRR STREAM
// Native Android engine (NativeAudioPlugin / NativeTtsManager) as the primary
// path, with the Web Speech API kept as the fallback for non-Android runtimes.
// The service never reports 'ready' unless the engine state is confirmed.

import { TTSConfig } from '../types';
import {
  isNativeAndroid,
  speak as nativeSpeak,
  stopSpeaking as nativeStopSpeaking,
  getAudioStatus,
  onTtsStart,
  onTtsDone,
  onTtsError,
} from './nativeAudioBridge';

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  enabled: true,
  volume: 0.9,
  rate: 1.0,
  pitch: 1.0,
  language: 'id-ID',
  readComments: true,
  readDonations: true,
  readGifts: true,
  readSongRequests: true,
};

type TTSStatus = 'unavailable' | 'not_primed' | 'ready' | 'error';

class TTSService {
  private config: TTSConfig = { ...DEFAULT_TTS_CONFIG };
  // Native Android is the primary path; Web Speech is the fallback.
  private readonly native = isNativeAndroid();
  private nativeReady = false;
  private nativeListenersAttached = false;
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private primed = false;
  private status: TTSStatus = 'unavailable';
  private queue: SpeechSynthesisUtterance[] = [];
  private voiceLoadRetries = 0;
  private readonly MAX_VOICE_RETRIES = 5;
  private resumeTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (this.native) {
      // The native engine lives in NativeTtsManager; it is never 'ready'
      // until getAudioStatus() confirms it. Start as 'not_primed'.
      this.status = 'not_primed';
      this.attachNativeListeners();
      void this.refreshStatus();
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.status = 'not_primed';
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => {
          this.loadVoices();
          this.voiceLoadRetries = 0;
        };
      }
    }
  }

  /** Subscribe to native utterance lifecycle events once. */
  private attachNativeListeners() {
    if (this.nativeListenersAttached || !this.native) return;
    this.nativeListenersAttached = true;

    void onTtsStart(() => {
      this.nativeReady = true;
      this.status = 'ready';
    });
    void onTtsDone(() => {
      // Completion does not clear readiness, but it must not invent it either.
      if (this.nativeReady) this.status = 'ready';
    });
    void onTtsError((data) => {
      this.nativeReady = false;
      this.status = 'error';
      console.warn('TTS native error:', data?.error || 'tidak diketahui');
    });
  }

  /**
   * Ask the native plugin for the real engine state and mirror it into
   * this.status. Never upgrades to 'ready' without confirmation.
   */
  async refreshStatus(): Promise<TTSStatus> {
    if (!this.native) return this.status;
    try {
      const nativeStatus = await getAudioStatus();
      if (!nativeStatus.isNative) {
        this.nativeReady = false;
        this.status = 'unavailable';
      } else if (nativeStatus.ttsReady) {
        this.nativeReady = true;
        this.status = 'ready';
      } else if (nativeStatus.ttsInitializing) {
        this.nativeReady = false;
        this.status = 'not_primed';
      } else {
        this.nativeReady = false;
        this.status = 'error';
      }
    } catch {
      this.nativeReady = false;
      this.status = 'error';
    }
    return this.status;
  }

  private async speakNative(text: string): Promise<void> {
    try {
      const result = await nativeSpeak(text, {
        rate: this.config.rate,
        pitch: this.config.pitch,
        language: this.config.language || 'id-ID',
        queue: true,
      });
      if (!result.isNative || !result.success) {
        this.nativeReady = false;
        this.status = 'error';
        console.warn('TTS native gagal:', result.message || 'tidak diketahui');
        return;
      }
      // A successful call only means the request was accepted (possibly
      // queued); confirm the engine state before claiming readiness.
      await this.refreshStatus();
    } catch (err) {
      this.nativeReady = false;
      this.status = 'error';
      console.warn('TTS native tidak dapat dijalankan:', err);
    }
  }

  private loadVoices() {
    if (this.synth) {
      this.voices = this.synth.getVoices();
      if (this.voices.length === 0 && this.voiceLoadRetries < this.MAX_VOICE_RETRIES) {
        this.voiceLoadRetries++;
        setTimeout(() => this.loadVoices(), 300 * this.voiceLoadRetries);
      }
    }
  }

  getVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0 && this.synth) {
      this.loadVoices();
    }
    return this.voices;
  }

  getStatus(): TTSStatus {
    return this.status;
  }

  isAvailable(): boolean {
    return this.native || this.synth !== null;
  }

  /**
   * Primes the engine.
   * - Native Android: initializes NativeTtsManager and reads back the real
   *   engine state. Never returns true unless the engine confirms readiness.
   * - Web: unlocks the speech synthesis engine via a user gesture. On Android
   *   WebView, speechSynthesis is blocked until the first user interaction
   *   triggers a speak() call. This sends a silent utterance to prime it.
   */
  prime(): boolean {
    if (this.native) {
      // The native engine initializes lazily inside the plugin; an async
      // refresh is the only truthful source of readiness.
      this.attachNativeListeners();
      void this.refreshStatus();
      // Readiness is confirmed later via events/refreshStatus, so do not
      // claim success at this point unless it was already verified.
      return this.nativeReady;
    }

    if (!this.synth) {
      this.status = 'unavailable';
      return false;
    }
    if (this.primed) return true;

    try {
      const primer = new SpeechSynthesisUtterance('');
      primer.volume = 0;
      primer.rate = 1;
      primer.onend = () => {
        this.primed = true;
        this.status = 'ready';
        this.startResumeTimer();
      };
      primer.onerror = (e) => {
        // A failed primer means the engine produced no audio: report it
        // honestly instead of pretending the engine is ready.
        this.primed = false;
        this.status = 'error';
        this.stopResumeTimer();
        console.warn('TTS primer gagal:', e.error);
      };
      this.synth.speak(primer);
      return true;
    } catch {
      this.status = 'error';
      return false;
    }
  }

  /**
   * Android WebView can pause speechSynthesis when the app is backgrounded
   * or when the engine is slow to start. This timer periodically resumes
   * the engine if it's paused but still has queued utterances.
   */
  private startResumeTimer() {
    if (this.resumeTimer) return;
    this.resumeTimer = setInterval(() => {
      if (!this.synth) return;
      if (this.synth.paused && this.synth.speaking) {
        this.synth.resume();
      }
      if (!this.synth.speaking && !this.synth.paused) {
        this.stopResumeTimer();
      }
    }, 5000);
  }

  private stopResumeTimer() {
    if (this.resumeTimer) {
      clearInterval(this.resumeTimer);
      this.resumeTimer = null;
    }
  }

  updateConfig(newConfig: Partial<TTSConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): TTSConfig {
    return { ...this.config };
  }

  speak(text: string, force = false): boolean {
    if (!this.config.enabled && !force) {
      return false;
    }

    if (this.native) {
      // Fire-and-forget so the public synchronous API is preserved; the
      // promise updates this.status truthfully once resolved.
      void this.speakNative(text);
      return true;
    }

    if (!this.synth) {
      return false;
    }

    if (!this.primed) {
      this.prime();
    }

    try {
      // Queue management: only cancel if there are multiple utterances
      // queued. A single in-progress utterance is allowed to finish,
      // which prevents the Android WebView bug where cancel() kills
      // a slow-starting utterance before it produces any audio.
      if (this.synth.speaking && this.synth.pending) {
        this.synth.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = this.config.volume;
      utterance.rate = this.config.rate;
      utterance.pitch = this.config.pitch;
      utterance.lang = this.config.language || 'id-ID';

      if (this.config.voiceUri && this.voices.length > 0) {
        const selectedVoice = this.voices.find((v) => v.voiceURI === this.config.voiceUri);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
      }

      // Fallback: if no voices loaded, try to find a matching language voice
      if (!utterance.voice && this.voices.length > 0) {
        const langVoice = this.voices.find(
          (v) => v.lang === this.config.language || v.lang.startsWith(this.config.language.split('-')[0])
        );
        if (langVoice) utterance.voice = langVoice;
      }

      utterance.onstart = () => {
        if (this.status !== 'ready') this.status = 'ready';
        if (!this.resumeTimer) this.startResumeTimer();
      };

      utterance.onerror = (e) => {
        // not-allowed, canceled or interrupted are common during rapid events
        const err = e.error as string;
        if (err !== 'interrupted' && err !== 'not-allowed' && err !== 'canceled') {
          console.warn('TTS utterance error:', e.error);
        }
      };

      this.synth.speak(utterance);
      return true;
    } catch (err) {
      console.warn('TTS tidak dapat dijalankan:', err);
      this.status = 'error';
      return false;
    }
  }

  speakEvent(type: string, username: string, detail?: string): boolean {
    let message = `${username}`;
    if (type === 'gift') {
      message += ` memberikan hadiah: ${detail || 'Gift Spesial'}`;
    } else if (type === 'donation') {
      message += ` berdonasi: ${detail || 'Dukungan untuk live'}`;
    } else if (type === 'follow') {
      message += ` mulai mengikuti siaran`;
    } else if (type === 'like') {
      message += ` menyukai siaran`;
    } else {
      message += `: ${detail || 'Halo'}`;
    }
    return this.speak(message);
  }

  stop() {
    if (this.native) {
      void nativeStopSpeaking().catch((err) => {
        console.warn('TTS native tidak dapat dihentikan:', err);
      });
      return;
    }

    if (this.synth) {
      this.synth.cancel();
      this.stopResumeTimer();
    }
  }
}

export const ttsService = new TTSService();
