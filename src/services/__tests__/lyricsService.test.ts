// Unit tests for A2.10.6.1 Lyrics Integration & Playback Synchronization
// Run with: bun run src/services/__tests__/lyricsService.test.ts

import {
  LRCLIB_USER_AGENT,
  __resetLyricsServiceForTests,
  buildLyricsRenderModel,
  fetchLyricsFromLrclib,
  findActiveLyricLines,
  parseLrc,
  parseLrcTimestamp,
  resolveActiveLyricsPlaybackSource,
  type LyricsLookupResult,
} from '../lyricsService';
import type { AudioEngineState } from '../localAudioEngine';
import type { SongRequestState } from '../songRequestEngine';

let assertionCount = 0;

function assert(condition: unknown, message: string): void {
  assertionCount += 1;
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assertionCount += 1;
  if (actual !== expected) {
    throw new Error(
      `Assertion failed (${message}): expected=${String(expected)} actual=${String(actual)}`,
    );
  }
}

function createBaseSrState(overrides: Partial<SongRequestState> = {}): SongRequestState {
  return {
    currentTrack: null,
    queue: [],
    history: [],
    isPlaying: false,
    playbackStatus: 'idle',
    currentTimeSec: 0,
    durationSec: 0,
    volume: 80,
    muted: false,
    policy: {
      enabled: true,
      maxQueueSize: 20,
      userCooldownSec: 30,
      allowedRoles: 'all',
      blacklistedKeywords: [],
    },
    recentAnnouncements: [],
    isLiveChatConnected: false,
    audioPlaybackMode: 'idle',
    audioSourceResolved: false,
    audioRoutedToStream: false,
    lastError: null,
    lastTestPipelineResult: null,
    ...overrides,
  };
}

function createBaseLocalAudioState(overrides: Partial<AudioEngineState> = {}): AudioEngineState {
  return {
    currentTrackId: null,
    title: '',
    artist: '',
    duration: 0,
    currentTime: 0,
    volume: 0.85,
    isMuted: false,
    isPlaying: false,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

async function runTests(): Promise<void> {
  // 1. Normal LRC timestamp parsing
  assertEqual(parseLrcTimestamp('00:05.25'), 5.25, 'parses [00:05.25] to 5.25s');
  assertEqual(parseLrcTimestamp('01:23.5'), 83.5, 'parses [01:23.5] to 83.5s');
  assertEqual(parseLrcTimestamp('02:00.125'), 120.125, 'parses [02:00.125] to 120.125s');
  assertEqual(parseLrcTimestamp('03:10'), 190, 'parses [03:10] without fraction');

  // 2. Invalid timestamps rejected safely
  assertEqual(parseLrcTimestamp('01:60.00'), null, 'rejects seconds >= 60');
  assertEqual(parseLrcTimestamp('99:99.00'), null, 'rejects [99:99.00]');
  assertEqual(parseLrcTimestamp('ar:Artist'), null, 'rejects metadata tag');
  assertEqual(parseLrcTimestamp('invalid'), null, 'rejects non-numeric tag');

  // 3. Multiple timestamps per line, offset, blank lines, and stable chronological sorting
  const multiAndOffset = parseLrc(
    [
      '[ar:Test Artist]',
      '[offset:500]',
      '',
      '[00:20.00][00:05.00] Chorus line',
      '[00:12.00]   ',
      '[99:99.00] Broken timestamp line',
      '[00:10.00] Verse one',
      'Plain text without tag',
    ].join('\n'),
  );
  assertEqual(multiAndOffset.hasSyncedLines, true, 'detects valid synced lines');
  assertEqual(multiAndOffset.offsetMs, 500, 'captures offsetMs from [offset:500]');
  assertEqual(multiAndOffset.lines.length, 4, 'expands multi-timestamp line and skips blank/invalid lines');
  assertEqual(multiAndOffset.lines[0].timeSec, 5.5, 'first sorted line applies +500ms offset');
  assertEqual(multiAndOffset.lines[0].text, 'Chorus line', 'preserves multi-timestamp text at 5.5s');
  assertEqual(multiAndOffset.lines[1].timeSec, 10.5, 'second sorted line at 10.5s');
  assertEqual(multiAndOffset.lines[1].text, 'Verse one', 'preserves verse text');
  assertEqual(multiAndOffset.lines[2].timeSec, 12.5, 'preserves timestamped instrumental pause');
  assertEqual(multiAndOffset.lines[2].text, '', 'timestamped pause has empty text');
  assertEqual(multiAndOffset.lines[3].timeSec, 20.5, 'repeated chorus line at 20.5s');

  // Negative offset clamps at 0
  const negOffset = parseLrc('[offset:-6000]\n[00:02.00] Early start');
  assertEqual(negOffset.lines[0].timeSec, 0, 'negative offset clamps timestamps at >= 0');

  // 4. Plain lyrics without timestamps must NEVER claim synced
  const plainParsed = parseLrc('Line one without tag\nLine two without tag');
  assertEqual(plainParsed.hasSyncedLines, false, 'plain text has hasSyncedLines=false');
  assertEqual(plainParsed.lines.length, 0, 'plain text produces 0 synced lines');

  // 5. Selecting active & next line based on playback position
  const sampleLines = [
    { timeSec: 5, text: 'Baris 1' },
    { timeSec: 10, text: 'Baris 2' },
    { timeSec: 18, text: 'Baris 3' },
  ];
  const beforeStart = findActiveLyricLines(sampleLines, 2);
  assertEqual(beforeStart.activeLine, null, 'before first timestamp activeLine is null');
  assertEqual(beforeStart.nextLine?.text, 'Baris 1', 'before first timestamp nextLine is first lyric');

  const atFirst = findActiveLyricLines(sampleLines, 5);
  assertEqual(atFirst.activeLine?.text, 'Baris 1', 'exact timestamp selects Baris 1');
  assertEqual(atFirst.nextLine?.text, 'Baris 2', 'nextLine is Baris 2');

  const midTrack = findActiveLyricLines(sampleLines, 14.2);
  assertEqual(midTrack.activeLine?.text, 'Baris 2', '14.2s selects Baris 2');
  assertEqual(midTrack.nextLine?.text, 'Baris 3', 'nextLine is Baris 3');

  const atEnd = findActiveLyricLines(sampleLines, 30);
  assertEqual(atEnd.activeLine?.text, 'Baris 3', 'end selects last line');
  assertEqual(atEnd.nextLine, null, 'last line has nextLine=null');

  // 6. LRCLIB success (synced), headers, query params, and in-memory cache
  __resetLyricsServiceForTests();
  let fetchCount = 0;
  let capturedUrl = '';
  let capturedHeaders: Record<string, string> = {};
  const okSyncedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCount += 1;
    capturedUrl = String(input);
    capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
    return new Response(
      JSON.stringify({
        trackName: 'Starlight',
        artistName: 'Nova',
        instrumental: false,
        syncedLyrics: '[00:04.00] Shining bright\n[00:09.00] Across the night',
        plainLyrics: 'Shining bright\nAcross the night',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }) as typeof fetch;

  const resSynced = await fetchLyricsFromLrclib(
    {
      trackName: 'Starlight',
      artistName: 'Nova',
      albumName: 'Cosmos',
      durationSec: 201.4,
    },
    { fetchFn: okSyncedFetch },
  );
  assertEqual(resSynced.status, 'synced', 'LRCLIB syncedLyrics resolves to synced');
  assertEqual(resSynced.synced, true, 'synced flag is true');
  assertEqual(resSynced.attribution, 'LRCLIB', 'LRCLIB attribution set');
  assertEqual(resSynced.lines.length, 2, '2 synced lines parsed');
  assert(
    capturedUrl.startsWith('https://lrclib.net/api/get?'),
    'uses LRCLIB stable /api/get endpoint',
  );
  assert(
    capturedUrl.includes('track_name=Starlight') &&
      capturedUrl.includes('artist_name=Nova') &&
      capturedUrl.includes('album_name=Cosmos') &&
      capturedUrl.includes('duration=201'),
    'passes track_name, artist_name, album_name, and integer duration',
  );
  assertEqual(capturedHeaders['X-User-Agent'], LRCLIB_USER_AGENT, 'sends X-User-Agent header');
  assert(
    LRCLIB_USER_AGENT.includes('SYNTXRR STREAM') && LRCLIB_USER_AGENT.includes('https://'),
    'X-User-Agent includes SYNTXRR STREAM and repository URL',
  );

  // Second lookup for same track uses in-memory cache (fetchCount stays 1)
  const cachedRes = await fetchLyricsFromLrclib(
    { trackName: 'Starlight', artistName: 'Nova', albumName: 'Cosmos', durationSec: 201.4 },
    { fetchFn: okSyncedFetch },
  );
  assertEqual(fetchCount, 1, 'in-memory cache prevents duplicate HTTP calls');
  assertEqual(cachedRes.lines.length, 2, 'cached response preserves synced lines');

  // 7. Plain lyrics only & instrumental response
  __resetLyricsServiceForTests();
  const plainFetch = (async () =>
    new Response(
      JSON.stringify({
        instrumental: false,
        syncedLyrics: null,
        plainLyrics: 'Plain verse one\nPlain verse two',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;
  const plainRes = await fetchLyricsFromLrclib(
    { trackName: 'Acoustic', artistName: 'Solo' },
    { fetchFn: plainFetch },
  );
  assertEqual(plainRes.status, 'unsynced', 'plainLyrics-only returns unsynced status');
  assertEqual(plainRes.synced, false, 'plainLyrics-only never claims synced');
  assertEqual(plainRes.attribution, 'LRCLIB', 'plainLyrics includes LRCLIB attribution');

  const instrumentalFetch = (async () =>
    new Response(
      JSON.stringify({
        instrumental: true,
        syncedLyrics: null,
        plainLyrics: null,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;
  const instrumentalRes = await fetchLyricsFromLrclib(
    { trackName: 'Nocturne', artistName: 'Piano' },
    { fetchFn: instrumentalFetch },
  );
  assertEqual(instrumentalRes.status, 'instrumental', 'instrumental response handled');
  assertEqual(instrumentalRes.instrumental, true, 'instrumental flag is true');

  // 8. 404, 429 + Retry-After, 503, invalid content-type, network error
  __resetLyricsServiceForTests();
  const notFoundFetch = (async () => new Response('Not Found', { status: 404 })) as typeof fetch;
  const notFoundRes = await fetchLyricsFromLrclib(
    { trackName: 'Unknown Track', artistName: 'Nobody' },
    { fetchFn: notFoundFetch },
  );
  assertEqual(notFoundRes.status, 'not_found', '404 maps to not_found');

  __resetLyricsServiceForTests();
  let nowTick = 1_000_000;
  let rateCalls = 0;
  const rateLimitFetch = (async () => {
    rateCalls += 1;
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': '30' },
    });
  }) as typeof fetch;
  const res429 = await fetchLyricsFromLrclib(
    { trackName: 'Song A', artistName: 'Artist A' },
    { fetchFn: rateLimitFetch, nowFn: () => nowTick },
  );
  assertEqual(res429.status, 'rate_limited', '429 maps to rate_limited');
  assertEqual(res429.retryAfterSec, 30, 'parses Retry-After header seconds');
  assertEqual(rateCalls, 1, 'no automatic retry loop on 429');

  // Calling again before Retry-After expires skips network fetch
  const duringCooldown = await fetchLyricsFromLrclib(
    { trackName: 'Song B', artistName: 'Artist B' },
    { fetchFn: rateLimitFetch, nowFn: () => nowTick + 10_000 },
  );
  assertEqual(duringCooldown.status, 'rate_limited', 'respects Retry-After cooldown');
  assertEqual(rateCalls, 1, 'does not hit network during Retry-After cooldown');

  __resetLyricsServiceForTests();
  const fetch503 = (async () =>
    new Response('Unavailable', { status: 503, headers: { 'Retry-After': '10' } })) as typeof fetch;
  const res503 = await fetchLyricsFromLrclib(
    { trackName: 'Song C', artistName: 'Artist C' },
    { fetchFn: fetch503, nowFn: () => 2_000_000 },
  );
  assertEqual(res503.status, 'service_unavailable', '503 maps to service_unavailable');
  assertEqual(res503.retryAfterSec, 10, '503 captures Retry-After');

  __resetLyricsServiceForTests();
  const badContentTypeFetch = (async () =>
    new Response('<html>bad</html>', { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch;
  const badCtRes = await fetchLyricsFromLrclib(
    { trackName: 'Song D', artistName: 'Artist D' },
    { fetchFn: badContentTypeFetch },
  );
  assertEqual(badCtRes.status, 'error', 'rejects non-JSON content type');

  const networkErrFetch = (async () => {
    throw new Error('Network offline');
  }) as typeof fetch;
  const netErrRes = await fetchLyricsFromLrclib(
    { trackName: 'Song E', artistName: 'Artist E' },
    { fetchFn: networkErrFetch },
  );
  assertEqual(netErrRes.status, 'error', 'handles network failure gracefully');

  // 9. Request deduplication & AbortController cancellation
  __resetLyricsServiceForTests();
  let dedupFetchCalls = 0;
  let capturedAbortSignal: AbortSignal | undefined;
  let resolveSlowFetch!: (value: Response) => void;
  const slowDedupFetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
    dedupFetchCalls += 1;
    capturedAbortSignal = init?.signal ?? undefined;
    return new Promise<Response>((resolve) => {
      resolveSlowFetch = resolve;
    });
  }) as typeof fetch;

  const ac1 = new AbortController();
  const ac2 = new AbortController();
  const p1 = fetchLyricsFromLrclib(
    { trackName: 'Dedup Song', artistName: 'Band' },
    { fetchFn: slowDedupFetch, signal: ac1.signal },
  );
  const p2 = fetchLyricsFromLrclib(
    { trackName: 'Dedup Song', artistName: 'Band' },
    { fetchFn: slowDedupFetch, signal: ac2.signal },
  );
  assertEqual(dedupFetchCalls, 1, 'deduplicates concurrent in-flight requests for same track');

  // Aborting caller 1 keeps underlying fetch alive for caller 2
  ac1.abort();
  const abortedCaller1 = await p1;
  assertEqual(abortedCaller1.status, 'aborted', 'aborted caller resolves aborted');
  assertEqual(capturedAbortSignal?.aborted, false, 'shared fetch stays active while caller 2 still waits');

  resolveSlowFetch(
    new Response(JSON.stringify({ syncedLyrics: '[00:01.00] Live dedup' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const completedCaller2 = await p2;
  assertEqual(completedCaller2.status, 'synced', 'second caller still receives synced lyrics');

  // Aborting the sole caller cancels the underlying fetch signal
  __resetLyricsServiceForTests();
  let soloSignal: AbortSignal | undefined;
  const abortableFetch = ((_url: RequestInfo | URL, init?: RequestInit) => {
    soloSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  }) as typeof fetch;
  const acSolo = new AbortController();
  const soloPromise = fetchLyricsFromLrclib(
    { trackName: 'Cancel Me', artistName: 'Solo' },
    { fetchFn: abortableFetch, signal: acSolo.signal },
  );
  acSolo.abort();
  const soloRes = await soloPromise;
  assertEqual(soloSignal?.aborted, true, 'aborting sole caller aborts underlying fetch AbortController');
  assertEqual(soloRes.status, 'aborted', 'cancelled fetch returns aborted status');

  // 10. Playback source prioritization & manual override + autoFetch disabled render model
  const activeSrPlaying = createBaseSrState({
    isPlaying: true,
    playbackStatus: 'playing',
    currentTimeSec: 12,
    durationSec: 180,
    currentTrack: {
      id: 'sr_1',
      title: 'SR Track',
      artist: 'SR Artist',
      requester: 'Viewer1',
      durationSec: 180,
      requestedAt: 1,
      sourceType: 'remote_url',
      provider: 'audius',
      playable: true,
    },
  });
  const pausedLocal = createBaseLocalAudioState({
    currentTrackId: 'loc_1',
    title: 'Local Track',
    artist: 'Local Artist',
    isPlaying: false,
    currentTime: 25,
    duration: 200,
  });
  assertEqual(
    resolveActiveLyricsPlaybackSource(activeSrPlaying, pausedLocal)?.title,
    'SR Track',
    'playing Song Request takes priority over paused Local Audio',
  );

  const pausedSr = createBaseSrState({
    isPlaying: false,
    playbackStatus: 'paused',
    currentTimeSec: 12,
    currentTrack: activeSrPlaying.currentTrack,
  });
  const playingLocal = createBaseLocalAudioState({
    currentTrackId: 'loc_1',
    title: 'Local Track',
    artist: 'Local Artist',
    isPlaying: true,
    currentTime: 30,
    duration: 200,
  });
  assertEqual(
    resolveActiveLyricsPlaybackSource(pausedSr, playingLocal)?.title,
    'Local Track',
    'playing Local Audio takes priority over paused Song Request',
  );

  const stoppedSr = createBaseSrState({
    isPlaying: false,
    playbackStatus: 'completed',
    currentTimeSec: 0,
    currentTrack: activeSrPlaying.currentTrack,
  });
  const stoppedLocal = createBaseLocalAudioState({
    currentTrackId: 'loc_1',
    title: 'Local Track',
    artist: 'Local Artist',
    isPlaying: false,
    currentTime: 0,
    duration: 200,
  });
  assertEqual(
    resolveActiveLyricsPlaybackSource(stoppedSr, stoppedLocal),
    null,
    'ended/stopped playback returns null so stale lyrics are cleared',
  );

  // Manual override beats auto LRCLIB result
  const autoLookup: LyricsLookupResult = {
    status: 'synced',
    source: 'lrclib',
    trackName: 'SR Track',
    artistName: 'SR Artist',
    lines: [{ timeSec: 5, text: 'Auto Lyric Line' }],
    plainText: 'Auto Lyric Line',
    synced: true,
    instrumental: false,
    attribution: 'LRCLIB',
  };
  const activePlayback = resolveActiveLyricsPlaybackSource(activeSrPlaying, stoppedLocal);

  const manualSyncedModel = buildLyricsRenderModel({
    manualInput: '[00:05.00] Manual Baris 1\n[00:10.00] Manual Baris 2\n[00:20.00] Manual Baris 3',
    autoFetchEnabled: true,
    playback: activePlayback,
    lookupResult: autoLookup,
    isLoading: false,
  });
  assertEqual(manualSyncedModel.status, 'manual_synced', 'manual LRC overrides auto LRCLIB');
  assertEqual(manualSyncedModel.primaryText, 'Manual Baris 2', 'manual LRC syncs with playback time 12s');
  assertEqual(manualSyncedModel.secondaryText, 'Manual Baris 3', 'manual LRC shows next line preview');
  assertEqual(manualSyncedModel.usesLrclibAttribution, false, 'manual override hides LRCLIB attribution');

  const manualPlainModel = buildLyricsRenderModel({
    manualInput: 'Teks lirik biasa tanpa timestamp',
    autoFetchEnabled: true,
    playback: activePlayback,
    lookupResult: autoLookup,
    isLoading: false,
  });
  assertEqual(manualPlainModel.status, 'manual_unsynced', 'plain manual text marks manual_unsynced');
  assertEqual(manualPlainModel.synced, false, 'plain manual text never claims synced');
  assertEqual(manualPlainModel.primaryText, 'Teks lirik biasa tanpa timestamp', 'plain manual text shown statically');

  const autoDisabledModel = buildLyricsRenderModel({
    manualInput: '',
    autoFetchEnabled: false,
    playback: activePlayback,
    lookupResult: null,
    isLoading: false,
  });
  assertEqual(autoDisabledModel.status, 'auto_disabled', 'reports auto_disabled when online search is off');

  console.log(`Lyrics service tests passed: ${assertionCount} assertions.`);
}

void runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
