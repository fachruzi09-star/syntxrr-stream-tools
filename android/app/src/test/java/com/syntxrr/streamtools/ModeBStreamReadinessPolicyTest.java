package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBStreamReadinessPolicyTest {
    @Test public void requiresSuccessfulRtmpHandshake() {
        assertFalse(ModeBStreamReadinessPolicy.canPublishLive(false, false, true, true, false));
    }

    @Test public void waitsForFirstProjectionFrameWhenScreenCaptureIsRequired() {
        assertFalse(ModeBStreamReadinessPolicy.canPublishLive(true, false, true, false, false));
    }

    @Test public void allowsLiveWhenRtmpAndFirstProjectionFrameAreReady() {
        assertTrue(ModeBStreamReadinessPolicy.canPublishLive(true, false, true, true, false));
    }

    @Test public void allowsLiveWithoutProjectionLayerWhenCaptureIsDisabled() {
        assertTrue(ModeBStreamReadinessPolicy.canPublishLive(true, false, false, false, false));
    }

    @Test public void suppressesLiveWhileRetryIsPending() {
        assertFalse(ModeBStreamReadinessPolicy.canPublishLive(true, true, true, true, false));
    }

    @Test public void suppressesLiveAfterStopWasRequested() {
        assertFalse(ModeBStreamReadinessPolicy.canPublishLive(true, false, true, true, true));
    }

    @Test public void captureTimeoutFailsOnlyWhenRequiredAndFirstFrameIsMissing() {
        assertTrue(ModeBStreamReadinessPolicy.shouldFailCaptureTimeout(true, false, false));
        assertFalse(ModeBStreamReadinessPolicy.shouldFailCaptureTimeout(true, true, false));
        assertFalse(ModeBStreamReadinessPolicy.shouldFailCaptureTimeout(false, false, false));
        assertFalse(ModeBStreamReadinessPolicy.shouldFailCaptureTimeout(true, false, true));
    }
}
