// Unit test terarah untuk YouTube Music Search Provider pada Song Request Mode A
// Dijalankan via: bun run src/services/__tests__/youtubeMusicSongRequest.test.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  YouTubeMusicService,
  YOUTUBE_DATA_API_SEARCH_ENDPOINT,
  YOUTUBE_MUSIC_CATEGORY_ID,
  extractYouTubeMusicArtist,
  decodeBasicHtmlEntities,
} from '../youtubeMusicService';
import {
  SongRequestEngine,
  songRequestEngine,
  sanitizeHistoryTrackSnapshot,
  type SongRequestItem,
} from '../songRequestEngine';

let assertions = 0;

function assert(condition: unknown, message: string): void {
  assertions += 1;
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assertions += 1;
  if (actual !== expected) {
    throw new Error(`Assertion failed (${message}): expected=${String(expected)} actual=${String(actual)}`);
  }
}

class MockHtmlAudio {
  public preload = 'metadata';
  public volume = 1;
  public src = '';
  public paused = true;
  public ended = false;
  public currentTime = 0;
  public duration = 180;
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
    (this.listeners.get('playing') || []).forEach((cb) => cb());
  }

  pause(): void {
    this.paused = true;
  }
}

async function runTests(): Promise<void> {
  songRequestEngine.destroy();
  const originalFetch = globalThis.fetch;
  const originalAudio = (globalThis as { Audio?: unknown }).Audio;
  (globalThis as { Audio?: unknown }).Audio = MockHtmlAudio;

  try {
    // 1. Utility & HTML entity / Topic artist parsing
    assertEqual(extractYouTubeMusicArtist('M83 - Topic'), 'M83', '1a: strips - Topic suffix for artist');
    assertEqual(extractYouTubeMusicArtist('LoFi Lab'), 'LoFi Lab', '1b: preserves normal channel title');
    assertEqual(
      decodeBasicHtmlEntities('Midnight &amp; Dawn &#39;Live&#39; &quot;Remix&quot;'),
      'Midnight & Dawn \'Live\' "Remix"',
      '1c: decodes HTML entities cleanly without DOM'
    );

    // 2. Missing API key fails honestly without network call
    let fetchCalledOnMissingKey = false;
    globalThis.fetch = (async () => {
      fetchCalledOnMissingKey = true;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const missingKeyRes = await YouTubeMusicService.searchMusicCatalog('Midnight City', '   ');
    assertEqual(missingKeyRes.success, false, '2a: missing key returns failure');
    assertEqual(missingKeyRes.isKeyMissing, true, '2b: sets isKeyMissing=true');
    assertEqual(fetchCalledOnMissingKey, false, '2c: does not perform fetch when API key is missing');

    // 3. Official YouTube Data API v3 query with videoCategoryId=10 & Topic/Official preference
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      requestedUrls.push(urlStr);
      const parsed = new URL(urlStr);

      assert(
        urlStr.startsWith(YOUTUBE_DATA_API_SEARCH_ENDPOINT),
        '3a: uses official YouTube Data API v3 search endpoint'
      );
      assertEqual(parsed.searchParams.get('part'), 'snippet', '3b: requests snippet part');
      assertEqual(parsed.searchParams.get('type'), 'video', '3c: requests type=video');
      assertEqual(
        parsed.searchParams.get('videoCategoryId'),
        YOUTUBE_MUSIC_CATEGORY_ID,
        '3d: scopes query to official Music category (videoCategoryId=10)'
      );
      assertEqual(parsed.searchParams.get('key'), 'yt-official-key-123', '3e: passes API key parameter');

      return new Response(
        JSON.stringify({
          items: [
            {
              id: { videoId: '' }, // invalid empty ID should be ignored
              snippet: { title: 'Invalid Item', channelTitle: 'Nobody' },
            },
            {
              id: { videoId: 'ytm_cover_99' },
              snippet: {
                title: 'Midnight City Reaction',
                channelTitle: 'Random Reviewer',
                thumbnails: { medium: { url: 'https://i.ytimg.com/vi/ytm_cover_99/mqdefault.jpg' } },
              },
            },
            {
              id: { videoId: 'ytm_topic_01' },
              snippet: {
                title: 'Midnight City &amp; Lights',
                channelTitle: 'M83 - Topic',
                thumbnails: { medium: { url: 'https://i.ytimg.com/vi/ytm_topic_01/mqdefault.jpg' } },
                publishedAt: '2024-05-01T00:00:00Z',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const searchRes = await YouTubeMusicService.searchMusicCatalog('Midnight City', 'yt-official-key-123');
    assertEqual(searchRes.success, true, '3f: searchMusicCatalog succeeds');
    assertEqual(searchRes.results.length, 2, '3g: filters out item without videoId');
    assertEqual(searchRes.results[0].id, 'ytm_topic_01', '3h: ranks official - Topic match first');
    assertEqual(searchRes.results[0].artist, 'M83', '3i: normalizes artist from Topic channel');
    assertEqual(searchRes.results[0].title, 'Midnight City & Lights', '3j: decodes title entities');
    assertEqual(
      searchRes.results[0].musicUrl,
      'https://music.youtube.com/watch?v=ytm_topic_01',
      '3k: sets official music.youtube.com deep-link'
    );
    assertEqual(requestedUrls.length, 1, '3l: makes exactly one official API call');

    // 4. SongRequestEngine integration: YouTube Music is primary catalog provider (zero Audius calls)
    const unconfiguredEngine = new SongRequestEngine();
    try {
      unconfiguredEngine.configureContext({
        operatingMode: 'MODE_A_TIKTOK_COMPANION',
        youtubeApiKey: '',
        spotifyAccessToken: '',
      });
      let networkCalledWhenUnconfigured = false;
      globalThis.fetch = (async () => {
        networkCalledWhenUnconfigured = true;
        return new Response('{}', { status: 200 });
      }) as typeof fetch;

      const noKeyRes = await unconfiguredEngine.handlePlayCommand('viewer_nokey', 'Starlight Echo', true);
      assertEqual(noKeyRes.success, false, '4a: missing YouTube API key reports failure cleanly');
      assertEqual(networkCalledWhenUnconfigured, false, '4b: zero network calls (including no Audius) when unconfigured');
      assert(
        (noKeyRes.error || '').includes('YouTube Data API v3 Key'),
        '4c: error instructs configuring YouTube Data API v3 Key for YouTube Music'
      );
    } finally {
      unconfiguredEngine.destroy();
    }

    const engine = new SongRequestEngine();
    try {
      engine.configureContext({
        operatingMode: 'MODE_A_TIKTOK_COMPANION',
        youtubeApiKey: 'yt-official-key-123',
        spotifyAccessToken: 'sp-token-abc',
      });

      // 4d. YouTube Music resolves directly as primary catalog provider (metadata-only, playable: false)
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const urlStr = typeof input === 'string' ? input : input.toString();
        if (urlStr.startsWith(YOUTUBE_DATA_API_SEARCH_ENDPOINT)) {
          const parsed = new URL(urlStr);
          if (parsed.searchParams.get('videoCategoryId') === YOUTUBE_MUSIC_CATEGORY_ID) {
            return new Response(
              JSON.stringify({
                items: [
                  {
                    id: { videoId: 'ytm_song_202' },
                    snippet: {
                      title: 'Starlight Echo',
                      channelTitle: 'Synth Band - Topic',
                      thumbnails: { medium: { url: 'https://i.ytimg.com/vi/ytm_song_202/mqdefault.jpg' } },
                    },
                  },
                ],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        }
        throw new Error(`Unexpected fetch: ${urlStr}`);
      }) as typeof fetch;

      const ytmIdlePlay = await engine.handlePlayCommand('viewer_ytm', 'Starlight Echo', false);
      assertEqual(ytmIdlePlay.success, false, '4d: idle YouTube Music metadata result MUST NOT claim playback started');
      assertEqual(ytmIdlePlay.item?.provider, 'youtube_music', '4e: item provider is youtube_music');
      assertEqual(ytmIdlePlay.item?.sourceType, 'youtube_metadata', '4f: sourceType is youtube_metadata');
      assertEqual(ytmIdlePlay.item?.playable, false, '4g: YouTube Music metadata stays playable=false');
      assertEqual(ytmIdlePlay.item?.platform, 'YouTube Music', '4h: platform label is YouTube Music');
      assertEqual(ytmIdlePlay.item?.artist, 'Synth Band', '4i: artist extracted from - Topic channel');
      assertEqual(
        ytmIdlePlay.item?.externalUrl,
        'https://music.youtube.com/watch?v=ytm_song_202',
        '4j: externalUrl points to music.youtube.com'
      );
      assert(
        (ytmIdlePlay.error || '').includes('https://music.youtube.com/watch?v=ytm_song_202'),
        '4j2: clear error preserves external deep-link for user'
      );
      assertEqual(engine.getState().isPlaying, false, '4k: engine isPlaying stays false');
      assertEqual(engine.getState().audioPlaybackMode, 'pending_source', '4l: audioPlaybackMode is pending_source');
      assertEqual(engine.getState().queue.length, 0, '4l2: YouTube Music metadata does not enter queue');
      assertEqual(
        engine.getState().lastCatalogReference?.externalUrl,
        'https://music.youtube.com/watch?v=ytm_song_202',
        '4l3: lastCatalogReference preserves external deep-link'
      );
      assertEqual(
        engine.getState().lastTestPipelineResult?.stages.stage5_audioSourceResolved.status,
        'failed',
        '4l4: Stage 5 fails for metadata-only YouTube Music item'
      );
      assertEqual(
        engine.getState().lastTestPipelineResult?.stages.stage6_playbackStarted.status,
        'failed',
        '4l5: Stage 6 fails for metadata-only YouTube Music item'
      );
      assertEqual(
        engine.getState().lastTestPipelineResult?.overallSuccess,
        false,
        '4l6: overallSuccess is false when metadata-only item cannot auto-play'
      );

      // Cooldown MUST NOT be consumed when viewer_ytm was rejected for missing playable audio source
      const ytmSecondImmediate = await engine.handlePlayCommand('viewer_ytm', 'Starlight Echo', false);
      assert(
        !(ytmSecondImmediate.error || '').toLowerCase().includes('cooldown'),
        '4l7: cooldown is NOT consumed when metadata-only request is rejected'
      );

      // 4e. Enqueue while authorized track is playing MUST reject metadata-only item and leave active track + queue untouched
      const activeAuth: SongRequestItem = {
        id: 'auth_active_1',
        title: 'Authorized Track',
        artist: 'Creator',
        requester: 'host',
        durationSec: 120,
        requestedAt: Date.now(),
        sourceType: 'remote_url',
        provider: 'authorized_stream',
        playable: true,
        audioUrl: 'https://cdn.example.com/audio/track.mp3',
        platform: 'Stream',
      };
      await engine.enqueueAndPlayItem(activeAuth);
      const ytmRejectedWhilePlaying = await engine.handlePlayCommand('viewer_q', 'Starlight Echo', false);
      assertEqual(ytmRejectedWhilePlaying.success, false, '4m: metadata item MUST NOT enter queue while active track plays');
      assertEqual(engine.getState().queue.length, 0, '4n: queue remains empty after metadata rejection');
      assertEqual(engine.getState().currentTrack?.id, 'auth_active_1', '4o: active authorized playback stays undisturbed');
      assertEqual(engine.getState().isPlaying, true, '4o2: active authorized track remains playing');

      await engine.stop();
      engine.clearQueue();

      // 4f. Fallback to general YouTube search when videoCategoryId=10 returns empty -> still rejected from queue & preserves link
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const urlStr = typeof input === 'string' ? input : input.toString();
        if (urlStr.startsWith(YOUTUBE_DATA_API_SEARCH_ENDPOINT)) {
          const parsed = new URL(urlStr);
          if (parsed.searchParams.get('videoCategoryId') === YOUTUBE_MUSIC_CATEGORY_ID) {
            return new Response(JSON.stringify({ items: [] }), { status: 200 });
          }
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: { videoId: 'yt_general_303' },
                  snippet: {
                    title: 'Live Acoustic Session',
                    channelTitle: 'Studio Channel',
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ tracks: { items: [] } }), { status: 200 });
      }) as typeof fetch;

      const ytFallbackPlay = await engine.handlePlayCommand('viewer_fb', 'Live Acoustic Session', true);
      assertEqual(ytFallbackPlay.success, false, '4p0: general YouTube metadata rejected from playback/queue');
      assertEqual(ytFallbackPlay.item?.provider, 'youtube', '4p: falls back to youtube when category=10 is empty');
      assertEqual(
        ytFallbackPlay.item?.externalUrl,
        'https://www.youtube.com/watch?v=yt_general_303',
        '4q: fallback uses www.youtube.com watch URL'
      );
      assertEqual(engine.getState().queue.length, 0, '4q2: general YouTube metadata does not enter queue');

      // 4g. When YouTube Music errors (403 quota), skips duplicate YouTube search and falls back to Spotify -> also rejected from playback/queue
      let ytCallsOnError = 0;
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const urlStr = typeof input === 'string' ? input : input.toString();
        if (urlStr.startsWith(YOUTUBE_DATA_API_SEARCH_ENDPOINT)) {
          ytCallsOnError += 1;
          return new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), { status: 403 });
        }
        if (urlStr.startsWith('https://api.spotify.com/v1/search')) {
          return new Response(
            JSON.stringify({
              tracks: {
                items: [
                  {
                    id: 'sp_track_1',
                    name: 'Fallback Song',
                    artists: [{ name: 'Spotify Artist' }],
                    album: { name: 'Album X', images: [] },
                    duration_ms: 190000,
                    external_urls: { spotify: 'https://open.spotify.com/track/sp_track_1' },
                  },
                ],
              },
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected fetch: ${urlStr}`);
      }) as typeof fetch;

      const spFallback = await engine.handlePlayCommand('viewer_sp', 'Fallback Song', true);
      assertEqual(ytCallsOnError, 1, '4r: does not burn duplicate YouTube quota on 403 error');
      assertEqual(spFallback.success, false, '4s0: Spotify metadata also rejected from playback/queue');
      assertEqual(spFallback.item?.provider, 'spotify', '4s: falls back to Spotify metadata when YouTube API fails');
      assertEqual(
        spFallback.item?.externalUrl,
        'https://open.spotify.com/track/sp_track_1',
        '4t: Spotify external deep-link preserved'
      );
      assertEqual(engine.getState().queue.length, 0, '4u: Spotify metadata does not enter queue');
    } finally {
      engine.destroy();
    }

    // 5. Legacy IndexedDB Audius history snapshot sanitizes safely to non-playable metadata record
    const legacyAudiusSnapshot = sanitizeHistoryTrackSnapshot({
      id: 'legacy_aud_1',
      title: 'Legacy Track',
      artist: 'Old Creator',
      provider: 'audius' as never,
      sourceType: 'remote_url',
      playable: true,
      audioUrl: 'https://creatornode.audius.co/tracks/cidstream/QmLegacy',
      externalUrl: 'https://audius.co/oldcreator/legacy-track',
    });
    assertEqual(legacyAudiusSnapshot.playable, false, '5a: legacy Audius history entry downgraded to playable=false');
    assertEqual(legacyAudiusSnapshot.audioUrl, undefined, '5b: legacy Audius audioUrl stripped safely');

    // 6. Static compliance check: official API only, zero scraping / undocumented endpoints, zero Audius code
    const ytmSource = readFileSync(join(process.cwd(), 'src', 'services', 'youtubeMusicService.ts'), 'utf8');
    const engineSource = readFileSync(join(process.cwd(), 'src', 'services', 'songRequestEngine.ts'), 'utf8');
    assert(
      ytmSource.includes('https://www.googleapis.com/youtube/v3/search') &&
        !ytmSource.includes('youtubei') &&
        !ytmSource.includes('ytdl') &&
        !ytmSource.includes('googlevideo.com'),
      '6a: youtubeMusicService.ts uses official YouTube Data API v3 only with zero scraping or audio extraction'
    );
    assert(
      !engineSource.includes('audiusService') && !engineSource.includes('api.audius.co'),
      '6b: songRequestEngine.ts has zero Audius imports or endpoints'
    );

    console.log(`youtubeMusicSongRequest.test.ts: PASS (${assertions} assertions)`);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { Audio?: unknown }).Audio = originalAudio;
  }
}

void runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
