package com.syntxrr.streamtools;

/**
 * Orders Mix audio teardown so a blocking AudioRecord.read() cannot hold the reader thread open
 * while the owner waits for that same thread to exit.
 */
final class ModeBAudioReaderRetirement {
    interface ReaderThread {
        void quitSafely();
        boolean join(long timeoutMs);
    }

    private ModeBAudioReaderRetirement() { }

    /**
     * Requests thread retirement, stops active recorder legs to wake blocking reads, then joins
     * the reader. Recorder release is deliberately left to the caller and must happen only after
     * this method returns successfully.
     */
    static void stopAndJoin(ReaderThread reader, ModeBAudioRecordCleanup.Recorder microphone,
            ModeBAudioRecordCleanup.Recorder playbackCapture, long timeoutMs) {
        Throwable signalFailure = null;
        if (reader != null) {
            try {
                reader.quitSafely();
            } catch (RuntimeException | Error failure) {
                signalFailure = failure;
            }
        }

        signalFailure = append(signalFailure,
                ModeBAudioRecordCleanup.stopForReaderRetirement(microphone));
        signalFailure = append(signalFailure,
                ModeBAudioRecordCleanup.stopForReaderRetirement(playbackCapture));

        if (reader != null) {
            boolean joined = false;
            try {
                joined = reader.join(timeoutMs);
            } catch (RuntimeException | Error failure) {
                signalFailure = append(signalFailure, failure);
            }
            if (!joined) {
                IllegalStateException failure = new IllegalStateException(
                        "Thread pembaca audio belum berhenti; AudioRecord dipertahankan untuk cleanup aman.");
                if (signalFailure != null) failure.addSuppressed(signalFailure);
                throw failure;
            }
        }
    }

    private static Throwable append(Throwable first, Throwable next) {
        if (next == null) return first;
        if (first == null) return next;
        first.addSuppressed(next);
        return first;
    }
}
