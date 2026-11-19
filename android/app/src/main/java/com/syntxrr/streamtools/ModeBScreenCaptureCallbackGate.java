package com.syntxrr.streamtools;

/**
 * Serializes direct-screen frame callbacks with projection suspension and source retirement.
 * A callback must hold a lease from tryEnter() through its final frame/first-frame dispatch.
 */
final class ModeBScreenCaptureCallbackGate {
    private final Object lock = new Object();
    private int activeCallbacks;
    private boolean accepting = true;
    private boolean permanentlyClosed;

    boolean tryEnter() {
        synchronized (lock) {
            if (!accepting || permanentlyClosed) return false;
            activeCallbacks++;
            return true;
        }
    }

    void exit() {
        synchronized (lock) {
            if (activeCallbacks <= 0) {
                throw new IllegalStateException("Screen-capture callback lease underflow.");
            }
            activeCallbacks--;
            if (activeCallbacks == 0) lock.notifyAll();
        }
    }

    /** Stops admitting callbacks and waits until every previously admitted callback exits. */
    void pauseAndAwait() {
        synchronized (lock) {
            if (permanentlyClosed) return;
            accepting = false;
            awaitCallbacksLocked();
        }
    }

    /** Reopens the gate after a fresh projection and generation have been installed. */
    void resume() {
        synchronized (lock) {
            if (!permanentlyClosed) accepting = true;
        }
    }

    /** Permanently closes the gate and drains callbacks before producer/GL resources are released. */
    void closeAndAwait() {
        synchronized (lock) {
            permanentlyClosed = true;
            accepting = false;
            awaitCallbacksLocked();
        }
    }

    private void awaitCallbacksLocked() {
        boolean interrupted = false;
        while (activeCallbacks > 0) {
            try {
                lock.wait();
            } catch (InterruptedException interruption) {
                // Resource retirement is a safety boundary: finish draining, then restore interrupt.
                interrupted = true;
            }
        }
        if (interrupted) Thread.currentThread().interrupt();
    }
}
