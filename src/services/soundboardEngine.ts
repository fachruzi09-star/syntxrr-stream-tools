// Mesin Audio Soundboard — SYNTXRR STREAM
// Memutar efek suara sintetis prosedural dan file audio lokal pengguna

class SoundboardEngine {
  private ctx: AudioContext | null = null;
  private customAudios: Map<string, HTMLAudioElement> = new Map();
  private volume: number = 0.9;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.customAudios.forEach((audio) => {
      audio.volume = this.volume;
    });
  }

  playSynthesizedSFX(type: 'cheer' | 'horn' | 'level_up' | 'game_over' | 'tada' | 'bell') {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(this.volume * 0.25, now);
      gain.connect(this.ctx.destination);

      if (type === 'horn') {
        // Airhorn blast
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
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
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const noteGain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.1);
          noteGain.gain.setValueAtTime(this.volume * 0.2, now + idx * 0.1);
          noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);
          osc.connect(noteGain);
          noteGain.connect(this.ctx.destination);
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + 0.25);
        });
      } else if (type === 'bell') {
        // Lonceng kristal
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(this.volume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 1.2);
      } else if (type === 'game_over') {
        // Nada turun dramatis
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.7);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.7);
      } else if (type === 'tada') {
        // Nada perayaan C - G
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(523.25, now);
        osc1.frequency.setValueAtTime(783.99, now + 0.2);
        osc2.frequency.setValueAtTime(659.25, now + 0.2);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.gain.setValueAtTime(this.volume * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.8);
        osc2.stop(now + 0.8);
      } else {
        // Sorak tepuk tangan (white noise terfilter)
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.4);
        gain.gain.setValueAtTime(this.volume * 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch {
      // Audio context tertahan oleh kebijakan browser
    }
  }

  playCustomFile(id: string, audioUrl: string) {
    let audio = this.customAudios.get(id);
    if (!audio) {
      audio = new Audio(audioUrl);
      this.customAudios.set(id, audio);
    }
    audio.currentTime = 0;
    audio.volume = this.volume;
    audio.play().catch(() => {});
  }
}

export const soundboardEngine = new SoundboardEngine();
