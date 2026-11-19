package com.syntxrr.streamtools;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Bounded FIFO barrier for retiring callbacks queued on a reused HandlerThread. */
final class ModeBHandlerDrainPolicy {
    interface Poster {
        boolean post(Runnable barrier);
    }

    private ModeBHandlerDrainPolicy() { }

    /**
     * Posts a marker after work already queued on the worker and waits for that marker.
     * Returns false if the worker is absent/dead, the marker is rejected, the wait times out,
     * the caller is the worker itself, or the caller is interrupted. Interrupt state is kept.
     */
    static boolean awaitBarrier(Poster poster, Thread workerThread, long timeoutMs) {
        if (poster == null || workerThread == null || !workerThread.isAlive()
                || workerThread == Thread.currentThread() || timeoutMs <= 0L) return false;
        CountDownLatch reached = new CountDownLatch(1);
        try {
            if (!poster.post(reached::countDown)) return false;
            return reached.await(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        } catch (RuntimeException rejected) {
            return false;
        }
    }
}
