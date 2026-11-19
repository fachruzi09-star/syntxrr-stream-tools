package com.syntxrr.streamtools;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/** Counts independent async cleanup participants and fires one completion after the final arrival. */
final class ModeBAsyncReleaseBarrier {
    private final AtomicInteger remaining;
    private final AtomicBoolean completed = new AtomicBoolean(false);
    private final Runnable onComplete;

    ModeBAsyncReleaseBarrier(int participants, Runnable onComplete) {
        if (participants <= 0) throw new IllegalArgumentException("At least one release participant is required.");
        if (onComplete == null) throw new IllegalArgumentException("Release completion callback is required.");
        this.remaining = new AtomicInteger(participants);
        this.onComplete = onComplete;
    }

    /** Extra arrivals are ignored, so duplicate native callbacks cannot complete twice. */
    boolean arrive() {
        while (true) {
            int current = remaining.get();
            if (current <= 0) return false;
            if (remaining.compareAndSet(current, current - 1)) {
                if (current == 1 && completed.compareAndSet(false, true)) {
                    try { onComplete.run(); } catch (RuntimeException ignored) { }
                }
                return true;
            }
        }
    }

    int remainingForTest() { return remaining.get(); }
    boolean isCompletedForTest() { return completed.get(); }
}
