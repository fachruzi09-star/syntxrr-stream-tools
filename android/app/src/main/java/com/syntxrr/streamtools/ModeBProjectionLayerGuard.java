package com.syntxrr.streamtools;

/** Prevents duplicate VirtualDisplay creation and callbacks racing with service teardown. */
final class ModeBProjectionLayerGuard {
    private boolean creationStarted;
    private boolean released;

    synchronized boolean tryBeginCreation() {
        if (released || creationStarted) return false;
        creationStarted = true;
        return true;
    }

    synchronized void close() {
        released = true;
    }

    synchronized boolean isClosed() {
        return released;
    }
}
