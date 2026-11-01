// Layanan Text-to-Speech (TTS) — SYNTXRR STREAM
// Web Speech API with Android WebView gesture-unlock, queue management, and resume logic.

import { TTSConfig } from '../types';

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
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private primed = false;
  private status: TTSStatus = 'unavailable';
  private queue: SpeechSynthesisUtterance[] = [];
  private voiceLoadRetries = 0;
  private readonly MAX_VOICE_RETRIES = 5;
  private resumeTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
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
    return this.synth !== null;
  }

  /**
   * Unlocks the speech synthesis engine via a user gesture.
   * On Android WebView, speechSynthesis is blocked until the first
   * user interaction triggers a speak() call. This sends a silent
   * utterance to prime the engine.
   */
  prime(): boolean {
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
      primer.onerror = () => {
        this.primed = true;
        this.status = 'ready';
        this.startResumeTimer();
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
    if (!this.synth || (!this.config.enabled && !force)) {
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
        // not_allowed or interrupted are common on Android during rapid events
        if (e.error !== 'interrupted' && e.error !== 'not_allowed' && e.error !== 'canceled') {
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
    if (this.synth) {
      this.synth.cancel();
      this.stopResumeTimer();
    }
  }
}

export const ttsService = new TTSService();
