package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import com.pedro.library.view.GlTimestamp;
import org.junit.Test;

/**
 * Contract tests against RootEncoder 2.8.1's actual GlTimestamp dependency.
 * These tests deliberately do not duplicate or replace the upstream timestamp implementation.
 */
public final class RootEncoderGlTimestampContractTest {

    private static final long SECOND = 1_000_000_000L;
    private static final long FRAME_30_FPS = SECOND / 30L;

    @Test
    public void firstFrameAnchorsToMonotonicClock() {
        GlTimestamp timestamp = new GlTimestamp();
        timestamp.setFps(30);
        assertEquals(5L * SECOND, timestamp.getTimestamp(SECOND, 5L * SECOND));
    }

    @Test
    public void advancingSourceTimestampDrivesPresentationDelta() {
        GlTimestamp timestamp = new GlTimestamp();
        timestamp.setFps(30);
        timestamp.getTimestamp(SECOND, 5L * SECOND);
        assertEquals(5L * SECOND + 16_000_000L,
                timestamp.getTimestamp(SECOND + 16_000_000L, 5L * SECOND + 20_000_000L));
    }

    @Test
    public void repeatedSourceTimestampFallsBackToClockDelta() {
        GlTimestamp timestamp = new GlTimestamp();
        timestamp.setFps(30);
        timestamp.getTimestamp(SECOND, 5L * SECOND);
        assertEquals(5L * SECOND + 20_000_000L,
                timestamp.getTimestamp(SECOND, 5L * SECOND + 20_000_000L));
    }

    @Test
    public void regressedSourceTimestampFallsBackToClockDelta() {
        GlTimestamp timestamp = new GlTimestamp();
        timestamp.setFps(30);
        timestamp.getTimestamp(SECOND, 5L * SECOND);
        assertEquals(5L * SECOND + 16_000_000L,
                timestamp.getTimestamp(SECOND - 100_000_000L, 5L * SECOND + 16_000_000L));
    }

    @Test
    public void sourceLeadIsCappedToOneFpsDriftWindow() {
        GlTimestamp timestamp = new GlTimestamp();
        timestamp.setFps(30);
        timestamp.getTimestamp(SECOND, 5L * SECOND);
        long clock = 5L * SECOND + 16_000_000L;
        assertEquals(clock + FRAME_30_FPS,
                timestamp.getTimestamp(SECOND + 500_000_000L, clock));
    }

    @Test
    public void sourceLagIsAdvancedToOneFpsDriftWindow() {
        GlTimestamp timestamp = new GlTimestamp();
        timestamp.setFps(30);
        timestamp.getTimestamp(SECOND, 5L * SECOND);
        long clock = 5L * SECOND + 200_000_000L;
        assertEquals(clock - FRAME_30_FPS,
                timestamp.getTimestamp(SECOND + 1_000_000L, clock));
    }

    @Test
    public void changingOutputFpsUpdatesTheAllowedDriftWindow() {
        GlTimestamp timestamp = new GlTimestamp();
        timestamp.setFps(30);
        timestamp.getTimestamp(SECOND, 5L * SECOND);
        timestamp.setFps(60);
        long clock = 5L * SECOND + 16_000_000L;
        assertEquals(clock + (SECOND / 60L),
                timestamp.getTimestamp(SECOND + 500_000_000L, clock));
    }

    @Test
    public void nonPositiveFpsUsesTheDefaultHundredMillisecondDrift() {
        GlTimestamp timestamp = new GlTimestamp();
        timestamp.setFps(0);
        timestamp.getTimestamp(SECOND, 5L * SECOND);
        long clock = 5L * SECOND + 16_000_000L;
        assertEquals(clock + 100_000_000L,
                timestamp.getTimestamp(SECOND + 500_000_000L, clock));
    }

    @Test
    public void resetStartsANewTimestampEpoch() {
        GlTimestamp timestamp = new GlTimestamp();
        timestamp.setFps(30);
        timestamp.getTimestamp(SECOND, 5L * SECOND);
        timestamp.getTimestamp(SECOND + 40_000_000L, 5L * SECOND + 40_000_000L);
        timestamp.reset();
        assertEquals(90L * SECOND,
                timestamp.getTimestamp(400_000_000L, 90L * SECOND));
    }

    @Test
    public void presentationTimestampNeverMovesBackwardForMonotonicClock() {
        GlTimestamp timestamp = new GlTimestamp();
        timestamp.setFps(30);
        long[] source = {
                SECOND,
                SECOND + 16_000_000L,
                SECOND + 16_000_000L,
                SECOND - 50_000_000L,
                SECOND + 17_000_000L,
                SECOND + 17_000_000L,
                SECOND + 600_000_000L,
                SECOND + 600_000_000L
        };
        long previous = Long.MIN_VALUE;
        for (int i = 0; i < source.length; i++) {
            long clock = 7L * SECOND + i * 16_000_000L;
            long current = timestamp.getTimestamp(source[i], clock);
            assertTrue("PTS moved backward at index " + i, current >= previous);
            previous = current;
        }
    }
}
