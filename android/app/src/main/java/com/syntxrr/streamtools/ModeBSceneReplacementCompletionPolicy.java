package com.syntxrr.streamtools;

/** Keeps scene-commit notifications aligned with the current Mode B session state. */
final class ModeBSceneReplacementCompletionPolicy {
    enum State { STOPPED, RESHARE_WAITING, RESHARING, HOST_WAIT, LIVE }

    private ModeBSceneReplacementCompletionPolicy() { }

    static State resolve(boolean stopRequested, boolean cleanupStarted, boolean reshareWaiting,
            boolean reshareInProgress, boolean hostWaitActive) {
        if (stopRequested || cleanupStarted) return State.STOPPED;
        if (reshareWaiting) return State.RESHARE_WAITING;
        if (reshareInProgress) return State.RESHARING;
        if (hostWaitActive) return State.HOST_WAIT;
        return State.LIVE;
    }
}
