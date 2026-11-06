// Mesin Audio Soundboard — SYNTXRR STREAM
// Memutar efek suara sintetis prosedural dan file audio lokal pengguna

type SynthType = 'cheer' | 'horn' | 'level_up' | 'game_over' | 'tada' | 'bell';

export type SoundboardPlaybackResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'audio_context_unavailable'
        | 'audio_context_resume_failed'
        | 'audio_context_suspended'
        | 'audio_context_playback_failed'
        | 'audio_play_failed'
        | 'invalid_audio';
      error?: unknown;
    };

type AudioContextResult = { ok: true; context: AudioContext } | Extract<SoundboardPlaybackResult, { ok: false }>;

const VALID_SYNTH_TYPES = new Set<SynthType>([
  'cheer',
  'horn',
  'level_up',
  'game_over',
  'tada',
  'bell',
]);

class SoundboardEngine {
  private ctx: AudioContext | null = null;
  private customAudios: Map<string, HTMLAudioElement> = new Map();
  private customAudioUrls: Map<string, string> = new Map();
  private volume: number = 0.9;

  private async ensureContext(): Promise<AudioContextResult> {
    try {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }

      if (!this.ctx) {
        return { ok: false, reason: 'audio_context_unavailable' };
      }

      if (this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch (error) {
          return { ok: false, reason: 'audio_context_resume_failed', error };
        }
      }

      if (this.ctx.state !== 'running') {
        return { ok: false, reason: 'audio_context_suspended' };
      }

      return { ok: true, context: this.ctx };
    } catch (error) {
      return { ok: false, reason: 'audio_context_unavailable', error };
    }
  }

  private normalizeVolume(vol: number, fallback: number = this.volume) {
    if (!Number.isFinite(vol)) return fallback;
    return Math.max(0, Math.min(1, vol));
  }

  setVolume(vol: number) {
    this.volume = this.normalizeVolume(vol);
    this.customAudios.forEach((audio) => {
      audio.volume = this.volume;
    });
  }

  async playSynthesizedSFX(type: SynthType, volume?: number): Promise<SoundboardPlaybackResult> {
    if (!VALID_SYNTH_TYPES.has(type)) {
      return { ok: false, reason: 'invalid_audio' };
    }

    const contextResult = await this.ensureContext();
    if (!contextResult.ok) return contextResult;

    const playbackVolume = volume === undefined ? this.volume : this.normalizeVolume(volume);
    const context = contextResult.context;

    try {
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(playbackVolume * 0.25, now);
      gain.connect(context.destination);

      if (type === 'horn') {
        // Airhorn blast
        const osc1 = context.createOscillator();
        const osc2 = context.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(320, now);
        osc2.frequency.setValueAtTime(480, now);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.6);
        osc2.stop(now + 0.6);
      } else if (type === 'level_up') {
        // Arpeggio nada ceria naik
        [440, 554, 659, 880].forEach((freq, idx) => {
          if (!context) return { ok: false, reason: 'audio_context_unavailable' };
          const osc = context.createOscillator();
          const noteGain = context.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.1);
          noteGain.gain.setValueAtTime(playbackVolume * 0.2, now + idx * 0.1);
          noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);
          osc.connect(noteGain);
          noteGain.connect(context.destination);
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + 0.25);
        });
      } else if (type === 'bell') {
        // Lonceng kristal
        const osc = context.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(playbackVolume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 1.2);
      } else if (type === 'game_over') {
        // Nada turun dramatis
        const osc = context.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.7);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.7);
      } else if (type === 'tada') {
        // Nada perayaan C - G
        const osc1 = context.createOscillator();
        const osc2 = context.createOscillator();
        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(523.25, now);
        osc1.frequency.setValueAtTime(783.99, now + 0.2);
        osc2.frequency.setValueAtTime(659.25, now + 0.2);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.gain.setValueAtTime(playbackVolume * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.8);
        osc2.stop(now + 0.8);
      } else {
        // Sorak tepuk tangan (white noise terfilter)
        const osc = context.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.4);
        gain.gain.setValueAtTime(playbackVolume * 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.5);
      }

      return { ok: true };
    } catch (error) {
      return { ok: false, reason: 'audio_context_playback_failed', error };
    }
  }

  async playCustomFile(id: string, audioUrl: string, volume?: number): Promise<SoundboardPlaybackResult> {
    if (typeof audioUrl !== 'string' || !audioUrl.trim()) {
      return { ok: false, reason: 'invalid_audio' };
    }

    try {
      let audio = this.customAudios.get(id);
    const cachedUrl = this.customAudioUrls.get(id);

    if (audio && cachedUrl !== audioUrl) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      this.customAudios.delete(id);
      this.customAudioUrls.delete(id);
      audio = undefined;
    }

    if (!audio) {
      audio = new Audio(audioUrl);
      this.customAudios.set(id, audio);
      this.customAudioUrls.set(id, audioUrl);
    }

      audio.currentTime = 0;
      audio.volume = volume === undefined ? this.volume : this.normalizeVolume(volume);
      await audio.play();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: 'audio_play_failed', error };
    }
  }

  removeCustomFile(id: string) {
    const audio = this.customAudios.get(id);
    if (!audio) {
      this.customAudioUrls.delete(id);
      return;
    }
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    this.customAudios.delete(id);
    this.customAudioUrls.delete(id);
  }
}

export const soundboardEngine = new SoundboardEngine();
