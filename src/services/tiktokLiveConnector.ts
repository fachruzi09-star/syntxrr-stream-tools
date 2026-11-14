// TikTokLiveConnector — Pemilik lifecycle koneksi Mode A di lapisan TypeScript
// Menghubungkan adapter transport native Android (atau adapter terinjeksi untuk uji unit)
// ke TikTokEventNormalizer -> streamEventBus SYNTXRR tanpa membuat event bus kedua.

import type { PluginListenerHandle } from '@capacitor/core';
import type {
  TikTokConnectionState,
  TikTokConnectorStatus,
} from '../types';
import { streamEventBus } from './eventBus';
import {
  connectTikTokLiveNative,
  disconnectTikTokLiveNative,
  getTikTokLiveStatusNative,
  isNativeAndroid,
  onTikTokLiveEvent,
  onTikTokLiveState,
  type NativeTikTokRawEventPayload,
  type NativeTikTokStatePayload,
} from './nativeCompanionBridge';
import { TikTokEventNormalizer } from './tiktokEventNormalizer';

export interface TikTokConnectOptions {
  username: string;
  eulerApiKey?: string;
  allowEulerFallback?: boolean;
}

export interface TikTokTransportAdapter {
  isSupported: () => boolean;
  connect: (options: TikTokConnectOptions) => Promise<{
    accepted: boolean;
    status?: NativeTikTokStatePayload;
    message?: string;
  }>;
  disconnect: () => Promise<{
    success: boolean;
    status?: NativeTikTokStatePayload;
  }>;
  getStatus: () => Promise<NativeTikTokStatePayload | null>;
  onState: (cb: (payload: NativeTikTokStatePayload) => void) => Promise<PluginListenerHandle | null>;
  onEvent: (cb: (payload: NativeTikTokRawEventPayload) => void) => Promise<PluginListenerHandle | null>;
}

const DEFAULT_NATIVE_ADAPTER: TikTokTransportAdapter = {
  isSupported: isNativeAndroid,
  connect: connectTikTokLiveNative,
  disconnect: disconnectTikTokLiveNative,
  getStatus: getTikTokLiveStatusNative,
  onState: onTikTokLiveState,
  onEvent: onTikTokLiveEvent,
};

function sanitizeUsernameInput(raw: string): string {
  let clean = (raw || '').trim();
  while (clean.startsWith('@')) {
    clean = clean.slice(1).trim();
  }
  return clean;
}

function initialStatus(): TikTokConnectorStatus {
  return {
    state: 'disconnected',
    transport: 'none',
    username: '',
    roomId: '',
    viewerCount: 0,
    totalLikeCount: 0,
    message: 'Belum terhubung ke TikTok LIVE.',
    updatedAt: Date.now(),
  };
}

export type TikTokStatusListener = (status: TikTokConnectorStatus) => void;

export class TikTokLiveConnector {
  private readonly adapter: TikTokTransportAdapter;
  private readonly normalizer = new TikTokEventNormalizer();
  private readonly emitToBus: (event: NonNullable<ReturnType<TikTokEventNormalizer['normalize']>['event']>) => void;
  private readonly listeners = new Set<TikTokStatusListener>();

  private status: TikTokConnectorStatus = initialStatus();
  private listenersAttached = false;
  private attachingPromise: Promise<void> | null = null;
  private stateHandle: PluginListenerHandle | null = null;
  private eventHandle: PluginListenerHandle | null = null;
  private connectInFlight = false;

  constructor(
    adapter: TikTokTransportAdapter = DEFAULT_NATIVE_ADAPTER,
    emitToBus: (event: NonNullable<ReturnType<TikTokEventNormalizer['normalize']>['event']>) => void = (evt) =>
      streamEventBus.emit(evt)
  ) {
    this.adapter = adapter;
    this.emitToBus = emitToBus;
  }

  getStatus(): TikTokConnectorStatus {
    return { ...this.status };
  }

  isConnected(): boolean {
    return this.status.state === 'connected_direct' || this.status.state === 'connected_euler';
  }

  isActiveSession(): boolean {
    return (
      this.status.state === 'resolving_room' ||
      this.status.state === 'connecting_direct' ||
      this.status.state === 'connected_direct' ||
      this.status.state === 'connecting_euler' ||
      this.status.state === 'connected_euler' ||
      this.status.state === 'reconnecting'
    );
  }

  subscribe(listener: TikTokStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    void this.ensureListenersAttached();
    return () => {
      this.listeners.delete(listener);
    };
  }

  async ensureListenersAttached(): Promise<void> {
    if (this.listenersAttached) return;
    if (this.attachingPromise) return this.attachingPromise;

    this.attachingPromise = (async () => {
      try {
        if (!this.adapter.isSupported()) {
          this.listenersAttached = true;
          return;
        }
        if (!this.stateHandle) {
          this.stateHandle = await this.adapter.onState((payload) => {
            this.applyNativeState(payload);
          });
        }
        if (!this.eventHandle) {
          this.eventHandle = await this.adapter.onEvent((rawEvent) => {
            this.handleIncomingRawEvent(rawEvent);
          });
        }
        this.listenersAttached = true;
      } finally {
        this.attachingPromise = null;
      }
    })();

    return this.attachingPromise;
  }

  async syncFromNative(): Promise<TikTokConnectorStatus> {
    await this.ensureListenersAttached();
    if (!this.adapter.isSupported()) {
      return this.getStatus();
    }
    const nativeStatus = await this.adapter.getStatus();
    if (nativeStatus) {
      this.applyNativeState(nativeStatus);
    }
    return this.getStatus();
  }

  async connect(options: TikTokConnectOptions): Promise<TikTokConnectorStatus> {
    const cleanUser = sanitizeUsernameInput(options.username);
    if (!cleanUser || !/^[A-Za-z0-9._]{1,64}$/.test(cleanUser)) {
      this.updateStatus({
        state: 'error',
        transport: 'none',
        username: cleanUser,
        roomId: '',
        viewerCount: 0,
        totalLikeCount: 0,
        message: 'Masukkan username TikTok yang valid terlebih dahulu.',
        errorCode: 'INVALID_INPUT',
      });
      return this.getStatus();
    }

    if (this.connectInFlight) {
      return this.getStatus();
    }

    if (
      this.isActiveSession() &&
      this.status.username.toLowerCase() === cleanUser.toLowerCase()
    ) {
      return this.getStatus();
    }

    if (!this.adapter.isSupported()) {
      this.updateStatus({
        state: 'error',
        transport: 'none',
        username: cleanUser,
        roomId: '',
        viewerCount: 0,
        totalLikeCount: 0,
        message:
          'Koneksi langsung TikTok LIVE hanya berjalan di APK Android (Mode A) karena browser web memblokir Cookie/User-Agent dan handshake WebSocket kustom.',
        errorCode: 'ANDROID_NATIVE_REQUIRED',
      });
      return this.getStatus();
    }

    this.connectInFlight = true;
    try {
      await this.ensureListenersAttached();
      this.normalizer.reset();

      this.updateStatus({
        state: 'resolving_room',
        transport: 'none',
        username: cleanUser,
        roomId: '',
        viewerCount: 0,
        totalLikeCount: 0,
        message: `Mencari room LIVE @${cleanUser}...`,
        errorCode: undefined,
      });

      const res = await this.adapter.connect({
        username: cleanUser,
        eulerApiKey: options.eulerApiKey?.trim() || undefined,
        allowEulerFallback: options.allowEulerFallback ?? true,
      });

      if (res.status) {
        this.applyNativeState(res.status);
      } else if (!res.accepted) {
        this.updateStatus({
          state: 'error',
          transport: 'none',
          username: cleanUser,
          roomId: '',
          viewerCount: 0,
          totalLikeCount: 0,
          message: res.message || 'Gagal memulai koneksi TikTok LIVE.',
          errorCode: 'CONNECT_REJECTED',
        });
      }
      return this.getStatus();
    } finally {
      this.connectInFlight = false;
    }
  }

  async disconnect(): Promise<TikTokConnectorStatus> {
    if (this.adapter.isSupported()) {
      const res = await this.adapter.disconnect();
      if (res.status) {
        this.applyNativeState(res.status);
        return this.getStatus();
      }
    }

    this.normalizer.reset();
    this.updateStatus({
      state: 'disconnected',
      transport: 'none',
      username: this.status.username,
      roomId: '',
      viewerCount: 0,
      totalLikeCount: 0,
      message: 'Koneksi TikTok LIVE diputuskan.',
      errorCode: undefined,
    });
    return this.getStatus();
  }

  async destroy(): Promise<void> {
    if (this.stateHandle) {
      await this.stateHandle.remove().catch(() => {});
      this.stateHandle = null;
    }
    if (this.eventHandle) {
      await this.eventHandle.remove().catch(() => {});
      this.eventHandle = null;
    }
    this.listenersAttached = false;
    this.normalizer.reset();
    this.listeners.clear();
  }

  private handleIncomingRawEvent(raw: NativeTikTokRawEventPayload): void {
    const outcome = this.normalizer.normalize(raw);
    if (outcome.roomEnded) {
      this.updateStatus({
        ...this.status,
        state: 'waiting_for_live',
        transport: 'none',
        message: `Siaran LIVE @${this.status.username || 'streamer'} telah berakhir.`,
        errorCode: 'LIVE_ENDED',
      });
    }

    let statsChanged = false;
    const nextStatus = { ...this.status };
    if (typeof outcome.viewerCount === 'number' && outcome.viewerCount !== nextStatus.viewerCount) {
      nextStatus.viewerCount = outcome.viewerCount;
      statsChanged = true;
    }
    if (
      typeof outcome.totalLikeCount === 'number' &&
      outcome.totalLikeCount > nextStatus.totalLikeCount
    ) {
      nextStatus.totalLikeCount = outcome.totalLikeCount;
      statsChanged = true;
    }
    if (statsChanged) {
      this.updateStatus(nextStatus);
    }

    if (outcome.event) {
      this.emitToBus(outcome.event);
    }
  }

  private applyNativeState(payload: NativeTikTokStatePayload): void {
    const allowedStates: ReadonlySet<TikTokConnectionState> = new Set([
      'disconnected',
      'resolving_room',
      'connecting_direct',
      'connected_direct',
      'connecting_euler',
      'connected_euler',
      'reconnecting',
      'waiting_for_live',
      'error',
    ]);

    const nextState: TikTokConnectionState = allowedStates.has(payload.state)
      ? payload.state
      : 'disconnected';

    this.updateStatus({
      state: nextState,
      transport: payload.transport || 'none',
      username: payload.username ?? this.status.username,
      roomId: payload.roomId ?? '',
      viewerCount: typeof payload.viewerCount === 'number' ? payload.viewerCount : this.status.viewerCount,
      totalLikeCount:
        typeof payload.totalLikeCount === 'number' ? payload.totalLikeCount : this.status.totalLikeCount,
      message: payload.message || this.status.message,
      errorCode: payload.errorCode || undefined,
    });
  }

  private updateStatus(next: Omit<TikTokConnectorStatus, 'updatedAt'>): void {
    this.status = {
      ...next,
      updatedAt: Date.now(),
    };
    const snapshot = this.getStatus();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.warn('Error pada listener status TikTok:', err);
      }
    });
  }
}

export const tiktokLiveConnector = new TikTokLiveConnector();
