package com.syntxrr.streamtools;

import com.pedro.encoder.input.audio.GetMicrophoneData;

/**
 * Runs a short audio-source capability check and always releases every resource acquired
 * during the attempted start. For the Mode B mix source, HandlerThread and MediaProjection callback
 * registration happen before the microphone reports isRunning(); therefore isRunning() alone
 * cannot prove that cleanup is unnecessary after a failed start.
 */
final class ModeBAudioPreflight {
    interface CaptureSource {
        void start(GetMicrophoneData sink);
        void stop();
    }

    private ModeBAudioPreflight() { }

    static void verifyAndRelease(CaptureSource source, GetMicrophoneData sink) {
        Throwable startFailure = null;
        try {
            source.start(sink);
        } catch (RuntimeException | Error failure) {
            startFailure = failure;
            throw failure;
        } finally {
            // stop() is deliberately unconditional after start() was attempted. The source
            // may own a thread/callback even when its recorder never reached isRunning=true.
            try {
                source.stop();
            } catch (RuntimeException | Error cleanupFailure) {
                if (startFailure != null) {
                    startFailure.addSuppressed(cleanupFailure);
                } else {
                    throw cleanupFailure;
                }
            }
        }
    }
}
