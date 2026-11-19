package com.syntxrr.streamtools;

/** Stops and releases every retained audio source without short-circuiting later cleanup. */
final class ModeBAudioSourceTeardown {
    interface Source {
        void stop();
        void release();
    }

    private ModeBAudioSourceTeardown() { }

    static Result run(Iterable<? extends Source> sources) {
        Throwable failure = null;
        if (sources == null) return new Result(null);
        for (Source source : sources) {
            if (source == null) continue;
            try {
                source.stop();
            } catch (RuntimeException | Error stopFailure) {
                failure = append(failure, stopFailure);
            }
            try {
                source.release();
            } catch (RuntimeException | Error releaseFailure) {
                failure = append(failure, releaseFailure);
            }
        }
        return new Result(failure);
    }

    private static Throwable append(Throwable first, Throwable next) {
        if (first == null) return next;
        if (first != next) first.addSuppressed(next);
        return first;
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

        void throwIfFailed() {
            if (failure instanceof RuntimeException) throw (RuntimeException) failure;
            if (failure instanceof Error) throw (Error) failure;
        }
    }
}
