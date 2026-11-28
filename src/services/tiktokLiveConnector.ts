// TikTokLiveConnector — Pemilik lifecycle koneksi Mode A di lapisan TypeScript
// Menghubungkan adapter transport native Android (atau adapter terinjeksi untuk uji unit)
// ke TikTokEventNormalizer -> streamEventBus SYNTXRR tanpa membuat event bus kedua.

import type { PluginListenerHandle } from '@capacitor/core';
import type {
  AppSettings,
  StreamEvent,
  StreamEventMetadataUpdate,
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
  getTikTokLiveEventsSinceNative,
  getTikTokLiveStatusNative,
  isNativeAndroid,
  onTikTokLiveEvent,
  onTikTokLiveState,
  type NativeTikTokRawEventPayload,
  type NativeTikTokReplaySnapshot,
  type NativeTikTokStatePayload,
} from './nativeCompanionBridge';
import { BoundedEventDeduplicator, TikTokEventNormalizer } from './tiktokEventNormalizer';

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
  getEventsSince?: (options?: {
    sessionId?: number;
    afterSequence?: number;
    limit?: number;
  }) => Promise<NativeTikTokReplaySnapshot | null>;
  onState: (cb: (payload: NativeTikTokStatePayload) => void) => Promise<PluginListenerHandle | null>;
  onEvent: (cb: (payload: NativeTikTokRawEventPayload) => void) => Promise<PluginListenerHandle | null>;
}

const DEFAULT_NATIVE_ADAPTER: TikTokTransportAdapter = {
  isSupported: isNativeAndroid,
  connect: connectTikTokLiveNative,
  disconnect: disconnectTikTokLiveNative,
  getStatus: getTikTokLiveStatusNative,
  getEventsSince: getTikTokLiveEventsSinceNative,
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

export interface TikTokReplayDiagnostics {
  nativeSessionId: number | null;
  lastProcessedSequence: number;
  pendingSequencedCount: number;
  replayInFlight: boolean;
  replayedEventCount: number;
  detectedGapCount: number;
  unrecoveredGapCount: number;
  replayOverflowCount: number;
  duplicateSequenceCount: number;
}

const MAX_PENDING_SEQUENCED_EVENTS = 256;
const MAX_REPLAY_PAGE_LIMIT = 256;
const MAX_REPLAY_PAGES = 16;
const MAX_RECENT_SEQUENCE_CACHE = 512;
const MAX_SUPERSEDED_SESSIONS = 16;

interface SequencedRawEventMeta {
  sessionId: number;
  sequence: number;
}

type SequencedRawEvent = NativeTikTokRawEventPayload & {
  nativeSequence: number;
  nativeSessionId: number;
};

function isValidRawEventObject(raw: unknown): raw is NativeTikTokRawEventPayload {
  return (
    Boolean(raw) &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    typeof (raw as NativeTikTokRawEventPayload).method === 'string' &&
    (raw as NativeTikTokRawEventPayload).method.trim().length > 0
  );
}

function getSequencedMeta(raw: unknown): SequencedRawEventMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as NativeTikTokRawEventPayload;
  if (
    typeof candidate.nativeSequence !== 'number' ||
    !Number.isFinite(candidate.nativeSequence) ||
    candidate.nativeSequence <= 0
  ) {
    return null;
  }
  if (
    typeof candidate.nativeSessionId !== 'number' ||
    !Number.isFinite(candidate.nativeSessionId) ||
    candidate.nativeSessionId <= 0
  ) {
    return null;
  }
  return {
    sessionId: Math.trunc(candidate.nativeSessionId),
    sequence: Math.trunc(candidate.nativeSequence),
  };
}

function isValidReplaySnapshot(raw: unknown): raw is NativeTikTokReplaySnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return false;
  }
  const candidate = raw as NativeTikTokReplaySnapshot;
  return (
    Array.isArray(candidate.events) &&
    typeof candidate.sessionId === 'number' &&
    Number.isFinite(candidate.sessionId)
  );
}

export class TikTokLiveConnector {
  private readonly adapter: TikTokTransportAdapter;
  private readonly normalizer = new TikTokEventNormalizer();
  private readonly replayNormalizer = new TikTokEventNormalizer();
  private readonly emitToBus: (event: NonNullable<ReturnType<TikTokEventNormalizer['normalize']>['event']>) => void;
  private readonly updateToBus: (update: StreamEventMetadataUpdate) => void;
  private readonly replayToBus: (event: StreamEvent) => void;
  private readonly replayUpdateToBus: (update: StreamEventMetadataUpdate) => void;
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

  private nativeSessionId: number | null = null;
  private lastProcessedSequence = 0;
  private replayGeneration = 0;
  private replayInFlight = false;
  private drainPromise: Promise<void> | null = null;
  private pendingSequencedEvents: SequencedRawEvent[] = [];
  private pendingLegacyEvents: NativeTikTokRawEventPayload[] = [];
  private readonly recentSequenceCache = new BoundedEventDeduplicator(MAX_RECENT_SEQUENCE_CACHE);
  private readonly supersededSessionIds = new BoundedEventDeduplicator(MAX_SUPERSEDED_SESSIONS);
  private replayDiagnostics = {
    replayedEventCount: 0,
    detectedGapCount: 0,
    unrecoveredGapCount: 0,
    replayOverflowCount: 0,
    duplicateSequenceCount: 0,
  };

  constructor(
    adapter: TikTokTransportAdapter = DEFAULT_NATIVE_ADAPTER,
    emitToBus: (event: NonNullable<ReturnType<TikTokEventNormalizer['normalize']>['event']>) => void = (evt) =>
      streamEventBus.emit(evt),
    updateToBus: (update: StreamEventMetadataUpdate) => void = (upd) =>
      streamEventBus.updateEventMetadata(upd),
    replayToBus: (event: StreamEvent) => void = (evt) => streamEventBus.replay(evt),
    replayUpdateToBus: (update: StreamEventMetadataUpdate) => void = (upd) =>
      streamEventBus.replayMetadataUpdate(upd)
  ) {
    this.adapter = adapter;
    this.emitToBus = emitToBus;
    this.updateToBus = updateToBus;
    this.replayToBus = replayToBus;
    this.replayUpdateToBus = replayUpdateToBus;
  }

  getStatus(): TikTokConnectorStatus {
    return {
      ...this.status,
      diagnostics: this.status.diagnostics ? { ...this.status.diagnostics } : undefined,
    };
  }

  getReplayDiagnostics(): TikTokReplayDiagnostics {
    return {
      nativeSessionId: this.nativeSessionId,
      lastProcessedSequence: this.lastProcessedSequence,
      pendingSequencedCount: this.pendingSequencedEvents.length,
      replayInFlight: this.replayInFlight,
      ...this.replayDiagnostics,
    };
  }

  async waitForReplayIdle(): Promise<void> {
    while (this.drainPromise) {
      await this.drainPromise;
    }
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
        if (typeof this.adapter.getEventsSince === 'function') {
          await this.runInitialReplaySerialized();
        }
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
    await this.syncMissedEventsFromNative();
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

      const sessionBeforeConnect = this.nativeSessionId;
      const genBeforeConnect = this.replayGeneration;

      const res = await this.adapter.connect({
        username: cleanUser,
        eulerApiKey: cleanApiKey || undefined,
        eulerJwtKey: cleanJwtKey || undefined,
        allowEulerFallback,
        connectionMethod,
      });

      if (res.accepted) {
        if (this.nativeSessionId === sessionBeforeConnect && this.replayGeneration === genBeforeConnect) {
          this.switchToNewNativeSession(null);
        }
      }

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
    this.invalidateReplayAndQueues(true);
    this.normalizer.reset();

    if (this.adapter.isSupported()) {
      const res = await this.adapter.disconnect();
      this.invalidateReplayAndQueues(true);
      this.normalizer.reset();
      if (res.status) {
        this.applyNativeState(res.status);
        return this.getStatus();
      }
    }

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
    this.invalidateReplayAndQueues(true);
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

  private invalidateReplayAndQueues(clearSuperseded: boolean): void {
    this.replayGeneration++;
    this.replayInFlight = false;
    this.drainPromise = null;
    this.pendingSequencedEvents = [];
    this.pendingLegacyEvents = [];
    this.nativeSessionId = null;
    this.lastProcessedSequence = 0;
    this.recentSequenceCache.clear();
    if (clearSuperseded) {
      this.supersededSessionIds.clear();
    }
    this.replayNormalizer.reset();
  }

  private switchToNewNativeSession(newSessionId: number | null): void {
    if (this.nativeSessionId !== null && this.nativeSessionId !== newSessionId) {
      this.supersededSessionIds.markAndCheckDuplicate(String(this.nativeSessionId));
    }
    this.replayGeneration++;
    this.replayInFlight = false;
    this.drainPromise = null;
    this.nativeSessionId = newSessionId;
    this.lastProcessedSequence = 0;
    this.pendingSequencedEvents = [];
    this.recentSequenceCache.clear();
    this.replayNormalizer.reset();
  }

  private handleIncomingRawEvent(raw: NativeTikTokRawEventPayload): void {
    const seqMeta = getSequencedMeta(raw);

    // Jalur legacy untuk event tanpa nativeSequence/nativeSessionId
    if (!seqMeta) {
      if (this.replayInFlight) {
        if (this.pendingLegacyEvents.length >= MAX_PENDING_SEQUENCED_EVENTS) {
          this.pendingLegacyEvents.shift();
        }
        this.pendingLegacyEvents.push(raw);
        void this.scheduleDrain();
        return;
      }
      this.tryProcessLiveRawEvent(raw);
      return;
    }

    if (!isValidRawEventObject(raw)) {
      return;
    }

    if (this.supersededSessionIds.has(String(seqMeta.sessionId))) {
      this.replayDiagnostics.duplicateSequenceCount++;
      return;
    }

    if (this.nativeSessionId !== null && seqMeta.sessionId !== this.nativeSessionId) {
      this.switchToNewNativeSession(seqMeta.sessionId);
    }

    if (
      this.nativeSessionId === seqMeta.sessionId &&
      (seqMeta.sequence <= this.lastProcessedSequence ||
        this.recentSequenceCache.has(`${seqMeta.sessionId}:${seqMeta.sequence}`))
    ) {
      this.replayDiagnostics.duplicateSequenceCount++;
      return;
    }

    // Jalur cepat saat sudah sinkron (tanpa replay aktif, tanpa antrean tertunda, urutan tepat berikutnya)
    if (!this.replayInFlight && this.pendingSequencedEvents.length === 0 && this.pendingLegacyEvents.length === 0) {
      if (this.nativeSessionId === null) {
        if (seqMeta.sequence === 1 || typeof this.adapter.getEventsSince !== 'function') {
          this.nativeSessionId = seqMeta.sessionId;
          if (this.tryProcessLiveRawEvent(raw)) {
            this.lastProcessedSequence = seqMeta.sequence;
            this.recentSequenceCache.markAndCheckDuplicate(`${seqMeta.sessionId}:${seqMeta.sequence}`);
          }
          return;
        }
      } else if (seqMeta.sequence === this.lastProcessedSequence + 1) {
        if (this.tryProcessLiveRawEvent(raw)) {
          this.lastProcessedSequence = seqMeta.sequence;
          this.recentSequenceCache.markAndCheckDuplicate(`${seqMeta.sessionId}:${seqMeta.sequence}`);
        }
        return;
      }
    }

    if (
      !this.replayInFlight &&
      this.pendingSequencedEvents.length === 0 &&
      typeof this.adapter.getEventsSince === 'function'
    ) {
      const expectedNext = this.nativeSessionId === null ? 1 : this.lastProcessedSequence + 1;
      if (seqMeta.sequence > expectedNext) {
        this.replayDiagnostics.detectedGapCount++;
      }
    }

    this.enqueuePendingSequencedEvent({
      ...raw,
      nativeSequence: seqMeta.sequence,
      nativeSessionId: seqMeta.sessionId,
    });
    void this.scheduleDrain();
  }

  private enqueuePendingSequencedEvent(item: SequencedRawEvent): void {
    if (
      this.pendingSequencedEvents.some(
        (existing) =>
          existing.nativeSessionId === item.nativeSessionId &&
          existing.nativeSequence === item.nativeSequence
      )
    ) {
      this.replayDiagnostics.duplicateSequenceCount++;
      return;
    }

    let inserted = false;
    for (let i = 0; i < this.pendingSequencedEvents.length; i++) {
      if (item.nativeSequence < this.pendingSequencedEvents[i].nativeSequence) {
        this.pendingSequencedEvents.splice(i, 0, item);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.pendingSequencedEvents.push(item);
    }

    while (this.pendingSequencedEvents.length > MAX_PENDING_SEQUENCED_EVENTS) {
      const dropIndex = this.pendingSequencedEvents.findIndex(
        (candidate) =>
          candidate.method !== 'WebcastChatMessage' &&
          candidate.method !== 'WebcastEmoteChatMessage' &&
          candidate.method !== 'WebcastGiftMessage'
      );
      if (dropIndex >= 0) {
        this.pendingSequencedEvents.splice(dropIndex, 1);
      } else {
        this.pendingSequencedEvents.shift();
      }
      this.replayDiagnostics.unrecoveredGapCount++;
    }
  }

  private runInitialReplaySerialized(): Promise<void> {
    if (this.drainPromise) {
      return this.drainPromise;
    }
    const runGen = this.replayGeneration;
    this.replayInFlight = true;
    let promise: Promise<void> | null = null;
    promise = (async () => {
      try {
        await this.performInitialReplay(runGen);
        if (this.replayGeneration === runGen) {
          await this.drainPendingQueuesLoop(runGen);
        }
      } finally {
        if (this.replayGeneration === runGen) {
          this.replayInFlight = false;
        }
        if (promise && this.drainPromise === promise) {
          this.drainPromise = null;
        }
      }
    })();
    this.drainPromise = promise;
    return promise;
  }

  private scheduleDrain(): Promise<void> {
    if (this.drainPromise) {
      return this.drainPromise;
    }
    const runGen = this.replayGeneration;
    this.replayInFlight = true;
    let promise: Promise<void> | null = null;
    promise = (async () => {
      try {
        await this.drainPendingQueuesLoop(runGen);
      } finally {
        if (this.replayGeneration === runGen) {
          this.replayInFlight = false;
        }
        if (promise && this.drainPromise === promise) {
          this.drainPromise = null;
        }
      }
    })();
    this.drainPromise = promise;
    return promise;
  }

  private async syncMissedEventsFromNative(): Promise<void> {
    await this.waitForReplayIdle();
    if (this.pendingSequencedEvents.length > 0) {
      await this.scheduleDrain();
      return;
    }
    if (this.nativeSessionId === null || typeof this.adapter.getEventsSince !== 'function') {
      return;
    }
    const sessionId = this.nativeSessionId;
    const runGen = this.replayGeneration;
    this.replayInFlight = true;
    let promise: Promise<void> | null = null;
    promise = (async () => {
      try {
        await this.recoverGapForSequence(runGen, sessionId, Number.MAX_SAFE_INTEGER);
        if (this.replayGeneration === runGen) {
          await this.drainPendingQueuesLoop(runGen);
        }
      } finally {
        if (this.replayGeneration === runGen) {
          this.replayInFlight = false;
        }
        if (promise && this.drainPromise === promise) {
          this.drainPromise = null;
        }
      }
    })();
    this.drainPromise = promise;
    await promise;
  }

  private async performInitialReplay(gen: number): Promise<void> {
    if (typeof this.adapter.getEventsSince !== 'function') {
      return;
    }

    let requestedSessionId = 0;
    let afterSequence = 0;
    let restarts = 0;

    for (let page = 0; page < MAX_REPLAY_PAGES; page++) {
      if (gen !== this.replayGeneration) {
        return;
      }

      let snapshot: NativeTikTokReplaySnapshot | null = null;
      try {
        snapshot = await this.adapter.getEventsSince({
          sessionId: requestedSessionId,
          afterSequence,
          limit: MAX_REPLAY_PAGE_LIMIT,
        });
      } catch (err) {
        console.warn('Gagal melakukan initial replay TikTok LIVE:', err);
        return;
      }

      if (gen !== this.replayGeneration) {
        return;
      }
      if (!isValidReplaySnapshot(snapshot)) {
        return;
      }

      if (snapshot.overflow === true) {
        this.replayDiagnostics.replayOverflowCount++;
        console.warn(
          `Native replay buffer overflow saat initial recovery (sessionId=${snapshot.sessionId}, dropped=${snapshot.droppedCount}).`
        );
      }

      if (requestedSessionId === 0) {
        if (snapshot.sessionId > 0) {
          this.nativeSessionId = snapshot.sessionId;
          requestedSessionId = snapshot.sessionId;
        }
        const hasMismatchedEventSession =
          requestedSessionId > 0 &&
          snapshot.events.some((evt) => {
            const meta = getSequencedMeta(evt);
            return meta !== null && meta.sessionId !== requestedSessionId;
          });
        if (hasMismatchedEventSession && restarts < 1) {
          restarts++;
          afterSequence = 0;
          this.lastProcessedSequence = 0;
          this.recentSequenceCache.clear();
          this.replayNormalizer.reset();
          continue;
        }
      } else if (
        snapshot.sessionChanged === true ||
        (snapshot.sessionId > 0 && snapshot.sessionId !== requestedSessionId)
      ) {
        if (restarts < 1 && snapshot.sessionId > 0) {
          restarts++;
          if (this.nativeSessionId !== null && this.nativeSessionId !== snapshot.sessionId) {
            this.supersededSessionIds.markAndCheckDuplicate(String(this.nativeSessionId));
          }
          this.nativeSessionId = snapshot.sessionId;
          requestedSessionId = snapshot.sessionId;
          afterSequence = 0;
          this.lastProcessedSequence = 0;
          this.recentSequenceCache.clear();
          this.replayNormalizer.reset();
          continue;
        }
        return;
      }

      const targetSessionId = requestedSessionId > 0 ? requestedSessionId : snapshot.sessionId;
      const beforeCursor = this.lastProcessedSequence;
      const validEvents = this.extractOrderedReplayEvents(snapshot.events, targetSessionId, beforeCursor);

      for (const evt of validEvents) {
        if (gen !== this.replayGeneration) {
          return;
        }
        const seq = evt.nativeSequence;
        if (seq <= this.lastProcessedSequence || this.recentSequenceCache.has(`${targetSessionId}:${seq}`)) {
          continue;
        }
        if (!this.tryProcessReplayRawEvent(evt)) {
          return;
        }
        this.lastProcessedSequence = seq;
        this.recentSequenceCache.markAndCheckDuplicate(`${targetSessionId}:${seq}`);
      }

      const madeProgress = this.lastProcessedSequence > beforeCursor;
      if (snapshot.hasMore === true && madeProgress && targetSessionId > 0) {
        afterSequence = this.lastProcessedSequence;
        continue;
      }
      return;
    }
  }

  private async drainPendingQueuesLoop(gen: number): Promise<void> {
    while (gen === this.replayGeneration) {
      while (this.pendingLegacyEvents.length > 0 && gen === this.replayGeneration) {
        const legacyRaw = this.pendingLegacyEvents.shift()!;
        this.tryProcessLiveRawEvent(legacyRaw);
      }

      if (this.pendingSequencedEvents.length === 0 || gen !== this.replayGeneration) {
        return;
      }

      const head = this.pendingSequencedEvents[0];
      const headSession = head.nativeSessionId;
      const headSequence = head.nativeSequence;

      if (this.supersededSessionIds.has(String(headSession))) {
        this.pendingSequencedEvents.shift();
        this.replayDiagnostics.duplicateSequenceCount++;
        continue;
      }

      if (this.nativeSessionId !== null && headSession !== this.nativeSessionId) {
        this.switchToNewNativeSession(headSession);
        return;
      }

      if (this.nativeSessionId === headSession && headSequence <= this.lastProcessedSequence) {
        this.pendingSequencedEvents.shift();
        this.replayDiagnostics.duplicateSequenceCount++;
        continue;
      }

      const activeSessionId = this.nativeSessionId ?? headSession;
      const needsInitialSessionStartCheck = this.nativeSessionId === null && headSequence > 1;
      const needsGapRecovery =
        (this.nativeSessionId !== null && headSequence > this.lastProcessedSequence + 1) ||
        needsInitialSessionStartCheck;

      if (!needsGapRecovery || typeof this.adapter.getEventsSince !== 'function') {
        if (this.nativeSessionId === null) {
          this.nativeSessionId = headSession;
        }
        this.pendingSequencedEvents.shift();
        if (this.tryProcessLiveRawEvent(head)) {
          this.lastProcessedSequence = headSequence;
          this.recentSequenceCache.markAndCheckDuplicate(`${headSession}:${headSequence}`);
        }
        continue;
      }

      const recoveryResult = await this.recoverGapForSequence(gen, activeSessionId, headSequence);
      if (gen !== this.replayGeneration || recoveryResult.sessionChanged) {
        return;
      }

      if (this.nativeSessionId === null) {
        this.nativeSessionId = activeSessionId;
      }

      if (!recoveryResult.canProceed) {
        const newHead = this.pendingSequencedEvents[0];
        // Jika event berurutan yang hilang kebetulan tiba di antrean sementara replay gagal, lanjutkan drain.
        if (
          newHead &&
          newHead.nativeSessionId === activeSessionId &&
          newHead.nativeSequence === this.lastProcessedSequence + 1
        ) {
          continue;
        }
        this.replayDiagnostics.unrecoveredGapCount++;
        return;
      }

      // Proses head jika masih menjadi urutan berikutnya (atau verifikasi awal sesi)
      const currentHead = this.pendingSequencedEvents[0];
      if (currentHead && currentHead.nativeSessionId === headSession && currentHead.nativeSequence === headSequence) {
        this.pendingSequencedEvents.shift();
        if (this.tryProcessLiveRawEvent(currentHead)) {
          this.lastProcessedSequence = headSequence;
          this.recentSequenceCache.markAndCheckDuplicate(`${headSession}:${headSequence}`);
        }
      }
    }
  }

  private async recoverGapForSequence(
    gen: number,
    sessionId: number,
    targetSequence: number
  ): Promise<{ canProceed: boolean; sessionChanged: boolean }> {
    if (typeof this.adapter.getEventsSince !== 'function') {
      return { canProceed: this.lastProcessedSequence === 0, sessionChanged: false };
    }

    for (let page = 0; page < MAX_REPLAY_PAGES; page++) {
      if (gen !== this.replayGeneration) {
        return { canProceed: false, sessionChanged: false };
      }

      const beforeCursor = this.lastProcessedSequence;
      let snapshot: NativeTikTokReplaySnapshot | null = null;
      try {
        snapshot = await this.adapter.getEventsSince({
          sessionId,
          afterSequence: beforeCursor,
          limit: MAX_REPLAY_PAGE_LIMIT,
        });
      } catch (err) {
        console.warn('Gagal memulihkan gap event TikTok LIVE:', err);
        return { canProceed: false, sessionChanged: false };
      }

      if (gen !== this.replayGeneration) {
        return { canProceed: false, sessionChanged: false };
      }
      if (!isValidReplaySnapshot(snapshot)) {
        return { canProceed: false, sessionChanged: false };
      }

      if (snapshot.overflow === true) {
        this.replayDiagnostics.replayOverflowCount++;
        console.warn(
          `Native replay buffer overflow saat gap recovery (sessionId=${snapshot.sessionId}, dropped=${snapshot.droppedCount}).`
        );
      }

      if (snapshot.sessionChanged === true || (snapshot.sessionId > 0 && snapshot.sessionId !== sessionId)) {
        const nextSessionId = snapshot.sessionId > 0 ? snapshot.sessionId : null;
        if (this.nativeSessionId !== null && this.nativeSessionId !== nextSessionId) {
          this.supersededSessionIds.markAndCheckDuplicate(String(this.nativeSessionId));
        }
        this.replayGeneration++;
        this.nativeSessionId = nextSessionId;
        this.lastProcessedSequence = 0;
        this.pendingSequencedEvents = [];
        this.recentSequenceCache.clear();
        this.replayNormalizer.reset();

        if (nextSessionId !== null) {
          const newSessionEvents = this.extractOrderedReplayEvents(snapshot.events, nextSessionId, 0);
          for (const evt of newSessionEvents) {
            if (!this.tryProcessReplayRawEvent(evt)) {
              break;
            }
            this.lastProcessedSequence = evt.nativeSequence;
            this.recentSequenceCache.markAndCheckDuplicate(`${nextSessionId}:${evt.nativeSequence}`);
          }
        }
        return { canProceed: false, sessionChanged: true };
      }

      const orderedCandidates = this.extractOrderedReplayEvents(
        snapshot.events,
        sessionId,
        beforeCursor,
        targetSequence
      );

      for (const evt of orderedCandidates) {
        const seq = evt.nativeSequence;
        if (seq <= this.lastProcessedSequence || this.recentSequenceCache.has(`${sessionId}:${seq}`)) {
          continue;
        }
        if (!this.tryProcessReplayRawEvent(evt)) {
          return { canProceed: false, sessionChanged: false };
        }
        this.lastProcessedSequence = seq;
        this.recentSequenceCache.markAndCheckDuplicate(`${sessionId}:${seq}`);
      }

      if (this.nativeSessionId === null) {
        this.nativeSessionId = sessionId;
      }

      // Awal sesi eksplisit baru terverifikasi di NativeTikTokEventBuffer (sequence global dimulai > 1)
      if (
        targetSequence < Number.MAX_SAFE_INTEGER &&
        beforeCursor === 0 &&
        snapshot.overflow !== true &&
        typeof snapshot.oldestSequence === 'number' &&
        snapshot.oldestSequence === targetSequence
      ) {
        return { canProceed: true, sessionChanged: false };
      }

      if (targetSequence < Number.MAX_SAFE_INTEGER && this.lastProcessedSequence >= targetSequence - 1) {
        return { canProceed: true, sessionChanged: false };
      }

      const madeProgress = this.lastProcessedSequence > beforeCursor;
      if (snapshot.hasMore === true && madeProgress) {
        continue;
      }

      return {
        canProceed: targetSequence === Number.MAX_SAFE_INTEGER,
        sessionChanged: false,
      };
    }

    return {
      canProceed: targetSequence === Number.MAX_SAFE_INTEGER,
      sessionChanged: false,
    };
  }

  private extractOrderedReplayEvents(
    rawEvents: unknown[],
    targetSessionId: number,
    minExclusiveSequence: number,
    maxExclusiveSequence?: number
  ): SequencedRawEvent[] {
    const filtered: SequencedRawEvent[] = [];
    for (const item of rawEvents) {
      if (!isValidRawEventObject(item)) {
        continue;
      }
      const meta = getSequencedMeta(item);
      if (!meta || meta.sessionId !== targetSessionId) {
        continue;
      }
      if (meta.sequence <= minExclusiveSequence) {
        continue;
      }
      if (maxExclusiveSequence !== undefined && meta.sequence >= maxExclusiveSequence) {
        continue;
      }
      filtered.push({
        ...item,
        nativeSequence: meta.sequence,
        nativeSessionId: meta.sessionId,
      });
    }
    filtered.sort((a, b) => a.nativeSequence - b.nativeSequence);
    return filtered;
  }

  private tryProcessLiveRawEvent(raw: NativeTikTokRawEventPayload): boolean {
    if (!isValidRawEventObject(raw)) {
      return false;
    }
    try {
      const outcome = this.normalizer.normalize(raw);
      if (outcome.ignoredReason === 'invalid_payload' || outcome.ignoredReason === 'missing_method') {
        return false;
      }

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
      if (outcome.giftComboUpdate) {
        this.updateToBus(outcome.giftComboUpdate);
      }
      return true;
    } catch (err) {
      console.warn('Gagal memproses event live TikTok:', err);
      return false;
    }
  }

  private tryProcessReplayRawEvent(raw: NativeTikTokRawEventPayload): boolean {
    if (!isValidRawEventObject(raw)) {
      return false;
    }
    try {
      const outcome = this.replayNormalizer.normalize(raw);
      if (outcome.ignoredReason === 'invalid_payload' || outcome.ignoredReason === 'missing_method') {
        return false;
      }
      if (outcome.event) {
        this.replayToBus(outcome.event);
        this.replayDiagnostics.replayedEventCount++;
      } else if (outcome.giftComboUpdate) {
        this.replayUpdateToBus(outcome.giftComboUpdate);
        this.replayDiagnostics.replayedEventCount++;
      }
      return true;
    } catch (err) {
      console.warn('Gagal memproses event replay TikTok:', err);
      return false;
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

