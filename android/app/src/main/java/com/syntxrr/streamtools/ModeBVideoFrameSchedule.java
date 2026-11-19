package com.syntxrr.streamtools;

/**
 * Keeps MP4 frame extraction on a monotonic cadence without catch-up bursts.
 * Slow decodes skip missed deadlines and wait one interval before the next frame.
 */
final class ModeBVideoFrameSchedule {
    private long nextFrameAtMs = -1L;

    void reset(long nowMs) {
        nextFrameAtMs = Math.max(0L, nowMs);
    }

    long delayUntilNextFrame(long nowMs, long intervalMs) {
        if (intervalMs <= 0L) throw new IllegalArgumentException("Frame interval must be positive.");
        long now = Math.max(0L, nowMs);
        if (nextFrameAtMs < 0L) reset(now);
        long candidate = saturatingAdd(nextFrameAtMs, intervalMs);
        if (candidate <= now) candidate = saturatingAdd(now, intervalMs);
        nextFrameAtMs = candidate;
        return Math.max(0L, candidate - now);
    }

    private static long saturatingAdd(long left, long right) {
        if (Long.MAX_VALUE - left < right) return Long.MAX_VALUE;
        return left + right;
    }
}
