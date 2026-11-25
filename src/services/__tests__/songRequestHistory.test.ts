// Unit & integration test terarah untuk A2.10.3.2 Song Request History & Requeue Foundation
// Dijalankan via: bun run src/services/__tests__/songRequestHistory.test.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_SONG_REQUEST_HISTORY,
  SongRequestEngine,
  hydrateSongRequestHistoryWithGuard,
  persistSongRequestHistoryIfReady,
  sanitizeHistoryTrackSnapshot,
  sanitizeReferenceUrl,
  sanitizeSongRequestHistoryEntries,
  songRequestEngine,
  type SongRequestHistoryEntry,
  type SongRequestItem,
} from '../songRequestEngine';
import { StorageService } from '../storage';

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
      `Assertion failed (${message}): expected=${String(expected)} actual=${String(actual)}`
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
  public duration = 195;
  public error: { code: number } | null = null;
  public autoEmitPlayingOnPlay = true;
  private pendingPlayResolve: (() => void) | null = null;
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
    if (this.autoEmitPlayingOnPlay) {
      this.paused = false;
      this.emit('playing');
      return;
    }
    await new Promise<void>((resolve) => {
      this.pendingPlayResolve = resolve;
    });
  }

  pause(): void {
    this.paused = true;
  }

  emit(event: string): void {
    if (event === 'playing') {
      this.paused = false;
    }
    const arr = this.listeners.get(event) || [];
    arr.forEach((cb) => cb());
    if (event === 'playing' && this.pendingPlayResolve) {
      const res = this.pendingPlayResolve;
      this.pendingPlayResolve = null;
      res();
    }
  }
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

interface StagedIdbControls {
  idbData: Map<string, unknown>;
  setTxMode: (mode: 'commit' | 'abort_after_request' | 'tx_error') => void;
  setReadMode: (mode: 'ok' | 'request_error' | 'tx_error' | 'tx_abort') => void;
  setFailOpen: (fail: boolean) => void;
  setFailPut: (fail: boolean) => void;
  setOpenDbDelayMs: (ms: number) => void;
  getStats: () => {
    openCount: number;
    closeCount: number;
    putRequestCount: number;
    txCompleteCount: number;
    txAbortCount: number;
    writeKeyOrder: string[];
  };
  install: () => void;
  restore: () => void;
}

function createStagedFakeIndexedDB(): StagedIdbControls {
  const globalRecord = globalThis as unknown as { indexedDB?: unknown };
  const originalIndexedDB = globalRecord.indexedDB;
  const idbData = new Map<string, unknown>();
  let txMode: 'commit' | 'abort_after_request' | 'tx_error' = 'commit';
  let readMode: 'ok' | 'request_error' | 'tx_error' | 'tx_abort' = 'ok';
  let failOpen = false;
  let failPut = false;
  let openDbDelayMs = 0;
  let openCount = 0;
  let closeCount = 0;
  let putRequestCount = 0;
  let txCompleteCount = 0;
  let txAbortCount = 0;
  const writeKeyOrder: string[] = [];

  const fakeIdb = {
    open(_name: string, _version?: number) {
      const openReq: {
        result?: unknown;
        error?: Error;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
      } = { onsuccess: null, onerror: null };

      const finishOpen = () => {
        if (failOpen) {
          openReq.error = new Error('Simulated openDB failure');
          openReq.onerror?.();
          return;
        }
        openCount += 1;
        openReq.result = {
          objectStoreNames: { contains: () => true },
          close() {
            closeCount += 1;
          },
          transaction() {
            const staged = new Map(idbData);
            const txObj: {
              error: Error | null;
              oncomplete: (() => void) | null;
              onerror: (() => void) | null;
              onabort: (() => void) | null;
              objectStore: () => {
                get: (key: string) => {
                  result: unknown;
                  error: Error | null;
                  onsuccess: (() => void) | null;
                  onerror: (() => void) | null;
                };
                put: (value: unknown, key: string) => {
                  error: Error | null;
                  onsuccess: (() => void) | null;
                  onerror: (() => void) | null;
                };
              };
            } = {
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore() {
                return {
                  get(key: string) {
                    const req: {
                      result: unknown;
                      error: Error | null;
                      onsuccess: (() => void) | null;
                      onerror: (() => void) | null;
                    } = { result: undefined, error: null, onsuccess: null, onerror: null };
                    queueMicrotask(() => {
                      if (readMode === 'request_error') {
                        req.error = new Error(`Simulated get request error for ${key}`);
                        req.onerror?.();
                        queueMicrotask(() => {
                          txObj.error = req.error;
                          txAbortCount += 1;
                          txObj.onabort?.();
                        });
                        return;
                      }
                      req.result = idbData.get(key) ?? null;
                      req.onsuccess?.();
                      queueMicrotask(() => {
                        if (readMode === 'tx_abort') {
                          txObj.error = new Error(`Simulated read tx abort for ${key}`);
                          txAbortCount += 1;
                          txObj.onabort?.();
                          return;
                        }
                        if (readMode === 'tx_error') {
                          txObj.error = new Error(`Simulated read tx error for ${key}`);
                          txObj.onerror?.();
                          return;
                        }
                        txObj.oncomplete?.();
                      });
                    });
                    return req;
                  },
                  put(value: unknown, key: string) {
                    const req: {
                      error: Error | null;
                      onsuccess: (() => void) | null;
                      onerror: (() => void) | null;
                    } = { error: null, onsuccess: null, onerror: null };
                    queueMicrotask(() => {
                      if (failPut) {
                        req.error = new Error(`Simulated put error for ${key}`);
                        req.onerror?.();
                        queueMicrotask(() => {
                          txObj.error = req.error;
                          txAbortCount += 1;
                          txObj.onabort?.();
                        });
                        return;
                      }
                      staged.set(key, JSON.parse(JSON.stringify(value)));
                      putRequestCount += 1;
                      writeKeyOrder.push(key);
                      req.onsuccess?.();

                      queueMicrotask(() => {
                        if (txMode === 'abort_after_request') {
                          txObj.error = new Error(`Simulated tx abort after put for ${key}`);
                          txAbortCount += 1;
                          txObj.onabort?.();
                          return;
                        }
                        if (txMode === 'tx_error') {
                          txObj.error = new Error(`Simulated tx error after put for ${key}`);
                          txObj.onerror?.();
                          return;
                        }
                        idbData.clear();
                        staged.forEach((v, k) => idbData.set(k, v));
                        txCompleteCount += 1;
                        txObj.oncomplete?.();
                      });
                    });
                    return req;
                  },
                };
              },
            };
            return txObj;
          },
        };
        openReq.onsuccess?.();
      };

      if (openDbDelayMs > 0) {
        setTimeout(finishOpen, openDbDelayMs);
      } else {
        queueMicrotask(finishOpen);
      }
      return openReq;
    },
  };

  return {
    idbData,
    setTxMode(mode) {
      txMode = mode;
    },
    setReadMode(mode) {
      readMode = mode;
    },
    setFailOpen(fail) {
      failOpen = fail;
    },
    setFailPut(fail) {
      failPut = fail;
    },
    setOpenDbDelayMs(ms) {
      openDbDelayMs = ms;
    },
    getStats() {
      return {
        openCount,
        closeCount,
        putRequestCount,
        txCompleteCount,
        txAbortCount,
        writeKeyOrder: [...writeKeyOrder],
      };
    },
    install() {
      globalRecord.indexedDB = fakeIdb;
    },
    restore() {
      globalRecord.indexedDB = originalIndexedDB;
    },
  };
}

async function runSongRequestHistoryTests(): Promise<void> {
  songRequestEngine.destroy();

  const originalAudio = (globalThis as { Audio?: unknown }).Audio;
  const mockAudioRef: { current: MockHtmlAudio | null } = { current: null };
  let autoEmitPlaying = true;
  (globalThis as { Audio?: unknown }).Audio = class extends MockHtmlAudio {
    constructor() {
      super();
      mockAudioRef.current = this;
    }
    override async play(): Promise<void> {
      this.autoEmitPlayingOnPlay = autoEmitPlaying;
      return super.play();
    }
  };

  const fakeIdb = createStagedFakeIndexedDB();
  fakeIdb.install();

  try {
    // 1. History is created ONLY when a playback session actually starts playing (not for metadata-only or preparing)
    const engine1 = new SongRequestEngine();
    try {
      const metadataOnlyTrack: SongRequestItem = {
        id: 'yt_meta_1',
        title: 'Metadata Only Song',
        artist: 'YouTube Channel',
        requester: 'viewer_meta',
        durationSec: 200,
        requestedAt: Date.now(),
        sourceType: 'youtube_metadata',
        provider: 'youtube',
        providerTrackId: 'yt_abc_123',
        playable: false,
        externalUrl: 'https://www.youtube.com/watch?v=yt_abc_123',
        thumbnailUrl: 'https://i.ytimg.com/vi/yt_abc_123/mqdefault.jpg',
        platform: 'YouTube',
      };

      const metaStarted = await engine1.playItem(metadataOnlyTrack);
      assertEqual(metaStarted, false, '1a: metadata-only track is not playable');
      assertEqual(engine1.getState().isPlaying, false, '1b: metadata-only track sets isPlaying=false');
      assertEqual(engine1.getState().audioPlaybackMode, 'pending_source', '1c: pending_source set honestly');
      assertEqual(engine1.getState().history.length, 0, '1d: metadata-only track creates NO history entry');

      // Preparing before playing does not create history until 'playing' fires
      autoEmitPlaying = false;
      const trackSessionA: SongRequestItem = {
        id: 'auth_track_a',
        title: 'Starlight Drift',
        artist: 'Synth Wave',
        album: 'Night Telemetry',
        requester: 'viewer_alpha',
        durationSec: 195,
        requestedAt: 1700000001000,
        sourceType: 'remote_url',
        provider: 'authorized_stream',
        providerTrackId: 'stream_track_a',
        playable: true,
        audioUrl: 'https://cdn.example.com/audio/starlight.mp3',
        externalUrl: 'https://cdn.example.com/tracks/starlight',
        thumbnailUrl: 'https://cdn.example.com/art/starlight.jpg',
        platform: 'Stream',
      };

      const playPromise = engine1.playItem(trackSessionA);
      await flushMicrotasks();
      assertEqual(engine1.getState().playbackStatus, 'preparing', '1e: status is preparing before playing event');
      assertEqual(engine1.getState().history.length, 0, '1f: history remains empty while preparing');

      mockAudioRef.current?.emit('playing');
      await playPromise;
      assertEqual(engine1.getState().history.length, 1, '1g: history created once playback actually starts');
      assertEqual(engine1.getState().history[0].status, 'playing', '1h: initial session status is playing');

      // 2. Same playback session updates in place across playing -> completed, playing -> skipped, playing -> error
      autoEmitPlaying = true;
      const firstSessionId = engine1.getState().history[0].sessionId;
      const firstStartedAt = engine1.getState().history[0].startedAt;
      await engine1.handleTrackEnded();
      assertEqual(engine1.getState().history.length, 1, '2a: completed does NOT add duplicate row');
      assertEqual(engine1.getState().history[0].sessionId, firstSessionId, '2b: same sessionId updated on complete');
      assertEqual(engine1.getState().history[0].status, 'completed', '2c: status updated to completed');
      assertEqual(engine1.getState().history[0].startedAt, firstStartedAt, '2d: startedAt preserved');
      assertEqual(engine1.getState().history[0].requester, 'viewer_alpha', '2e: original requester preserved');

      // Session 2: playing -> skipped via skipTrack()
      const trackSessionB: SongRequestItem = {
        id: 'auth_track_b',
        title: 'Neon Pulse',
        artist: 'City Synth',
        requester: 'viewer_beta',
        durationSec: 210,
        requestedAt: 1700000002000,
        sourceType: 'remote_url',
        provider: 'authorized_stream',
        providerTrackId: 'stream_track_b',
        playable: true,
        audioUrl: 'https://cdn.example.com/audio/neon_pulse.mp3',
        thumbnailUrl: 'https://cdn.example.com/art/neon_pulse.jpg',
        platform: 'Stream',
      };
      await engine1.playItem(trackSessionB);
      assertEqual(engine1.getState().history.length, 2, '2f: second playback creates second session entry');
      const secondSessionId = engine1.getState().history[0].sessionId;
      await engine1.skipTrack('Streamer');
      assertEqual(engine1.getState().history.length, 2, '2g: skip updates same session entry without duplicate row');
      const skippedEntry = engine1.getState().history.find((h) => h.sessionId === secondSessionId);
      assertEqual(skippedEntry?.status, 'skipped', '2h: second session updated to skipped');

      // Session 3: playing -> runtime error
      const trackSessionC: SongRequestItem = {
        id: 'auth_track_c',
        title: 'Broken Stream',
        artist: 'Error Lab',
        requester: 'viewer_gamma',
        durationSec: 180,
        requestedAt: 1700000003000,
        sourceType: 'remote_url',
        provider: 'youtube_music',
        providerTrackId: 'ytm_err_1',
        playable: true,
        audioUrl: 'https://cdn.example.com/audio/broken.mp3',
        externalUrl: 'https://music.youtube.com/watch?v=ytm_err_1',
        platform: 'YouTube Music',
      };
      // Wait: youtube_music with sourceType remote_url (authorized stream) plays, then emits error
      await engine1.playItem(trackSessionC);
      assertEqual(engine1.getState().history.length, 3, '2i: third playback creates third session entry');
      const thirdSessionId = engine1.getState().history[0].sessionId;
      if (mockAudioRef.current) {
        mockAudioRef.current.error = { code: 3 };
        mockAudioRef.current.emit('error');
      }
      const errorEntry = engine1.getState().history.find((h) => h.sessionId === thirdSessionId);
      assertEqual(engine1.getState().history.length, 3, '2j: runtime error updates same session without duplicate row');
      assertEqual(errorEntry?.status, 'error', '2k: third session status updated to error');
      assert(Boolean(errorEntry?.errorMessage), '2l: errorMessage stored on session entry');

      // 3 & 5. Persist to IndexedDB + sanitize out sensitive/ephemeral/blob URLs + sequential writes
      await StorageService.saveSongRequestHistory(engine1.getState().history);
      const savedRaw = fakeIdb.idbData.get('song_request_history') as SongRequestHistoryEntry[];
      assert(Array.isArray(savedRaw) && savedRaw.length === 3, '3a: history saved under key song_request_history');

      // Also verify sensitive query params & blob/data URLs are stripped before storage
      const dirtyEntry: SongRequestHistoryEntry = {
        ...engine1.getState().history[0],
        id: 'sess_dirty',
        sessionId: 'sess_dirty',
        startedAt: Date.now() + 5000,
        updatedAt: Date.now() + 5000,
        timestamp: Date.now() + 5000,
        trackSnapshot: {
          ...engine1.getState().history[0].trackSnapshot,
          provider: 'spotify',
          providerTrackId: 'sp_track_999',
          sourceType: 'spotify_metadata',
          album: 'Clean Album',
          externalUrl: 'https://open.spotify.com/track/sp_track_999',
          thumbnailUrl: 'data:image/png;base64,AAAA',
          audioUrl: 'https://cdn.example.com/stream.mp3?token=secret_123&expires=9999',
          playable: true,
        },
      };
      // Test sequential saves: slow first write with older snapshot followed immediately by second write with newer snapshot
      fakeIdb.setOpenDbDelayMs(15);
      const olderPromise = StorageService.saveSongRequestHistory(engine1.getState().history);
      const newerList = [dirtyEntry, ...engine1.getState().history];
      const newerPromise = StorageService.saveSongRequestHistory(newerList);
      await Promise.all([olderPromise, newerPromise]);
      fakeIdb.setOpenDbDelayMs(0);

      const persistedAfterSeq = await StorageService.getSongRequestHistory();
      assertEqual(persistedAfterSeq.length, 4, '3b: sequential writes finish in order so newer snapshot wins');
      const restoredDirty = persistedAfterSeq.find((e) => e.sessionId === 'sess_dirty');
      assertEqual(restoredDirty?.provider, 'spotify', '5a: provider preserved');
      assertEqual(restoredDirty?.providerTrackId, 'sp_track_999', '5b: providerTrackId preserved');
      assertEqual(restoredDirty?.album, 'Clean Album', '5c: album preserved');
      assertEqual(
        restoredDirty?.externalUrl,
        'https://open.spotify.com/track/sp_track_999',
        '5d: official externalUrl preserved'
      );
      assertEqual(
        restoredDirty?.trackSnapshot.audioUrl,
        undefined,
        '5e: expiring/token audioUrl stripped from persisted history'
      );
      assertEqual(
        restoredDirty?.trackSnapshot.thumbnailUrl,
        undefined,
        '5f: base64/data thumbnailUrl stripped from persisted history'
      );
      assertEqual(
        restoredDirty?.trackSnapshot.playable,
        false,
        '5g: metadata track stays non-playable (playable=false)'
      );
    } finally {
      engine1.destroy();
    }

    // 4. Restart simulation: fresh engine starts with empty history, does NOT overwrite IDB before hydration, then restores
    const engineAfterRestart = new SongRequestEngine();
    try {
      assertEqual(engineAfterRestart.getState().history.length, 0, '4a: fresh engine starts empty before hydration');
      // Simulate startup hydration order: read from IDB first, then hydrate engine
      const restoredFromIdb = await StorageService.getSongRequestHistory();
      engineAfterRestart.hydrateHistory(restoredFromIdb);
      assertEqual(engineAfterRestart.getState().history.length, 4, '4b: history restored after restart');
      assertEqual(
        fakeIdb.idbData.get('song_request_history') !== undefined &&
          (fakeIdb.idbData.get('song_request_history') as unknown[]).length === 4,
        true,
        '4c: empty initial state did NOT overwrite stored IndexedDB history'
      );

      // 6, 7, 8, 9. Requeue from history while engine is active AND while engine is idle
      // First test when engine is idle: item enters queue (does NOT bypass queue into currentTrack)
      const sourceEntry = engineAfterRestart.getState().history.find((h) => h.title === 'Starlight Drift')!;
      const sourceSnapshotBefore = JSON.stringify(sourceEntry);

      const idleRequeue = engineAfterRestart.requeueFromHistory(sourceEntry.id, 'Streamer');
      assertEqual(idleRequeue.success, true, '6a: requeue succeeds when engine is idle');
      assertEqual(engineAfterRestart.getState().currentTrack, null, '8a: idle requeue does NOT set currentTrack directly');
      assertEqual(engineAfterRestart.getState().queue.length, 1, '7a: idle requeue enters normal queue');
      assert(
        idleRequeue.item!.id !== sourceEntry.trackSnapshot.id && idleRequeue.item!.id !== sourceEntry.trackId,
        '6b: requeue assigns a brand new item ID'
      );
      assertEqual(idleRequeue.item!.requester, 'Streamer', '6c: requeue marks Streamer as requester');
      assertEqual(idleRequeue.item!.provider, sourceEntry.provider, '6d: requeue preserves provider');
      assertEqual(idleRequeue.item!.providerTrackId, sourceEntry.providerTrackId, '6e: requeue preserves providerTrackId');
      assertEqual(idleRequeue.item!.album, sourceEntry.album, '6f: requeue preserves album');

      // Start an active track, then requeue another entry from history -> goes to BACK of queue, active stays untouched
      const activeTrack: SongRequestItem = {
        id: 'active_playing_track',
        title: 'Current Active Track',
        artist: 'Live DJ',
        requester: 'viewer_live',
        durationSec: 200,
        requestedAt: Date.now(),
        sourceType: 'remote_url',
        provider: 'authorized_stream',
        playable: true,
        audioUrl: 'https://cdn.example.com/audio/active.mp3',
        platform: 'Stream',
      };
      await engineAfterRestart.playItem(activeTrack);
      const spotifyHistoryEntry = engineAfterRestart.getState().history.find((h) => h.provider === 'spotify')!;
      const spotifyBefore = JSON.stringify(spotifyHistoryEntry);

      const activeRequeue = engineAfterRestart.requeueFromHistory(spotifyHistoryEntry.id, 'Streamer');
      assertEqual(activeRequeue.success, true, '7b: requeue succeeds while another song is playing');
      assertEqual(
        engineAfterRestart.getState().currentTrack?.id,
        'active_playing_track',
        '8b: requeue does NOT replace currently playing track'
      );
      assertEqual(engineAfterRestart.getState().queue.length, 2, '7c: requeue appends to existing queue');
      assertEqual(
        engineAfterRestart.getState().queue[1].id,
        activeRequeue.item!.id,
        '7d: requeue places item at the very back (tail) of the queue'
      );
      assertEqual(
        activeRequeue.item!.playable,
        false,
        '7e: requeued Spotify metadata item preserves non-playable metadata policy'
      );
      assertEqual(
        JSON.stringify(engineAfterRestart.getState().history.find((h) => h.id === sourceEntry.id)),
        sourceSnapshotBefore,
        '9a: original Starlight Drift history entry remains unmodified'
      );
      assertEqual(
        JSON.stringify(engineAfterRestart.getState().history.find((h) => h.id === spotifyHistoryEntry.id)),
        spotifyBefore,
        '9b: original Spotify history entry remains unmodified'
      );

      // 10. Full queue rejects requeue cleanly without mutating queue, active track, or history
      engineAfterRestart.updatePolicy({ maxQueueSize: 2 });
      const queueBeforeReject = engineAfterRestart.getState().queue.map((q) => q.id).join(',');
      const historyCountBeforeReject = engineAfterRestart.getState().history.length;
      const fullRes = engineAfterRestart.requeueFromHistory(sourceEntry.id, 'Streamer');
      assertEqual(fullRes.success, false, '10a: requeue rejected when queue is full');
      assert((fullRes.error || '').includes('penuh'), '10b: full queue error mentions queue full');
      assertEqual(
        engineAfterRestart.getState().queue.map((q) => q.id).join(','),
        queueBeforeReject,
        '10c: queue unchanged on rejected requeue'
      );
      assertEqual(
        engineAfterRestart.getState().history.length,
        historyCountBeforeReject,
        '10d: history unchanged on rejected requeue'
      );

      // 11. History capped at maximum 100 sessions (oldest evicted by timestamp without touching active queue)
      const activeQueueBeforeCap = engineAfterRestart.getState().queue.map((q) => q.id).join(',');
      const baseTime = Date.now() + 100_000;
      const bulk105: SongRequestHistoryEntry[] = Array.from({ length: 105 }, (_, idx) => {
        const started = baseTime + idx * 1000;
        const trackId = `bulk_track_${idx + 1}`;
        return {
          id: `bulk_sess_${idx + 1}`,
          sessionId: `bulk_sess_${idx + 1}`,
          trackId,
          title: `Track #${idx + 1}`,
          artist: 'Artist',
          provider: 'youtube',
          providerTrackId: `yt_${idx + 1}`,
          sourceType: 'youtube_metadata',
          durationSec: 180,
          externalUrl: `https://www.youtube.com/watch?v=yt_${idx + 1}`,
          requester: `user_${idx + 1}`,
          startedAt: started,
          updatedAt: started,
          timestamp: started,
          status: 'completed',
          trackSnapshot: {
            id: trackId,
            title: `Track #${idx + 1}`,
            artist: 'Artist',
            requester: `user_${idx + 1}`,
            durationSec: 180,
            requestedAt: started,
            sourceType: 'youtube_metadata',
            provider: 'youtube',
            providerTrackId: `yt_${idx + 1}`,
            playable: false,
            externalUrl: `https://www.youtube.com/watch?v=yt_${idx + 1}`,
          },
        };
      });

      const capped = engineAfterRestart.hydrateHistory(bulk105);
      assertEqual(capped.length, MAX_SONG_REQUEST_HISTORY, '11a: history capped at 100 sessions');
      assertEqual(capped[0].sessionId, 'bulk_sess_105', '11b: newest session kept first');
      assert(
        !capped.some((e) => e.sessionId === 'bulk_sess_1' || e.sessionId === 'bulk_sess_5'),
        '11c: oldest sessions evicted first'
      );
      assertEqual(
        engineAfterRestart.getState().queue.map((q) => q.id).join(','),
        activeQueueBeforeCap,
        '11d: capping history does not affect active queue'
      );

      // 12. Aborted IndexedDB transaction is NOT treated as success and preserves previous stored snapshot
      await StorageService.saveSongRequestHistory(capped);
      const snapshotBeforeAbort = JSON.stringify(fakeIdb.idbData.get('song_request_history'));
      fakeIdb.setTxMode('abort_after_request');
      let abortRejected = false;
      try {
        await StorageService.saveSongRequestHistory([]);
      } catch (err) {
        abortRejected = err instanceof Error && err.message.includes('abort');
      } finally {
        fakeIdb.setTxMode('commit');
      }
      assert(abortRejected, '12a: aborted IndexedDB transaction rejects Promise');
      assertEqual(
        JSON.stringify(fakeIdb.idbData.get('song_request_history')),
        snapshotBeforeAbort,
        '12b: aborted transaction leaves previous IndexedDB history intact'
      );
      const statsAfterAbort = fakeIdb.getStats();
      assertEqual(
        statsAfterAbort.closeCount,
        statsAfterAbort.openCount,
        '12c: IndexedDB connection always closed across complete and aborted transactions'
      );
    } finally {
      engineAfterRestart.destroy();
    }

    // 13. Structural verification: SongRequestEngine is decoupled from localFilesMap / Audio Element imports
    const engineSource = readFileSync(join(process.cwd(), 'src', 'services', 'songRequestEngine.ts'), 'utf8');
    const appSource = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    const musicCenterSource = readFileSync(join(process.cwd(), 'src', 'components', 'MusicCenterView.tsx'), 'utf8');
    const storageSource = readFileSync(join(process.cwd(), 'src', 'services', 'storage.ts'), 'utf8');

    assert(
      !engineSource.includes('localFilesMap') &&
        !engineSource.includes('LocalAudioTrackMeta') &&
        !engineSource.includes('registerLocalLibrary') &&
        !engineSource.includes('localFileId') &&
        !engineSource.includes('youtubei/v1'),
      '13a: songRequestEngine.ts has zero dependency on localFilesMap, LocalAudioTrackMeta, or undocumented youtubei endpoints'
    );
    assert(
      !appSource.includes('registerLocalLibrary'),
      '13b: App.tsx no longer registers Local Audio library into SongRequestEngine'
    );
    assert(
      appSource.includes('StorageService.getSongRequestHistory()') &&
        appSource.includes('songRequestEngine.hydrateHistory(') &&
        appSource.includes('srHistorySyncReadyRef'),
      '13c: App.tsx hydrates Song Request history before enabling sequential persistence'
    );
    assert(
      musicCenterSource.includes("setActiveTab('history')") &&
        musicCenterSource.includes('handleRequeueFromHistory') &&
        musicCenterSource.includes('Tambah ke antrean'),
      '13d: MusicCenterView.tsx renders History tab and requeue controls'
    );
    assert(
      storageSource.includes("const DB_VERSION = 3;") &&
        storageSource.includes("const SONG_REQUEST_HISTORY_KEY = 'song_request_history';") &&
        storageSource.includes('async getSongRequestHistory()') &&
        storageSource.includes('async saveSongRequestHistory('),
      '13e: storage.ts keeps DB_VERSION=3 and provides getSongRequestHistory / saveSongRequestHistory'
    );

    // 14. A2.10.3.3 URL Reference Sanitization (externalUrl & thumbnailUrl)
    assertEqual(
      sanitizeReferenceUrl('https://cdn.example.com/ref?token=secret123'),
      undefined,
      '14a: reference URL with token query param is rejected'
    );
    assertEqual(
      sanitizeReferenceUrl('https://cdn.example.com/thumb.jpg?signature=abc&expires=999'),
      undefined,
      '14b: reference URL with signature/expires query param is rejected'
    );
    assertEqual(
      sanitizeReferenceUrl('https://cdn.example.com/track?auth=bearer_x&X-Amz-Credential=abc'),
      undefined,
      '14c: reference URL with auth/x-amz query param is rejected'
    );
    assertEqual(
      sanitizeReferenceUrl('https://cdn.example.com/track?api_key=k123'),
      undefined,
      '14d: reference URL with api_key query param is rejected'
    );
    assertEqual(
      sanitizeReferenceUrl('https://user:pass@www.youtube.com/watch?v=yt_123'),
      undefined,
      '14e: reference URL with username/password is rejected'
    );
    assertEqual(
      sanitizeReferenceUrl('javascript:alert(1)'),
      undefined,
      '14f: non-HTTP/HTTPS reference URL is rejected'
    );
    assertEqual(
      sanitizeReferenceUrl('https://www.youtube.com/watch?v=yt_abc_123'),
      'https://www.youtube.com/watch?v=yt_abc_123',
      '14g: normal YouTube URL with v query param is preserved'
    );
    assertEqual(
      sanitizeReferenceUrl('https://i.ytimg.com/vi/yt_abc_123/mqdefault.jpg'),
      'https://i.ytimg.com/vi/yt_abc_123/mqdefault.jpg',
      '14h: normal thumbnail URL is preserved'
    );

    const sanitizedSnapshotWithSensitiveRef = sanitizeHistoryTrackSnapshot({
      id: 'yt_ref_test',
      title: 'Ref Filter Song',
      artist: 'YT Creator',
      album: 'Session Vol 1',
      requester: 'viewer_1',
      durationSec: 190,
      requestedAt: 1700000005000,
      sourceType: 'youtube_metadata',
      provider: 'youtube',
      providerTrackId: 'yt_vid_777',
      playable: false,
      externalUrl: 'https://www.youtube.com/watch?v=yt_vid_777&token=leak',
      thumbnailUrl: 'https://i.ytimg.com/vi/yt_vid_777/hqdefault.jpg?sig=leak_sig',
    });
    assertEqual(
      sanitizedSnapshotWithSensitiveRef.externalUrl,
      undefined,
      '14i: sensitive externalUrl stripped from trackSnapshot'
    );
    assertEqual(
      sanitizedSnapshotWithSensitiveRef.thumbnailUrl,
      undefined,
      '14j: sensitive thumbnailUrl stripped from trackSnapshot'
    );
    assertEqual(sanitizedSnapshotWithSensitiveRef.provider, 'youtube', '14k: provider preserved');
    assertEqual(
      sanitizedSnapshotWithSensitiveRef.providerTrackId,
      'yt_vid_777',
      '14l: providerTrackId preserved'
    );
    assertEqual(sanitizedSnapshotWithSensitiveRef.album, 'Session Vol 1', '14m: album preserved');

    const [sanitizedHistoryEntry] = sanitizeSongRequestHistoryEntries([
      {
        id: 'sess_ref_clean',
        sessionId: 'sess_ref_clean',
        trackId: 'yt_clean_888',
        title: 'Clean Ref Song',
        artist: 'YT Channel',
        provider: 'youtube',
        providerTrackId: 'yt_clean_888',
        sourceType: 'youtube_metadata',
        durationSec: 210,
        externalUrl: 'https://www.youtube.com/watch?v=yt_clean_888',
        thumbnailUrl: 'https://i.ytimg.com/vi/yt_clean_888/mqdefault.jpg',
        requester: 'viewer_2',
        startedAt: 1700000006000,
        updatedAt: 1700000006000,
        timestamp: 1700000006000,
        status: 'completed',
        trackSnapshot: {
          id: 'yt_clean_888',
          title: 'Clean Ref Song',
          artist: 'YT Channel',
          requester: 'viewer_2',
          durationSec: 210,
          requestedAt: 1700000006000,
          sourceType: 'youtube_metadata',
          provider: 'youtube',
          providerTrackId: 'yt_clean_888',
          playable: false,
          externalUrl: 'https://www.youtube.com/watch?v=yt_clean_888',
          thumbnailUrl: 'https://i.ytimg.com/vi/yt_clean_888/mqdefault.jpg',
        },
      },
    ]);
    assertEqual(
      sanitizedHistoryEntry.externalUrl,
      'https://www.youtube.com/watch?v=yt_clean_888',
      '14n: clean YouTube externalUrl preserved on history entry'
    );
    assertEqual(
      sanitizedHistoryEntry.thumbnailUrl,
      'https://i.ytimg.com/vi/yt_clean_888/mqdefault.jpg',
      '14o: clean thumbnailUrl preserved on history entry'
    );

    // 15. A2.10.3.3 IndexedDB Read Failure Handling (vs valid empty read)
    fakeIdb.idbData.delete('song_request_history');
    fakeIdb.setFailOpen(false);
    fakeIdb.setReadMode('ok');
    const emptyReadResult = await StorageService.getSongRequestHistory();
    assert(
      Array.isArray(emptyReadResult) && emptyReadResult.length === 0,
      '15a: valid empty IndexedDB read returns empty array'
    );

    fakeIdb.setFailOpen(true);
    let openFailureRejected = false;
    try {
      await StorageService.getSongRequestHistory();
    } catch {
      openFailureRejected = true;
    } finally {
      fakeIdb.setFailOpen(false);
    }
    assert(openFailureRejected, '15b: openDB failure rejects instead of returning empty array');

    fakeIdb.setReadMode('request_error');
    let readRequestErrorRejected = false;
    try {
      await StorageService.getSongRequestHistory();
    } catch {
      readRequestErrorRejected = true;
    } finally {
      fakeIdb.setReadMode('ok');
    }
    assert(readRequestErrorRejected, '15c: read request error rejects instead of returning empty array');

    fakeIdb.setReadMode('tx_abort');
    let readAbortRejected = false;
    try {
      await StorageService.getSongRequestHistory();
    } catch {
      readAbortRejected = true;
    } finally {
      fakeIdb.setReadMode('ok');
    }
    assert(readAbortRejected, '15d: read transaction abort rejects instead of returning empty array');

    fakeIdb.setReadMode('tx_error');
    let readTxErrorRejected = false;
    try {
      await StorageService.getSongRequestHistory();
    } catch {
      readTxErrorRejected = true;
    } finally {
      fakeIdb.setReadMode('ok');
    }
    assert(readTxErrorRejected, '15e: read transaction error rejects instead of returning empty array');

    const statsAfterReadFailures = fakeIdb.getStats();
    assertEqual(
      statsAfterReadFailures.closeCount,
      statsAfterReadFailures.openCount,
      '15f: IndexedDB connection always closed across read successes and failures'
    );

    // 16. A2.10.3.3 Startup Hydration Guard & Non-Overwrite Guarantee
    const existingStoredEntry: SongRequestHistoryEntry = {
      ...sanitizedHistoryEntry,
      id: 'sess_existing_persisted',
      sessionId: 'sess_existing_persisted',
      title: 'Existing Persisted Song',
    };
    await StorageService.saveSongRequestHistory([existingStoredEntry]);
    const persistedBeforeFailedHydration = JSON.stringify(fakeIdb.idbData.get('song_request_history'));

    const failedEngine = new SongRequestEngine();
    try {
      const syncReadyRef = { current: false };
      const lastPersistedJsonRef = { current: '' };
      fakeIdb.setReadMode('tx_abort');
      const failedHydration = await hydrateSongRequestHistoryWithGuard({
        readHistory: () => StorageService.getSongRequestHistory(),
        hydrateHistory: (entries) => failedEngine.hydrateHistory(entries),
        syncReadyRef,
        lastPersistedJsonRef,
      });
      fakeIdb.setReadMode('ok');

      assertEqual(failedHydration.hydrated, false, '16a: failed hydration reports hydrated=false');
      assertEqual(syncReadyRef.current, false, '16b: syncReadyRef remains false on read failure');
      assertEqual(
        lastPersistedJsonRef.current,
        '',
        '16c: lastPersistedJsonRef is not updated on read failure'
      );

      // Attempted sync with empty history while syncReadyRef is false MUST NOT overwrite old IDB history
      const blockedWriteResult = await persistSongRequestHistoryIfReady({
        history: failedEngine.getState().history,
        syncReadyRef,
        lastPersistedJsonRef,
        saveHistory: (history) => StorageService.saveSongRequestHistory(history),
      });
      assertEqual(blockedWriteResult, null, '16d: persistence sync blocked while hydration failed');
      assertEqual(
        JSON.stringify(fakeIdb.idbData.get('song_request_history')),
        persistedBeforeFailedHydration,
        '16e: existing IndexedDB history is NOT overwritten by empty snapshot after read failure'
      );
    } finally {
      failedEngine.destroy();
    }

    // Successful hydration with empty array MUST enable persistence sync normally
    fakeIdb.idbData.delete('song_request_history');
    const emptyEngine = new SongRequestEngine();
    try {
      const syncReadyRef = { current: false };
      const lastPersistedJsonRef = { current: '' };
      const emptyHydration = await hydrateSongRequestHistoryWithGuard({
        readHistory: () => StorageService.getSongRequestHistory(),
        hydrateHistory: (entries) => emptyEngine.hydrateHistory(entries),
        syncReadyRef,
        lastPersistedJsonRef,
      });
      assertEqual(emptyHydration.hydrated, true, '16f: empty IDB read hydrates successfully');
      assertEqual(syncReadyRef.current, true, '16g: syncReadyRef enabled after valid empty read');
      assertEqual(lastPersistedJsonRef.current, '[]', '16h: lastPersistedJsonRef initialized to []');

      // Playing a track afterward persists normally through write-chain
      await emptyEngine.playItem({
        id: 'post_empty_hydrate_track',
        title: 'After Empty Hydration',
        artist: 'Stream DJ',
        requester: 'viewer_live',
        durationSec: 180,
        requestedAt: Date.now(),
        sourceType: 'remote_url',
        provider: 'authorized_stream',
        playable: true,
        audioUrl: 'https://cdn.example.com/audio/after_empty.mp3',
        platform: 'Stream',
      });
      const persistedAfterPlay = await persistSongRequestHistoryIfReady({
        history: emptyEngine.getState().history,
        syncReadyRef,
        lastPersistedJsonRef,
        saveHistory: (history) => StorageService.saveSongRequestHistory(history),
      });
      assertEqual(persistedAfterPlay, true, '16i: persistence succeeds after valid empty hydration');
      const storedAfterEmptyHydration = await StorageService.getSongRequestHistory();
      assertEqual(storedAfterEmptyHydration.length, 1, '16j: new session persisted after empty hydration');
      assertEqual(
        storedAfterEmptyHydration[0].title,
        'After Empty Hydration',
        '16k: persisted session title matches'
      );
    } finally {
      emptyEngine.destroy();
    }

    // Structural verification: getSongRequestHistory is separated from startup Promise.all in App.tsx
    const promiseAllBlockMatch = appSource.match(/Promise\.all\(\[[\s\S]*?\]\);/);
    assert(
      Boolean(promiseAllBlockMatch) && !promiseAllBlockMatch![0].includes('getSongRequestHistory'),
      '16l: App.tsx separates StorageService.getSongRequestHistory() from main startup Promise.all'
    );
    assert(
      appSource.includes('hydrateSongRequestHistoryWithGuard') &&
        appSource.includes('persistSongRequestHistoryIfReady'),
      '16m: App.tsx uses guarded startup hydration and guarded persistence sync'
    );
  } finally {
    fakeIdb.restore();
    (globalThis as { Audio?: unknown }).Audio = originalAudio;
  }

  console.log(`songRequestHistory.test.ts: PASS (${assertionCount} assertions)`);
}

void runSongRequestHistoryTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
