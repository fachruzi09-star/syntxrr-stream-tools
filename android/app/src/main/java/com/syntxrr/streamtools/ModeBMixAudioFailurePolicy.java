package com.syntxrr.streamtools;

/** Distinguishes a failed playback-capture leg from a failed microphone leg in Mix mode. */
final class ModeBMixAudioFailurePolicy {
    private ModeBMixAudioFailurePolicy() { }

    static boolean isPlaybackCaptureCreationFailure(boolean microphoneInitialized,
            boolean playbackCaptureInitialized) {
        return microphoneInitialized && !playbackCaptureInitialized;
    }

    static boolean isPlaybackCaptureStartFailure(boolean microphoneRecording,
            boolean playbackCaptureRecording) {
        return microphoneRecording && !playbackCaptureRecording;
    }
}
