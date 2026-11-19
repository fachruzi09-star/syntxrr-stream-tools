package com.syntxrr.streamtools;

import com.pedro.encoder.Frame;
import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

public final class ModeBScreensaverAudioSourceTest {

    @Test public void failedAacCallbackDropsBacklogWithoutInvalidatingDecoderEpoch() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        long decoderEpoch = queue.resetForPlayback();
        ModeBScreensaverAudioSource source = new ModeBScreensaverAudioSource(queue);
        assertTrue(source.init(ModeBScreensaverAudioPcmQueue.SAMPLE_RATE, true, false, false));

        CountDownLatch firstCallback = new CountDownLatch(1);
        CountDownLatch recoveredCallback = new CountDownLatch(1);
        AtomicInteger callbackCount = new AtomicInteger();
        AtomicReference<Frame> recoveredFrame = new AtomicReference<>();
        source.start(frame -> {
            if (callbackCount.incrementAndGet() == 1) {
                firstCallback.countDown();
                throw new IllegalStateException("Simulated AAC sink failure");
            }
            recoveredFrame.set(frame);
            recoveredCallback.countDown();
        });

        byte[] pcm = stereoPcm(441, 300);
        try {
            assertTrue(queue.offer(pcm, 0, pcm.length, 1_000_000L, decoderEpoch));
            assertTrue(queue.offer(pcm, 0, pcm.length, 1_010_000L, decoderEpoch));
            assertTrue("First AAC callback was not reached", firstCallback.await(1, TimeUnit.SECONDS));

            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
            while (queue.droppedChunksForTest() < 1L && System.nanoTime() < deadline) {
                Thread.sleep(2L);
            }
            assertEquals(1L, queue.droppedChunksForTest());
            assertEquals(0, queue.queuedChunksForTest());

            // The failed callback must not invalidate the producer epoch or lower its PTS fence.
            assertFalse(queue.offer(pcm, 0, pcm.length, 1_005_000L, decoderEpoch));
            assertTrue(queue.offer(pcm, 0, pcm.length, 1_020_000L, decoderEpoch));
            assertTrue("Fresh PCM did not reach AAC after recovery",
                    recoveredCallback.await(1, TimeUnit.SECONDS));

            Frame frame = recoveredFrame.get();
            assertNotNull(frame);
            assertEquals(1_020_000L, frame.getTimeStamp());
            assertEquals(pcm.length, frame.getSize());
            assertEquals(300, readSigned16Le(frame.getBuffer(), frame.getOffset()));
            assertTrue(callbackCount.get() >= 2);
        } finally {
            source.stop();
            queue.close();
        }
        assertFalse(source.isRunning());
    }


    @Test public void timedOutStopRetainsReaderAndPreventsSecondConsumerUntilRetryJoins() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        long decoderEpoch = queue.resetForPlayback();
        ModeBScreensaverAudioSource source = new ModeBScreensaverAudioSource(queue);
        assertTrue(source.init(ModeBScreensaverAudioPcmQueue.SAMPLE_RATE, true, false, false));

        CountDownLatch callbackEntered = new CountDownLatch(1);
        CountDownLatch releaseCallback = new CountDownLatch(1);
        AtomicInteger callbackCount = new AtomicInteger();
        AtomicReference<Throwable> callbackFailure = new AtomicReference<>();
        source.start(frame -> {
            callbackCount.incrementAndGet();
            callbackEntered.countDown();
            boolean interrupted = false;
            while (true) {
                try {
                    releaseCallback.await();
                    break;
                } catch (InterruptedException ignored) {
                    // Simulate a native/encoder callback that does not retire on interruption.
                    interrupted = true;
                }
            }
            if (interrupted) Thread.currentThread().interrupt();
        });

        byte[] pcm = stereoPcm(441, 321);
        assertTrue(queue.offer(pcm, 0, pcm.length, 3_000_000L, decoderEpoch));
        assertTrue("AAC callback did not enter", callbackEntered.await(1, TimeUnit.SECONDS));

        try {
            boolean timedOut = false;
            try {
                source.stop();
            } catch (IllegalStateException expected) {
                timedOut = true;
            }
            assertTrue("Stop must report a reader that outlives the join deadline", timedOut);
            assertFalse(source.isRunning());
            assertTrue("Timed-out worker reference must remain owned", source.hasLiveReaderForTest());

            boolean restartRejected = false;
            try {
                source.start(frame -> callbackCount.incrementAndGet());
            } catch (IllegalStateException expected) {
                restartRejected = true;
            }
            assertTrue("A second consumer must not start while the previous worker is alive", restartRejected);
            assertEquals(1, callbackCount.get());
        } finally {
            releaseCallback.countDown();
        }

        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (source.hasLiveReaderForTest() && System.nanoTime() < deadline) Thread.sleep(2L);
        assertFalse("Old reader should exit after the callback is released", source.hasLiveReaderForTest());
        source.stop(); // retry joins the retained, now-terminated worker and clears its ownership.

        CountDownLatch restartedCallback = new CountDownLatch(1);
        source.start(frame -> {
            callbackCount.incrementAndGet();
            restartedCallback.countDown();
        });
        assertTrue(queue.offer(pcm, 0, pcm.length, 3_010_000L, decoderEpoch));
        assertTrue("A fresh consumer should start after the old one has retired",
                restartedCallback.await(1, TimeUnit.SECONDS));
        source.stop();
        queue.close();
        assertEquals("Old and new consumer callbacks must remain strictly separated", 2, callbackCount.get());
        assertFalse(source.hasLiveReaderForTest());
    }

    private static byte[] stereoPcm(int frames, int value) {
        byte[] data = new byte[frames * ModeBScreensaverAudioPcmQueue.BYTES_PER_FRAME];
        for (int offset = 0; offset < data.length; offset += 2) {
            data[offset] = (byte) (value & 0xFF);
            data[offset + 1] = (byte) ((value >>> 8) & 0xFF);
        }
        return data;
    }

    private static int readSigned16Le(byte[] data, int offset) {
        int value = (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
        return value >= 0x8000 ? value - 0x10000 : value;
    }
}
