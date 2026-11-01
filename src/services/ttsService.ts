// Layanan Text-to-Speech (TTS) — SYNTXRR STREAM
// Menggunakan Web Speech API bawaan perangkat Android / Browser

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

class TTSService {
  private config: TTSConfig = { ...DEFAULT_TTS_CONFIG };
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  private loadVoices() {
    if (this.synth) {
      this.voices = this.synth.getVoices();
    }
  }

  getVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0 && this.synth) {
      this.loadVoices();
    }
    return this.voices;
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

    try {
      // Hentikan ujaran sebelumnya jika antrean terlalu panjang
      if (this.synth.speaking) {
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

      this.synth.speak(utterance);
      return true;
    } catch (err) {
      console.warn('TTS tidak dapat dijalankan:', err);
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
    }
  }
}

export const ttsService = new TTSService();
