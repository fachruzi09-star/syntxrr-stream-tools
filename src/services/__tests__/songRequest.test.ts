// Unit test terarah untuk SongRequestEngine Mode A
// Dijalankan via: bun run src/services/__tests__/songRequest.test.ts

import { streamEventBus } from '../eventBus';
import { SongRequestEngine, songRequestEngine, isPlayableSongRequestItem, type SongRequestItem } from '../songRequestEngine';
import { audioEngine } from '../localAudioEngine';
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

    // 1b. Metadata-only track from YouTube Music catalog when idle MUST NOT enter queue, fake playback, or consume cooldown
    const metadataOnlyPlay = await engine.handlePlayCommand('viewer_meta', 'Midnight Drive', false);
    assertEqual(metadataOnlyPlay.success, false, 'Metadata-only track does not claim playable success');
    assertEqual(metadataOnlyPlay.item?.provider, 'youtube_music', 'Primary catalog provider is youtube_music');
    assertEqual(metadataOnlyPlay.item?.platform, 'YouTube Music', 'Primary catalog platform is YouTube Music');
    assertEqual(metadataOnlyPlay.item?.playable, false, 'Metadata item keeps playable=false');
    assertEqual(engine.getState().isPlaying, false, 'Metadata-only track keeps isPlaying=false');
    assertEqual(engine.getState().audioPlaybackMode, 'pending_source', 'Metadata-only track marks pending_source');
    assertEqual(engine.getState().queue.length, 0, 'Metadata-only track does not enter queue');
    assertEqual(engine.getState().history.length, 0, 'Metadata-only failure does not create played session history');
    assert(
      (metadataOnlyPlay.error || '').includes('https://music.youtube.com/watch?v=yt_vid_midnight'),
      'Metadata rejection preserves external deep-link'
    );

    // Cooldown MUST NOT be consumed by rejected metadata request from viewer_meta
    const repeatMetaSameUser = await engine.handlePlayCommand('viewer_meta', 'Midnight Drive', false);
    assert(
      !(repeatMetaSameUser.error || '').toLowerCase().includes('cooldown'),
      'Cooldown not consumed when previous metadata-only request failed'
    );

    // 1c. 7-stage pre-flight diagnostic with API Key configured MUST NOT claim Stage 5 resolved or overallSuccess=true
    const preflightDiag = engine.execute7StageTestPipeline('Midnight Drive', 'Tester_Streamer', true);
    assertEqual(
      preflightDiag.stages.stage5_audioSourceResolved.status,
      'pending',
      'API key config alone does not mark Stage 5 success'
    );
    assertEqual(
      preflightDiag.stages.stage6_playbackStarted.status,
      'pending',
      'Stage 6 stays pending before real playback'
    );
    assertEqual(preflightDiag.overallSuccess, false, 'Pre-flight 7-stage test never reports overallSuccess=true');

    // 1d. Direct entry guards: enqueueAndPlayItem(), setQueue(), and hydrateQueue() MUST reject metadata-only / spoofed items
    const ytmMetadataStub: SongRequestItem = {
      id: 'meta_ytm_1',
      title: 'Metadata YTM',
      artist: 'Topic Artist',
      requester: 'viewer_1',
      durationSec: 0,
      requestedAt: Date.now(),
      sourceType: 'youtube_metadata',
      provider: 'youtube_music',
      playable: false,
      externalUrl: 'https://music.youtube.com/watch?v=meta_ytm_1',
      platform: 'YouTube Music',
    };
    const ytSpoofedMetadata: SongRequestItem = {
      id: 'meta_yt_spoof',
      title: 'Spoofed YT',
      artist: 'Channel',
      requester: 'viewer_2',
      durationSec: 0,
      requestedAt: Date.now(),
      sourceType: 'youtube_metadata',
      provider: 'youtube',
      playable: true, // invalid attempt to mark metadata playable
      audioUrl: 'https://music.youtube.com/watch?v=meta_yt_spoof',
      platform: 'YouTube',
    };
    const spMetadataStub: SongRequestItem = {
      id: 'meta_sp_1',
      title: 'Metadata Spotify',
      artist: 'Spotify Artist',
      requester: 'viewer_3',
      durationSec: 180,
      requestedAt: Date.now(),
      sourceType: 'spotify_metadata',
      provider: 'spotify',
      playable: false,
      externalUrl: 'https://open.spotify.com/track/sp_1',
      platform: 'Spotify',
    };

    assertEqual(isPlayableSongRequestItem(ytmMetadataStub), false, 'isPlayableSongRequestItem rejects YouTube Music metadata');
    assertEqual(isPlayableSongRequestItem(ytSpoofedMetadata), false, 'isPlayableSongRequestItem rejects spoofed youtube_metadata');
    assertEqual(isPlayableSongRequestItem(spMetadataStub), false, 'isPlayableSongRequestItem rejects Spotify metadata');
    assertEqual(await engine.enqueueAndPlayItem(ytmMetadataStub), false, 'enqueueAndPlayItem rejects YouTube Music metadata');
    assertEqual(await engine.enqueueAndPlayItem(ytSpoofedMetadata), false, 'enqueueAndPlayItem rejects spoofed YouTube metadata');
    assertEqual(await engine.enqueueAndPlayItem(spMetadataStub), false, 'enqueueAndPlayItem rejects Spotify metadata');
    engine.setQueue([ytmMetadataStub, ytSpoofedMetadata, spMetadataStub]);
    assertEqual(engine.getState().queue.length, 0, 'setQueue filters out all metadata-only items');
    const hydrated = engine.hydrateQueue([ytmMetadataStub, spMetadataStub]);
    assertEqual(hydrated.length, 0, 'hydrateQueue filters out restored non-playable metadata items');

    // 2. Authorized direct stream starts playback cleanly & produces honest 7-stage diagnostics
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

    // Wire a controlled test resolver for playable streams when testing chat commands (!play / !sr / !songrequest)
    let resolveAuthorizedStreamsForChatTests = false;
    const originalResolve = (engine as unknown as {
      resolveSongFromProviders: (q: string, r: string) => Promise<{ item?: SongRequestItem; error?: string }>;
    }).resolveSongFromProviders.bind(engine);
    (engine as unknown as {
      resolveSongFromProviders: (q: string, r: string) => Promise<{ item?: SongRequestItem; error?: string }>;
    }).resolveSongFromProviders = async (q: string, r: string) => {
      if (resolveAuthorizedStreamsForChatTests) {
        const clean = q.trim();
        const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        return {
          item: makeAuthorizedTrack(
            `chat_auth_${slug}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            clean,
            'Authorized Studio Artist',
            r,
            `https://cdn.example.com/audio/${slug}.mp3`
          ),
        };
      }
      return originalResolve(q, r);
    };

    // Exercise playable !play while idle -> Stage 5 & 6 success, Stage 7 warning (no false TikTok LIVE capture claim), overallSuccess=true
    resolveAuthorizedStreamsForChatTests = true;
    const authIdlePlay = await engine.handlePlayCommand('penonton_a', 'Neon Horizon', true);
    assertEqual(authIdlePlay.success, true, 'Authorized direct stream !play starts playback cleanly');
    const authDiag = engine.getState().lastTestPipelineResult!;
    assertEqual(authDiag.stages.stage5_audioSourceResolved.status, 'success', 'Stage 5 success for genuine playable stream');
    assertEqual(authDiag.stages.stage6_playbackStarted.status, 'success', 'Stage 6 success when playback started');
    assertEqual(authDiag.stages.stage7_audioRoutedToStream.status, 'warning', 'Stage 7 stays warning without TikTok LIVE capture verification');
    assert(
      !authDiag.stages.stage7_audioRoutedToStream.summary.includes('tertangkap TikTok LIVE'),
      'Stage 7 summary never falsely claims audio is captured by TikTok LIVE'
    );
    assertEqual(authDiag.overallSuccess, true, 'overallSuccess true when Stage 5 and Stage 6 succeed');

    // While playable track is playing, metadata-only !play MUST be rejected and NOT disturb queue or active playback
    resolveAuthorizedStreamsForChatTests = false;
    const metaWhilePlaying = await engine.handlePlayCommand('viewer_meta_active', 'Midnight Drive', false);
    assertEqual(metaWhilePlaying.success, false, 'Metadata-only !play rejected even while active track plays');
    assertEqual(engine.getState().queue.length, 0, 'Metadata-only !play does not enter queue');
    assertEqual(engine.getState().currentTrack?.title, 'Neon Horizon', 'Active authorized track stays playing');
    assertEqual(engine.getState().isPlaying, true, 'isPlaying stays true after metadata rejection');
    // Verify viewer_meta_active cooldown was NOT consumed
    resolveAuthorizedStreamsForChatTests = true;
    const sameViewerPlayableAfterMeta = await engine.handlePlayCommand('viewer_meta_active', 'Allowed After Reject', false);
    assertEqual(
      sameViewerPlayableAfterMeta.success,
      true,
      'Viewer can immediately request playable song because metadata rejection did not consume cooldown'
    );
    assertEqual(engine.getState().queue.length, 1, 'Playable track queued after metadata rejection');
    // Check queued Stage 6 warning -> overallSuccess MUST be false
    assertEqual(
      engine.getState().lastTestPipelineResult?.stages.stage6_playbackStarted.status,
      'warning',
      'Queued track marks Stage 6 warning'
    );
    assertEqual(
      engine.getState().lastTestPipelineResult?.overallSuccess,
      false,
      'overallSuccess is false when Stage 6 is only warning'
    );

    // Clear queue & restart cleanly from authTrack1 for FIFO chat tests
    await engine.stop();
    engine.clearQueue();
    const startedAuth1 = await engine.enqueueAndPlayItem(authTrack1);
    assertEqual(startedAuth1, true, 'Authorized direct stream starts playback via enqueueAndPlayItem');

    let state = engine.getState();
    assertEqual(state.currentTrack?.title, 'Neon Horizon', 'Active track is Neon Horizon');
    assertEqual(state.isPlaying, true, 'Playback status is playing');
    assertEqual(state.playbackStatus, 'playing', 'playbackStatus=playing');
    assertEqual(state.queue.length, 0, 'Queue empty when only 1 track playing');

    // Mode A playable !play via streamEventBus + duplicate event.id deduplication
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
    assertEqual(state.queue.length, 1, 'First queued playable !play added via streamEventBus');
    assertEqual(state.queue[0].sourceType, 'remote_url', 'Queued track stores remote_url');
    assertEqual(state.queue[0].playable, true, 'Queued track is playable=true');
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

    // Replace queue with mixed stale non-playable entries + authorized playable track to verify setQueue & resilient advancement
    engine.setQueue([ytmMetadataStub, authTrack2, spMetadataStub, authTrack3]);
    assertEqual(engine.getState().queue.length, 2, 'setQueue strips metadata items and keeps only playable tracks');

    // Simulate legacy unplayable items present directly in queue before handleTrackEnded()
    (engine as unknown as { state: { queue: SongRequestItem[] } }).state.queue = [
      ytmMetadataStub,
      spMetadataStub,
      authTrack2,
      authTrack3,
    ];

    // 4. Duplicate handleTrackEnded() guard + stale unplayable skipping must advance cleanly to Midnight Drive
    await Promise.all([engine.handleTrackEnded(), engine.handleTrackEnded()]);
    await flushMicrotasks();
    state = engine.getState();
    assertEqual(
      state.currentTrack?.title,
      'Midnight Drive',
      'Concurrent handleTrackEnded skips stale unplayable items and plays Midnight Drive'
    );
    assertEqual(state.queue.length, 1, 'Remaining queue length is 1 after skipping stale entries and starting Midnight Drive');

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

    // 6. Internal Next (!next control via skipTrack()) skips stale unplayable items and plays Sunset Echo
    (engine as unknown as { state: { queue: SongRequestItem[] } }).state.queue = [
      ytmMetadataStub,
      ytSpoofedMetadata,
      authTrack3,
    ];
    const skipInternalOk = await engine.skipTrack('Streamer');
    await flushMicrotasks();
    assertEqual(skipInternalOk, true, 'Internal skipTrack() skips stale unplayable entries and starts playable Sunset Echo');
    state = engine.getState();
    assertEqual(state.currentTrack?.title, 'Sunset Echo', 'skipTrack() advances immediately to Sunset Echo');
    assertEqual(state.isPlaying, true, 'skipTrack() starts playback of next track');
    assertEqual(state.playbackStatus, 'playing', 'skipTrack() keeps playbackStatus=playing');
    assertEqual(state.queue.length, 0, 'Queue empty now after skipTrack()');

    // 7. Internal skipTrack() when queue only contains stale unplayable item clears playback cleanly without getting stuck
    (engine as unknown as { state: { queue: SongRequestItem[] } }).state.queue = [ytmMetadataStub];
    const skipOnlyInvalidOk = await engine.skipTrack('MediaSession');
    assertEqual(skipOnlyInvalidOk, false, 'skipTrack() with only invalid legacy items returns false cleanly');
    state = engine.getState();
    assertEqual(state.currentTrack, null, 'Active track cleared when only stale non-playable items remained');
    assertEqual(state.isPlaying, false, 'isPlaying false after clearing stale-only queue');
    assertEqual(state.playbackStatus, 'idle', 'playbackStatus=idle after clearing stale-only queue');
    assertEqual(state.queue.length, 0, 'Stale items drained from queue cleanly');

    // 8. Cooldown enforced for same non-sim user when playable request actually succeeded
    const cooldownErr = await engine.handlePlayCommand('penonton_b', 'Neon Horizon', false);
    assertEqual(cooldownErr.success, false, 'Viewer cooldown blocks rapid repeat request after accepted playable song');
    assert(
      (cooldownErr.error || '').toLowerCase().includes('cooldown'),
      'Cooldown error explains cooldown policy'
    );

    // 9. Queue capacity policy: default 5, max configurable 20, clamped integer 1-20, no truncation of existing queue
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

    // 10. LocalAudioEngine remains independently functional and unaffected by SongRequestEngine
    let observedLocalState = audioEngine.getState();
    const unsubLocal = audioEngine.subscribe((s) => {
      observedLocalState = s;
    });
    assertEqual(observedLocalState.currentTrackId, null, 'LocalAudioEngine starts independent and clean');
    assertEqual(observedLocalState.volume, 0.85, 'LocalAudioEngine default volume remains intact');
    unsubLocal();

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
