package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public final class ModeBScreensaverAudioTimelineTest {
    private static final long DURATION_US = 10_000_000L;
    private static final long NOW_US = 50_000_000L;

    @Test public void mapsMatchingVideoAndAudioPtsToCurrentStreamClock() {
        assertEquals(NOW_US, ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                2_500_000L, 2_500_000L, DURATION_US, NOW_US, false, true));
    }

    @Test public void mapsFutureAndLateSamplesByTheirMediaOffset() {
        assertEquals(NOW_US + 80_000L, ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                2_580_000L, 2_500_000L, DURATION_US, NOW_US, false, true));
        assertEquals(NOW_US - 40_000L, ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                2_460_000L, 2_500_000L, DURATION_US, NOW_US, false, true));
    }

    @Test public void loopedPtsStayAdjacentAcrossTheEndBoundary() {
        assertEquals(NOW_US + 60_000L, ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                20_000L, 9_960_000L, DURATION_US, NOW_US, true, true));
        assertEquals(NOW_US - 90_000L, ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                9_930_000L, 20_000L, DURATION_US, NOW_US, true, true));
    }

    @Test public void nonLoopedPtsDoNotWrapAcrossTheEndBoundary() {
        assertEquals(ModeBScreensaverAudioTimeline.DROP_TIMESTAMP,
                ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                        20_000L, 9_960_000L, DURATION_US, NOW_US, false, true));
    }

    @Test public void dropsSamplesWhenPlaybackIsPausedOrPtsIsInvalid() {
        assertEquals(ModeBScreensaverAudioTimeline.DROP_TIMESTAMP,
                ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                        1_000L, 1_000L, DURATION_US, NOW_US, true, false));
        assertEquals(ModeBScreensaverAudioTimeline.DROP_TIMESTAMP,
                ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                        -1L, 1_000L, DURATION_US, NOW_US, true, true));
        assertEquals(ModeBScreensaverAudioTimeline.DROP_TIMESTAMP,
                ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                        DURATION_US, 1_000L, DURATION_US, NOW_US, true, true));
    }

    @Test public void allowsBoundedDecoderPreRollButRejectsExcessiveLeadAndLateAudio() {
        assertEquals(NOW_US + 800_000L, ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                2_800_000L, 2_000_000L, DURATION_US, NOW_US, false, true));
        assertEquals(ModeBScreensaverAudioTimeline.DROP_TIMESTAMP,
                ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                        3_000_001L, 2_000_000L, DURATION_US, NOW_US, false, true));
        assertEquals(NOW_US - 200_000L, ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                1_800_000L, 2_000_000L, DURATION_US, NOW_US, false, true));
        assertEquals(ModeBScreensaverAudioTimeline.DROP_TIMESTAMP,
                ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                        1_749_999L, 2_000_000L, DURATION_US, NOW_US, false, true));
    }

    @Test public void rejectsStaleFramesAndInvalidClockValues() {
        assertEquals(ModeBScreensaverAudioTimeline.DROP_TIMESTAMP,
                ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                        1_000_000L, 2_000_000L, DURATION_US, NOW_US, false, true));
        assertEquals(ModeBScreensaverAudioTimeline.DROP_TIMESTAMP,
                ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                        1_000L, 1_000L, 0L, NOW_US, true, true));
        assertEquals(ModeBScreensaverAudioTimeline.DROP_TIMESTAMP,
                ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                        1_000L, DURATION_US, DURATION_US, NOW_US, true, true));
    }

    @Test public void saturatesTimestampAdditionInsteadOfWrapping() {
        assertEquals(Long.MAX_VALUE,
                ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                        510_000L, 10_000L, DURATION_US, Long.MAX_VALUE - 100_000L, false, true));
    }
}
