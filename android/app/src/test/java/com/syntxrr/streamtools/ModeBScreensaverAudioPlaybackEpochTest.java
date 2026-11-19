package com.syntxrr.streamtools;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.List;

import static org.junit.Assert.*;

public final class ModeBScreensaverAudioPlaybackEpochTest {

    @Test public void pauseAndResumeReplaceBothGenerationsTogetherAndAllowFreshTimeline() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        ModeBScreensaverAudioPlaybackEpoch epoch = new ModeBScreensaverAudioPlaybackEpoch(queue);
        byte[] pcm = stereoPcm(441, 200);

        ModeBScreensaverAudioPlaybackEpoch.Session first = epoch.start();
        assertNotNull(first);
        assertTrue(queue.offer(pcm, 0, pcm.length, 90_000_000L, first.queueGeneration));

        epoch.pause();
        assertFalse(epoch.isCurrent(first.decoderGeneration));
        assertEquals(0, queue.queuedChunksForTest());

        ModeBScreensaverAudioPlaybackEpoch.Session resumed = epoch.start();
        assertNotNull(resumed);
        assertTrue(resumed.decoderGeneration > first.decoderGeneration);
        assertTrue(resumed.queueGeneration > first.queueGeneration);
        assertFalse(queue.offer(pcm, 0, pcm.length, 90_010_000L, first.queueGeneration));
        // A new playback epoch may legitimately restart its media PTS from the beginning.
        assertTrue(queue.offer(pcm, 0, pcm.length, 1_000L, resumed.queueGeneration));
        assertTrue(epoch.isCurrent(resumed.decoderGeneration));
    }

    @Test public void terminalFailureInvalidatesOnlyTheMatchingEpoch() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        ModeBScreensaverAudioPlaybackEpoch epoch = new ModeBScreensaverAudioPlaybackEpoch(queue);
        byte[] pcm = stereoPcm(441, 300);

        ModeBScreensaverAudioPlaybackEpoch.Session failed = epoch.start();
        assertNotNull(failed);
        assertTrue(queue.offer(pcm, 0, pcm.length, 20_000L, failed.queueGeneration));
        assertTrue(epoch.fail(failed.decoderGeneration));
        assertFalse(epoch.fail(failed.decoderGeneration));
        assertFalse(epoch.isPlaying());
        assertEquals(0, queue.queuedChunksForTest());

        ModeBScreensaverAudioPlaybackEpoch.Session recovered = epoch.start();
        assertNotNull(recovered);
        assertFalse(queue.offer(pcm, 0, pcm.length, 30_000L, failed.queueGeneration));
        assertTrue(queue.offer(pcm, 0, pcm.length, 1_000L, recovered.queueGeneration));
    }

    @Test public void concurrentPauseAndResumeNeverDetachTheActiveDecoderFromItsQueueEpoch() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        ModeBScreensaverAudioPlaybackEpoch epoch = new ModeBScreensaverAudioPlaybackEpoch(queue);
        AtomicInteger pauseCalls = new AtomicInteger();
        AtomicInteger startCalls = new AtomicInteger();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch begin = new CountDownLatch(1);

        Thread pauser = new Thread(() -> {
            ready.countDown();
            try {
                begin.await();
                for (int index = 0; index < 5_000; index++) {
                    epoch.pause();
                    pauseCalls.incrementAndGet();
                }
            } catch (Throwable error) {
                failure.compareAndSet(null, error);
            }
        }, "screensaver-epoch-pauser-test");
        Thread resumer = new Thread(() -> {
            ready.countDown();
            try {
                begin.await();
                for (int index = 0; index < 5_000; index++) {
                    epoch.start();
                    startCalls.incrementAndGet();
                }
            } catch (Throwable error) {
                failure.compareAndSet(null, error);
            }
        }, "screensaver-epoch-resumer-test");
        pauser.start();
        resumer.start();
        assertTrue(ready.await(1, TimeUnit.SECONDS));
        begin.countDown();
        pauser.join(3_000L);
        resumer.join(3_000L);

        assertFalse("pause thread did not finish", pauser.isAlive());
        assertFalse("resume thread did not finish", resumer.isAlive());
        if (failure.get() != null) throw new AssertionError("Concurrent epoch transition failed", failure.get());
        assertEquals(5_000, pauseCalls.get());
        assertEquals(5_000, startCalls.get());

        ModeBScreensaverAudioPlaybackEpoch.Session active = epoch.currentSessionForTest();
        if (active == null) {
            assertFalse(epoch.isPlaying());
        } else {
            assertTrue(epoch.isPlaying());
            assertTrue(epoch.isCurrent(active.decoderGeneration));
            byte[] pcm = stereoPcm(441, 500);
            assertTrue("Active decoder generation was detached from its queue generation",
                    queue.offer(pcm, 0, pcm.length, 500_000L, active.queueGeneration));
            assertEquals(1, queue.queuedChunksForTest());
        }
    }

    @Test public void decodeTaskPostIsSerializedBeforeRetirementMarker() throws Exception {
        ModeBScreensaverAudioPlaybackEpoch epoch = new ModeBScreensaverAudioPlaybackEpoch(
                new ModeBScreensaverAudioPcmQueue());
        ModeBScreensaverAudioPlaybackEpoch.Session session = epoch.start();
        assertNotNull(session);

        CountDownLatch posterEntered = new CountDownLatch(1);
        CountDownLatch allowPost = new CountDownLatch(1);
        CountDownLatch releaseFinished = new CountDownLatch(1);
        AtomicReference<Boolean> postResult = new AtomicReference<>(false);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        List<Runnable> workerQueue = java.util.Collections.synchronizedList(new java.util.ArrayList<>());

        Thread starter = new Thread(() -> {
            try {
                postResult.set(epoch.postIfCurrent(session.decoderGeneration, task -> {
                    posterEntered.countDown();
                    try {
                        if (!allowPost.await(2, TimeUnit.SECONDS)) return false;
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        return false;
                    }
                    workerQueue.add(task);
                    return true;
                }, () -> { }));
            } catch (Throwable error) {
                failure.compareAndSet(null, error);
            }
        }, "screensaver-decode-poster-test");
        starter.start();
        assertTrue("decode poster did not enter", posterEntered.await(1, TimeUnit.SECONDS));

        Thread releaser = new Thread(() -> {
            try { epoch.release(); }
            catch (Throwable error) { failure.compareAndSet(null, error); }
            finally { releaseFinished.countDown(); }
        }, "screensaver-release-poster-test");
        releaser.start();
        assertFalse("release must wait while a current decode task is being inserted",
                releaseFinished.await(50, TimeUnit.MILLISECONDS));

        allowPost.countDown();
        starter.join(1_000L);
        releaser.join(1_000L);
        assertFalse("starter did not finish", starter.isAlive());
        assertFalse("releaser did not finish", releaser.isAlive());
        if (failure.get() != null) throw new AssertionError("serialized decode post failed", failure.get());
        assertTrue(postResult.get());
        assertEquals("exactly one current decode task must precede retirement", 1, workerQueue.size());
        assertTrue(epoch.isReleased());
        assertFalse("released epoch must reject a later decode post",
                epoch.postIfCurrent(session.decoderGeneration, task -> {
                    throw new AssertionError("stale task was posted");
                }, () -> { }));
    }

    @Test public void releaseWinsOverEveryLaterResumeAndFailureCallback() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        ModeBScreensaverAudioPlaybackEpoch epoch = new ModeBScreensaverAudioPlaybackEpoch(queue);
        byte[] pcm = stereoPcm(441, 400);
        ModeBScreensaverAudioPlaybackEpoch.Session session = epoch.start();
        assertNotNull(session);
        assertTrue(epoch.release());
        assertFalse(epoch.release());
        assertNull(epoch.start());
        assertFalse(epoch.isPlaying());
        assertTrue(epoch.isReleased());
        assertFalse(epoch.isCurrent(session.decoderGeneration));
        assertFalse(epoch.fail(session.decoderGeneration));
        assertFalse(queue.offer(pcm, 0, pcm.length, 1_000L, session.queueGeneration));
    }

    private static byte[] stereoPcm(int frames, int value) {
        byte[] data = new byte[frames * ModeBScreensaverAudioPcmQueue.BYTES_PER_FRAME];
        for (int offset = 0; offset < data.length; offset += 2) {
            data[offset] = (byte) (value & 0xFF);
            data[offset + 1] = (byte) ((value >>> 8) & 0xFF);
        }
        return data;
    }
}
