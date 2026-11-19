package com.syntxrr.streamtools;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Bounds camera conversion work submitted to the shared visual worker.
 * A new frame is accepted only when no previous camera frame is queued or converting.
 */
final class ModeBCameraFrameGate {
    private final AtomicBoolean pending = new AtomicBoolean(false);

    boolean tryAcquire() {
        return pending.compareAndSet(false, true);
    }

    void release() {
        pending.set(false);
    }

    boolean isPending() {
        return pending.get();
    }
}
