// Unit & integration tests for A2.10.4.1: Audius Authorized Song Request Playback
// Run via: bun run src/services/__tests__/audiusSongRequest.test.ts

import {
  AUDIUS_API_BASE,
  AudiusService,
  evaluateAudiusTrackAuthorization,
  type AudiusTrack,
} from '../audiusService';
import {
  SongRequestEngine,
  sanitizeHistoryTrackSnapshot,
  songRequestEngine,
  type SongRequestItem,
} from '../songRequestEngine';
import { streamEventBus } from '../eventBus';

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

class MockHtmlAudio {
  public preload = 'metadata';
  public volume = 1;
  public src = '';
  public paused = true;
  public ended = false;
  public currentTime = 0;
  public duration = 210;
  public error: { code: number } | null = null;
  private listeners: Map<string, Array<() => void>> = new Map();

  addEventListener(event: string, cb: () => void): void {
    const arr = this.listeners.get(event) || [];
    arr.push(cb);
    this.listeners.set(event, arr);
  }

  removeAttribute(attr: string): void {
    if (attr === 'src') this.src = '';
  }

  load(): void {
    this.ended = false;
  }

  async play(): Promise<void> {
    if (!this.src) throw new Error('No src set');
    this.paused = false;
    this.emit('playing');
  }

  pause(): void {
    this.paused = true;
  }

  emit(event: string): void {
    const arr = this.listeners.get(event) || [];
    arr.forEach((cb) => cb());
  }
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 15));
}

async function runAudiusSongRequestTests(): Promise<void> {
  songRequestEngine.destroy();

  const originalAudio = (globalThis as { Audio?: unknown }).Audio;
  const originalFetch = globalThis.fetch;
  const mockAudioRef: { current: MockHtmlAudio | null } = { current: null };

  (globalThis as { Audio?: unknown }).Audio = class extends MockHtmlAudio {
    constructor() {
      super();
      mockAudioRef.current = this;
    }
  };

  try {
    // 1. Direct authorization & license checks
    const validOmlTrack: AudiusTrack = {
      id: 'aud_oml_1',
      title: 'Aurora Circuit',
      duration: 214,
      permalink: '/syntxrr_artist/aurora-circuit',
      is_streamable: true,
      is_stream_gated: false,
      stream_conditions: null,
      license: 'Open Music License',
      copyright_notice: '2026 Syntxrr Artist',
      artwork: { '480x480': 'https://cdn.audius.test/art/aurora.jpg' },
      user: { id: 'u1', name: 'Syntxrr Artist', handle: 'syntxrr_artist' },
    };
    const omlEval = evaluateAudiusTrackAuthorization(validOmlTrack);
    assertEqual(omlEval.allowed, true, '1a: valid OML track allowed');
    assertEqual(omlEval.licenseType, 'Open Music License', '1b: normalized OML license label');
    assertEqual(omlEval.attribution.rightsHolder, 'Syntxrr Artist', '1c: rightsHolder captured');
    assertEqual(omlEval.attribution.copyrightNotice, '2026 Syntxrr Artist', '1d: copyrightNotice captured');
    assertEqual(
      omlEval.attribution.trackUrl,
      'https://audius.co/syntxrr_artist/aurora-circuit',
      '1e: permalink resolved to audius.co URL',
    );

    const ccByTrack: AudiusTrack = {
      ...validOmlTrack,
      id: 'aud_ccby_1',
      license: 'by',
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(ccByTrack).allowed,
      true,
      '1f: CC BY (by) track allowed',
    );

    const unclearAltLicenseTrack: AudiusTrack = {
      ...validOmlTrack,
      id: 'aud_alt_1',
      license: 'Custom Artist Promo Agreement',
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(unclearAltLicenseTrack).allowed,
      false,
      '1g: unverified alternative license rejected',
    );

    const arrTrack: AudiusTrack = {
      ...validOmlTrack,
      id: 'aud_arr_1',
      license: 'All Rights Reserved',
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(arrTrack).allowed,
      false,
      '1h: All Rights Reserved rejected',
    );

    const ncTrack: AudiusTrack = {
      ...validOmlTrack,
      id: 'aud_nc_1',
      license: 'by-nc-sa',
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(ncTrack).allowed,
      false,
      '1i: NonCommercial license rejected for live streaming',
    );

    const missingLicenseTrack: AudiusTrack = {
      ...validOmlTrack,
      id: 'aud_nolicense_1',
      license: null,
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(missingLicenseTrack).allowed,
      false,
      '1j: missing license metadata rejected (not assumed safe)',
    );

    const gatedTrack: AudiusTrack = {
      ...validOmlTrack,
      id: 'aud_gated_1',
      is_stream_gated: true,
      stream_conditions: { follow_user_id: 99 },
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(gatedTrack).allowed,
      false,
      '1k: stream-gated track rejected',
    );

    const conditionOnlyGatedTrack: AudiusTrack = {
      ...validOmlTrack,
      id: 'aud_cond_1',
      is_stream_gated: false,
      stream_conditions: { usdc_purchase: { price: 500 } },
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(conditionOnlyGatedTrack).allowed,
      false,
      '1l: stream_conditions non-null rejected even if is_stream_gated=false',
    );

    const nonStreamableTrack: AudiusTrack = {
      ...validOmlTrack,
      id: 'aud_nostream_1',
      is_streamable: false,
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(nonStreamableTrack).allowed,
      false,
      '1m: is_streamable=false rejected',
    );

    // 2. Mock Audius API fetch scenarios (search, stream HEAD/GET, 429 rate limit, 404, invalid response, refresh)
    const searchUrlsSeen: string[] = [];
    const streamUrlsSeen: string[] = [];
    let auroraRevokedOnRefresh = false;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input.toString();

      if (urlStr.startsWith(`${AUDIUS_API_BASE}/tracks/search`)) {
        searchUrlsSeen.push(urlStr);
        const q = (new URL(urlStr).searchParams.get('query') || '').toLowerCase();

        if (q.includes('rate_limit_test')) {
          return new Response(JSON.stringify({ message: 'Too Many Requests' }), { status: 429 });
        }
        if (q.includes('network_fail_test')) {
          throw new Error('ECONNREFUSED simulated network failure');
        }
        if (q.includes('empty_test')) {
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (q.includes('gated_only')) {
          return new Response(JSON.stringify({ data: [gatedTrack] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (q.includes('alt_license_only')) {
          return new Response(JSON.stringify({ data: [unclearAltLicenseTrack] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (q.includes('bad_stream_url')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  ...validOmlTrack,
                  id: 'aud_bad_stream',
                  title: 'Broken Stream Track',
                  permalink: '/syntxrr_artist/broken-stream',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (q.includes('non_audio_stream')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  ...validOmlTrack,
                  id: 'aud_json_stream',
                  title: 'Non Audio Stream Track',
                  permalink: '/syntxrr_artist/non-audio-stream',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (q.includes('tokenized_cdn_track')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  ...validOmlTrack,
                  id: 'aud_tok_1',
                  title: 'Tokenized Redirect Track',
                  permalink: '/syntxrr_artist/tokenized-redirect',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        // Mixed results: first track is gated, second track is valid OML -> selects second track!
        return new Response(
          JSON.stringify({
            data: [gatedTrack, validOmlTrack],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.startsWith(`${AUDIUS_API_BASE}/tracks/aud_tok_1?`)) {
        return new Response(
          JSON.stringify({
            data: {
              ...validOmlTrack,
              id: 'aud_tok_1',
              title: 'Tokenized Redirect Track',
              permalink: '/syntxrr_artist/tokenized-redirect',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.startsWith(`${AUDIUS_API_BASE}/tracks/aud_oml_1?`)) {
        return new Response(
          JSON.stringify({
            data: auroraRevokedOnRefresh ? { ...validOmlTrack, is_streamable: false } : validOmlTrack,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('/tracks/') && urlStr.includes('/stream')) {
        streamUrlsSeen.push(urlStr);
        if (urlStr.includes('aud_bad_stream')) {
          return new Response(null, { status: 404, statusText: 'Not Found' });
        }
        if (urlStr.includes('aud_json_stream')) {
          return new Response(JSON.stringify({ error: 'Not audio' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('aud_tok_1')) {
          // Simulate 405 on HEAD, then 206 with redirected CDN URL containing sensitive token param
          if ((init?.method || 'GET').toUpperCase() === 'HEAD') {
            return new Response(null, { status: 405 });
          }
          const resp = new Response(null, {
            status: 206,
            headers: { 'Content-Type': 'audio/mpeg' },
          });
          Object.defineProperty(resp, 'url', {
            value: 'https://cn1.audius.test/v1/stream/aud_tok_1?token=ephemeral_secret_abc&expires=999999',
          });
          return resp;
        }
        return new Response(null, {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        });
      }

      return new Response(JSON.stringify({ error: 'Unexpected test URL' }), { status: 404 });
    }) as typeof fetch;

    // 3. Direct AudiusService search, rate limit, network error, empty response, invalid stream tests
    const rateLimitSearch = await AudiusService.searchCatalog('rate_limit_test');
    assertEqual(rateLimitSearch.success, false, '3a: rate limit handled cleanly');
    assertEqual(rateLimitSearch.rateLimited, true, '3b: rateLimited flag set on HTTP 429');

    const networkSearch = await AudiusService.searchCatalog('network_fail_test');
    assertEqual(networkSearch.success, false, '3c: network failure handled cleanly');

    const emptySearch = await AudiusService.searchCatalog('empty_test');
    assertEqual(emptySearch.success, true, '3d: empty search succeeds honestly');
    assertEqual(emptySearch.hasMatchedTracks, false, '3e: empty search reports hasMatchedTracks=false');

    const badStreamRes = await AudiusService.resolvePlayableTrack('bad_stream_url');
    assertEqual(badStreamRes.success, false, '3f: HTTP 404 stream rejected');

    const nonAudioRes = await AudiusService.resolvePlayableTrack('non_audio_stream');
    assertEqual(nonAudioRes.success, false, '3g: JSON non-audio stream response rejected');

    // 4. SongRequestEngine integration with zero API key configured!
    const engine = new SongRequestEngine();
    try {
      engine.configureContext({
        operatingMode: 'MODE_A_TIKTOK_COMPANION',
        youtubeApiKey: '',
        spotifyAccessToken: '',
      });

      assertEqual(engine.getState().policy.maxQueueSize, 5, '4a: default maxQueueSize=5 preserved');

      // 4a. Rejected tracks MUST NOT become playable or start fake playback
      const gatedPlay = await engine.handlePlayCommand('viewer_1', 'gated_only', true);
      assertEqual(gatedPlay.success, false, '4b: stream-gated !play fails');
      assertEqual(gatedPlay.item, undefined, '4c: gated track not marked playable or queued as playable');
      assertEqual(engine.getState().isPlaying, false, '4d: gated track keeps isPlaying=false');

      const altLicPlay = await engine.handlePlayCommand('viewer_1', 'alt_license_only', true);
      assertEqual(altLicPlay.success, false, '4e: unclear alternative license !play fails');
      assertEqual(engine.getState().isPlaying, false, '4f: unclear license keeps isPlaying=false');

      const badStreamPlay = await engine.handlePlayCommand('viewer_1', 'bad_stream_url', true);
      assertEqual(badStreamPlay.success, false, '4g: unavailable stream fails honestly');
      assertEqual(engine.getState().isPlaying, false, '4h: unavailable stream keeps isPlaying=false');

      // Manually passing unauthorized/unplayable items directly to playItem MUST also be rejected
      const manualUnauthItem: SongRequestItem = {
        id: 'manual_bad_aud',
        title: 'Forged ARR Track',
        artist: 'Forger',
        requester: 'viewer_x',
        durationSec: 120,
        requestedAt: Date.now(),
        sourceType: 'remote_url',
        provider: 'audius',
        providerTrackId: 'aud_arr_1',
        playable: true,
        audioUrl: 'https://api.audius.co/v1/tracks/aud_arr_1/stream',
        licenseType: 'All Rights Reserved',
      };
      const manualRejected = await engine.playItem(manualUnauthItem);
      assertEqual(manualRejected, false, '4i: playItem rejects Audius item with unpermitted licenseType');
      assertEqual(engine.getState().isPlaying, false, '4j: playItem keeps isPlaying=false on unpermitted source');

      // 4b. Valid OML track from mixed search skips gated candidate #1 and plays valid OML candidate #2
      const validPlay = await engine.handlePlayCommand('viewer_oml', 'Aurora Circuit', true);
      assertEqual(validPlay.success, true, '4k: !play finds and plays valid OML Audius track without API key');
      assertEqual(validPlay.item?.provider, 'audius', '4l: provider set to audius');
      assertEqual(validPlay.item?.playable, true, '4m: valid OML track marked playable=true');
      assertEqual(validPlay.item?.rightsHolder, 'Syntxrr Artist', '4n: attribution rightsHolder stored');
      assertEqual(validPlay.item?.licenseType, 'Open Music License', '4o: attribution licenseType stored');
      assertEqual(
        validPlay.item?.copyrightNotice,
        '2026 Syntxrr Artist',
        '4p: attribution copyrightNotice stored',
      );
      assertEqual(
        validPlay.item?.externalUrl,
        'https://audius.co/syntxrr_artist/aurora-circuit',
        '4q: attribution track link stored',
      );
      assertEqual(engine.getState().isPlaying, true, '4r: engine starts playing via existing playback engine');
      assertEqual(
        engine.getState().audioPlaybackMode,
        'real_html5_audio',
        '4s: uses existing HTML5 Audio playback mode on web',
      );
      assert(
        searchUrlsSeen.some((u) => u.includes('/tracks/search') && !u.includes('api_key=')),
        '4t: search uses official /tracks/search without requiring user API key',
      );
      assert(
        streamUrlsSeen.some((u) => u.includes('/tracks/aud_oml_1/stream')),
        '4u: stream uses official /tracks/{track_id}/stream endpoint',
      );

      // 4c. Chat !next and !skip remain disabled; internal skipTrack() still works
      const beforeNextId = engine.getState().currentTrack?.id;
      streamEventBus.emit({
        id: 'aud_chat_next',
        type: 'chat',
        username: 'chatter',
        detail: '!next',
        timestamp: Date.now(),
        isSimulation: false,
      });
      await flushMicrotasks();
      assertEqual(engine.getState().currentTrack?.id, beforeNextId, '4v: !next in chat remains ignored');

      // 4d. Enqueue tokenized Audius track via chat !play, verify history strips token but requeue refreshes & plays!
      streamEventBus.emit({
        id: 'aud_chat_play_tok',
        type: 'chat',
        username: 'viewer_tok',
        detail: '!play tokenized_cdn_track',
        timestamp: Date.now(),
        isSimulation: false,
      });
      await flushMicrotasks();
      assertEqual(engine.getState().queue.length, 1, '4w: second valid Audius track queued FIFO');
      assertEqual(engine.getState().queue[0].title, 'Tokenized Redirect Track', '4x: queued track title matches');

      // Internal skip advances to queued Tokenized Redirect Track
      const skippedOk = await engine.skipTrack('Streamer');
      assertEqual(skippedOk, true, '4y: internal skipTrack advances to queued Audius track');
      assertEqual(
        engine.getState().currentTrack?.title,
        'Tokenized Redirect Track',
        '4z: Tokenized Redirect Track now playing',
      );

      // Verify sanitized history stripped the ?token=...&expires=... URL while keeping audius refresh eligibility
      const historyBeforeRequeue = engine.getState().history;
      const tokHistoryEntry = historyBeforeRequeue.find((h) => h.title === 'Tokenized Redirect Track')!;
      assert(Boolean(tokHistoryEntry), '5a: Audius playback session recorded in history');
      const persistedSanitized = sanitizeHistoryTrackSnapshot(tokHistoryEntry.trackSnapshot);
      assertEqual(
        persistedSanitized.audioUrl,
        undefined,
        '5b: ephemeral tokenized stream URL stripped before history persistence',
      );
      assertEqual(
        persistedSanitized.playable,
        true,
        '5c: Audius history snapshot preserves refreshable playable=true via providerTrackId',
      );
      assertEqual(persistedSanitized.providerTrackId, 'aud_tok_1', '5d: providerTrackId preserved');
      assertEqual(persistedSanitized.licenseType, 'Open Music License', '5e: licenseType preserved in history');

      // Simulate restart/persisted entry without audioUrl -> requeue -> skipTrack refreshes stream URL & plays!
      const auroraHistoryEntry = historyBeforeRequeue.find((h) => h.title === 'Aurora Circuit')!;
      // Also test tokenized entry requeue where audioUrl was stripped:
      engine.hydrateHistory([
        {
          ...tokHistoryEntry,
          id: 'sess_tok_sanitized',
          sessionId: 'sess_tok_sanitized',
          startedAt: Date.now() + 10_000,
          updatedAt: Date.now() + 10_000,
          timestamp: Date.now() + 10_000,
          trackSnapshot: persistedSanitized,
        },
      ]);

      const requeueTok = engine.requeueFromHistory('sess_tok_sanitized', 'Streamer');
      assertEqual(requeueTok.success, true, '5f: requeue from sanitized Audius history succeeds');
      assertEqual(requeueTok.item?.playable, true, '5g: requeued Audius item stays playable');

      const playRequeuedOk = await engine.skipTrack('Streamer');
      assertEqual(
        playRequeuedOk,
        true,
        '5h: requeued Audius track refreshes stream URL from /tracks/{id}/stream and plays',
      );
      assertEqual(engine.getState().isPlaying, true, '5i: requeued Audius track is actively playing');
      assert(
        Boolean(mockAudioRef.current?.src.includes('cn1.audius.test/v1/stream/aud_tok_1')),
        '5j: HTML5 Audio received refreshed Audius stream URL',
      );

      // If artist later disables streaming before requeued track plays, refresh rejects honestly!
      auroraRevokedOnRefresh = true;
      const requeueAurora = engine.requeueFromHistory(auroraHistoryEntry.id, 'Streamer');
      assertEqual(requeueAurora.success, true, '5k: Aurora history entry requeued');
      const playRevokedOk = await engine.skipTrack('Streamer');
      assertEqual(
        playRevokedOk,
        false,
        '5l: requeued track rejected honestly when artist later revokes streamability',
      );
      assertEqual(engine.getState().isPlaying, false, '5m: revoked track stops playback cleanly');
      assertEqual(engine.getState().audioPlaybackMode, 'pending_source', '5n: revoked track sets pending_source');
    } finally {
      engine.destroy();
    }
  } finally {
    (globalThis as { Audio?: unknown }).Audio = originalAudio;
    globalThis.fetch = originalFetch;
  }

  console.log(`audiusSongRequest.test.ts: PASS (${assertionCount} assertions)`);
}

void runAudiusSongRequestTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
