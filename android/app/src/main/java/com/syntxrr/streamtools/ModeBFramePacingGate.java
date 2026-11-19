package com.syntxrr.streamtools;

/**
 * Bounds an app-owned Surface producer to one posted frame awaiting GL consumption.
 * The producer may start its next Canvas frame only after updateTexImage() has successfully
 * consumed the previous posted frame. Closing the gate wakes a producer blocked during teardown.
 */
final class ModeBFramePacingGate {
    static final long NO_PENDING_FRAME = -1L;

    private long nextSequence;
    private long pendingSequence = NO_PENDING_FRAME;
    private boolean pendingPostConfirmed;
    private boolean closed;

    synchronized boolean awaitProducerTurn() throws InterruptedException {
        while (!closed && pendingSequence != NO_PENDING_FRAME) wait();
        return !closed;
    }

    /** Must be called immediately before unlockCanvasAndPost(), after drawing the Canvas. */
    synchronized long beginFramePost() {
        if (pendingSequence != NO_PENDING_FRAME) {
            throw new IllegalStateException("Frame Surface sebelumnya belum dikonsumsi GL.");
        }
        if (nextSequence == Long.MAX_VALUE) {
            throw new IllegalStateException("Urutan frame Surface mencapai batas maksimum.");
        }
        pendingSequence = ++nextSequence;
        pendingPostConfirmed = false;
        return pendingSequence;
    }

    /** Called only after unlockCanvasAndPost() returns successfully for this sequence. */
    synchronized boolean confirmFramePosted(long sequence) {
        if (sequence <= 0L || sequence != pendingSequence || pendingPostConfirmed) return false;
        pendingPostConfirmed = true;
        return true;
    }

    /** A callback alone is not enough: GL may latch only a successfully posted Canvas buffer. */
    synchronized long confirmedPendingFrameSequence() {
        return pendingPostConfirmed ? pendingSequence : NO_PENDING_FRAME;
    }

    /** Called only after updateTexImage() returns successfully on the GL thread. */
    synchronized boolean acknowledgeConsumed(long sequence) {
        if (sequence <= 0L || sequence != pendingSequence || !pendingPostConfirmed) return false;
        pendingSequence = NO_PENDING_FRAME;
        pendingPostConfirmed = false;
        notifyAll();
        return true;
    }

    synchronized long pendingFrameSequence() {
        return pendingSequence;
    }

    synchronized long lastPostedFrameSequence() {
        return nextSequence;
    }

    /** Permanent close used only by final renderer release; detachment remains restartable. */
    synchronized void close() {
        closed = true;
        notifyAll();
    }

    synchronized boolean isClosed() {
        return closed;
    }
}
