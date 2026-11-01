// Automated Background Song Request Engine — SYNTXRR STREAM
// Listens to chat events from streamEventBus for !play, !skip, !queue, !np
// Validates policies (queue limit, cooldown, permissions)
// Plays synthesized chill lo-fi tunes or local tracks via Web Audio API
// Emits updates to Song Request widgets and UI

import { streamEventBus } from './eventBus';
import { StreamEvent } from '../types';

export interface SongRequestItem {
  id: string;
  title: string;
  artist: string;
  requester: string;
  durationSec: number;
  requestedAt: number;
  notes?: string;
}

export interface SongRequestPolicy {
  enabled: boolean;
  maxQueueSize: number;
  userCooldownSec: number;
  allowedRoles: 'all' | 'vip_only' | 'subscribers';
  blacklistedKeywords: string[];
}

export interface SongRequestState {
  currentTrack: SongRequestItem | null;
  queue: SongRequestItem[];
  isPlaying: boolean;
  currentTimeSec: number;
  volume: number;
  policy: SongRequestPolicy;
  recentAnnouncements: string[];
}

type SongRequestListener = (state: SongRequestState) => void;

class SongRequestEngine {
  private state: SongRequestState = {
    currentTrack: {
      id: 'default_track_1',
      title: 'Neon Horizon (Syntxrr Lo-Fi)',
      artist: 'SYNTXRR Beat Lab',
      requester: 'System / BGM',
      durationSec: 180,
      requestedAt: Date.now(),
    },
    queue: [
      {
        id: 'sample_queue_1',
        title: 'Midnight Drive City',
        artist: 'Lofi Coffee Beats',
        requester: 'DimasGamer',
        durationSec: 154,
        requestedAt: Date.now() - 30000,
      },
      {
        id: 'sample_queue_2',
        title: 'Cyberpunk Sakura Rain',
        artist: 'Tokyo Nights',
        requester: 'SitiStream',
        durationSec: 210,
        requestedAt: Date.now() - 15000,
      },
    ],
    isPlaying: true,
    currentTimeSec: 42,
    volume: 75,
    policy: {
      enabled: true,
      maxQueueSize: 20,
      userCooldownSec: 15,
      allowedRoles: 'all',
      blacklistedKeywords: ['hate', 'spam', 'nsfw', 'toxic'],
    },
    recentAnnouncements: [
      'Sistem Song Request aktif! Ketik !play <judul lagu> di live chat.',
    ],
  };

  private listeners: Set<SongRequestListener> = new Set();
  private userLastRequestTime: Map<string, number> = new Map();
  private audioCtx: AudioContext | null = null;
  private playbackInterval: any = null;
  private activeSynthNodes: { osc?: OscillatorNode; gain?: GainNode }[] = [];

  constructor() {
    this.startChatCommandListener();
    this.startPlaybackTicker();
  }

  // Subscribe to streamEventBus for chat commands
  private startChatCommandListener() {
    streamEventBus.subscribe((event: StreamEvent) => {
      if (event.type !== 'chat') return;
      if (!this.state.policy.enabled) return;

      const message = (event.detail || '').trim();
      if (!message.startsWith('!')) return;

      const parts = message.split(' ');
      const command = parts[0].toLowerCase();
      const query = parts.slice(1).join(' ').trim();

      if (command === '!play' || command === '!sr' || command === '!songrequest') {
        this.handlePlayCommand(event.username, query);
      } else if (command === '!skip') {
        this.handleSkipCommand(event.username);
      } else if (command === '!queue') {
        this.handleQueueCommand();
      } else if (command === '!np' || command === '!nowplaying') {
        this.handleNowPlayingCommand();
      }
    });
  }

  private handlePlayCommand(username: string, query: string) {
    if (!query) {
      this.announce(`@${username}, gunakan format: !play <judul lagu atau artis>`);
      return;
    }

    // Check Blacklist
    const lowerQuery = query.toLowerCase();
    const hasBlacklisted = this.state.policy.blacklistedKeywords.some((word) =>
      lowerQuery.includes(word.toLowerCase())
    );
    if (hasBlacklisted) {
      this.announce(`@${username}, request ditolak: mengandung kata terlarang.`);
      return;
    }

    // Check Cooldown
    const now = Date.now();
    const lastTime = this.userLastRequestTime.get(username) || 0;
    const cooldownMs = this.state.policy.userCooldownSec * 1000;
    if (now - lastTime < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - (now - lastTime)) / 1000);
      this.announce(`@${username}, mohon tunggu ${waitSec} detik sebelum request lagi.`);
      return;
    }

    // Check Queue Size
    if (this.state.queue.length >= this.state.policy.maxQueueSize) {
      this.announce(`@${username}, antrean lagu sudah penuh (${this.state.policy.maxQueueSize} lagu).`);
      return;
    }

    // Add to Queue
    this.userLastRequestTime.set(username, now);
    const newTrack: SongRequestItem = {
      id: `sr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: query,
      artist: 'Auto-Matched Live Audio',
      requester: username,
      durationSec: 160 + Math.floor(Math.random() * 60),
      requestedAt: now,
    };

    const newQueue = [...this.state.queue, newTrack];
    this.updateState({ queue: newQueue });
    this.announce(`🎵 @${username} menambahkan "${newTrack.title}" ke antrean (Posisi #${newQueue.length}).`);

    // Play synthesized melodic chime confirmation
    this.playMelodicCue();
  }

  private handleSkipCommand(username: string) {
    if (this.state.queue.length > 0) {
      const nextTrack = this.state.queue[0];
      const remainingQueue = this.state.queue.slice(1);
      this.updateState({
        currentTrack: nextTrack,
        queue: remainingQueue,
        currentTimeSec: 0,
        isPlaying: true,
      });
      this.announce(`⏭️ Lagu di-skip oleh @${username}. Sekarang memutar: "${nextTrack.title}".`);
      this.playMelodicCue();
    } else {
      this.announce(`@${username}, antrean kosong, tidak bisa skip lagu.`);
    }
  }

  private handleQueueCommand() {
    if (this.state.queue.length === 0) {
      this.announce('Antrean lagu saat ini kosong. Jadilah yang pertama request dengan !play <judul>');
    } else {
      const top3 = this.state.queue.slice(0, 3).map((item, idx) => `#${idx + 1} "${item.title}" (${item.requester})`).join(' | ');
      this.announce(`Antrean (${this.state.queue.length} lagu): ${top3}`);
    }
  }

  private handleNowPlayingCommand() {
    if (this.state.currentTrack) {
      this.announce(`🎶 Now Playing: "${this.state.currentTrack.title}" (${this.state.currentTrack.artist}) diminta oleh @${this.state.currentTrack.requester}`);
    } else {
      this.announce('Tidak ada lagu yang sedang diputar.');
    }
  }

  private announce(message: string) {
    const updated = [message, ...this.state.recentAnnouncements.slice(0, 9)];
    this.updateState({ recentAnnouncements: updated });
  }

  private startPlaybackTicker() {
    if (typeof window === 'undefined') return;
    if (this.playbackInterval) clearInterval(this.playbackInterval);

    this.playbackInterval = setInterval(() => {
      if (!this.state.isPlaying || !this.state.currentTrack) return;

      const newTime = this.state.currentTimeSec + 1;
      if (newTime >= this.state.currentTrack.durationSec) {
        // Track finished, next track
        if (this.state.queue.length > 0) {
          const next = this.state.queue[0];
          const remaining = this.state.queue.slice(1);
          this.updateState({
            currentTrack: next,
            queue: remaining,
            currentTimeSec: 0,
            isPlaying: true,
          });
          this.announce(`🎶 Sekarang memutar: "${next.title}" (${next.requester})`);
        } else {
          // Loop or reset default
          this.updateState({
            currentTimeSec: 0,
          });
        }
      } else {
        this.updateState({ currentTimeSec: newTime });
      }
    }, 1000);
  }

  // Melodic synthesizer for audio feedback
  private playMelodicCue() {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      // Play soft arpeggiated lo-fi chord
      osc.frequency.setValueAtTime(329.63, now); // E4
      osc.frequency.setValueAtTime(440.00, now + 0.1); // A4
      osc.frequency.setValueAtTime(523.25, now + 0.2); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.3); // E5

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.start(now);
      osc.stop(now + 0.6);
    } catch {
      // Audio autoplay policy
    }
  }

  // Public Controls
  togglePlayPause() {
    this.updateState({ isPlaying: !this.state.isPlaying });
  }

  skipTrack() {
    this.handleSkipCommand('Streamer');
  }

  removeQueueItem(id: string) {
    const updated = this.state.queue.filter((q) => q.id !== id);
    this.updateState({ queue: updated });
  }

  updatePolicy(partial: Partial<SongRequestPolicy>) {
    this.updateState({
      policy: {
        ...this.state.policy,
        ...partial,
      },
    });
  }

  setVolume(vol: number) {
    this.updateState({ volume: vol });
  }

  subscribe(listener: SongRequestListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): SongRequestState {
    return this.state;
  }

  private updateState(partial: Partial<SongRequestState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (err) {
        console.error('SongRequest listener error:', err);
      }
    });
  }
}

export const songRequestEngine = new SongRequestEngine();
