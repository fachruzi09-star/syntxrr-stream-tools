// Unit test terarah untuk SongRequestEngine Mode A
// Dijalankan via: bun run src/services/__tests__/songRequest.test.ts

import { streamEventBus } from '../eventBus';
import { SongRequestEngine, songRequestEngine } from '../songRequestEngine';
import type { LocalAudioTrackMeta, StreamEvent } from '../../types';

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

async function runSongRequestTests(): Promise<void> {
  // Detach module singleton so test instance receives streamEventBus events cleanly without interference
  songRequestEngine.destroy();

  const originalAudio = (globalThis as { Audio?: unknown }).Audio;
  let lastMockAudio: MockHtmlAudio | null = null;
  (globalThis as { Audio?: unknown }).Audio = class extends MockHtmlAudio {
    constructor() {
      super();
      lastMockAudio = this;
    }
  };

  const engine = new SongRequestEngine();

  try {
    engine.configureContext({
      operatingMode: 'MODE_A_TIKTOK_COMPANION',
      youtubeApiKey: '',
      spotifyAccessToken: '',
    });

    const tracksMeta: LocalAudioTrackMeta[] = [
      {
        id: 'local_1',
        title: 'Neon Horizon',
        artist: 'Synth Wave',
        duration: 180,
        sizeBytes: 1024,
        filename: 'neon_horizon.mp3',
        addedAt: 1000,
        mimeType: 'audio/mpeg',
      },
      {
        id: 'local_2',
        title: 'Midnight Drive',
        artist: 'City Pop',
        duration: 210,
        sizeBytes: 1024,
        filename: 'midnight_drive.mp3',
        addedAt: 2000,
        mimeType: 'audio/mpeg',
      },
      {
        id: 'local_3',
        title: 'Sunset Echo',
        artist: 'LoFi Lab',
        duration: 150,
        sizeBytes: 1024,
        filename: 'sunset_echo.mp3',
        addedAt: 3000,
        mimeType: 'audio/mpeg',
      },
    ];
    const filesMap = new Map<string, File>([
      ['local_1', new File([new Uint8Array([1, 2, 3])], 'neon_horizon.mp3', { type: 'audio/mpeg' })],
      ['local_2', new File([new Uint8Array([4, 5, 6])], 'midnight_drive.mp3', { type: 'audio/mpeg' })],
      ['local_3', new File([new Uint8Array([7, 8, 9])], 'sunset_echo.mp3', { type: 'audio/mpeg' })],
    ]);
    engine.registerLocalLibrary(tracksMeta, filesMap);

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

    // 2. Mode A !play via streamEventBus + duplicate event.id deduplication
    const chatPlay1: StreamEvent = {
      id: 'chat_evt_1',
      type: 'chat',
      username: 'penonton_a',
      detail: '!play Neon Horizon',
      timestamp: Date.now(),
      isSimulation: false,
    };
    streamEventBus.emit(chatPlay1);
    await flushMicrotasks();

    let state = engine.getState();
    assertEqual(state.currentTrack?.title, 'Neon Horizon', 'First !play starts playback immediately');
    assertEqual(state.isPlaying, true, 'Playback status is playing');
    assertEqual(state.playbackStatus, 'playing', 'playbackStatus=playing');
    assertEqual(state.queue.length, 0, 'Queue empty when only 1 track playing');
    assertEqual(state.isLiveChatConnected, true, 'Real Mode A chat marks isLiveChatConnected=true');

    // Re-emitting exact same event.id MUST be ignored by deduplicator (not queued twice, no cooldown error)
    streamEventBus.emit(chatPlay1);
    await flushMicrotasks();
    state = engine.getState();
    assertEqual(state.queue.length, 0, 'Duplicate event.id does not enqueue track again');

    // 3. Second & third requests from different viewers go into queue
    streamEventBus.emit({
      id: 'chat_evt_2',
      type: 'chat',
      username: 'penonton_b',
      detail: '!play Midnight Drive',
      timestamp: Date.now(),
      isSimulation: false,
    });
    streamEventBus.emit({
      id: 'chat_evt_3',
      type: 'chat',
      username: 'penonton_c',
      detail: '!play Sunset Echo',
      timestamp: Date.now(),
      isSimulation: false,
    });
    await flushMicrotasks();

    state = engine.getState();
    assertEqual(state.queue.length, 2, 'Two subsequent requests added to queue');
    assertEqual(state.queue[0].title, 'Midnight Drive', 'Queue FIFO #1');
    assertEqual(state.queue[1].title, 'Sunset Echo', 'Queue FIFO #2');

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

    // 5. !next immediately stops active track and starts queued Sunset Echo
    streamEventBus.emit({
      id: 'chat_evt_4',
      type: 'chat',
      username: 'streamer_mod',
      detail: '!next',
      timestamp: Date.now(),
      isSimulation: false,
    });
    await flushMicrotasks();

    state = engine.getState();
    assertEqual(state.currentTrack?.title, 'Sunset Echo', '!next advances immediately to Sunset Echo');
    assertEqual(state.isPlaying, true, '!next starts playback of next track');
    assertEqual(state.queue.length, 0, 'Queue empty now');

    // 6. !next when queue is empty stops playback cleanly without error
    const skipEmptyOk = await engine.handleSkipCommand('streamer_mod', false);
    assertEqual(skipEmptyOk, false, '!next on empty queue returns false');
    state = engine.getState();
    assertEqual(state.currentTrack, null, 'Active track cleared when queue empty on !next');
    assertEqual(state.isPlaying, false, 'isPlaying false after stopping on empty queue');
    assertEqual(state.playbackStatus, 'idle', 'playbackStatus=idle after stopping on empty queue');

    // 7. History records playing / completed / skipped transitions accurately
    const statuses = state.history.map((h) => `${h.title}:${h.status}`);
    assert(statuses.includes('Neon Horizon:playing'), 'History recorded Neon Horizon playing');
    assert(statuses.includes('Neon Horizon:completed'), 'History recorded Neon Horizon completed');
    assert(statuses.includes('Midnight Drive:skipped'), 'History recorded Midnight Drive skipped');
    assert(statuses.includes('Sunset Echo:skipped'), 'History recorded Sunset Echo skipped');

    // 8. Cooldown enforced for same non-sim user within cooldown window
    const cooldownErr = await engine.handlePlayCommand('penonton_b', 'Neon Horizon', false);
    assertEqual(cooldownErr.success, false, 'Viewer cooldown blocks rapid repeat request');
    assert(
      (cooldownErr.error || '').toLowerCase().includes('cooldown'),
      'Cooldown error explains cooldown policy'
    );

    assert(lastMockAudio !== null, 'Mock HTMLAudio instance exercised');
  } finally {
    engine.destroy();
    (globalThis as { Audio?: unknown }).Audio = originalAudio;
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
