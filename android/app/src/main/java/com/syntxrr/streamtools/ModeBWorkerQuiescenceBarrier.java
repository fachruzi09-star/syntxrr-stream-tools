package com.syntxrr.streamtools;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Runs resource cleanup after a worker has left all queued and in-flight file-reading work.
 * If the worker no longer accepts a FIFO barrier, cleanup is deferred until that worker thread
 * has actually terminated; callers must never release a retriever concurrently with getFrameAtTime.
 */
final class ModeBWorkerQuiescenceBarrier {
    interface Poster {
        boolean post(Runnable task);
    }

    interface Awaiter {
        boolean await(Runnable onQuiescent);
    }

    private ModeBWorkerQuiescenceBarrier() { }

    /** Returns true when cleanup is queued or an asynchronous termination wait was scheduled. */
    static boolean enqueue(Poster poster, Awaiter awaiter, Runnable cleanup) {
        if (cleanup == null) return true;
        AtomicBoolean completed = new AtomicBoolean(false);
        Runnable once = () -> {
            if (completed.compareAndSet(false, true)) cleanup.run();
        };
        if (poster != null && poster.post(once)) return true;
        return awaiter != null && awaiter.await(once);
    }

    /**
     * Schedules a callback only after the supplied worker thread is no longer alive.
     * This is intentionally asynchronous so a UI/service caller never blocks waiting for a decoder.
     */
    static boolean awaitThreadTermination(Thread worker, Runnable onQuiescent) {
        if (onQuiescent == null) return true;
        if (worker == null || !worker.isAlive()) {
            onQuiescent.run();
            return true;
        }
        try {
            Thread waiter = new Thread(() -> {
                boolean interrupted = false;
                while (worker.isAlive()) {
                    try {
                        worker.join();
                    } catch (InterruptedException interruption) {
                        interrupted = true;
                    }
                }
                if (interrupted) Thread.currentThread().interrupt();
                onQuiescent.run();
            }, "SYNTXRR-WorkerRetirement");
            waiter.setDaemon(true);
            waiter.start();
            return true;
        } catch (RuntimeException | OutOfMemoryError schedulingFailure) {
            // Fail closed: do not acknowledge resource retirement while the worker may still read.
            if (!worker.isAlive()) {
                onQuiescent.run();
                return true;
            }
            return false;
        }
    }
}
