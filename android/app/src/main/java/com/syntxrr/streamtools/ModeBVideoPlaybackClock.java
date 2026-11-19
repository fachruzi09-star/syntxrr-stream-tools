package com.syntxrr.streamtools;

/**
 * Monotonic playback clock for Studio MP4 overlays.
 * Playback starts only after RTMP publish succeeds and pauses during reconnects.
 */
final class ModeBVideoPlaybackClock {
    private final long durationMs;
    private final boolean loop;
    private long accumulatedMs;
    private long startedAtMs = -1L;
    private boolean finished;

    ModeBVideoPlaybackClock(long durationMs, boolean loop) {
        if (durationMs <= 0L) throw new IllegalArgumentException("Video duration must be positive.");
        this.durationMs = durationMs;
        this.loop = loop;
    }

    /** Returns true only when playback transitions from paused to running. */
    synchronized boolean start(long nowMs) {
        if (finished || startedAtMs >= 0L) return false;
        startedAtMs = Math.max(0L, nowMs);
        return true;
    }

    /** Returns true only when a running timeline is paused. */
    synchronized boolean pause(long nowMs) {
        if (startedAtMs < 0L) return false;
        accumulatedMs = boundedElapsed(nowMs);
        startedAtMs = -1L;
        if (!loop && accumulatedMs >= durationMs) finished = true;
        return true;
    }

    synchronized long positionMs(long nowMs) {
        long elapsed = startedAtMs >= 0L ? boundedElapsed(nowMs) : accumulatedMs;
        if (loop) return elapsed % durationMs;
        if (elapsed >= durationMs) {
            accumulatedMs = durationMs;
            startedAtMs = -1L;
            finished = true;
            return Math.max(0L, durationMs - 1L);
        }
        return elapsed;
    }

    /**
     * Returns total active playback time, without applying the loop modulo. Unlike wall-clock
     * time this value does not advance while paused, and unlike positionMs() it cannot hide a
     * loop boundary that was crossed before an asynchronous decoder observed end-of-stream.
     */
    synchronized long elapsedPlaybackMs(long nowMs) {
        return startedAtMs >= 0L ? boundedElapsed(nowMs) : accumulatedMs;
    }

    synchronized boolean isPlaying() {
        return startedAtMs >= 0L && !finished;
    }

    synchronized boolean isFinished() {
        return finished;
    }

    private long boundedElapsed(long nowMs) {
        long delta = Math.max(0L, nowMs - startedAtMs);
        if (Long.MAX_VALUE - accumulatedMs < delta) return Long.MAX_VALUE;
        return accumulatedMs + delta;
    }
}
