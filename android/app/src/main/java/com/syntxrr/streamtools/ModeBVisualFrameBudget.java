package com.syntxrr.streamtools;

/** Aggregate cap for visual-frame task start times on the shared Mode B worker. */
final class ModeBVisualFrameBudget {
    // Four sources can be active: camera, two MP4 overlay layers, and one MP4 Screensaver.
    // They share about 24 frame-work starts/second; 42 ms is a conservative aggregate cap.
    static final long MIN_FRAME_START_INTERVAL_MS = 42L;

    private ModeBVisualFrameBudget() { }

    static long delayUntilNextStart(long nowMs, long lastStartMs) {
        if (lastStartMs < 0L) return 0L;
        long now = Math.max(0L, nowMs);
        long elapsed = Math.max(0L, now - lastStartMs);
        return Math.max(0L, MIN_FRAME_START_INTERVAL_MS - elapsed);
    }
}
