package com.syntxrr.streamtools;

import com.pedro.encoder.Frame;
import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;

public final class ModeBScreensaverAudioPcmQueueTest {
    @Test public void mixesOnlyTimestampOverlapIntoLivePcmFrame() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        byte[] base = stereoPcm(4_410, 1_000);
        byte[] overlay = stereoPcm(4_410, 2_000);
        assertTrue(queue.offer(overlay, 0, overlay.length, 1_000_000L));

        Frame frame = new Frame(base, 0, base.length, 1_000_000L);
        queue.mixInto(frame);

        assertEquals(3_000, readShort(base, 0));
        assertEquals(3_000, readShort(base, 2));
        assertEquals(3_000, readShort(base, base.length - 4));
    }

    @Test public void retainsUnconsumedOverlayTailForTheNextEncoderFrame() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        byte[] overlay = stereoPcm(4_410, 500);
        assertTrue(queue.offer(overlay, 0, overlay.length, 2_000_000L));

        byte[] firstHalf = stereoPcm(2_205, 100);
        queue.mixInto(new Frame(firstHalf, 0, firstHalf.length, 2_000_000L));
        Frame tail = queue.takeNextFrame(() -> true);

        assertNotNull(tail);
        assertEquals(ModeBScreensaverAudioPcmQueue.MAX_ENCODER_FRAME_BYTES, tail.getSize());
        assertEquals(2_050_000L, tail.getTimeStamp());
        assertEquals(500, readShort(tail.getBuffer(), tail.getOffset()));

        Frame remainder = queue.takeNextFrame(() -> true);
        assertNotNull(remainder);
        assertEquals(2205 * 4 - ModeBScreensaverAudioPcmQueue.MAX_ENCODER_FRAME_BYTES,
                remainder.getSize());
        assertEquals(2_050_000L + (long) (ModeBScreensaverAudioPcmQueue.MAX_ENCODER_FRAME_BYTES / 4)
                * 1_000_000L / ModeBScreensaverAudioPcmQueue.SAMPLE_RATE, remainder.getTimeStamp());
        assertEquals(500, readShort(remainder.getBuffer(), remainder.getOffset()));
    }

    @Test public void doesNotMixFutureSamplesAndKeepsThemQueued() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        byte[] overlay = stereoPcm(441, 700);
        assertTrue(queue.offer(overlay, 0, overlay.length, 3_500_000L));
        byte[] base = stereoPcm(441, 100);

        queue.mixInto(new Frame(base, 0, base.length, 3_000_000L));

        assertEquals(100, readShort(base, 0));
        assertEquals(1, queue.queuedChunksForTest());
    }

    @Test public void removesAudioThatHasAlreadyFallenBehindTheEncoderClock() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        byte[] overlay = stereoPcm(441, 700);
        assertTrue(queue.offer(overlay, 0, overlay.length, 4_000_000L));
        byte[] base = stereoPcm(441, 100);

        queue.mixInto(new Frame(base, 0, base.length, 4_020_000L));

        assertEquals(100, readShort(base, 0));
        assertEquals(0, queue.queuedChunksForTest());
        assertEquals(1L, queue.droppedChunksForTest());
    }

    @Test public void playbackEpochRejectsLateDecoderOutputAfterPause() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        long firstEpoch = queue.resetForPlayback();
        queue.flush();
        byte[] overlay = stereoPcm(441, 100);

        assertFalse(queue.offer(overlay, 0, overlay.length, 5_000_000L, firstEpoch));
        assertEquals(0, queue.queuedChunksForTest());
    }

    @Test public void trimsQueueByBothChunkCountAndMaximumBufferedDuration() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        byte[] oneSample = stereoPcm(1, 100);
        for (int i = 0; i < 100; i++) {
            assertTrue(queue.offer(oneSample, 0, oneSample.length, 6_000_000L + i * 50_000L));
        }

        assertTrue(queue.queuedChunksForTest() <= ModeBScreensaverAudioPcmQueue.MAX_CHUNKS);
        assertTrue(queue.droppedChunksForTest() > 0L);
    }

    @Test public void closeWakesBlockedAudioOnlyConsumer() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        final Frame[] result = new Frame[1];
        Thread consumer = new Thread(() -> {
            try { result[0] = queue.takeNextFrame(() -> true); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        });
        consumer.start();
        Thread.sleep(20L);
        queue.close();
        consumer.join(500L);

        assertFalse(consumer.isAlive());
        assertNull(result[0]);
    }


    @Test public void audioOnlyFramesNeverExceedRootEncoderInputCapacity() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        byte[] overlay = stereoPcm(8_000, 250);
        assertTrue(queue.offer(overlay, 0, overlay.length, 7_000_000L));
        int total = 0;
        long previousTimestamp = -1L;
        Frame frame;
        while ((frame = queue.takeNextFrame(() -> queue.queuedChunksForTest() > 0)) != null) {
            assertTrue(frame.getSize() <= ModeBScreensaverAudioPcmQueue.MAX_ENCODER_FRAME_BYTES);
            assertEquals(0, frame.getSize() % ModeBScreensaverAudioPcmQueue.BYTES_PER_FRAME);
            if (previousTimestamp >= 0L) assertTrue(frame.getTimeStamp() >= previousTimestamp);
            previousTimestamp = frame.getTimeStamp();
            total += frame.getSize();
        }
        assertEquals(overlay.length, total);
    }


    @Test public void newScreensaverConsumerDropsBufferedFramesWithoutResettingDecoderEpoch() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        long decoderEpoch = queue.resetForPlayback();
        byte[] pcm = stereoPcm(441, 200);
        assertTrue(queue.offer(pcm, 0, pcm.length, 8_000_000L, decoderEpoch));
        assertEquals(1, queue.queuedChunksForTest());

        // A re-share briefly routes audio to Internal/Mix. When projection is lost again,
        // the new Screensaver source must not replay audio accumulated during that interval.
        queue.discardPendingFramesPreservingEpoch();
        assertEquals(0, queue.queuedChunksForTest());
        assertEquals(1L, queue.droppedChunksForTest());
        assertTrue(queue.offer(pcm, 0, pcm.length, 8_100_000L, decoderEpoch));

        Frame fresh = queue.takeNextFrame(() -> true);
        assertNotNull(fresh);
        assertEquals(8_100_000L, fresh.getTimeStamp());
        assertEquals(pcm.length, fresh.getSize());
    }

    @Test public void discardingBufferedFramesKeepsTimestampFenceAndDecoderGeneration() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        long decoderEpoch = queue.resetForPlayback();
        byte[] pcm = stereoPcm(441, 200);
        assertTrue(queue.offer(pcm, 0, pcm.length, 9_000_000L, decoderEpoch));

        queue.discardPendingFramesPreservingEpoch();

        // An old/out-of-order callback must still be rejected; only later decoder PCM is valid.
        assertFalse(queue.offer(pcm, 0, pcm.length, 8_900_000L, decoderEpoch));
        assertTrue(queue.offer(pcm, 0, pcm.length, 9_100_000L, decoderEpoch));
        assertEquals(1, queue.queuedChunksForTest());
    }

    @Test public void consumerFailureRecoveryDropsPendingFramesButKeepsDecoderEpoch() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        long decoderEpoch = queue.resetForPlayback();
        byte[] pcm = stereoPcm(441, 300);
        assertTrue(queue.offer(pcm, 0, pcm.length, 10_000_000L, decoderEpoch));
        assertTrue(queue.offer(pcm, 0, pcm.length, 10_010_000L, decoderEpoch));

        // Model a failed AAC sink callback after the first frame has been removed. Recovery
        // must discard only the remaining backlog, not invalidate the producer's epoch.
        Frame failed = queue.takeNextFrame(() -> true);
        assertNotNull(failed);
        queue.discardPendingFramesPreservingEpoch();
        assertEquals(0, queue.queuedChunksForTest());
        assertEquals(1L, queue.droppedChunksForTest());

        assertFalse(queue.offer(pcm, 0, pcm.length, 9_990_000L, decoderEpoch));
        assertTrue(queue.offer(pcm, 0, pcm.length, 10_020_000L, decoderEpoch));
        Frame recovered = queue.takeNextFrame(() -> true);
        assertNotNull(recovered);
        assertEquals(10_020_000L, recovered.getTimeStamp());
        assertEquals(pcm.length, recovered.getSize());
    }

    @Test public void repeatedInternalAndScreensaverHandoffsNeverReplayConsumedChunks() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        long decoderEpoch = queue.resetForPlayback();
        byte[] overlay = stereoPcm(441, 900);

        // Internal/Mix owns the queue: the overlay is consumed once by timestamped mixing.
        assertTrue(queue.offer(overlay, 0, overlay.length, 11_000_000L, decoderEpoch));
        byte[] live = stereoPcm(441, 100);
        queue.mixInto(new Frame(live, 0, live.length, 11_000_000L));
        assertEquals(1_000, readShort(live, 0));
        assertEquals(0, queue.queuedChunksForTest());

        // A failed re-share returns the Screensaver-only source. Backlog from the handoff is
        // discarded, but future current-epoch PCM is consumed by exactly one standalone reader.
        assertTrue(queue.offer(overlay, 0, overlay.length, 11_010_000L, decoderEpoch));
        queue.discardPendingFramesPreservingEpoch();
        assertTrue(queue.offer(overlay, 0, overlay.length, 11_020_000L, decoderEpoch));
        Frame waiting = queue.takeNextFrame(() -> true);
        assertNotNull(waiting);
        assertEquals(11_020_000L, waiting.getTimeStamp());
        assertNull(queue.takeNextFrame(() -> queue.queuedChunksForTest() > 0));

        // The next successful re-share restores Internal/Mix. New PCM is mixed and consumed once.
        assertTrue(queue.offer(overlay, 0, overlay.length, 11_030_000L, decoderEpoch));
        byte[] resumed = stereoPcm(441, 50);
        queue.mixInto(new Frame(resumed, 0, resumed.length, 11_030_000L));
        assertEquals(950, readShort(resumed, 0));
        assertEquals(0, queue.queuedChunksForTest());

        // Another projection loss repeats the handoff without changing decoder generation.
        assertTrue(queue.offer(overlay, 0, overlay.length, 11_040_000L, decoderEpoch));
        queue.discardPendingFramesPreservingEpoch();
        assertTrue(queue.offer(overlay, 0, overlay.length, 11_050_000L, decoderEpoch));
        Frame secondWaiting = queue.takeNextFrame(() -> true);
        assertNotNull(secondWaiting);
        assertEquals(11_050_000L, secondWaiting.getTimeStamp());
        assertNull(queue.takeNextFrame(() -> queue.queuedChunksForTest() > 0));
    }


    @Test public void exactDuplicatePresentationTimestampIsNotMixedTwice() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        byte[] first = stereoPcm(441, 700);
        byte[] duplicate = stereoPcm(441, 900);
        assertTrue(queue.offer(first, 0, first.length, 12_000_000L));
        assertFalse(queue.offer(duplicate, 0, duplicate.length, 12_000_000L));

        byte[] base = stereoPcm(441, 100);
        queue.mixInto(new Frame(base, 0, base.length, 12_000_000L));

        assertEquals(800, readShort(base, 0));
        assertEquals(0, queue.queuedChunksForTest());
        assertEquals(1L, queue.droppedChunksForTest());
    }

    @Test public void partiallyOverlappingOutputKeepsOnlyPreviouslyUnseenPcmTail() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        byte[] first = stereoPcm(441, 200); // 10 ms at 44.1 kHz
        byte[] overlapping = stereoPcm(441, 300); // starts 5 ms into the first buffer
        assertTrue(queue.offer(first, 0, first.length, 13_000_000L));
        assertTrue(queue.offer(overlapping, 0, overlapping.length, 13_005_000L));

        byte[] firstLiveFrame = stereoPcm(441, 100);
        queue.mixInto(new Frame(firstLiveFrame, 0, firstLiveFrame.length, 13_000_000L));
        assertEquals(300, readShort(firstLiveFrame, 0));
        assertEquals(1, queue.queuedChunksForTest());

        Frame tail = queue.takeNextFrame(() -> true);
        assertNotNull(tail);
        // ceil(5 ms * 44.1 kHz) removes 221 already-covered samples.
        assertEquals(220 * ModeBScreensaverAudioPcmQueue.BYTES_PER_FRAME, tail.getSize());
        assertEquals(13_010_011L, tail.getTimeStamp());
        assertEquals(300, readShort(tail.getBuffer(), tail.getOffset()));
        assertEquals(0, queue.queuedChunksForTest());
    }


    @Test public void splittingLongPcmChunkDerivesEachAacTimestampFromCumulativeSamples() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        int totalSamples = 16_384; // Exact MAX_CHUNK_BYTES at stereo PCM16.
        byte[] pcm = stereoPcm(totalSamples, 321);
        long originUs = 33_000_000L;
        assertTrue(queue.offer(pcm, 0, pcm.length, originUs));

        int consumedSamples = 0;
        int frames = 0;
        while (queue.queuedChunksForTest() > 0) {
            long expectedTimestampUs = originUs
                    + (long) consumedSamples * 1_000_000L / ModeBScreensaverAudioPcmQueue.SAMPLE_RATE;
            Frame next = queue.takeNextFrame(() -> true);
            assertNotNull(next);
            assertEquals("AAC slice timestamp must use cumulative sample position",
                    expectedTimestampUs, next.getTimeStamp());
            assertEquals(0, next.getSize() % ModeBScreensaverAudioPcmQueue.BYTES_PER_FRAME);
            consumedSamples += next.getSize() / ModeBScreensaverAudioPcmQueue.BYTES_PER_FRAME;
            frames++;
        }

        assertEquals(totalSamples, consumedSamples);
        assertEquals(8, frames);
        assertEquals(0, queue.queuedChunksForTest());
    }


    @Test public void irregularMixSlicesKeepCumulativeCursorAlignedAcrossOneLongChunk() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        int totalSamples = 16_384;
        long originUs = 34_000_000L;
        byte[] overlay = stereoPcm(totalSamples, 321);
        assertTrue(queue.offer(overlay, 0, overlay.length, originUs));

        int[] slices = { 1_237, 2_048, 1_001, 3_000, 2_047, 4_096, 2_955 };
        int consumedSamples = 0;
        for (int sliceSamples : slices) {
            long frameTimestampUs = originUs
                    + (long) consumedSamples * 1_000_000L / ModeBScreensaverAudioPcmQueue.SAMPLE_RATE;
            byte[] live = stereoPcm(sliceSamples, 100);
            queue.mixInto(new Frame(live, 0, live.length, frameTimestampUs));
            assertEquals("Every irregular AAC slice must receive exactly one overlay",
                    421, readShort(live, 0));
            assertEquals(421, readShort(live, live.length - ModeBScreensaverAudioPcmQueue.BYTES_PER_FRAME));
            consumedSamples += sliceSamples;
        }

        assertEquals(totalSamples, consumedSamples);
        assertEquals(0, queue.queuedChunksForTest());
    }

    @Test public void repeatedHandoffsRejectDuplicatePcmAcrossManyCycles() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        long decoderEpoch = queue.resetForPlayback();
        long timestampUs = 20_000_000L;

        for (int cycle = 0; cycle < 100; cycle++) {
            int value = 100 + (cycle % 500);
            byte[] pcm = stereoPcm(441, value);
            assertTrue(queue.offer(pcm, 0, pcm.length, timestampUs, decoderEpoch));
            assertFalse("Duplicate decoder PTS was accepted at cycle " + cycle,
                    queue.offer(pcm, 0, pcm.length, timestampUs, decoderEpoch));

            if (cycle % 3 == 0) {
                // Simulate a brief Internal/Mix consumer handoff while old Screensaver PCM is
                // pending. The pending data is discarded, but its accepted PTS remains fenced.
                queue.discardPendingFramesPreservingEpoch();
                assertFalse(queue.offer(pcm, 0, pcm.length, timestampUs, decoderEpoch));
                timestampUs += 10_000L;
                assertTrue(queue.offer(pcm, 0, pcm.length, timestampUs, decoderEpoch));
            }

            if (cycle % 2 == 0) {
                Frame audioOnly = queue.takeNextFrame(() -> true);
                assertNotNull(audioOnly);
                assertEquals(timestampUs, audioOnly.getTimeStamp());
                assertEquals(pcm.length, audioOnly.getSize());
                assertEquals(value, readShort(audioOnly.getBuffer(), audioOnly.getOffset()));
            } else {
                byte[] live = stereoPcm(441, 10);
                queue.mixInto(new Frame(live, 0, live.length, timestampUs));
                assertEquals(value + 10, readShort(live, 0));
            }
            assertEquals("Queue must be drained once per handoff cycle", 0, queue.queuedChunksForTest());
            timestampUs += 10_000L;
        }
    }



    @Test public void partiallyConsumedOldestChunkIsNotEvictedBeforeRemainingBacklogExceedsLimit() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        int samplesPerChunk = 16_384;
        int chunkBytes = samplesPerChunk * ModeBScreensaverAudioPcmQueue.BYTES_PER_FRAME;
        long chunkDurationUs = (long) samplesPerChunk * 1_000_000L
                / ModeBScreensaverAudioPcmQueue.SAMPLE_RATE;
        long timestampUs = 0L;

        assertTrue(queue.offer(stereoPcm(samplesPerChunk, 200), 0, chunkBytes, timestampUs));

        // Consume 250 ms of the first 371 ms chunk, leaving a valid 121 ms tail.
        int consumedSamples = 11_025;
        byte[] live = stereoPcm(consumedSamples, 100);
        queue.mixInto(new Frame(live, 0, live.length, timestampUs));
        assertEquals(300, readShort(live, 0));

        for (int index = 1; index < 6; index++) {
            timestampUs = index * chunkDurationUs;
            byte[] next = stereoPcm(samplesPerChunk, 200 + index);
            assertTrue("Contiguous PCM chunk rejected at index " + index,
                    queue.offer(next, 0, next.length, timestampUs));
        }

        assertEquals("The partially consumed first chunk still has an in-window tail",
                6, queue.queuedChunksForTest());
        assertTrue(queue.queuedDurationUsForTest() <= ModeBScreensaverAudioPcmQueue.MAX_QUEUED_DURATION_US);
        assertTrue(queue.queuedBytesForTest() <= 6L * ModeBScreensaverAudioPcmQueue.MAX_CHUNK_BYTES);
    }

    @Test public void producerPressureNeverExceedsChunkCountOrByteBudget() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        int samplesPerChunk = 64;
        byte[] pcm = stereoPcm(samplesPerChunk, 123);
        long timestampUs = 50_000_000L;
        long stepUs = (long) samplesPerChunk * 1_000_000L
                / ModeBScreensaverAudioPcmQueue.SAMPLE_RATE;

        for (int index = 0; index < 20_000; index++) {
            assertTrue(queue.offer(pcm, 0, pcm.length, timestampUs));
            timestampUs += stepUs;
            assertTrue(queue.queuedChunksForTest() <= ModeBScreensaverAudioPcmQueue.MAX_CHUNKS);
            assertTrue(queue.queuedBytesForTest()
                    <= (long) ModeBScreensaverAudioPcmQueue.MAX_CHUNKS
                    * ModeBScreensaverAudioPcmQueue.MAX_CHUNK_BYTES);
            assertTrue(queue.queuedDurationUsForTest()
                    <= ModeBScreensaverAudioPcmQueue.MAX_QUEUED_DURATION_US);
        }

        assertEquals(ModeBScreensaverAudioPcmQueue.MAX_CHUNKS, queue.queuedChunksForTest());
        assertTrue(queue.droppedChunksForTest() >= 20_000L - ModeBScreensaverAudioPcmQueue.MAX_CHUNKS);
    }

    @Test public void durationPressureTrimsOldBacklogEvenBelowChunkCountLimit() {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        int samplesPerChunk = 8_192;
        byte[] pcm = stereoPcm(samplesPerChunk, 234);
        long timestampUs = 70_000_000L;
        long stepUs = (long) samplesPerChunk * 1_000_000L
                / ModeBScreensaverAudioPcmQueue.SAMPLE_RATE;

        for (int index = 0; index < 40; index++) {
            assertTrue(queue.offer(pcm, 0, pcm.length, timestampUs));
            timestampUs += stepUs;
        }

        assertTrue(queue.queuedChunksForTest() < ModeBScreensaverAudioPcmQueue.MAX_CHUNKS);
        assertTrue(queue.queuedChunksForTest() > 0);
        assertTrue(queue.queuedDurationUsForTest()
                <= ModeBScreensaverAudioPcmQueue.MAX_QUEUED_DURATION_US);
        assertTrue(queue.droppedChunksForTest() > 0L);
    }

    @Test public void playbackEpochCanResetSamePtsAcrossTenThousandHandoffs() throws Exception {
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        byte[] pcm = stereoPcm(64, 456);
        long previousEpoch = -1L;

        for (int cycle = 0; cycle < 10_000; cycle++) {
            long epoch = queue.resetForPlayback();
            assertTrue(epoch > previousEpoch);
            previousEpoch = epoch;
            assertTrue(queue.offer(pcm, 0, pcm.length, 1_000_000L, epoch));
            assertFalse(queue.offer(pcm, 0, pcm.length, 1_000_000L, epoch));
            Frame frame = queue.takeNextFrame(() -> true);
            assertNotNull(frame);
            assertEquals(1_000_000L, frame.getTimeStamp());
            assertEquals(0, queue.queuedChunksForTest());
        }
    }



    @Test public void concurrentLongProducerAndConsumerRemainMonotonicAndBounded() throws Exception {
        final ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        final int samplesPerChunk = 64;
        final int chunkBytes = samplesPerChunk * ModeBScreensaverAudioPcmQueue.BYTES_PER_FRAME;
        final long originUs = 90_000_000L;
        final long stepUs = (long) samplesPerChunk * 1_000_000L
                / ModeBScreensaverAudioPcmQueue.SAMPLE_RATE;
        final int totalChunks = 15_000;
        final AtomicBoolean producerDone = new AtomicBoolean(false);
        final AtomicLong consumedFrames = new AtomicLong();
        final AtomicReference<Throwable> failure = new AtomicReference<>();
        final CountDownLatch start = new CountDownLatch(1);

        Thread consumer = new Thread(() -> {
            try {
                start.await();
                long previousTimestampUs = -1L;
                while (true) {
                    Frame frame = queue.takeNextFrame(() -> !producerDone.get()
                            || queue.queuedChunksForTest() > 0);
                    if (frame == null) {
                        if (producerDone.get()) break;
                        continue;
                    }
                    assertTrue("Consumer received non-monotonic PCM timestamp",
                            frame.getTimeStamp() > previousTimestampUs);
                    assertEquals(chunkBytes, frame.getSize());
                    long chunkIndex = (frame.getTimeStamp() - originUs) / stepUs;
                    assertEquals((int) (chunkIndex % 30_000L),
                            readShort(frame.getBuffer(), frame.getOffset()));
                    previousTimestampUs = frame.getTimeStamp();
                    consumedFrames.incrementAndGet();
                }
            } catch (Throwable error) {
                failure.compareAndSet(null, error);
            }
        }, "PCM-Queue-Stress-Consumer");

        Thread producer = new Thread(() -> {
            try {
                start.await();
                for (int index = 0; index < totalChunks; index++) {
                    byte[] pcm = stereoPcm(samplesPerChunk, index % 30_000);
                    long timestampUs = originUs + (long) index * stepUs;
                    if (!queue.offer(pcm, 0, pcm.length, timestampUs)) {
                        throw new AssertionError("Valid sequential PCM was rejected at " + index);
                    }
                    assertTrue(queue.queuedChunksForTest() <= ModeBScreensaverAudioPcmQueue.MAX_CHUNKS);
                    assertTrue(queue.queuedBytesForTest()
                            <= (long) ModeBScreensaverAudioPcmQueue.MAX_CHUNKS
                            * ModeBScreensaverAudioPcmQueue.MAX_CHUNK_BYTES);
                    assertTrue(queue.queuedDurationUsForTest()
                            <= ModeBScreensaverAudioPcmQueue.MAX_QUEUED_DURATION_US);
                }
            } catch (Throwable error) {
                failure.compareAndSet(null, error);
            } finally {
                producerDone.set(true);
                queue.wakeConsumers();
            }
        }, "PCM-Queue-Stress-Producer");

        consumer.start();
        producer.start();
        start.countDown();
        producer.join(TimeUnit.SECONDS.toMillis(10));
        consumer.join(TimeUnit.SECONDS.toMillis(10));
        if (producer.isAlive() || consumer.isAlive()) {
            producer.interrupt();
            consumer.interrupt();
            fail("Concurrent PCM stress workers did not terminate");
        }
        if (failure.get() != null) throw new AssertionError("Concurrent PCM stress failed", failure.get());
        assertTrue("Consumer should receive some PCM under concurrent load", consumedFrames.get() > 0L);
        assertEquals(0, queue.queuedChunksForTest());
        assertTrue(queue.droppedChunksForTest() >= 0L);
    }

    private static byte[] stereoPcm(int frames, int value) {
        byte[] data = new byte[frames * ModeBScreensaverAudioPcmQueue.BYTES_PER_FRAME];
        for (int offset = 0; offset < data.length; offset += 2) {
            data[offset] = (byte) (value & 0xFF);
            data[offset + 1] = (byte) ((value >>> 8) & 0xFF);
        }
        return data;
    }

    private static int readShort(byte[] data, int offset) {
        int value = (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
        return value >= 0x8000 ? value - 0x10000 : value;
    }
}
