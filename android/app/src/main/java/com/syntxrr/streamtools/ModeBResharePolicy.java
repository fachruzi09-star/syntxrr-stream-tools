package com.syntxrr.streamtools;

/** Pure state policy for keeping the RTMP session alive while a fresh projection is requested. */
final class ModeBResharePolicy {
    private ModeBResharePolicy() { }

    static boolean shouldKeepRtmpAlive(boolean projectionDependent, boolean sessionWasLive,
            boolean rtmpStillStreaming, boolean stopRequested, boolean cleanupStarted) {
        return projectionDependent && sessionWasLive && rtmpStillStreaming
                && !stopRequested && !cleanupStarted;
    }

    static boolean canAcceptReshare(boolean waiting, boolean inProgress, boolean stopRequested,
            boolean cleanupStarted, int resultCode, boolean hasResultData, boolean hasStream) {
        return waiting && !inProgress && !stopRequested && !cleanupStarted
                && resultCode == -1 && hasResultData && hasStream;
    }

    static boolean shouldReturnToWaiting(boolean stopRequested, boolean cleanupStarted,
            boolean firstFrameReady, boolean projectionAttached) {
        return !stopRequested && !cleanupStarted && projectionAttached && !firstFrameReady;
    }
}
