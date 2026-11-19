package com.syntxrr.streamtools;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ModeBMixAudioFailurePolicyTest {
    @Test public void identifiesPlaybackCaptureCreationFailureOnlyWhenMicLegIsReady() {
        assertTrue(ModeBMixAudioFailurePolicy.isPlaybackCaptureCreationFailure(true, false));
        assertFalse(ModeBMixAudioFailurePolicy.isPlaybackCaptureCreationFailure(false, false));
        assertFalse(ModeBMixAudioFailurePolicy.isPlaybackCaptureCreationFailure(true, true));
    }

    @Test public void identifiesPlaybackCaptureStartFailureAfterMicHasStarted() {
        assertTrue(ModeBMixAudioFailurePolicy.isPlaybackCaptureStartFailure(true, false));
        assertFalse(ModeBMixAudioFailurePolicy.isPlaybackCaptureStartFailure(false, false));
        assertFalse(ModeBMixAudioFailurePolicy.isPlaybackCaptureStartFailure(true, true));
        assertFalse(ModeBMixAudioFailurePolicy.isPlaybackCaptureStartFailure(false, true));
    }
}
