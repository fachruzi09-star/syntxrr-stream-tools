package com.syntxrr.streamtools;

/** Attempts every independent GL filter removal even when an earlier request throws. */
final class ModeBFilterRemovalBatch {
    private ModeBFilterRemovalBatch() { }

    /**
     * Runs each non-null removal exactly once and returns the first failure with later failures
     * attached as suppressed exceptions. A returned failure does not imply that any filter has
     * been released; callers must still wait for each filter's release acknowledgement.
     */
    static RuntimeException attemptAll(Runnable... removals) {
        return attemptAllWithRetry(1, removals);
    }

    /**
     * Attempts every independent removal up to maxAttempts times. A failed attempt is ambiguous:
     * RootEncoder queues REMOVE operations, so an implementation can fail after accepting a
     * request. ModeBSceneReplacementFilter therefore guards its GL release against duplicate
     * requests before this retry path is used. A returned failure means every attempt for at
     * least one filter failed; callers must still wait for release acknowledgements and fail
     * closed when an acknowledgement never arrives.
     */
    static RuntimeException attemptAllWithRetry(int maxAttempts, Runnable... removals) {
        if (removals == null) return new IllegalArgumentException("Removal requests must not be null.");
        if (maxAttempts < 1) return new IllegalArgumentException("At least one removal attempt is required.");
        RuntimeException firstFailure = null;
        for (Runnable removal : removals) {
            if (removal == null) continue;
            RuntimeException requestFailure = null;
            for (int attempt = 0; attempt < maxAttempts; attempt++) {
                try {
                    removal.run();
                    requestFailure = null;
                    break;
                } catch (RuntimeException failure) {
                    if (requestFailure == null) requestFailure = failure;
                    else if (failure != requestFailure) requestFailure.addSuppressed(failure);
                }
            }
            if (requestFailure != null) {
                if (firstFailure == null) firstFailure = requestFailure;
                else if (firstFailure != requestFailure) firstFailure.addSuppressed(requestFailure);
            }
        }
        return firstFailure;
    }
}
