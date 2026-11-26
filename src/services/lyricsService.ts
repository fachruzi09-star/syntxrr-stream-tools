// Lyrics Service & LRC Parser for SYNTXRR STREAM
// Uses public read-only LRCLIB API (https://lrclib.net/api/get) with in-memory cache only.

import type { AudioEngineState } from './localAudioEngine';
import type { SongRequestState } from './songRequestEngine';

export const LRCLIB_API_ENDPOINT = 'https://lrclib.net/api/get';
export const LRCLIB_USER_AGENT = 'SYNTXRR STREAM/1.0.0 (https://github.com/syntxrr/syntxrr-stream)';

export interface LrcLine {
  timeSec: number;
  text: string;
}

export interface ParsedLrcResult {
  lines: LrcLine[];
  offsetMs: number;
  hasSyncedLines: boolean;
}

export interface LyricsLookupQuery {
  trackName: string;
  artistName?: string;
  albumName?: string;
  durationSec?: number;
}

export type LyricsLookupStatus =
  | 'synced'
  | 'unsynced'
  | 'instrumental'
  | 'not_found'
  | 'rate_limited'
  | 'service_unavailable'
  | 'error'
  | 'aborted';

export interface LyricsLookupResult {
  status: LyricsLookupStatus;
  source: 'lrclib';
  trackName: string;
  artistName: string;
  lines: LrcLine[];
  plainText: string;
  synced: boolean;
  instrumental: boolean;
  attribution?: 'LRCLIB';
  httpStatus?: number;
  retryAfterSec?: number;
  errorMessage?: string;
}

export interface FetchLyricsOptions {
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  nowFn?: () => number;
}

export interface ActiveLyricsPlaybackSource {
  origin: 'song_request' | 'local_audio';
  title: string;
  artist: string;
  album?: string;
  positionSec: number;
  durationSec?: number;
  isPlaying: boolean;
}

export type LyricsDisplayStatus =
  | 'idle'
  | 'manual_synced'
  | 'manual_unsynced'
  | 'searching'
  | 'synced'
  | 'unsynced'
  | 'instrumental'
  | 'not_found'
  | 'rate_limited'
  | 'error'
  | 'auto_disabled';

export interface LyricsRenderModel {
  status: LyricsDisplayStatus;
  statusLabel: string;
  trackLabel: string;
  primaryText: string;
  secondaryText: string | null;
  synced: boolean;
  usesLrclibAttribution: boolean;
}

export interface BuildLyricsRenderModelParams {
  manualInput?: string | null;
  autoFetchEnabled?: boolean;
  playback: ActiveLyricsPlaybackSource | null;
  lookupResult: LyricsLookupResult | null;
  isLoading: boolean;
}

interface InFlightLyricsEntry {
  promise: Promise<LyricsLookupResult>;
  controller: AbortController;
  activeCallers: number;
}

const memoryCache = new Map<string, LyricsLookupResult>();
const inFlightRequests = new Map<string, InFlightLyricsEntry>();
let rateLimitedUntilMs = 0;

const LRC_TIMESTAMP_BRACKET_PATTERN = /\[([^\]]+)\]/g;
const LRC_TIME_PATTERN = /^(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?$/;
const LRC_OFFSET_PATTERN = /^offset\s*:\s*([+-]?\d+)$/i;

function normalizeMetaPart(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDurationSec(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : undefined;
}

export function buildLyricsLookupKey(query: LyricsLookupQuery): string {
  const track = normalizeMetaPart(query.trackName).toLowerCase();
  if (!track) return '';
  const artist = normalizeMetaPart(query.artistName).toLowerCase();
  const album = normalizeMetaPart(query.albumName).toLowerCase();
  const duration = normalizeDurationSec(query.durationSec);
  return `${track}::${artist}::${album}::${duration ?? ''}`;
}

/**
 * Parses a single LRC timestamp body (without brackets), e.g. "01:23.45" -> 83.45 seconds.
 * Rejects invalid minutes/seconds (e.g. seconds >= 60 or non-numeric segments).
 */
export function parseLrcTimestamp(rawTagBody: string): number | null {
  if (typeof rawTagBody !== 'string') return null;
  const trimmed = rawTagBody.trim();
  const match = LRC_TIME_PATTERN.exec(trimmed);
  if (!match) return null;

  const minutes = Number.parseInt(match[1], 10);
  const seconds = Number.parseInt(match[2], 10);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds < 0 || seconds >= 60) {
    return null;
  }

  let fractionSec = 0;
  if (match[3]) {
    const fracRaw = match[3];
    const divisor = Math.pow(10, fracRaw.length);
    fractionSec = Number.parseInt(fracRaw, 10) / divisor;
  }

  const totalSec = minutes * 60 + seconds + fractionSec;
  return Number.isFinite(totalSec) && totalSec >= 0 ? totalSec : null;
}

/**
 * Pure LRC parser supporting [mm:ss.xx] timestamps, multiple timestamps per line,
 * [offset:+/-ms] global adjustment (+ shifts timestamps later, - shifts earlier, clamped >= 0),
 * invalid timestamp skipping, and stable chronological sorting.
 */
export function parseLrc(rawText: string): ParsedLrcResult {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { lines: [], offsetMs: 0, hasSyncedLines: false };
  }

  const rawLines = rawText.split(/\r?\n/);
  let offsetMs = 0;

  // First pass: capture [offset:...] metadata so lines before or after the tag adjust consistently.
  for (const rawLine of rawLines) {
    let match: RegExpExecArray | null;
    LRC_TIMESTAMP_BRACKET_PATTERN.lastIndex = 0;
    while ((match = LRC_TIMESTAMP_BRACKET_PATTERN.exec(rawLine)) !== null) {
      const offsetMatch = LRC_OFFSET_PATTERN.exec(match[1].trim());
      if (offsetMatch) {
        const parsedOffset = Number.parseInt(offsetMatch[1], 10);
        if (Number.isFinite(parsedOffset)) {
          offsetMs = parsedOffset;
        }
      }
    }
  }

  const offsetSec = offsetMs / 1000;
  const parsedEntries: Array<LrcLine & { order: number }> = [];
  let orderCounter = 0;

  for (const rawLine of rawLines) {
    if (!rawLine.trim()) continue;

    const timestamps: number[] = [];
    let lastTagEnd = 0;
    let hasBrackets = false;
    let match: RegExpExecArray | null;
    LRC_TIMESTAMP_BRACKET_PATTERN.lastIndex = 0;

    while ((match = LRC_TIMESTAMP_BRACKET_PATTERN.exec(rawLine)) !== null) {
      hasBrackets = true;
      const parsedTime = parseLrcTimestamp(match[1]);
      if (parsedTime !== null) {
        timestamps.push(parsedTime);
      }
      lastTagEnd = match.index + match[0].length;
    }

    if (!hasBrackets || timestamps.length === 0) {
      continue;
    }

    const lyricText = rawLine.slice(lastTagEnd).trim();
    for (const rawTime of timestamps) {
      const adjustedTime = Math.max(0, Number((rawTime + offsetSec).toFixed(3)));
      parsedEntries.push({
        timeSec: adjustedTime,
        text: lyricText,
        order: orderCounter++,
      });
    }
  }

  parsedEntries.sort((a, b) => a.timeSec - b.timeSec || a.order - b.order);

  const lines: LrcLine[] = parsedEntries.map(({ timeSec, text }) => ({ timeSec, text }));
  return {
    lines,
    offsetMs,
    hasSyncedLines: lines.length > 0,
  };
}

/**
 * Selects the active and next lyric line for a given playback position in seconds.
 */
export function findActiveLyricLines(
  lines: readonly LrcLine[],
  positionSec: number,
): {
  activeIndex: number;
  activeLine: LrcLine | null;
  nextLine: LrcLine | null;
} {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { activeIndex: -1, activeLine: null, nextLine: null };
  }

  const safePos =
    typeof positionSec === 'number' && Number.isFinite(positionSec) && positionSec >= 0
      ? positionSec
      : 0;

  let activeIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].timeSec <= safePos) {
      activeIndex = i;
    } else {
      break;
    }
  }

  return {
    activeIndex,
    activeLine: activeIndex >= 0 ? lines[activeIndex] : null,
    nextLine: activeIndex + 1 < lines.length ? lines[activeIndex + 1] : null,
  };
}

export function resolveManualLyricsInput(rawText: string | null | undefined):
  | { mode: 'empty' }
  | { mode: 'manual_synced'; lines: LrcLine[]; offsetMs: number }
  | { mode: 'manual_unsynced'; plainText: string } {
  if (typeof rawText !== 'string') {
    return { mode: 'empty' };
  }
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { mode: 'empty' };
  }

  const parsed = parseLrc(trimmed);
  if (parsed.hasSyncedLines) {
    return {
      mode: 'manual_synced',
      lines: parsed.lines,
      offsetMs: parsed.offsetMs,
    };
  }

  return {
    mode: 'manual_unsynced',
    plainText: trimmed,
  };
}

export function parseRetryAfterSeconds(headerValue: string | null, nowMs = Date.now()): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const secs = Number.parseInt(trimmed, 10);
    return Number.isFinite(secs) && secs >= 0 ? secs : undefined;
  }

  const targetMs = Date.parse(trimmed);
  if (!Number.isFinite(targetMs)) return undefined;
  const diffSec = Math.ceil((targetMs - nowMs) / 1000);
  return Math.max(0, diffSec);
}

function buildAbortedResult(trackName: string, artistName: string): LyricsLookupResult {
  return {
    status: 'aborted',
    source: 'lrclib',
    trackName,
    artistName,
    lines: [],
    plainText: '',
    synced: false,
    instrumental: false,
  };
}

function buildRateLimitedResult(
  trackName: string,
  artistName: string,
  httpStatus: number,
  retryAfterSec?: number,
): LyricsLookupResult {
  return {
    status: httpStatus === 503 ? 'service_unavailable' : 'rate_limited',
    source: 'lrclib',
    trackName,
    artistName,
    lines: [],
    plainText: '',
    synced: false,
    instrumental: false,
    httpStatus,
    retryAfterSec,
    errorMessage:
      httpStatus === 503
        ? 'Layanan LRCLIB sedang sibuk (503). Coba lagi nanti.'
        : 'Batas permintaan LRCLIB tercapai (429). Menunggu jeda Retry-After.',
  };
}

function createLrclibRequestUrl(query: LyricsLookupQuery): string {
  const url = new URL(LRCLIB_API_ENDPOINT);
  url.searchParams.set('track_name', normalizeMetaPart(query.trackName));
  url.searchParams.set('artist_name', normalizeMetaPart(query.artistName));

  const albumName = normalizeMetaPart(query.albumName);
  if (albumName) {
    url.searchParams.set('album_name', albumName);
  }

  const durationSec = normalizeDurationSec(query.durationSec);
  if (durationSec !== undefined) {
    url.searchParams.set('duration', String(durationSec));
  }

  return url.toString();
}

export function getCachedLyricsLookup(lookupKey: string): LyricsLookupResult | null {
  if (!lookupKey) return null;
  return memoryCache.get(lookupKey) ?? null;
}

function waitWithSignal(
  sharedPromise: Promise<LyricsLookupResult>,
  trackName: string,
  artistName: string,
  callerSignal: AbortSignal | undefined,
  onCallerAbort: () => void,
): Promise<LyricsLookupResult> {
  if (!callerSignal) {
    return sharedPromise;
  }
  if (callerSignal.aborted) {
    onCallerAbort();
    return Promise.resolve(buildAbortedResult(trackName, artistName));
  }

  return new Promise<LyricsLookupResult>((resolve) => {
    let settled = false;
    const handleAbort = () => {
      if (settled) return;
      settled = true;
      onCallerAbort();
      resolve(buildAbortedResult(trackName, artistName));
    };

    callerSignal.addEventListener('abort', handleAbort, { once: true });
    sharedPromise.then(
      (result) => {
        if (settled) return;
        settled = true;
        callerSignal.removeEventListener('abort', handleAbort);
        resolve(result);
      },
      () => {
        if (settled) return;
        settled = true;
        callerSignal.removeEventListener('abort', handleAbort);
        resolve({
          status: 'error',
          source: 'lrclib',
          trackName,
          artistName,
          lines: [],
          plainText: '',
          synced: false,
          instrumental: false,
          errorMessage: 'Gagal mengambil lirik dari LRCLIB.',
        });
      },
    );
  });
}

export async function fetchLyricsFromLrclib(
  query: LyricsLookupQuery,
  options: FetchLyricsOptions = {},
): Promise<LyricsLookupResult> {
  const trackName = normalizeMetaPart(query.trackName);
  const artistName = normalizeMetaPart(query.artistName);
  const fetchFn = options.fetchFn ?? fetch;
  const nowFn = options.nowFn ?? Date.now;
  const callerSignal = options.signal;

  if (callerSignal?.aborted) {
    return buildAbortedResult(trackName, artistName);
  }

  if (!trackName) {
    return {
      status: 'not_found',
      source: 'lrclib',
      trackName: '',
      artistName,
      lines: [],
      plainText: '',
      synced: false,
      instrumental: false,
    };
  }

  const cacheKey = buildLyricsLookupKey(query);
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const nowMs = nowFn();
  if (nowMs < rateLimitedUntilMs) {
    const remainingSec = Math.max(1, Math.ceil((rateLimitedUntilMs - nowMs) / 1000));
    return buildRateLimitedResult(trackName, artistName, 429, remainingSec);
  }

  const existingInFlight = inFlightRequests.get(cacheKey);
  if (existingInFlight) {
    existingInFlight.activeCallers += 1;
    let released = false;
    return waitWithSignal(existingInFlight.promise, trackName, artistName, callerSignal, () => {
      if (released) return;
      released = true;
      existingInFlight.activeCallers = Math.max(0, existingInFlight.activeCallers - 1);
      if (existingInFlight.activeCallers === 0) {
        existingInFlight.controller.abort();
        inFlightRequests.delete(cacheKey);
      }
    });
  }

  const requestController = new AbortController();
  const entry: InFlightLyricsEntry = {
    controller: requestController,
    activeCallers: 1,
    promise: Promise.resolve(buildAbortedResult(trackName, artistName)),
  };
  inFlightRequests.set(cacheKey, entry);

  entry.promise = (async (): Promise<LyricsLookupResult> => {
      try {
        const requestUrl = createLrclibRequestUrl(query);
        const response = await fetchFn(requestUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-User-Agent': LRCLIB_USER_AGENT,
          },
          signal: requestController.signal,
        });

        if (response.status === 404) {
          const notFound: LyricsLookupResult = {
            status: 'not_found',
            source: 'lrclib',
            trackName,
            artistName,
            lines: [],
            plainText: '',
            synced: false,
            instrumental: false,
            httpStatus: 404,
          };
          memoryCache.set(cacheKey, notFound);
          return notFound;
        }

        if (response.status === 429 || response.status === 503) {
          const retryAfterSec = parseRetryAfterSeconds(
            response.headers.get('retry-after'),
            nowFn(),
          );
          const cooldownSec = retryAfterSec !== undefined ? retryAfterSec : 15;
          rateLimitedUntilMs = Math.max(rateLimitedUntilMs, nowFn() + cooldownSec * 1000);
          return buildRateLimitedResult(trackName, artistName, response.status, retryAfterSec);
        }

        if (!response.ok) {
          return {
            status: 'error',
            source: 'lrclib',
            trackName,
            artistName,
            lines: [],
            plainText: '',
            synced: false,
            instrumental: false,
            httpStatus: response.status,
            errorMessage: `LRCLIB merespons status HTTP ${response.status}.`,
          };
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.toLowerCase().includes('application/json')) {
          return {
            status: 'error',
            source: 'lrclib',
            trackName,
            artistName,
            lines: [],
            plainText: '',
            synced: false,
            instrumental: false,
            httpStatus: response.status,
            errorMessage: 'Format respons LRCLIB tidak valid (bukan JSON).',
          };
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          return {
            status: 'error',
            source: 'lrclib',
            trackName,
            artistName,
            lines: [],
            plainText: '',
            synced: false,
            instrumental: false,
            httpStatus: response.status,
            errorMessage: 'Gagal membaca data JSON dari LRCLIB.',
          };
        }

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          return {
            status: 'error',
            source: 'lrclib',
            trackName,
            artistName,
            lines: [],
            plainText: '',
            synced: false,
            instrumental: false,
            httpStatus: response.status,
            errorMessage: 'Struktur respons LRCLIB tidak dikenali.',
          };
        }

        const record = payload as Record<string, unknown>;
        const resolvedTrackName =
          typeof record.trackName === 'string' && record.trackName.trim()
            ? record.trackName.trim()
            : trackName;
        const resolvedArtistName =
          typeof record.artistName === 'string' && record.artistName.trim()
            ? record.artistName.trim()
            : artistName;

        if (record.instrumental === true) {
          const instrumentalResult: LyricsLookupResult = {
            status: 'instrumental',
            source: 'lrclib',
            trackName: resolvedTrackName,
            artistName: resolvedArtistName,
            lines: [],
            plainText: '',
            synced: false,
            instrumental: true,
            attribution: 'LRCLIB',
            httpStatus: response.status,
          };
          memoryCache.set(cacheKey, instrumentalResult);
          return instrumentalResult;
        }

        const syncedRaw = typeof record.syncedLyrics === 'string' ? record.syncedLyrics : '';
        const plainRaw = typeof record.plainLyrics === 'string' ? record.plainLyrics.trim() : '';

        if (syncedRaw.trim()) {
          const parsedSynced = parseLrc(syncedRaw);
          if (parsedSynced.hasSyncedLines) {
            const syncedResult: LyricsLookupResult = {
              status: 'synced',
              source: 'lrclib',
              trackName: resolvedTrackName,
              artistName: resolvedArtistName,
              lines: parsedSynced.lines,
              plainText: plainRaw,
              synced: true,
              instrumental: false,
              attribution: 'LRCLIB',
              httpStatus: response.status,
            };
            memoryCache.set(cacheKey, syncedResult);
            return syncedResult;
          }
        }

        if (plainRaw) {
          const unsyncedResult: LyricsLookupResult = {
            status: 'unsynced',
            source: 'lrclib',
            trackName: resolvedTrackName,
            artistName: resolvedArtistName,
            lines: [],
            plainText: plainRaw,
            synced: false,
            instrumental: false,
            attribution: 'LRCLIB',
            httpStatus: response.status,
          };
          memoryCache.set(cacheKey, unsyncedResult);
          return unsyncedResult;
        }

        const emptyNotFound: LyricsLookupResult = {
          status: 'not_found',
          source: 'lrclib',
          trackName: resolvedTrackName,
          artistName: resolvedArtistName,
          lines: [],
          plainText: '',
          synced: false,
          instrumental: false,
          httpStatus: response.status,
        };
        memoryCache.set(cacheKey, emptyNotFound);
        return emptyNotFound;
      } catch (error) {
        if (requestController.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
          return buildAbortedResult(trackName, artistName);
        }
        return {
          status: 'error',
          source: 'lrclib',
          trackName,
          artistName,
          lines: [],
          plainText: '',
          synced: false,
          instrumental: false,
          errorMessage: 'Gagal terhubung ke server lirik LRCLIB.',
        };
      } finally {
        if (inFlightRequests.get(cacheKey) === entry) {
          inFlightRequests.delete(cacheKey);
        }
      }
    })();

  let released = false;
  return waitWithSignal(entry.promise, trackName, artistName, callerSignal, () => {
    if (released) return;
    released = true;
    entry.activeCallers = Math.max(0, entry.activeCallers - 1);
    if (entry.activeCallers === 0) {
      entry.controller.abort();
      if (inFlightRequests.get(cacheKey) === entry) {
        inFlightRequests.delete(cacheKey);
      }
    }
  });
}

/**
 * Selects the active audio source for Lyrics sync, prioritizing whichever source is actively playing,
 * preserving active line when paused, and returning null once playback has stopped/completed.
 */
export function resolveActiveLyricsPlaybackSource(
  srState: Pick<
    SongRequestState,
    'currentTrack' | 'currentTimeSec' | 'durationSec' | 'playbackStatus' | 'isPlaying'
  >,
  localAudioState: Pick<
    AudioEngineState,
    'currentTrackId' | 'title' | 'artist' | 'currentTime' | 'duration' | 'isPlaying' | 'isLoading' | 'error'
  >,
): ActiveLyricsPlaybackSource | null {
  const srTrack =
    srState.currentTrack &&
    srState.playbackStatus !== 'idle' &&
    srState.playbackStatus !== 'completed' &&
    srState.playbackStatus !== 'stopped' &&
    srState.playbackStatus !== 'error'
      ? srState.currentTrack
      : null;
  const srPlaying = Boolean(
    srTrack && (srState.isPlaying || srState.playbackStatus === 'playing'),
  );

  const localTitle = normalizeMetaPart(localAudioState.title);
  const localHasTrack = Boolean(
    localAudioState.currentTrackId && localTitle && !localAudioState.error,
  );
  const localPlaying = Boolean(localHasTrack && localAudioState.isPlaying);
  const localPaused = Boolean(
    localHasTrack &&
      !localAudioState.isPlaying &&
      (localAudioState.currentTime > 0 || localAudioState.isLoading),
  );

  if (srPlaying && srTrack) {
    return {
      origin: 'song_request',
      title: srTrack.title,
      artist: srTrack.artist,
      album: srTrack.album,
      positionSec: Math.max(0, Number.isFinite(srState.currentTimeSec) ? srState.currentTimeSec : 0),
      durationSec: normalizeDurationSec(srState.durationSec || srTrack.durationSec),
      isPlaying: true,
    };
  }

  if (localPlaying) {
    return {
      origin: 'local_audio',
      title: localTitle,
      artist: normalizeMetaPart(localAudioState.artist),
      positionSec: Math.max(
        0,
        Number.isFinite(localAudioState.currentTime) ? localAudioState.currentTime : 0,
      ),
      durationSec: normalizeDurationSec(localAudioState.duration),
      isPlaying: true,
    };
  }

  if (srTrack) {
    return {
      origin: 'song_request',
      title: srTrack.title,
      artist: srTrack.artist,
      album: srTrack.album,
      positionSec: Math.max(0, Number.isFinite(srState.currentTimeSec) ? srState.currentTimeSec : 0),
      durationSec: normalizeDurationSec(srState.durationSec || srTrack.durationSec),
      isPlaying: false,
    };
  }

  if (localPaused) {
    return {
      origin: 'local_audio',
      title: localTitle,
      artist: normalizeMetaPart(localAudioState.artist),
      positionSec: Math.max(
        0,
        Number.isFinite(localAudioState.currentTime) ? localAudioState.currentTime : 0,
      ),
      durationSec: normalizeDurationSec(localAudioState.duration),
      isPlaying: false,
    };
  }

  return null;
}

function findNextNonEmptyPreview(
  lines: readonly LrcLine[],
  activeIndex: number,
  immediateNext: LrcLine | null,
): string | null {
  if (immediateNext && immediateNext.text) {
    return immediateNext.text;
  }
  for (let i = Math.max(0, activeIndex + 1); i < lines.length; i += 1) {
    if (lines[i].text) {
      return lines[i].text;
    }
  }
  return null;
}

export function buildLyricsRenderModel(params: BuildLyricsRenderModelParams): LyricsRenderModel {
  const { manualInput, autoFetchEnabled = true, playback, lookupResult, isLoading } = params;

  const trackLabel = playback
    ? `${playback.title}${playback.artist ? ` — ${playback.artist}` : ''}`
    : 'Lyrics Widget (Menunggu lagu aktif)';

  const manual = resolveManualLyricsInput(manualInput);
  if (manual.mode === 'manual_synced') {
    const position = playback ? playback.positionSec : 0;
    const { activeIndex, activeLine, nextLine } = findActiveLyricLines(manual.lines, position);
    const primaryText = playback
      ? activeLine
        ? activeLine.text || '♪ … ♪'
        : '♪ Intro ♪'
      : manual.lines[0]?.text || '♪ LRC Manual Siap ♪';
    const secondaryText = playback
      ? findNextNonEmptyPreview(manual.lines, activeIndex, nextLine)
      : manual.lines[1]?.text || null;

    return {
      status: 'manual_synced',
      statusLabel: 'Manual · Tersinkron',
      trackLabel,
      primaryText,
      secondaryText,
      synced: true,
      usesLrclibAttribution: false,
    };
  }

  if (manual.mode === 'manual_unsynced') {
    return {
      status: 'manual_unsynced',
      statusLabel: 'Manual · Tanpa Sinkronisasi',
      trackLabel,
      primaryText: manual.plainText,
      secondaryText: null,
      synced: false,
      usesLrclibAttribution: false,
    };
  }

  if (!playback) {
    return {
      status: 'idle',
      statusLabel: 'Menunggu Lagu',
      trackLabel,
      primaryText: 'Belum ada lagu aktif dari Song Request / Audio.',
      secondaryText: null,
      synced: false,
      usesLrclibAttribution: false,
    };
  }

  if (autoFetchEnabled === false) {
    return {
      status: 'auto_disabled',
      statusLabel: 'Pencarian Online Nonaktif',
      trackLabel,
      primaryText: 'Pencarian lirik online dinonaktifkan. Isi LRC/teks manual di Inspector.',
      secondaryText: null,
      synced: false,
      usesLrclibAttribution: false,
    };
  }

  if (isLoading && !lookupResult) {
    return {
      status: 'searching',
      statusLabel: 'Mencari Lirik…',
      trackLabel,
      primaryText: 'Mencari lirik lagu aktif di LRCLIB…',
      secondaryText: null,
      synced: false,
      usesLrclibAttribution: false,
    };
  }

  if (lookupResult?.status === 'synced') {
    const { activeIndex, activeLine, nextLine } = findActiveLyricLines(
      lookupResult.lines,
      playback.positionSec,
    );
    return {
      status: 'synced',
      statusLabel: 'Tersinkron',
      trackLabel,
      primaryText: activeLine ? activeLine.text || '♪ … ♪' : '♪ Intro ♪',
      secondaryText: findNextNonEmptyPreview(lookupResult.lines, activeIndex, nextLine),
      synced: true,
      usesLrclibAttribution: true,
    };
  }

  if (lookupResult?.status === 'unsynced') {
    return {
      status: 'unsynced',
      statusLabel: 'Tanpa Sinkronisasi',
      trackLabel,
      primaryText: lookupResult.plainText,
      secondaryText: null,
      synced: false,
      usesLrclibAttribution: true,
    };
  }

  if (lookupResult?.status === 'instrumental') {
    return {
      status: 'instrumental',
      statusLabel: 'Instrumental',
      trackLabel,
      primaryText: '♪ Lagu instrumental (tanpa lirik) ♪',
      secondaryText: null,
      synced: false,
      usesLrclibAttribution: true,
    };
  }

  if (lookupResult?.status === 'not_found') {
    return {
      status: 'not_found',
      statusLabel: 'Tidak Ditemukan',
      trackLabel,
      primaryText: 'Lirik tidak ditemukan untuk lagu ini.',
      secondaryText: null,
      synced: false,
      usesLrclibAttribution: false,
    };
  }

  if (lookupResult?.status === 'rate_limited' || lookupResult?.status === 'service_unavailable') {
    return {
      status: 'rate_limited',
      statusLabel: lookupResult.status === 'service_unavailable' ? 'LRCLIB Sibuk' : 'Batas Request',
      trackLabel,
      primaryText: lookupResult.errorMessage || 'Layanan LRCLIB sedang membatasi permintaan.',
      secondaryText: null,
      synced: false,
      usesLrclibAttribution: false,
    };
  }

  if (lookupResult?.status === 'error') {
    return {
      status: 'error',
      statusLabel: 'Gagal Koneksi',
      trackLabel,
      primaryText: lookupResult.errorMessage || 'Gagal terhubung ke LRCLIB.',
      secondaryText: null,
      synced: false,
      usesLrclibAttribution: false,
    };
  }

  return {
    status: 'searching',
    statusLabel: 'Mencari Lirik…',
    trackLabel,
    primaryText: 'Menyiapkan pencarian lirik LRCLIB…',
    secondaryText: null,
    synced: false,
    usesLrclibAttribution: false,
  };
}

/** @internal Clears in-memory cache, in-flight map, and rate-limit cooldown for unit tests only. */
export function __resetLyricsServiceForTests(): void {
  for (const entry of inFlightRequests.values()) {
    entry.controller.abort();
  }
  inFlightRequests.clear();
  memoryCache.clear();
  rateLimitedUntilMs = 0;
}
