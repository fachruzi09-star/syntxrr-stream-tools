package com.syntxrr.streamtools;

/** Bounded thread retirement helper for callbacks that must finish before owner teardown. */
final class ModeBThreadJoinPolicy {
    private ModeBThreadJoinPolicy() { }

    /**
     * Waits up to {@code timeoutMs} for a previously quit thread to finish.
     * Returns false when it is still alive, when asked to join the current thread, or when
     * interrupted. Interruption is restored so the caller retains cancellation state.
     */
    static boolean join(Thread thread, long timeoutMs) {
        if (thread == null || !thread.isAlive()) return true;
        if (thread == Thread.currentThread() || timeoutMs <= 0L) return false;
        try {
            thread.join(timeoutMs);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
        return !thread.isAlive();
    }
}
