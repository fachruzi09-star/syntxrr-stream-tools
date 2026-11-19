package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ModeBScreensaverLoopBoundaryTest {
    @Test public void audioEosObservedAfterVideoAlreadyWrappedDoesNotWaitAnotherCycle() {
        long nextBoundary = ModeBScreensaverLoopBoundary.nextBoundaryElapsedMs(
                9_950L, 9_950L, 10_000L);

        assertEquals(10_000L, nextBoundary);
        assertTrue(ModeBScreensaverLoopBoundary.hasReachedBoundary(10_120L, nextBoundary));
    }

    @Test public void shortAudioTrackWaitsForActualVideoLoopBoundary() {
        long nextBoundary = ModeBScreensaverLoopBoundary.nextBoundaryElapsedMs(
                7_200L, 7_200L, 10_000L);

        assertEquals(10_000L, nextBoundary);
        assertFalse(ModeBScreensaverLoopBoundary.hasReachedBoundary(9_999L, nextBoundary));
        assertTrue(ModeBScreensaverLoopBoundary.hasReachedBoundary(10_000L, nextBoundary));
    }

    @Test public void resumedPlaybackKeepsCumulativeLoopEpochAcrossPause() {
        ModeBVideoPlaybackClock clock = new ModeBVideoPlaybackClock(10_000L, true);
        assertTrue(clock.start(1_000L));
        assertEquals(8_200L, clock.elapsedPlaybackMs(9_200L));
        assertTrue(clock.pause(9_200L));
        assertEquals(8_200L, clock.elapsedPlaybackMs(100_000L));

        assertTrue(clock.start(200_000L));
        assertEquals(10_000L, clock.elapsedPlaybackMs(201_800L));
        long boundary = ModeBScreensaverLoopBoundary.nextBoundaryElapsedMs(
                clock.elapsedPlaybackMs(201_800L), clock.positionMs(201_800L), 10_000L);
        assertEquals(20_000L, boundary);
    }

    @Test public void rejectsInvalidLoopSnapshotAndSaturatesLargeBoundary() {
        assertEquals(-1L, ModeBScreensaverLoopBoundary.nextBoundaryElapsedMs(-1L, 0L, 10_000L));
        assertEquals(-1L, ModeBScreensaverLoopBoundary.nextBoundaryElapsedMs(5_000L, 10_000L, 10_000L));
        assertEquals(Long.MAX_VALUE, ModeBScreensaverLoopBoundary.nextBoundaryElapsedMs(
                Long.MAX_VALUE - 1_000L, 0L, 10_000L));
        assertFalse(ModeBScreensaverLoopBoundary.hasReachedBoundary(-1L, 1L));
    }
}
