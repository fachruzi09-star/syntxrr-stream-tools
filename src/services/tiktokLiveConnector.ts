// TikTokLiveConnector — Pemilik lifecycle koneksi Mode A di lapisan TypeScript
// Menghubungkan adapter transport native Android (atau adapter terinjeksi untuk uji unit)
// ke TikTokEventNormalizer -> streamEventBus SYNTXRR tanpa membuat event bus kedua.

import type { PluginListenerHandle } from '@capacitor/core';
import type {
  AppSettings,
  TikTokAccountState,
  TikTokConnectionDiagnostics,
  TikTokConnectionMethod,
  TikTokConnectionState,
  TikTokConnectorStatus,
  TikTokCookieWarmUpResult,
  TikTokDiagnosticStage,
  TikTokHandshakeBodyKind,
  TikTokHandshakeResponseClass,
  TikTokRoomStatus,
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

export const TIKTOK_USERNAME_REGEX = /^[A-Za-z0-9._]{1,64}$/;

export function normalizeTikTokTargetUsername(raw?: string | null): string {
  let clean = (raw || '').trim();
  while (clean.startsWith('@')) {
    clean = clean.slice(1).trim();
  }
  return clean;
}

export function isValidTikTokTargetUsername(raw?: string | null): boolean {
  const clean = normalizeTikTokTargetUsername(raw);
  return TIKTOK_USERNAME_REGEX.test(clean);
}

/**
 * Satu sumber kebenaran target username LIVE TikTok publik untuk Dashboard, Integrations,
 * dan TikTokLiveConnector tanpa mewajibkan login OAuth.
 */
export function resolveTikTokTargetUsername(
  settings?: Pick<AppSettings, 'tiktokUsername'> | null,
  account?: Pick<TikTokAccountState, 'isLinked' | 'username'> | null
): string {
  const fromSettings = normalizeTikTokTargetUsername(settings?.tiktokUsername);
  if (isValidTikTokTargetUsername(fromSettings)) {
    return fromSettings;
  }
  if (account?.isLinked) {
    const fromAccount = normalizeTikTokTargetUsername(account.username);
    if (isValidTikTokTargetUsername(fromAccount)) {
      return fromAccount;
    }
  }
  return '';
}

export interface TikTokConnectOptions {
  username: string;
  eulerApiKey?: string;
  eulerJwtKey?: string;
  allowEulerFallback?: boolean;
  connectionMethod?: TikTokConnectionMethod;
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
  return normalizeTikTokTargetUsername(raw);
}

const ALLOWED_DIAGNOSTIC_STAGES: ReadonlySet<TikTokDiagnosticStage> = new Set([
  'idle',
  'resolving_room',
  'room_resolved',
  'websocket_connecting',
  'websocket_open',
  'room_entry_sent',
  'waiting_room_ack',
  'connected',
  'receiving_events',
  'reconnecting',
  'waiting_for_live',
  'error',
  'disconnected',
]);

function fallbackDiagnosticStageForState(state: TikTokConnectionState): TikTokDiagnosticStage {
  switch (state) {
    case 'resolving_room':
      return 'resolving_room';
    case 'connecting_direct':
    case 'connecting_euler':
      return 'websocket_connecting';
    case 'connected_direct':
    case 'connected_euler':
      return 'connected';
    case 'reconnecting':
      return 'reconnecting';
    case 'waiting_for_live':
      return 'waiting_for_live';
    case 'error':
      return 'error';
    default:
      return 'disconnected';
  }
}

export function sanitizeDiagnosticErrorMessage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let cleaned = raw.trim();
  if (!cleaned) return null;

  cleaned = cleaned
    .replace(
      /(apiKey|jwtKey|token|access_token|refresh_token|ttwid|sessionid|cookie|authorization)=([^&\s]+)/gi,
      '$1=[REDACTED]'
    )
    .replace(/(?:^|\s)(?:Cookie|Set-Cookie|Authorization)\s*:\s*[^\r\n]+/gi, ' [REDACTED_HEADER]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[REDACTED]')
    .trim();

  if (cleaned.length > 220) {
    cleaned = `${cleaned.slice(0, 217)}...`;
  }
  return cleaned || null;
}

function sanitizeDiagnosticIdentifier(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(trimmed) ? trimmed : null;
}

function toFiniteIntegerOrNull(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.trunc(raw);
}

const ALLOWED_BODY_KINDS: ReadonlySet<TikTokHandshakeBodyKind> = new Set([
  'html',
  'json',
  'plain_text',
  'empty',
  'unknown',
]);

const ALLOWED_RESPONSE_CLASSES: ReadonlySet<TikTokHandshakeResponseClass> = new Set([
  'redirect',
  'edge_html',
  'api_json',
  'upgrade_missing',
  'protocol_rejected',
  'unknown',
]);

const ALLOWED_COOKIE_WARMUP_RESULTS: ReadonlySet<TikTokCookieWarmUpResult> = new Set([
  'TTWID_FOUND_ON_HOMEPAGE',
  'TTWID_FOUND_ON_LIVE_PAGE',
  'TTWID_NOT_FOUND',
  'LIVE_PAGE_NOT_ATTEMPTED',
  'WARMUP_FAILED',
]);

function sanitizeDiagnosticHeaderValue(raw: unknown, maxLen: number = 128): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = sanitizeDiagnosticErrorMessage(raw);
  if (!cleaned) return null;
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 3)}...` : cleaned;
}

export function sanitizeDiagnosticRedirectLocation(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) return null;
  const hashIdx = cleaned.indexOf('#');
  if (hashIdx >= 0) cleaned = cleaned.slice(0, hashIdx);
  const queryIdx = cleaned.indexOf('?');
  if (queryIdx >= 0) cleaned = cleaned.slice(0, queryIdx);
  cleaned = cleaned.trim();
  if (!cleaned) return null;

  if (/^(https?|wss?):\/\//i.test(cleaned) || cleaned.startsWith('//')) {
    try {
      const normalized = cleaned.startsWith('//') ? `https:${cleaned}` : cleaned;
      const parsed = new URL(normalized);
      const host = parsed.hostname.toLowerCase();
      if (!host) return null;
      const path = parsed.pathname || '/';
      const combined = `${host}${path}`;
      return combined.length > 200 ? `${combined.slice(0, 197)}...` : combined;
    } catch {
      return null;
    }
  }
  if (cleaned.startsWith('/')) {
    return cleaned.length > 200 ? `${cleaned.slice(0, 197)}...` : cleaned;
  }
  if (/^[A-Za-z0-9.-]+(\/.*)?$/.test(cleaned)) {
    return cleaned.length > 200 ? `${cleaned.slice(0, 197)}...` : cleaned;
  }
  return null;
}

export function extractDiagnosticsFromNativePayload(
  payload: NativeTikTokStatePayload,
  resolvedState: TikTokConnectionState
): TikTokConnectionDiagnostics | undefined {
  const nested = payload.diagnostics && typeof payload.diagnostics === 'object' ? payload.diagnostics : undefined;

  const pick = <K extends keyof TikTokConnectionDiagnostics>(
    key: K
  ): unknown => {
    const topValue = (payload as unknown as Record<string, unknown>)[key];
    if (topValue !== undefined) return topValue;
    if (nested) {
      return (nested as unknown as Record<string, unknown>)[key];
    }
    return undefined;
  };

  const keys: Array<keyof TikTokConnectionDiagnostics> = [
    'diagnosticStage',
    'roomLookupHttpStatus',
    'hasTtwidCookie',
    'cookieWarmUpHomepageHttpStatus',
    'cookieWarmUpHomepageHasSetCookie',
    'cookieWarmUpHomepageCookieCount',
    'cookieWarmUpHomepageHasTtwid',
    'cookieWarmUpLivePageAttempted',
    'cookieWarmUpLivePageHttpStatus',
    'cookieWarmUpLivePageHasSetCookie',
    'cookieWarmUpLivePageCookieCount',
    'cookieWarmUpLivePageHasTtwid',
    'cookieWarmUpResult',
    'websocketHttpStatus',
    'websocketAttemptHost',
    'websocketContentType',
    'websocketRedirectLocation',
    'websocketServerHeader',
    'websocketUpgradeHeader',
    'websocketConnectionHeader',
    'websocketHasAcceptHeader',
    'websocketBodyBytes',
    'websocketBodyKind',
    'websocketResponseClass',
    'websocketRejectionReason',
    'roomEntryFrameSent',
    'roomEntryConfirmed',
    'eventReceivedBeforeRoomAck',
    'lastPayloadType',
    'lastFrameReceivedAt',
    'decodedEventCount',
    'lastDecodedEventMethod',
    'lastEventReceivedAt',
    'lastTransportError',
  ];

  const hasAnyDiagnosticField = keys.some((k) => pick(k) !== undefined);
  if (!hasAnyDiagnosticField) {
    return undefined;
  }

  const rawStage = pick('diagnosticStage');
  const diagnosticStage: TikTokDiagnosticStage =
    typeof rawStage === 'string' && ALLOWED_DIAGNOSTIC_STAGES.has(rawStage as TikTokDiagnosticStage)
      ? (rawStage as TikTokDiagnosticStage)
      : fallbackDiagnosticStageForState(resolvedState);

  const rawDecodedCount = toFiniteIntegerOrNull(pick('decodedEventCount'));
  const rawBodyBytes = toFiniteIntegerOrNull(pick('websocketBodyBytes'));
  const rawBodyKind = pick('websocketBodyKind');
  const rawResponseClass = pick('websocketResponseClass');
  const rawHasAccept = pick('websocketHasAcceptHeader');
  const rawHomepageSetCookie = pick('cookieWarmUpHomepageHasSetCookie');
  const rawHomepageCookieCount = toFiniteIntegerOrNull(pick('cookieWarmUpHomepageCookieCount'));
  const rawHomepageHasTtwid = pick('cookieWarmUpHomepageHasTtwid');
  const rawLivePageAttempted = pick('cookieWarmUpLivePageAttempted');
  const rawLivePageSetCookie = pick('cookieWarmUpLivePageHasSetCookie');
  const rawLivePageCookieCount = toFiniteIntegerOrNull(pick('cookieWarmUpLivePageCookieCount'));
  const rawLivePageHasTtwid = pick('cookieWarmUpLivePageHasTtwid');
  const rawWarmUpResult = pick('cookieWarmUpResult');

  return {
    diagnosticStage,
    roomLookupHttpStatus: toFiniteIntegerOrNull(pick('roomLookupHttpStatus')),
    hasTtwidCookie: pick('hasTtwidCookie') === true,
    cookieWarmUpHomepageHttpStatus: toFiniteIntegerOrNull(pick('cookieWarmUpHomepageHttpStatus')),
    cookieWarmUpHomepageHasSetCookie:
      typeof rawHomepageSetCookie === 'boolean' ? rawHomepageSetCookie : null,
    cookieWarmUpHomepageCookieCount:
      rawHomepageCookieCount !== null ? Math.max(0, rawHomepageCookieCount) : null,
    cookieWarmUpHomepageHasTtwid:
      typeof rawHomepageHasTtwid === 'boolean' ? rawHomepageHasTtwid : null,
    cookieWarmUpLivePageAttempted:
      typeof rawLivePageAttempted === 'boolean' ? rawLivePageAttempted : null,
    cookieWarmUpLivePageHttpStatus: toFiniteIntegerOrNull(pick('cookieWarmUpLivePageHttpStatus')),
    cookieWarmUpLivePageHasSetCookie:
      typeof rawLivePageSetCookie === 'boolean' ? rawLivePageSetCookie : null,
    cookieWarmUpLivePageCookieCount:
      rawLivePageCookieCount !== null ? Math.max(0, rawLivePageCookieCount) : null,
    cookieWarmUpLivePageHasTtwid:
      typeof rawLivePageHasTtwid === 'boolean' ? rawLivePageHasTtwid : null,
    cookieWarmUpResult:
      typeof rawWarmUpResult === 'string' &&
      ALLOWED_COOKIE_WARMUP_RESULTS.has(rawWarmUpResult as TikTokCookieWarmUpResult)
        ? (rawWarmUpResult as TikTokCookieWarmUpResult)
        : null,
    websocketHttpStatus: toFiniteIntegerOrNull(pick('websocketHttpStatus')),
    websocketAttemptHost: sanitizeDiagnosticIdentifier(pick('websocketAttemptHost')),
    websocketContentType: sanitizeDiagnosticHeaderValue(pick('websocketContentType')),
    websocketRedirectLocation: sanitizeDiagnosticRedirectLocation(pick('websocketRedirectLocation')),
    websocketServerHeader: sanitizeDiagnosticHeaderValue(pick('websocketServerHeader')),
    websocketUpgradeHeader: sanitizeDiagnosticHeaderValue(pick('websocketUpgradeHeader')),
    websocketConnectionHeader: sanitizeDiagnosticHeaderValue(pick('websocketConnectionHeader')),
    websocketHasAcceptHeader: typeof rawHasAccept === 'boolean' ? rawHasAccept : null,
    websocketBodyBytes: rawBodyBytes !== null ? Math.max(0, rawBodyBytes) : null,
    websocketBodyKind:
      typeof rawBodyKind === 'string' && ALLOWED_BODY_KINDS.has(rawBodyKind as TikTokHandshakeBodyKind)
        ? (rawBodyKind as TikTokHandshakeBodyKind)
        : null,
    websocketResponseClass:
      typeof rawResponseClass === 'string' &&
      ALLOWED_RESPONSE_CLASSES.has(rawResponseClass as TikTokHandshakeResponseClass)
        ? (rawResponseClass as TikTokHandshakeResponseClass)
        : null,
    websocketRejectionReason: sanitizeDiagnosticErrorMessage(pick('websocketRejectionReason')),
    roomEntryFrameSent: pick('roomEntryFrameSent') === true,
    roomEntryConfirmed: pick('roomEntryConfirmed') === true,
    eventReceivedBeforeRoomAck: pick('eventReceivedBeforeRoomAck') === true,
    lastPayloadType: sanitizeDiagnosticIdentifier(pick('lastPayloadType')),
    lastFrameReceivedAt: toFiniteIntegerOrNull(pick('lastFrameReceivedAt')),
    decodedEventCount: rawDecodedCount !== null ? Math.max(0, rawDecodedCount) : 0,
    lastDecodedEventMethod: sanitizeDiagnosticIdentifier(pick('lastDecodedEventMethod')),
    lastEventReceivedAt: toFiniteIntegerOrNull(pick('lastEventReceivedAt')),
    lastTransportError: sanitizeDiagnosticErrorMessage(pick('lastTransportError')),
  };
}

function initialStatus(): TikTokConnectorStatus {
  return {
    state: 'disconnected',
    transport: 'none',
    connectionMethod: 'direct',
    roomStatus: 'unknown',
    username: '',
    roomId: '',
    viewerCount: 0,
    totalLikeCount: 0,
    message: 'Belum terhubung ke TikTok LIVE.',
    diagnostics: undefined,
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
  private activeConnectConfig: {
    username: string;
    connectionMethod: TikTokConnectionMethod;
    allowEulerFallback: boolean;
    eulerApiKey: string;
    eulerJwtKey: string;
  } | null = null;

  constructor(
    adapter: TikTokTransportAdapter = DEFAULT_NATIVE_ADAPTER,
    emitToBus: (event: NonNullable<ReturnType<TikTokEventNormalizer['normalize']>['event']>) => void = (evt) =>
      streamEventBus.emit(evt)
  ) {
    this.adapter = adapter;
    this.emitToBus = emitToBus;
  }

  getStatus(): TikTokConnectorStatus {
    return {
      ...this.status,
      diagnostics: this.status.diagnostics ? { ...this.status.diagnostics } : undefined,
    };
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
    const connectionMethod: TikTokConnectionMethod =
      options.connectionMethod === 'euler' ? 'euler' : 'direct';
    const allowEulerFallback = options.allowEulerFallback ?? true;
    const cleanApiKey = (options.eulerApiKey || '').trim();
    const cleanJwtKey = (options.eulerJwtKey || '').trim();

    if (!cleanUser || !/^[A-Za-z0-9._]{1,64}$/.test(cleanUser)) {
      this.activeConnectConfig = null;
      this.updateStatus({
        state: 'error',
        transport: 'none',
        connectionMethod,
        roomStatus: 'not_found',
        username: cleanUser,
        roomId: '',
        viewerCount: 0,
        totalLikeCount: 0,
        message: 'Username TikTok yang valid belum tersedia untuk memulai koneksi room LIVE.',
        errorCode: 'INVALID_INPUT',
      });
      return this.getStatus();
    }

    if (cleanApiKey && cleanJwtKey) {
      this.activeConnectConfig = null;
      this.updateStatus({
        state: 'error',
        transport: 'none',
        connectionMethod,
        roomStatus: 'unknown',
        username: cleanUser,
        roomId: '',
        viewerCount: 0,
        totalLikeCount: 0,
        message: 'EulerStream hanya menerima tepat satu kredensial: API Key atau JWT Key, bukan keduanya bersamaan.',
        errorCode: 'EULER_CONFLICTING_CREDENTIALS',
      });
      return this.getStatus();
    }

    if (connectionMethod === 'euler' && !cleanApiKey && !cleanJwtKey) {
      this.activeConnectConfig = null;
      this.updateStatus({
        state: 'error',
        transport: 'none',
        connectionMethod,
        roomStatus: 'unknown',
        username: cleanUser,
        roomId: '',
        viewerCount: 0,
        totalLikeCount: 0,
        message: 'EulerStream memerlukan API Key atau JWT. Pilih Direct TikTok untuk koneksi tanpa kunci tambahan.',
        errorCode: 'EULER_API_KEY_REQUIRED',
      });
      return this.getStatus();
    }

    if (this.connectInFlight) {
      return this.getStatus();
    }

    if (
      this.isActiveSession() &&
      this.activeConnectConfig !== null &&
      this.activeConnectConfig.username.toLowerCase() === cleanUser.toLowerCase() &&
      this.activeConnectConfig.connectionMethod === connectionMethod &&
      this.activeConnectConfig.allowEulerFallback === allowEulerFallback &&
      this.activeConnectConfig.eulerApiKey === cleanApiKey &&
      this.activeConnectConfig.eulerJwtKey === cleanJwtKey
    ) {
      return this.getStatus();
    }

    if (!this.adapter.isSupported()) {
      this.activeConnectConfig = null;
      this.updateStatus({
        state: 'error',
        transport: 'none',
        connectionMethod,
        roomStatus: 'unknown',
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

      this.activeConnectConfig = {
        username: cleanUser,
        connectionMethod,
        allowEulerFallback,
        eulerApiKey: cleanApiKey,
        eulerJwtKey: cleanJwtKey,
      };

      this.updateStatus({
        state: 'resolving_room',
        transport: 'none',
        connectionMethod,
        roomStatus: 'unknown',
        username: cleanUser,
        roomId: '',
        viewerCount: 0,
        totalLikeCount: 0,
        message: `Mencari room LIVE @${cleanUser}...`,
        errorCode: undefined,
        diagnostics: undefined,
      });

      const res = await this.adapter.connect({
        username: cleanUser,
        eulerApiKey: cleanApiKey || undefined,
        eulerJwtKey: cleanJwtKey || undefined,
        allowEulerFallback,
        connectionMethod,
      });

      if (res.status) {
        this.applyNativeState(res.status);
      } else if (!res.accepted) {
        this.activeConnectConfig = null;
        this.updateStatus({
          state: 'error',
          transport: 'none',
          connectionMethod,
          roomStatus: 'unknown',
          username: cleanUser,
          roomId: '',
          viewerCount: 0,
          totalLikeCount: 0,
          message: res.message || 'Gagal memulai koneksi TikTok LIVE.',
          errorCode: 'CONNECT_REJECTED',
          diagnostics: undefined,
        });
      }
      return this.getStatus();
    } finally {
      this.connectInFlight = false;
    }
  }

  async disconnect(): Promise<TikTokConnectorStatus> {
    this.activeConnectConfig = null;
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
      connectionMethod: this.status.connectionMethod ?? 'direct',
      roomStatus: 'unknown',
      username: this.status.username,
      roomId: '',
      viewerCount: 0,
      totalLikeCount: 0,
      message: 'Koneksi TikTok LIVE diputuskan.',
      errorCode: undefined,
      diagnostics: undefined,
    });
    return this.getStatus();
  }

  async destroy(): Promise<void> {
    this.activeConnectConfig = null;
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
        roomStatus: 'not_live',
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

    if (nextState === 'disconnected' || nextState === 'error') {
      this.activeConnectConfig = null;
    }

    const derivedRoomStatus: TikTokRoomStatus = payload.roomStatus
      ? payload.roomStatus
      : nextState === 'connected_direct' || nextState === 'connected_euler'
      ? 'live'
      : nextState === 'waiting_for_live'
      ? 'not_live'
      : this.status.roomStatus ?? 'unknown';

    const diagnostics = extractDiagnosticsFromNativePayload(payload, nextState);

    this.updateStatus({
      state: nextState,
      transport: payload.transport || 'none',
      connectionMethod: payload.connectionMethod ?? this.status.connectionMethod ?? 'direct',
      roomStatus: derivedRoomStatus,
      username: payload.username ?? this.status.username,
      roomId: payload.roomId ?? '',
      viewerCount: typeof payload.viewerCount === 'number' ? payload.viewerCount : this.status.viewerCount,
      totalLikeCount:
        typeof payload.totalLikeCount === 'number' ? payload.totalLikeCount : this.status.totalLikeCount,
      message: payload.message || this.status.message,
      errorCode: payload.errorCode || undefined,
      diagnostics,
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

export interface ModeAHonestStatusSummary {
  accountLinked: {
    label: string;
    detail: string;
    tone: 'ok' | 'warn' | 'error' | 'off';
  };
  modeASession: {
    label: string;
    detail: string;
    tone: 'ok' | 'warn' | 'off';
  };
  roomStatus: {
    label: string;
    tone: 'ok' | 'warn' | 'error' | 'off';
  };
  eventTransport: {
    label: string;
    detail: string;
    tone: 'ok' | 'warn' | 'error' | 'off';
  };
}

export function buildModeAHonestStatus(params: {
  account: import('../types').TikTokAccountState;
  connector: TikTokConnectorStatus;
  companionRunning: boolean;
  sessionMode: import('../types').ModeASessionMode;
}): ModeAHonestStatusSummary {
  const { account, connector, companionRunning, sessionMode } = params;

  const accountLinked: ModeAHonestStatusSummary['accountLinked'] =
    account.accountLinkStatus === 'linking'
      ? {
          label: 'Menghubungkan',
          detail: 'Menunggu persetujuan otorisasi TikTok...',
          tone: 'warn',
        }
      : account.isLinked && account.accountLinkStatus === 'linked'
      ? {
          label: 'Terhubung',
          detail: account.username
            ? `@${account.username}`
            : account.displayName || account.openId || 'Akun terotorisasi',
          tone: 'ok',
        }
      : account.accountLinkStatus === 'failed'
      ? {
          label: 'Gagal',
          detail: account.linkErrorMessage || 'Autentikasi akun TikTok gagal.',
          tone: 'error',
        }
      : {
          label: 'Belum terhubung',
          detail: 'Akun TikTok belum ditautkan.',
          tone: 'off',
        };

  const modeASession: ModeAHonestStatusSummary['modeASession'] = !companionRunning
    ? {
        label: 'Tidak aktif',
        detail: 'Sesi Mode A belum dijalankan.',
        tone: 'off',
      }
    : sessionMode === 'without_live_connection'
    ? {
        label: 'Aktif (tanpa koneksi LIVE)',
        detail: 'Overlay aktif, tetapi event LIVE belum tersedia.',
        tone: 'warn',
      }
    : sessionMode === 'with_live_connector'
    ? {
        label: 'Aktif (dengan konektor LIVE)',
        detail: 'Companion Service berjalan dengan konektor Mode A.',
        tone: 'ok',
      }
    : {
        label: 'Aktif',
        detail: 'Companion Service & overlay Mode A aktif.',
        tone: 'ok',
      };

  const resolvedRoomStatus = connector.roomStatus ?? 'unknown';
  const roomStatus: ModeAHonestStatusSummary['roomStatus'] =
    resolvedRoomStatus === 'live'
      ? {
          label: connector.roomId ? `Sedang LIVE (${connector.roomId})` : 'Sedang LIVE',
          tone: 'ok',
        }
      : resolvedRoomStatus === 'not_live'
      ? { label: 'Belum LIVE', tone: 'warn' }
      : resolvedRoomStatus === 'not_found'
      ? { label: 'Tidak dapat ditemukan', tone: 'error' }
      : resolvedRoomStatus === 'unreadable'
      ? { label: 'Tidak dapat dibaca', tone: 'error' }
      : { label: 'Belum diperiksa', tone: 'off' };

  let eventTransport: ModeAHonestStatusSummary['eventTransport'];
  switch (connector.state) {
    case 'connected_direct':
      eventTransport = {
        label: 'Connected Direct',
        detail: connector.message || 'Terhubung via WebSocket langsung TikTok.',
        tone: 'ok',
      };
      break;
    case 'connected_euler':
      eventTransport = {
        label: 'Connected EulerStream',
        detail: connector.message || 'Terhubung via EulerStream.',
        tone: 'ok',
      };
      break;
    case 'resolving_room':
    case 'connecting_direct':
    case 'connecting_euler':
      eventTransport = {
        label: 'Connecting',
        detail: connector.message || 'Menghubungkan transport event LIVE...',
        tone: 'warn',
      };
      break;
    case 'reconnecting':
      eventTransport = {
        label: 'Reconnecting',
        detail: connector.message || 'Menyambung ulang ke transport LIVE...',
        tone: 'warn',
      };
      break;
    case 'waiting_for_live':
      eventTransport = {
        label: 'Menunggu LIVE',
        detail: connector.message || 'Akun belum LIVE; menunggu siaran dimulai.',
        tone: 'warn',
      };
      break;
    case 'error':
      eventTransport = {
        label: 'Gagal',
        detail: connector.message || 'Koneksi transport LIVE gagal.',
        tone: 'error',
      };
      break;
    default:
      eventTransport = {
        label: 'Disconnected',
        detail:
          sessionMode === 'without_live_connection'
            ? 'Dimulai tanpa koneksi LIVE (WebSocket tidak dijalankan).'
            : connector.message || 'Transport LIVE tidak aktif.',
        tone: 'off',
      };
      break;
  }

  return {
    accountLinked,
    modeASession,
    roomStatus,
    eventTransport,
  };
}

