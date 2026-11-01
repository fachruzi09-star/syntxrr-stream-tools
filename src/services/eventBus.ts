// Event Bus Terpusat — SYNTXRR STREAM
// Menghubungkan Event Stream (Chat, Gift, Like, Follow, Donasi) dengan Overlay & TTS

import { StreamEvent } from '../types';
import { ttsService } from './ttsService';
import { soundboardEngine } from './soundboardEngine';

type EventListener = (event: StreamEvent) => void;

class StreamEventBus {
  private listeners: Set<EventListener> = new Set();
  private history: StreamEvent[] = [];

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: StreamEvent) {
    this.history.unshift(event);
    if (this.history.length > 50) {
      this.history.pop();
    }

    // Trigger TTS jika diizinkan
    const ttsConfig = ttsService.getConfig();
    if (ttsConfig.enabled) {
      if (event.type === 'donation' && ttsConfig.readDonations) {
        ttsService.speak(`Donasi dari ${event.username}, ${event.detail}`);
      } else if (event.type === 'gift' && ttsConfig.readGifts) {
        ttsService.speak(`Hadiah dari ${event.username}, ${event.detail}`);
      } else if (event.type === 'chat' && ttsConfig.readComments) {
        ttsService.speak(`${event.username} berkata, ${event.detail}`);
      }
    }

    // Trigger audio cue
    if (event.type === 'donation') {
      soundboardEngine.playSynthesizedSFX('tada');
    } else if (event.type === 'gift') {
      soundboardEngine.playSynthesizedSFX('level_up');
    } else if (event.type === 'follow') {
      soundboardEngine.playSynthesizedSFX('bell');
    }

    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error saat menjalankan listener event:', err);
      }
    });
  }

  getHistory(): StreamEvent[] {
    return [...this.history];
  }

  clearHistory() {
    this.history = [];
  }
}

export const eventBus = new StreamEventBus();
export const streamEventBus = eventBus;
