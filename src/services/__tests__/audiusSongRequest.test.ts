// Unit & integration tests for A2.10.4.2: Audius OML Semantics & Stream Validation Hardening
// Run via: bun run src/services/__tests__/audiusSongRequest.test.ts

import {
  AUDIUS_API_BASE,
  AudiusService,
  evaluateAudiusTrackAuthorization,
  hasAudioMagicBytes,
  isPermittedAudiusLicenseLabel,
  isValidAudiusRedirectUrl,
  type AudiusTrack,
} from '../audiusService';
import {
  SongRequestEngine,
  sanitizeHistoryTrackSnapshot,
  songRequestEngine,
  type SongRequestItem,
} from '../songRequestEngine';
import { streamEventBus } from '../eventBus';
import type { SongRequest, UnifiedQueueItem } from '../../types';

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

function makeOctetStreamAudioResponse(bytes: Uint8Array, url?: string, status: number = 200): Response {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const resp = new Response(copy, {
    status,
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  if (url) {
    Object.defineProperty(resp, 'url', { value: url });
  }
  return resp;
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
    // Compile-time check: 'Audius' is supported on UnifiedQueueItem['platform'] & SongRequest['platform']
    const audiusPlatformQueueSample: UnifiedQueueItem['platform'] = 'Audius';
    const audiusPlatformSongSample: SongRequest['platform'] = 'Audius';
    assertEqual(audiusPlatformQueueSample, 'Audius', '0a: UnifiedQueueItem supports Audius platform');
    assertEqual(audiusPlatformSongSample, 'Audius', '0b: SongRequest supports Audius platform');

    // 1. Real sanitized Audius API v1 track fixtures (OML, ARR + streamable, null + streamable, API disabled, CC variants)
    const realStyleArrStreamableTrack: AudiusTrack = {
      id: 'Kp7K522',
      title: 'Aurora Circuit',
      duration: 214,
      permalink: '/syntxrr_artist/aurora-circuit',
      is_available: true,
      is_streamable: true,
      is_stream_gated: false,
      stream_conditions: null,
      access: { stream: true, download: false },
      is_unlisted: false,
      is_delete: false,
      license: 'All rights reserved',
      copyright_line: { year: 2026, text: 'Syntxrr Artist' },
      artwork: { '480x480': 'https://cdn.audius.test/art/aurora.jpg' },
      user: { id: 'u1', name: 'Syntxrr Artist', handle: 'syntxrr_artist' },
    };
    const omlFromArrEval = evaluateAudiusTrackAuthorization(realStyleArrStreamableTrack);
    assertEqual(
      omlFromArrEval.allowed,
      true,
      '1a: streamable ungated track with "All rights reserved" label is permitted under Audius OML',
    );
    assertEqual(omlFromArrEval.licenseType, 'Open Music License', '1b: normalized to Open Music License');
    assertEqual(omlFromArrEval.attribution.rightsHolder, 'Syntxrr Artist', '1c: creator attribution captured');
    assertEqual(omlFromArrEval.attribution.copyrightNotice, '2026 Syntxrr Artist', '1d: copyrightNotice captured');
    assertEqual(
      omlFromArrEval.attribution.trackUrl,
      'https://audius.co/syntxrr_artist/aurora-circuit',
      '1e: permalink resolved to audius.co URL',
    );

    const nullLicenseStreamableTrack: AudiusTrack = {
      ...realStyleArrStreamableTrack,
      id: 'QNqqqzB',
      license: null,
      access: { stream: true, download: true },
    };
    const omlFromNullEval = evaluateAudiusTrackAuthorization(nullLicenseStreamableTrack);
    assertEqual(
      omlFromNullEval.allowed,
      true,
      '1f: streamable ungated track with null license defaults to Audius OML',
    );
    assertEqual(omlFromNullEval.licenseType, 'Open Music License', '1g: null license normalizes to OML');

    const disallowedApiStreamingTrack: AudiusTrack = {
      ...realStyleArrStreamableTrack,
      id: '95wro',
      is_streamable: false,
      access: { stream: true, download: true },
      license: 'All rights reserved',
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(disallowedApiStreamingTrack).allowed,
      false,
      '1h: is_streamable=false ("Disallow Streaming via the API") rejected even if access.stream=true',
    );

    const unavailableTrack: AudiusTrack = {
      ...realStyleArrStreamableTrack,
      id: 'aud_unavail',
      is_available: false,
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(unavailableTrack).allowed,
      false,
      '1i: is_available=false rejected',
    );

    const ccByApiFormatTrack: AudiusTrack = {
      ...realStyleArrStreamableTrack,
      id: 'aud_ccby_real',
      license: 'Attribution CC BY',
    };
    const ccByEval = evaluateAudiusTrackAuthorization(ccByApiFormatTrack);
    assertEqual(ccByEval.allowed, true, '1j: real API "Attribution CC BY" permitted');
    assertEqual(ccByEval.licenseType, 'CC BY', '1k: "Attribution CC BY" normalized to CC BY');

    const ccBySaApiFormatTrack: AudiusTrack = {
      ...realStyleArrStreamableTrack,
      id: 'aud_ccbysa_real',
      license: 'Attribution-ShareAlike CC BY-SA',
    };
    const ccBySaEval = evaluateAudiusTrackAuthorization(ccBySaApiFormatTrack);
    assertEqual(ccBySaEval.allowed, true, '1l: "Attribution-ShareAlike CC BY-SA" permitted');
    assertEqual(ccBySaEval.licenseType, 'CC BY-SA', '1m: CC BY-SA normalized');

    const ccByNcNdTrack: AudiusTrack = {
      ...realStyleArrStreamableTrack,
      id: 'aud_nc_nd',
      license: 'Attribution-NonCommercial-NoDerivs CC BY-NC-ND',
    };
    const ncNdEval = evaluateAudiusTrackAuthorization(ccByNcNdTrack);
    assertEqual(ncNdEval.allowed, false, '1n: CC BY-NC-ND rejected');
    assert(
      Boolean(ncNdEval.reason && /NonCommercial/i.test(ncNdEval.reason)),
      '1o: CC BY-NC-ND rejection mentions NonCommercial',
    );

    const ccByNdTrack: AudiusTrack = {
      ...realStyleArrStreamableTrack,
      id: 'aud_by_nd',
      license: 'Attribution-NoDerivs CC BY-ND',
    };
    const ndEval = evaluateAudiusTrackAuthorization(ccByNdTrack);
    assertEqual(ndEval.allowed, false, '1p: CC BY-ND rejected conservatively in Stage 1');
    assert(
      Boolean(ndEval.reason && /NoDerivatives/i.test(ndEval.reason) && !/NonCommercial/i.test(ndEval.reason)),
      '1q: CC BY-ND rejection states NoDerivatives/commercial distinction and does NOT label it NonCommercial',
    );

    const unclearAltLicenseTrack: AudiusTrack = {
      ...realStyleArrStreamableTrack,
      id: 'aud_alt_1',
      license: 'Custom Artist Promo Agreement',
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(unclearAltLicenseTrack).allowed,
      false,
      '1r: unverified alternative license rejected (fail-closed)',
    );

    const gatedTrack: AudiusTrack = {
      ...realStyleArrStreamableTrack,
      id: 'aud_gated_1',
      is_stream_gated: true,
      stream_conditions: { follow_user_id: 99 },
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(gatedTrack).allowed,
      false,
      '1s: stream-gated track rejected',
    );

    const conditionOnlyGatedTrack: AudiusTrack = {
      ...realStyleArrStreamableTrack,
      id: 'aud_cond_1',
      is_stream_gated: false,
      stream_conditions: { usdc_purchase: { price: 500 } },
    };
    assertEqual(
      evaluateAudiusTrackAuthorization(conditionOnlyGatedTrack).allowed,
      false,
      '1t: non-null stream_conditions rejected even if is_stream_gated=false',
    );

    // Direct standalone license check MUST fail closed on empty or unverified "All Rights Reserved"
    assertEqual(
      isPermittedAudiusLicenseLabel('').permitted,
      false,
      '1u: standalone license check rejects empty licenseType',
    );
    assertEqual(
      isPermittedAudiusLicenseLabel('All Rights Reserved').permitted,
      false,
      '1v: standalone license check rejects raw "All Rights Reserved" without verified API track state',
    );

    // Audio magic bytes & redirect validator sanity checks
    assertEqual(
      hasAudioMagicBytes(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00])),
      true,
      '1w: recognizes ID3 audio header',
    );
    assertEqual(
      hasAudioMagicBytes(new TextEncoder().encode('FAKE_BINARY_NON_AUDIO')),
      false,
      '1x: rejects fake non-audio binary payload',
    );
    assertEqual(
      isValidAudiusRedirectUrl(
        'http://creatornode.audius.co/tracks/cidstream/QmAbc',
        'https://api.audius.co/v1/tracks/1/stream',
      ),
      false,
      '1y: rejects HTTPS->HTTP redirect downgrade',
    );
    assertEqual(
      isValidAudiusRedirectUrl(
        'https://evil.example/login.html',
        'https://api.audius.co/v1/tracks/1/stream',
      ),
      false,
      '1z: rejects redirect to arbitrary non-Audius path',
    );
    assertEqual(
      isValidAudiusRedirectUrl(
        'https://creatornode.audius.co/tracks/cidstream/QmAbc?signature=xyz',
        'https://api.audius.co/v1/tracks/1/stream',
      ),
      true,
      '1za: accepts valid HTTPS Audius cidstream redirect',
    );

    // 2. Mock Audius API fetch scenarios (search, octet-stream byte verification, MIME rejections, redirects, refresh)
    const searchUrlsSeen: string[] = [];
    const streamUrlsSeen: string[] = [];
    let auroraRevokedOnRefresh = false;

    const id3SampleBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x01, 0x03]);

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      const method = (init?.method || 'GET').toUpperCase();

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
              data: [{ ...realStyleArrStreamableTrack, id: 'aud_bad_stream', title: 'Broken Stream' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (q.includes('non_audio_stream')) {
          return new Response(
            JSON.stringify({
              data: [{ ...realStyleArrStreamableTrack, id: 'aud_json_stream', title: 'JSON Stream' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (q.includes('text_plain_stream')) {
          return new Response(
            JSON.stringify({
              data: [{ ...realStyleArrStreamableTrack, id: 'aud_text_stream', title: 'Text Stream' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (q.includes('fake_octet_stream')) {
          return new Response(
            JSON.stringify({
              data: [{ ...realStyleArrStreamableTrack, id: 'aud_fake_octet', title: 'Fake Octet' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (q.includes('empty_octet_stream')) {
          return new Response(
            JSON.stringify({
              data: [{ ...realStyleArrStreamableTrack, id: 'aud_empty_octet', title: 'Empty Octet' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (q.includes('real_octet_track')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  ...realStyleArrStreamableTrack,
                  id: 'aud_real_octet',
                  title: 'Real Creatornode Octet Track',
                  permalink: '/syntxrr_artist/real-octet-track',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (q.includes('bad_redirect_track')) {
          return new Response(
            JSON.stringify({
              data: [{ ...realStyleArrStreamableTrack, id: 'aud_bad_redir', title: 'Bad Redirect' }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (q.includes('tokenized_cdn_track')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  ...realStyleArrStreamableTrack,
                  id: 'aud_tok_1',
                  title: 'Tokenized Redirect Track',
                  permalink: '/syntxrr_artist/tokenized-redirect',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        // Mixed results: gated #1, disallowed API #2, valid OML ("All rights reserved" + is_streamable=true) #3
        return new Response(
          JSON.stringify({
            data: [gatedTrack, disallowedApiStreamingTrack, realStyleArrStreamableTrack],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.startsWith(`${AUDIUS_API_BASE}/tracks/aud_tok_1?`)) {
        return new Response(
          JSON.stringify({
            data: {
              ...realStyleArrStreamableTrack,
              id: 'aud_tok_1',
              title: 'Tokenized Redirect Track',
              permalink: '/syntxrr_artist/tokenized-redirect',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.startsWith(`${AUDIUS_API_BASE}/tracks/Kp7K522?`)) {
        return new Response(
          JSON.stringify({
            data: auroraRevokedOnRefresh
              ? { ...realStyleArrStreamableTrack, is_streamable: false }
              : realStyleArrStreamableTrack,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('/tracks/cidstream/')) {
        if (urlStr.includes('QmRealId3')) {
          return makeOctetStreamAudioResponse(id3SampleBytes, urlStr, 206);
        }
        if (urlStr.includes('QmFakeBinary')) {
          return makeOctetStreamAudioResponse(new TextEncoder().encode('NOT_AN_AUDIO_FILE_HEADER'), urlStr, 206);
        }
        if (urlStr.includes('QmEmptyBinary')) {
          return makeOctetStreamAudioResponse(new Uint8Array(0), urlStr, 206);
        }
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
        if (urlStr.includes('aud_text_stream')) {
          return new Response('Stream unavailable', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        if (urlStr.includes('aud_fake_octet')) {
          const r = new Response(null, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
          Object.defineProperty(r, 'url', {
            value: 'https://creatornode.audius.test/tracks/cidstream/QmFakeBinary',
          });
          return r;
        }
        if (urlStr.includes('aud_empty_octet')) {
          const r = new Response(null, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
          Object.defineProperty(r, 'url', {
            value: 'https://creatornode.audius.test/tracks/cidstream/QmEmptyBinary',
          });
          return r;
        }
        if (urlStr.includes('aud_real_octet')) {
          const r = new Response(null, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
          Object.defineProperty(r, 'url', {
            value: 'https://creatornode.audius.test/tracks/cidstream/QmRealId3?signature=sig_real_octet',
          });
          return r;
        }
        if (urlStr.includes('aud_bad_redir')) {
          const r = new Response(null, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
          Object.defineProperty(r, 'url', {
            value: 'https://attacker.example/phish.html',
          });
          return r;
        }
        if (urlStr.includes('aud_tok_1')) {
          if (method === 'HEAD') {
            return new Response(null, { status: 405 });
          }
          const resp = new Response(null, {
            status: 206,
            headers: { 'Content-Type': 'audio/mpeg' },
          });
          Object.defineProperty(resp, 'url', {
            value:
              'https://creatornode.audius.test/tracks/cidstream/QmTok1?signature=ephemeral_sig_abc&expires=999999',
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

    // 3. Direct AudiusService search, MIME, magic bytes, and redirect validation tests
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

    const textPlainRes = await AudiusService.resolvePlayableTrack('text_plain_stream');
    assertEqual(textPlainRes.success, false, '3h: text/plain non-audio stream response rejected');

    const fakeOctetRes = await AudiusService.resolvePlayableTrack('fake_octet_stream');
    assertEqual(fakeOctetRes.success, false, '3i: fake application/octet-stream without audio header rejected');

    const emptyOctetRes = await AudiusService.resolvePlayableTrack('empty_octet_stream');
    assertEqual(emptyOctetRes.success, false, '3j: empty application/octet-stream rejected');

    const badRedirRes = await AudiusService.resolvePlayableTrack('bad_redirect_track');
    assertEqual(badRedirRes.success, false, '3k: arbitrary non-Audius redirect rejected');

    const realOctetRes = await AudiusService.resolvePlayableTrack('real_octet_track');
    assertEqual(
      realOctetRes.success,
      true,
      '3l: real creatornode application/octet-stream with ID3 audio header accepted via Range inspection',
    );
    assert(
      Boolean(realOctetRes.streamUrl?.includes('/tracks/cidstream/QmRealId3')),
      '3m: verified cidstream URL returned',
    );

    // 4. SongRequestEngine integration
    const engine = new SongRequestEngine();
    try {
      engine.configureContext({
        operatingMode: 'MODE_A_TIKTOK_COMPANION',
        youtubeApiKey: '',
        spotifyAccessToken: '',
      });

      assertEqual(engine.getState().policy.maxQueueSize, 5, '4a: default maxQueueSize=5 preserved');

      const gatedPlay = await engine.handlePlayCommand('viewer_1', 'gated_only', true);
      assertEqual(gatedPlay.success, false, '4b: stream-gated !play fails');
      assertEqual(engine.getState().isPlaying, false, '4c: gated track keeps isPlaying=false');

      const altLicPlay = await engine.handlePlayCommand('viewer_1', 'alt_license_only', true);
      assertEqual(altLicPlay.success, false, '4d: unclear alternative license !play fails');
      assertEqual(engine.getState().isPlaying, false, '4e: unclear license keeps isPlaying=false');

      const badStreamPlay = await engine.handlePlayCommand('viewer_1', 'bad_stream_url', true);
      assertEqual(badStreamPlay.success, false, '4f: unavailable stream fails honestly');
      assertEqual(engine.getState().isPlaying, false, '4g: unavailable stream keeps isPlaying=false');

      // Direct playItem MUST reject Audius items with missing/empty OR unpermitted licenseType even if audioUrl is filled!
      const missingLicenseDirectItem: SongRequestItem = {
        id: 'manual_missing_lic_aud',
        title: 'Forged No-License Track',
        artist: 'Forger',
        requester: 'viewer_x',
        durationSec: 120,
        requestedAt: Date.now(),
        sourceType: 'remote_url',
        provider: 'audius',
        providerTrackId: 'aud_no_lic',
        playable: true,
        audioUrl: 'https://creatornode.audius.co/tracks/cidstream/QmFake',
      };
      const missingLicRejected = await engine.playItem(missingLicenseDirectItem);
      assertEqual(
        missingLicRejected,
        false,
        '4h: playItem rejects Audius item with missing licenseType even when audioUrl is present',
      );
      assertEqual(engine.getState().isPlaying, false, '4i: missing licenseType keeps isPlaying=false');

      const ndDirectItem: SongRequestItem = {
        ...missingLicenseDirectItem,
        id: 'manual_nd_aud',
        licenseType: 'Attribution-NoDerivs CC BY-ND',
      };
      const ndRejected = await engine.playItem(ndDirectItem);
      assertEqual(ndRejected, false, '4j: playItem rejects Audius item with CC BY-ND');

      const rawArrDirectItem: SongRequestItem = {
        ...missingLicenseDirectItem,
        id: 'manual_raw_arr_aud',
        licenseType: 'All Rights Reserved',
      };
      const arrDirectRejected = await engine.playItem(rawArrDirectItem);
      assertEqual(arrDirectRejected, false, '4k: playItem rejects raw unverified All Rights Reserved');

      // History snapshot sanitizer MUST also reject playable=true when Audius licenseType is empty
      const missingLicSnapshot = sanitizeHistoryTrackSnapshot(missingLicenseDirectItem);
      assertEqual(
        missingLicSnapshot.playable,
        false,
        '4l: sanitizeHistoryTrackSnapshot rejects playable=true when Audius licenseType is empty',
      );

      // Valid OML track ("All rights reserved" label + is_streamable=true + ungated) skips gated/disabled candidates and plays!
      const validPlay = await engine.handlePlayCommand('viewer_oml', 'Aurora Circuit', true);
      assertEqual(validPlay.success, true, '4m: !play finds and plays OML Audius track without API key');
      assertEqual(validPlay.item?.provider, 'audius', '4n: provider set to audius');
      assertEqual(validPlay.item?.platform, 'Audius', '4o: platform identity preserved as Audius');
      assertEqual(validPlay.item?.playable, true, '4p: valid OML track marked playable=true');
      assertEqual(validPlay.item?.rightsHolder, 'Syntxrr Artist', '4q: creator attribution stored');
      assertEqual(validPlay.item?.licenseType, 'Open Music License', '4r: normalized OML license stored');
      assert(
        Boolean(validPlay.item?.notes?.includes('Kreator: Syntxrr Artist')) &&
          !validPlay.item?.notes?.includes('Hak cipta:'),
        '4s: notes display creator attribution rather than claiming verified copyright ownership',
      );
      assertEqual(engine.getState().isPlaying, true, '4t: engine starts playing via existing playback engine');
      assert(
        searchUrlsSeen.some((u) => u.includes('/tracks/search') && !u.includes('api_key=')),
        '4u: search uses official /tracks/search without requiring user API key',
      );
      assert(
        streamUrlsSeen.some((u) => u.includes('/tracks/Kp7K522/stream')),
        '4v: stream uses official /tracks/{track_id}/stream endpoint',
      );

      // Chat !next remains ignored
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
      assertEqual(engine.getState().currentTrack?.id, beforeNextId, '4w: !next in chat remains ignored');

      // Enqueue tokenized Audius track, advance via internal skipTrack, verify signature stripped from History, requeue refreshes!
      streamEventBus.emit({
        id: 'aud_chat_play_tok',
        type: 'chat',
        username: 'viewer_tok',
        detail: '!play tokenized_cdn_track',
        timestamp: Date.now(),
        isSimulation: false,
      });
      await flushMicrotasks();
      assertEqual(engine.getState().queue.length, 1, '4x: second valid Audius track queued FIFO');

      const skippedOk = await engine.skipTrack('Streamer');
      assertEqual(skippedOk, true, '4y: internal skipTrack advances to queued Audius track');
      assertEqual(engine.getState().currentTrack?.title, 'Tokenized Redirect Track', '4z: queued track active');

      const historyBeforeRequeue = engine.getState().history;
      const tokHistoryEntry = historyBeforeRequeue.find((h) => h.title === 'Tokenized Redirect Track')!;
      assert(Boolean(tokHistoryEntry), '5a: Audius playback session recorded in history');
      const persistedSanitized = sanitizeHistoryTrackSnapshot(tokHistoryEntry.trackSnapshot);
      assertEqual(
        persistedSanitized.audioUrl,
        undefined,
        '5b: signed/tokenized stream URL (?signature=...&expires=...) stripped before history persistence',
      );
      assertEqual(
        persistedSanitized.playable,
        true,
        '5c: Audius history snapshot preserves refreshable playable=true via providerTrackId + verified licenseType',
      );

      const auroraHistoryEntry = historyBeforeRequeue.find((h) => h.title === 'Aurora Circuit')!;
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
      assertEqual(requeueTok.success, true, '5d: requeue from sanitized Audius history succeeds');
      const playRequeuedOk = await engine.skipTrack('Streamer');
      assertEqual(playRequeuedOk, true, '5e: requeued Audius track refreshes stream URL and plays');
      assertEqual(engine.getState().isPlaying, true, '5f: requeued Audius track is playing');
      assert(
        Boolean(mockAudioRef.current?.src.includes('creatornode.audius.test/tracks/cidstream/QmTok1')),
        '5g: HTML5 Audio received refreshed cidstream Audius URL',
      );

      // Revoking streamability before requeued track plays MUST reject honestly
      auroraRevokedOnRefresh = true;
      const requeueAurora = engine.requeueFromHistory(auroraHistoryEntry.id, 'Streamer');
      assertEqual(requeueAurora.success, true, '5h: Aurora history entry requeued');
      const playRevokedOk = await engine.skipTrack('Streamer');
      assertEqual(playRevokedOk, false, '5i: requeued track rejected honestly when artist disables API streaming');
      assertEqual(engine.getState().isPlaying, false, '5j: revoked track keeps isPlaying=false');
      assertEqual(engine.getState().audioPlaybackMode, 'pending_source', '5k: revoked track sets pending_source');
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
