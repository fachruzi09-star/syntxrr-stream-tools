// Event Bus Terpusat — SYNTXRR STREAM
// Menghubungkan Event Stream (Chat, Gift, Like, Follow, Donasi) dengan Overlay & TTS

import { StreamEvent, StreamEventMetadataUpdate } from '../types';
import { ttsService } from './ttsService';
import { soundboardEngine } from './soundboardEngine';

type EventListener = (event: StreamEvent) => void;
type EventMetadataUpdateListener = (
  update: StreamEventMetadataUpdate,
  updatedEvent?: StreamEvent
) => void;

class StreamEventBus {
  private listeners: Set<EventListener> = new Set();
  private replayListeners: Set<EventListener> = new Set();
  private updateListeners: Set<EventMetadataUpdateListener> = new Set();
  private history: StreamEvent[] = [];

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeReplay(listener: EventListener): () => void {
    this.replayListeners.add(listener);
    return () => {
      this.replayListeners.delete(listener);
    };
  }

  subscribeUpdates(listener: EventMetadataUpdateListener): () => void {
    this.updateListeners.add(listener);
    return () => {
      this.updateListeners.delete(listener);
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

  /**
   * Memulihkan event histori hasil replay buffer native ke histori bersama dan
   * subscriber replay UI saja, tanpa memanggil normal listeners, TTS, soundboard,
   * floating alert, Mode B forwarding, Song Request, atau aksi Studio.
   */
  replay(event: StreamEvent): void {
    if (this.history.some((item) => item.id === event.id)) {
      return;
    }
    this.history.unshift(event);
    if (this.history.length > 50) {
      this.history.pop();
    }

    this.replayListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error saat menjalankan listener replay event:', err);
      }
    });
  }

  /**
   * Memperbarui metadata event yang sudah terbit (mis. status terminal combo gift repeatEnd=true)
   * tanpa menambah duplikat ke histori dan tanpa memicu TTS, soundboard, atau alert ulang.
   */
  updateEventMetadata(update: StreamEventMetadataUpdate): StreamEvent | undefined {
    return this.applyMetadataUpdate(update);
  }

  /**
   * Jalur khusus replay untuk pembaruan metadata terminal gift combo agar terisolasi
   * dari efek samping normal.
   */
  replayMetadataUpdate(update: StreamEventMetadataUpdate): StreamEvent | undefined {
    return this.applyMetadataUpdate(update);
  }

  private applyMetadataUpdate(update: StreamEventMetadataUpdate): StreamEvent | undefined {
    let updatedEvent: StreamEvent | undefined;
    const index = this.history.findIndex((item) => item.id === update.id);
    if (index !== -1) {
      const current = this.history[index];
      updatedEvent = {
        ...current,
        ...(update.repeatEnd !== undefined ? { repeatEnd: update.repeatEnd } : {}),
        ...(update.repeatCount !== undefined ? { repeatCount: update.repeatCount } : {}),
        ...(update.giftId !== undefined ? { giftId: update.giftId } : {}),
        ...(update.giftName !== undefined ? { giftName: update.giftName } : {}),
      };
      this.history[index] = updatedEvent;
    }

    this.updateListeners.forEach((listener) => {
      try {
        listener(update, updatedEvent);
      } catch (err) {
        console.error('Error saat menjalankan listener update event:', err);
      }
    });

    return updatedEvent;
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
