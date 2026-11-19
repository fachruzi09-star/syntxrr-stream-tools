package com.syntxrr.streamtools;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

public final class ModeBVideoPlaybackClockTest {
    @Test
    public void clipDoesNotAdvanceBeforePublishStarts() {
        ModeBVideoPlaybackClock clock = new ModeBVideoPlaybackClock(5_000L, false);
        assertTrue(0L == clock.positionMs(50_000L));
        assertFalse(clock.isPlaying());
        assertTrue(clock.start(70_000L));
        assertTrue(250L == clock.positionMs(70_250L));
    }

    @Test
    public void pauseAndResumePreservePositionAcrossReconnect() {
        ModeBVideoPlaybackClock clock = new ModeBVideoPlaybackClock(8_000L, false);
        assertTrue(clock.start(1_000L));
        assertTrue(300L == clock.positionMs(1_300L));
        assertTrue(clock.pause(1_500L));
        assertTrue(500L == clock.positionMs(9_000L));
        assertTrue(clock.start(10_000L));
        assertTrue(900L == clock.positionMs(10_400L));
    }

    @Test
    public void loopingClipWrapsAfterAccumulatedPlaybackTime() {
        ModeBVideoPlaybackClock clock = new ModeBVideoPlaybackClock(1_000L, true);
        assertTrue(clock.start(100L));
        assertTrue(250L == clock.positionMs(1_350L));
        assertTrue(clock.pause(1_500L));
        assertTrue(clock.start(5_000L));
        assertTrue(600L == clock.positionMs(5_200L));
    }

    @Test
    public void cumulativePlaybackTimeDoesNotWrapAtLoopBoundary() {
        ModeBVideoPlaybackClock clock = new ModeBVideoPlaybackClock(1_000L, true);
        assertTrue(clock.start(100L));
        assertTrue(1_250L == clock.elapsedPlaybackMs(1_350L));
        assertTrue(250L == clock.positionMs(1_350L));
    }

    @Test
    public void cumulativePlaybackTimeRemainsFrozenWhilePaused() {
        ModeBVideoPlaybackClock clock = new ModeBVideoPlaybackClock(8_000L, true);
        assertTrue(clock.start(1_000L));
        assertTrue(clock.pause(3_500L));
        assertTrue(2_500L == clock.elapsedPlaybackMs(90_000L));
        assertTrue(clock.start(100_000L));
        assertTrue(3_000L == clock.elapsedPlaybackMs(100_500L));
    }

    @Test
    public void nonLoopingClipFreezesAtLastFrameAndCannotRestart() {
        ModeBVideoPlaybackClock clock = new ModeBVideoPlaybackClock(1_000L, false);
        assertTrue(clock.start(1_000L));
        assertTrue(999L == clock.positionMs(2_050L));
        assertTrue(clock.isFinished());
        assertFalse(clock.isPlaying());
        assertFalse(clock.start(4_000L));
        assertTrue(999L == clock.positionMs(5_000L));
    }

    @Test
    public void rejectsInvalidVideoDuration() {
        assertThrows(IllegalArgumentException.class, () -> new ModeBVideoPlaybackClock(0L, false));
        assertThrows(IllegalArgumentException.class, () -> new ModeBVideoPlaybackClock(-1L, true));
    }
}
