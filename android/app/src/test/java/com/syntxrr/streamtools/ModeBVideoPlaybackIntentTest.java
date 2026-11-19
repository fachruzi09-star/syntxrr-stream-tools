package com.syntxrr.streamtools;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ModeBVideoPlaybackIntentTest {
    @Test
    public void liveRequestBeforeDecoderReadyIsRetained() {
        ModeBVideoPlaybackIntent intent = new ModeBVideoPlaybackIntent();
        intent.requestPlayback();
        assertTrue(intent.isPlaybackRequested());
    }

    @Test
    public void pauseBeforeDecoderReadyCancelsPendingAutostart() {
        ModeBVideoPlaybackIntent intent = new ModeBVideoPlaybackIntent();
        intent.requestPlayback();
        intent.requestPause();
        assertFalse(intent.isPlaybackRequested());
    }

    @Test
    public void latestPlaybackIntentWinsDuringInitialization() {
        ModeBVideoPlaybackIntent intent = new ModeBVideoPlaybackIntent();
        intent.requestPlayback();
        intent.requestPause();
        intent.requestPlayback();
        assertTrue(intent.isPlaybackRequested());
    }

    @Test
    public void earlyLiveRequestStartsClockAfterDecoderBecomesReady() {
        ModeBVideoPlaybackIntent intent = new ModeBVideoPlaybackIntent();
        intent.requestPlayback();
        ModeBVideoPlaybackClock clock = new ModeBVideoPlaybackClock(5_000L, false);
        assertTrue(intent.startIfRequested(clock, 10_000L));
        assertTrue(clock.isPlaying());
        assertTrue(200L == clock.positionMs(10_200L));
    }

    @Test
    public void pendingLiveRequestIsNotAppliedAfterPause() {
        ModeBVideoPlaybackIntent intent = new ModeBVideoPlaybackIntent();
        intent.requestPlayback();
        intent.requestPause();
        ModeBVideoPlaybackClock clock = new ModeBVideoPlaybackClock(5_000L, false);
        assertFalse(intent.startIfRequested(clock, 10_000L));
        assertFalse(clock.isPlaying());
    }
}
