package com.syntxrr.streamtools;

import android.media.AudioRecord;

/**
 * Closes an AudioRecord without assuming that it reached RECORDSTATE_RECORDING.
 * AudioRecord.stop() is only attempted for an initialized recorder that is currently recording;
 * release() is always attempted, including after stop() fails.
 */
final class ModeBAudioRecordCleanup {
    interface Recorder {
        int state();
        int recordingState();
        void clearPositionUpdateListener();
        void stop();
        void release();
    }

    private ModeBAudioRecordCleanup() { }

    /**
     * @return null when release succeeded; otherwise the release failure, with an earlier
     *         stop/listener failure attached as suppressed context.
     */
    static Throwable release(Recorder recorder) {
        if (recorder == null) return null;
        Throwable earlierFailure = null;
        try {
            recorder.clearPositionUpdateListener();
        } catch (RuntimeException | Error failure) {
            earlierFailure = failure;
        }
        Throwable stopFailure = stopForReaderRetirement(recorder);
        if (stopFailure != null) earlierFailure = append(earlierFailure, stopFailure);
        try {
            recorder.release();
            // A successfully released AudioRecord no longer owns capture resources. A stop()
            // failure is therefore diagnostic only and must not strand the source lifecycle.
            return null;
        } catch (RuntimeException | Error releaseFailure) {
            if (earlierFailure != null) releaseFailure.addSuppressed(earlierFailure);
            return releaseFailure;
        }
    }

    /**
     * Stops an active recorder without releasing it. Call this before joining a reader thread:
     * RootEncoder reads AudioRecord in blocking mode, so merely clearing its running flag and
     * quitting the HandlerThread may leave the thread blocked inside read(). The caller must
     * still wait for the reader to exit before releasing the recorder.
     *
     * @return null when no stop was needed or the stop succeeded; otherwise the stop failure.
     */
    static Throwable stopForReaderRetirement(Recorder recorder) {
        if (recorder == null) return null;
        try {
            if (recorder.state() == AudioRecord.STATE_INITIALIZED
                    && recorder.recordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                recorder.stop();
            }
            return null;
        } catch (RuntimeException | Error failure) {
            return failure;
        }
    }

    private static Throwable append(Throwable first, Throwable next) {
        if (first == null) return next;
        first.addSuppressed(next);
        return first;
    }
}
