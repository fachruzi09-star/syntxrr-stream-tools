package com.syntxrr.streamtools;

/** Pure readiness rules for publishing LIVE only when RTMP and the required capture layer are ready. */
final class ModeBStreamReadinessPolicy {
    private ModeBStreamReadinessPolicy() { }

    static boolean canPublishLive(boolean connectionEstablished, boolean retryPending,
                                   boolean captureRequired, boolean captureFrameReady,
                                   boolean stopRequested) {
        return !stopRequested && connectionEstablished && !retryPending
                && (!captureRequired || captureFrameReady);
    }

    static boolean shouldFailCaptureTimeout(boolean captureRequired, boolean captureFrameReady,
                                            boolean stopRequested) {
        return captureRequired && !captureFrameReady && !stopRequested;
    }
}
