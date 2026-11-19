package com.syntxrr.streamtools;

/** FIFO queue barrier used before deleting files that may still be read by a worker task. */
final class ModeBWorkerReleaseBarrier {
    interface Poster {
        boolean post(Runnable task);
    }

    private ModeBWorkerReleaseBarrier() { }

    /** Returns false when the worker no longer accepts tasks; callers must defer deletion. */
    static boolean enqueue(Poster poster, Runnable acknowledgement) {
        if (acknowledgement == null) return true;
        return poster != null && poster.post(acknowledgement);
    }
}
