// Unit test terarah untuk SongRequestEngine Mode A
// Dijalankan via: bun run src/services/__tests__/songRequest.test.ts

import { streamEventBus } from '../eventBus';
import { SongRequestEngine, songRequestEngine, type SongRequestItem } from '../songRequestEngine';
import type { StreamEvent } from '../../types';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
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
  public duration = 120;
  public error: { code: number } | null = null;
  private listeners: Map<string, Array<() => void>> = new Map();

  addEventListener(event: string, cb: () => void): void {
    const arr = this.listeners.get(event) || [];
    arr.push(cb);
    this.listeners.set(event, arr);
  }

  removeAttribute(attr: string): void {
    if (attr === 'src') {
      this.src = '';
    }
  }

  load(): void {
    this.ended = false;
  }

  async play(): Promise<void> {
    if (!this.src) {
      throw new Error('No src set');
    }
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

function makeAuthorizedTrack(
  id: string,
  title: string,
  artist: string,
  requester: string,
  audioUrl: string
): SongRequestItem {
  return {
    id,
    title,
    artist,
    requester,
    durationSec: 180,
    requestedAt: Date.now(),
    sourceType: 'remote_url',
    provider: 'authorized_stream',
    providerTrackId: id,
    playable: true,
    audioUrl,
    platform: 'Stream',
  };
}

async function runSongRequestTests(): Promise<void> {
  // Detach module singleton so test instance receives streamEventBus events cleanly without interference
  songRequestEngine.destroy();

  const originalAudio = (globalThis as { Audio?: unknown }).Audio;
  const originalFetch = globalThis.fetch;
  let lastMockAudio: MockHtmlAudio | null = null;
  (globalThis as { Audio?: unknown }).Audio = class extends MockHtmlAudio {
    constructor() {
      super();
      lastMockAudio = this;
    }
  };

  // Mock official YouTube Data API v3 & Spotify Web API catalog responses (metadata only)
  const catalogFetchMock = (async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    if (urlStr.startsWith('https://www.googleapis.com/youtube/v3/search')) {
      const parsed = new URL(urlStr);
      const q = (parsed.searchParams.get('q') || '').toLowerCase();
      if (q.includes('lagu tidak ada')) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (q.includes('midnight drive')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: { videoId: 'yt_vid_midnight' },
                snippet: {
                  title: 'Midnight Drive',
                  channelTitle: 'City Pop',
                  thumbnails: { medium: { url: 'https://i.ytimg.com/vi/yt_vid_midnight/mqdefault.jpg' } },
                  publishedAt: '2025-01-01T00:00:00Z',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (q.includes('sunset echo')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: { videoId: 'yt_vid_sunset' },
                snippet: {
                  title: 'Sunset Echo',
                  channelTitle: 'LoFi Lab',
                  thumbnails: { medium: { url: 'https://i.ytimg.com/vi/yt_vid_sunset/mqdefault.jpg' } },
                  publishedAt: '2025-01-02T00:00:00Z',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          items: [
            {
              id: { videoId: 'yt_vid_neon' },
              snippet: {
                title: 'Neon Horizon',
                channelTitle: 'Synth Wave',
                thumbnails: { medium: { url: 'https://i.ytimg.com/vi/yt_vid_neon/mqdefault.jpg' } },
                publishedAt: '2025-01-03T00:00:00Z',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.startsWith('https://api.spotify.com/v1/search')) {
      return new Response(JSON.stringify({ tracks: { items: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: { message: 'Unexpected URL' } }), { status: 404 });
  }) as typeof fetch;
  globalThis.fetch = catalogFetchMock;

  const engine = new SongRequestEngine();

  try {
    engine.configureContext({
      operatingMode: 'MODE_A_TIKTOK_COMPANION',
      youtubeApiKey: 'test-youtube-catalog-key',
      spotifyAccessToken: '',
    });

    // Initial announcement must not advertise !next or !skip as chat commands
    assert(
      !engine.getState().recentAnnouncements.some((msg) => msg.includes('!next') || msg.includes('!skip')),
      'Initial announcement does not mention !next or !skip'
    );

    // 1. Validation & error handling for empty query, blacklist, and unfound song
    const emptyRes = await engine.handlePlayCommand('viewer1', '   ', false);
    assertEqual(emptyRes.success, false, 'Empty !play query rejected');
    assert(Boolean(engine.getState().lastError), 'lastError populated for empty query');

    const blacklistRes = await engine.handlePlayCommand('viewer1', 'toxic beats', false);
    assertEqual(blacklistRes.success, false, 'Blacklisted query rejected');

    const missingRes = await engine.handlePlayCommand('viewer1', 'Lagu Tidak Ada', false);
    assertEqual(missingRes.success, false, 'Missing track reports honest error');
    assert(
      (engine.getState().lastError || '').includes('tidak ditemukan'),
      'lastError describes missing track'
    );

    // 1b. Metadata-only track from YouTube Music catalog when idle MUST NOT fake playback success
    const metadataOnlyPlay = await engine.handlePlayCommand('viewer_meta', 'Midnight Drive', true);
    assertEqual(metadataOnlyPlay.success, false, 'Metadata-only track does not claim playable success');
    assertEqual(metadataOnlyPlay.item?.provider, 'youtube_music', 'Primary catalog provider is youtube_music');
    assertEqual(metadataOnlyPlay.item?.platform, 'YouTube Music', 'Primary catalog platform is YouTube Music');
    assertEqual(metadataOnlyPlay.item?.playable, false, 'Metadata item keeps playable=false');
    assertEqual(engine.getState().isPlaying, false, 'Metadata-only track keeps isPlaying=false');
    assertEqual(engine.getState().audioPlaybackMode, 'pending_source', 'Metadata-only track marks pending_source');
    assertEqual(engine.getState().history.length, 0, 'Metadata-only failure does not create played session history');

    // 2. Authorized direct stream starts playback cleanly; subsequent !play/!sr/!songrequest enqueue FIFO + dedup
    const authTrack1 = makeAuthorizedTrack(
      'auth_1',
      'Neon Horizon',
      'Synth Wave',
      'penonton_a',
      'https://cdn.example.com/audio/neon_horizon.mp3'
    );
    const authTrack2 = makeAuthorizedTrack(
      'auth_2',
      'Midnight Drive',
      'City Pop',
      'penonton_b',
      'https://cdn.example.com/audio/midnight_drive.mp3'
    );
    const authTrack3 = makeAuthorizedTrack(
      'auth_3',
      'Sunset Echo',
      'LoFi Lab',
      'penonton_c',
      'https://cdn.example.com/audio/sunset_echo.mp3'
    );

    const startedAuth1 = await engine.enqueueAndPlayItem(authTrack1);
    assertEqual(startedAuth1, true, 'Authorized direct stream starts playback');

    let state = engine.getState();
    assertEqual(state.currentTrack?.title, 'Neon Horizon', 'Active track is Neon Horizon');
    assertEqual(state.isPlaying, true, 'Playback status is playing');
    assertEqual(state.playbackStatus, 'playing', 'playbackStatus=playing');
    assertEqual(state.queue.length, 0, 'Queue empty when only 1 track playing');
    assertEqual(state.history.length, 1, 'Single history session created when playback starts');
    assertEqual(state.history[0].status, 'playing', 'Active session history starts as playing');

    // Mode A !play via streamEventBus + duplicate event.id deduplication
    const chatPlay1: StreamEvent = {
      id: 'chat_evt_1',
      type: 'chat',
      username: 'penonton_chat_1',
      detail: '!play Neon Horizon',
      timestamp: Date.now(),
      isSimulation: false,
    };
    streamEventBus.emit(chatPlay1);
    await flushMicrotasks();

    state = engine.getState();
    assertEqual(state.queue.length, 1, 'First queued !play added via streamEventBus');
    assertEqual(state.queue[0].sourceType, 'youtube_metadata', 'Catalog request stores metadata reference');
    assertEqual(state.queue[0].playable, false, 'Catalog request stays non-playable until authorized source');
    assertEqual(state.isLiveChatConnected, true, 'Real Mode A chat marks isLiveChatConnected=true');

    // Re-emitting exact same event.id MUST be ignored by deduplicator
    streamEventBus.emit(chatPlay1);
    await flushMicrotasks();
    state = engine.getState();
    assertEqual(state.queue.length, 1, 'Duplicate event.id does not enqueue track again');

    // 3. Second & third requests via !sr and !songrequest go into queue in FIFO order
    streamEventBus.emit({
      id: 'chat_evt_2',
      type: 'chat',
      username: 'penonton_b',
      detail: '!sr Midnight Drive',
      timestamp: Date.now(),
      isSimulation: false,
    });
    streamEventBus.emit({
      id: 'chat_evt_3',
      type: 'chat',
      username: 'penonton_c',
      detail: '!songrequest Sunset Echo',
      timestamp: Date.now(),
      isSimulation: false,
    });
    await flushMicrotasks();

    state = engine.getState();
    assertEqual(state.queue.length, 3, 'Three chat requests queued in FIFO order');
    assertEqual(state.queue[0].title, 'Neon Horizon', 'Queue FIFO #1');
    assertEqual(state.queue[1].title, 'Midnight Drive', 'Queue FIFO #2');
    assertEqual(state.queue[2].title, 'Sunset Echo', 'Queue FIFO #3');

    // !queue, !np, and !nowplaying remain active chat commands
    streamEventBus.emit({
      id: 'chat_evt_queue',
      type: 'chat',
      username: 'penonton_q',
      detail: '!queue',
      timestamp: Date.now(),
      isSimulation: false,
    });
    streamEventBus.emit({
      id: 'chat_evt_np',
      type: 'chat',
      username: 'penonton_np',
      detail: '!np',
      timestamp: Date.now(),
      isSimulation: false,
    });
    streamEventBus.emit({
      id: 'chat_evt_nowplaying',
      type: 'chat',
      username: 'penonton_np2',
      detail: '!nowplaying',
      timestamp: Date.now(),
      isSimulation: false,
    });
    await flushMicrotasks();
    state = engine.getState();
    assert(
      state.recentAnnouncements.some((m) => m.includes('Antrean (3 lagu)')),
      '!queue chat command announces current queue'
    );
    assert(
      state.recentAnnouncements.some((m) => m.includes('Now Playing') && m.includes('Neon Horizon')),
      '!np / !nowplaying chat command announces current track'
    );

    // Replace queue with authorized playable tracks to test natural completion & skipTrack() playback transitions
    engine.setQueue([authTrack2, authTrack3]);

    // 4. Duplicate handleTrackEnded() guard (race between native callback & position poll) must NOT double-skip
    await Promise.all([engine.handleTrackEnded(), engine.handleTrackEnded()]);
    await flushMicrotasks();
    state = engine.getState();
    assertEqual(
      state.currentTrack?.title,
      'Midnight Drive',
      'Concurrent handleTrackEnded advances only one track'
    );
    assertEqual(state.queue.length, 1, 'Remaining queue length is 1 after natural completion');

    // 5. Chat commands !next and !skip MUST be ignored (neither advances active track nor modifies queue/status)
    const beforeChatNext = engine.getState();
    const beforeQueueIds = beforeChatNext.queue.map((q) => q.id).join(',');
    const beforeHistoryLen = beforeChatNext.history.length;
    const beforeAnnouncementsLen = beforeChatNext.recentAnnouncements.length;

    streamEventBus.emit({
      id: 'chat_evt_next_ignored',
      type: 'chat',
      username: 'viewer_next',
      detail: '!next',
      timestamp: Date.now(),
      isSimulation: false,
    });
    streamEventBus.emit({
      id: 'chat_evt_skip_ignored',
      type: 'chat',
      username: 'viewer_skip',
      detail: '!skip',
      timestamp: Date.now(),
      isSimulation: false,
    });
    streamEventBus.emit({
      id: 'chat_evt_next_sim_ignored',
      type: 'chat',
      username: 'viewer_next_sim',
      detail: '!next',
      timestamp: Date.now(),
      isSimulation: true,
    });
    await flushMicrotasks();

    state = engine.getState();
    assertEqual(state.currentTrack?.title, 'Midnight Drive', '!next and !skip from chat do not change active track');
    assertEqual(state.queue.map((q) => q.id).join(','), beforeQueueIds, '!next and !skip from chat do not modify queue');
    assertEqual(state.isPlaying, true, '!next and !skip from chat do not change isPlaying');
    assertEqual(state.playbackStatus, 'playing', '!next and !skip from chat do not change playbackStatus');
    assertEqual(state.history.length, beforeHistoryLen, '!next and !skip from chat do not write skip history');
    assertEqual(
      state.recentAnnouncements.length,
      beforeAnnouncementsLen,
      '!next and !skip from chat do not emit skip announcements'
    );

    // 6. Internal Next via skipTrack() still skips active track and plays queued Sunset Echo
    const skipInternalOk = await engine.skipTrack('Streamer');
    await flushMicrotasks();
    assertEqual(skipInternalOk, true, 'Internal skipTrack() returns true when starting next queued track');
    state = engine.getState();
    assertEqual(state.currentTrack?.title, 'Sunset Echo', 'skipTrack() advances immediately to Sunset Echo');
    assertEqual(state.isPlaying, true, 'skipTrack() starts playback of next track');
    assertEqual(state.playbackStatus, 'playing', 'skipTrack() keeps playbackStatus=playing');
    assertEqual(state.queue.length, 0, 'Queue empty now after skipTrack()');

    // 7. Internal skipTrack() when queue is empty clears playback state cleanly without error
    const skipEmptyOk = await engine.skipTrack('MediaSession');
    assertEqual(skipEmptyOk, false, 'skipTrack() on empty queue returns false');
    state = engine.getState();
    assertEqual(state.currentTrack, null, 'Active track cleared when queue empty on skipTrack()');
    assertEqual(state.isPlaying, false, 'isPlaying false after stopping on empty queue');
    assertEqual(state.playbackStatus, 'idle', 'playbackStatus=idle after stopping on empty queue');
    assertEqual(state.audioPlaybackMode, 'idle', 'audioPlaybackMode=idle after stopping on empty queue');
    assertEqual(state.audioRoutedToStream, false, 'audioRoutedToStream=false after stopping on empty queue');

    // 8. History updates the SAME session entry per playback session (3 sessions total: 1 completed, 2 skipped)
    assertEqual(state.history.length, 3, 'One history entry per playback session (no duplicate rows)');
    const statuses = state.history.map((h) => `${h.title}:${h.status}`);
    assert(statuses.includes('Neon Horizon:completed'), 'Session 1 updated in place to completed');
    assert(statuses.includes('Midnight Drive:skipped'), 'Session 2 updated in place to skipped');
    assert(statuses.includes('Sunset Echo:skipped'), 'Session 3 updated in place to skipped');

    // 9. Cooldown enforced for same non-sim user within cooldown window
    const cooldownErr = await engine.handlePlayCommand('penonton_b', 'Neon Horizon', false);
    assertEqual(cooldownErr.success, false, 'Viewer cooldown blocks rapid repeat request');
    assert(
      (cooldownErr.error || '').toLowerCase().includes('cooldown'),
      'Cooldown error explains cooldown policy'
    );

    // 10. Queue capacity policy: default 5, max configurable 20, clamped integer 1-20, no truncation of existing queue
    assertEqual(engine.getState().policy.maxQueueSize, 5, 'Default maxQueueSize is 5');

    // Start 1 active authorized track, then fill default 5 queue slots (simulation skips cooldown)
    await engine.enqueueAndPlayItem(
      makeAuthorizedTrack('cap_active_track', 'Neon Horizon', 'Synth Wave', 'cap_active', 'https://cdn.example.com/a.mp3')
    );
    for (let i = 1; i <= 5; i++) {
      const enq = await engine.handlePlayCommand(`cap_u_${i}`, 'Midnight Drive', true);
      assertEqual(enq.success, true, `Default capacity allows queued track #${i}`);
    }
    assertEqual(engine.getState().queue.length, 5, 'Queue holds 5 tracks under default policy');

    const overflowDefault = await engine.handlePlayCommand('cap_overflow', 'Sunset Echo', true);
    assertEqual(overflowDefault.success, false, '6th queued track rejected under default maxQueueSize=5');
    assert(
      (overflowDefault.error || '').includes('(5 lagu)'),
      'Overflow error reports active maxQueueSize=5'
    );

    // Lowering maxQueueSize below existing queue length MUST NOT drop queued tracks, and still rejects new requests
    engine.updatePolicy({ maxQueueSize: 3 });
    assertEqual(engine.getState().policy.maxQueueSize, 3, 'updatePolicy sets valid integer maxQueueSize=3');
    assertEqual(
      engine.getState().queue.length,
      5,
      'Lowering maxQueueSize does NOT remove already-queued tracks'
    );
    const blockedAfterLower = await engine.handlePlayCommand('cap_after_lower', 'Sunset Echo', true);
    assertEqual(
      blockedAfterLower.success,
      false,
      'New request rejected when existing queue.length >= lowered maxQueueSize'
    );

    // Clamping & integer coercion tests
    engine.updatePolicy({ maxQueueSize: 0 });
    assertEqual(engine.getState().policy.maxQueueSize, 1, 'maxQueueSize=0 clamped to 1');
    engine.updatePolicy({ maxQueueSize: -5 });
    assertEqual(engine.getState().policy.maxQueueSize, 1, 'Negative maxQueueSize clamped to 1');
    engine.updatePolicy({ maxQueueSize: 7.6 });
    assertEqual(engine.getState().policy.maxQueueSize, 8, 'Fractional maxQueueSize 7.6 rounded to integer 8');
    engine.updatePolicy({ maxQueueSize: 7.2 });
    assertEqual(engine.getState().policy.maxQueueSize, 7, 'Fractional maxQueueSize 7.2 rounded to integer 7');
    engine.updatePolicy({ maxQueueSize: Number.NaN });
    assertEqual(engine.getState().policy.maxQueueSize, 7, 'NaN maxQueueSize preserves valid previous integer');
    engine.updatePolicy({ maxQueueSize: 50 });
    assertEqual(engine.getState().policy.maxQueueSize, 20, 'maxQueueSize above 20 clamped to 20');

    // Verify queue can hold up to maximum 20 tracks and rejects the 21st
    for (let i = 6; i <= 20; i++) {
      const enq = await engine.handlePlayCommand(`cap_max_${i}`, 'Sunset Echo', true);
      assertEqual(enq.success, true, `Max capacity allows queued track #${i}`);
    }
    assertEqual(engine.getState().queue.length, 20, 'Queue holds maximum 20 tracks');
    const overflowMax = await engine.handlePlayCommand('cap_overflow_21', 'Neon Horizon', true);
    assertEqual(overflowMax.success, false, '21st queued track rejected at maxQueueSize=20');
    assert(
      (overflowMax.error || '').includes('(20 lagu)'),
      'Overflow error reports maxQueueSize=20'
    );

    assert(lastMockAudio !== null, 'Mock HTMLAudio instance exercised');
  } finally {
    engine.destroy();
    (globalThis as { Audio?: unknown }).Audio = originalAudio;
    globalThis.fetch = originalFetch;
  }
}

void runSongRequestTests()
  .then(() => {
    console.log('ALL_SONG_REQUEST_TESTS_PASSED');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
