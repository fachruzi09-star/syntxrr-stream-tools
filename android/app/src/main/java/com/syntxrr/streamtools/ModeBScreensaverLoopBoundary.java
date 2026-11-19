package com.syntxrr.streamtools;

/** Computes the next video loop boundary in the clock's cumulative active-playback timebase. */
final class ModeBScreensaverLoopBoundary {
    private ModeBScreensaverLoopBoundary() { }

    static long nextBoundaryElapsedMs(long elapsedPlaybackMs, long mediaPositionMs,
            long durationMs) {
        if (elapsedPlaybackMs < 0L || mediaPositionMs < 0L || durationMs <= 0L
                || mediaPositionMs >= durationMs) {
            return -1L;
        }
        // The video position is modulo duration while elapsedPlaybackMs is cumulative. Their
        // difference identifies this loop's absolute start even after pause/resume transitions.
        long loopStartElapsedMs = Math.max(0L, elapsedPlaybackMs - mediaPositionMs);
        if (Long.MAX_VALUE - loopStartElapsedMs < durationMs) return Long.MAX_VALUE;
        return loopStartElapsedMs + durationMs;
    }

    static boolean hasReachedBoundary(long elapsedPlaybackMs, long boundaryElapsedMs) {
        return elapsedPlaybackMs >= 0L && boundaryElapsedMs >= 0L
                && elapsedPlaybackMs >= boundaryElapsedMs;
    }
}
