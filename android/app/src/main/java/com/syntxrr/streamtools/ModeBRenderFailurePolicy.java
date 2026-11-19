package com.syntxrr.streamtools;

/** Rejects GL render failures delivered by an obsolete or already-retired RTMP stream. */
final class ModeBRenderFailurePolicy {
    private ModeBRenderFailurePolicy() { }

    static boolean shouldEndSession(long failedGeneration, long currentGeneration,
            boolean stopRequested, boolean cleanupStarted) {
        return failedGeneration == currentGeneration && !stopRequested && !cleanupStarted;
    }
}
