package com.syntxrr.streamtools;

/** Runs stream stop/release and independent source fallbacks while preserving every failure. */
final class ModeBStreamTeardown {
    private ModeBStreamTeardown() { }

    static Result run(Runnable stopStream, Runnable release) {
        return run(stopStream, release, null, null);
    }

    /** Compatibility overload for the direct-screen source fallback. */
    static Result run(Runnable stopStream, Runnable release, Runnable directSourceFallback) {
        return run(stopStream, release, directSourceFallback, null);
    }

    /**
     * Attempts direct-video and audio-source retirement independently after RootEncoder's
     * teardown. RootEncoder's stopSources() stops video before audio, so a video exception can
     * otherwise prevent the app-owned AudioSource from receiving stop()/release().
     */
    static Result run(Runnable stopStream, Runnable release, Runnable directSourceFallback,
            Runnable audioSourceFallback) {
        return run(stopStream, release, directSourceFallback, audioSourceFallback, null, null);
    }

    /**
     * Adds an independent GL stop retry after a failed RootEncoder release, followed by a
     * mandatory worker-retirement check. This keeps a video/audio source exception from
     * preventing the GL renderer from receiving its own stop request.
     */
    static Result run(Runnable stopStream, Runnable release,
            Runnable directSourceFallback, Runnable audioSourceFallback,
            Runnable glFallback, Runnable glWorkerCheck) {
        Throwable failure = null;
        failure = attempt(stopStream, failure);
        boolean releaseFailed = false;
        if (release != null) {
            try {
                release.run();
            } catch (RuntimeException | Error releaseFailure) {
                releaseFailed = true;
                failure = append(failure, releaseFailure);
            }
        }
        failure = attempt(directSourceFallback, failure);
        // A successful RootEncoder release has already called AudioSource.stop/release. Only
        // retry the separately owned audio sources when release failed or no stream owns them.
        if (audioSourceFallback != null && (release == null || releaseFailed)) {
            failure = attempt(audioSourceFallback, failure);
        }
        boolean glFallbackAttempted = false;
        if (glFallback != null && (release == null || releaseFailed)) {
            failure = attempt(glFallback, failure);
            glFallbackAttempted = true;
        }

        // The first postcondition check is mandatory even when RootEncoder.release() returned
        // normally: secureSubmit(100) can swallow a timeout while the public release API exits.
        // If that check finds an unretired worker or EGL Java-side state, retry GL cleanup once
        // (only after the guard has established that the original worker is no longer running),
        // then run the same postcondition check again.
        Throwable glCheckFailure = capture(glWorkerCheck);
        if (glCheckFailure != null && glFallback != null && !glFallbackAttempted) {
            Throwable glRecoveryFailure = capture(glFallback);
            Throwable glRetryCheckFailure = capture(glWorkerCheck);
            if (glRecoveryFailure != null || glRetryCheckFailure != null) {
                failure = append(failure, glCheckFailure);
                failure = append(failure, glRecoveryFailure);
                failure = append(failure, glRetryCheckFailure);
            }
            // A failed first check is considered recovered only when both the guarded retry
            // and its final worker/EGL postcondition check succeed.
        } else {
            failure = append(failure, glCheckFailure);
        }
        return new Result(failure);
    }

    private static Throwable append(Throwable firstFailure, Throwable nextFailure) {
        if (nextFailure == null) return firstFailure;
        if (firstFailure == null) return nextFailure;
        if (firstFailure != nextFailure) firstFailure.addSuppressed(nextFailure);
        return firstFailure;
    }

    private static Throwable attempt(Runnable operation, Throwable firstFailure) {
        return append(firstFailure, capture(operation));
    }

    private static Throwable capture(Runnable operation) {
        if (operation == null) return null;
        try {
            operation.run();
            return null;
        } catch (RuntimeException | Error failure) {
            return failure;
        }
    }

    static final class Result {
        private final Throwable failure;

        private Result(Throwable failure) { this.failure = failure; }

        boolean isSuccessful() { return failure == null; }

        String failureMessage() {
            if (failure == null) return "";
            String message = failure.getMessage();
            String result = failure.getClass().getSimpleName()
                    + (message == null || message.trim().isEmpty() ? "" : ": " + message);
            for (Throwable suppressed : failure.getSuppressed()) {
                if (suppressed == null) continue;
                String detail = suppressed.getMessage();
                result += "; " + suppressed.getClass().getSimpleName()
                        + (detail == null || detail.trim().isEmpty() ? "" : ": " + detail);
            }
            return result;
        }
    }
}
