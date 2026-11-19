package com.syntxrr.streamtools;

import java.util.ArrayList;
import java.util.List;

/** Coalesces duplicate async media-release requests into one retirement and one acknowledgement. */
final class ModeBMediaReleaseCoordinator {
    private final List<Runnable> callbacks = new ArrayList<>();
    private boolean started;
    private boolean completed;

    /** Returns true only to the caller that owns starting the underlying retirement. */
    boolean request(Runnable onComplete) {
        boolean runImmediately = false;
        boolean shouldStart = false;
        synchronized (this) {
            if (completed) {
                runImmediately = onComplete != null;
            } else {
                if (onComplete != null) callbacks.add(onComplete);
                if (!started) {
                    started = true;
                    shouldStart = true;
                }
            }
        }
        if (runImmediately) runSafely(onComplete);
        return shouldStart;
    }

    /** Completes the shared retirement and acknowledges every joined caller exactly once. */
    void complete() {
        final List<Runnable> pending;
        synchronized (this) {
            if (completed) return;
            completed = true;
            pending = new ArrayList<>(callbacks);
            callbacks.clear();
        }
        for (Runnable callback : pending) runSafely(callback);
    }

    synchronized boolean isStartedForTest() { return started; }
    synchronized boolean isCompletedForTest() { return completed; }
    synchronized int pendingCallbacksForTest() { return callbacks.size(); }

    private static void runSafely(Runnable callback) {
        try { callback.run(); } catch (RuntimeException ignored) { }
    }
}
