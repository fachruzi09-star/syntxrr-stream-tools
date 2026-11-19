package com.syntxrr.streamtools;

/** Serializes GL filter release attempts and exposes completion only after a successful release. */
final class ModeBFilterReleaseGuard {
    private boolean releaseInProgress;
    private boolean releaseCompleted;

    synchronized boolean beginRelease() {
        if (releaseInProgress || releaseCompleted) return false;
        releaseInProgress = true;
        return true;
    }

    /** A failed GL release is not an acknowledgement; permit a later bounded retry. */
    synchronized void markReleaseFailed() {
        if (!releaseCompleted) releaseInProgress = false;
    }

    synchronized void markReleaseCompleted() {
        releaseCompleted = true;
        releaseInProgress = false;
    }

    synchronized boolean isReleaseCompleted() { return releaseCompleted; }
}
