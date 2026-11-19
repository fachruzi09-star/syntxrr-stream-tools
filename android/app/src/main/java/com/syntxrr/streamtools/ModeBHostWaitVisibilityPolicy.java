package com.syntxrr.streamtools;

/** Decides whether a completed reshare must immediately show the host-wait card. */
final class ModeBHostWaitVisibilityPolicy {
    private ModeBHostWaitVisibilityPolicy() { }

    static boolean shouldShowAfterReshare(boolean screensaverEnabled,
            boolean screenCaptureLayerRequired, boolean capturedContentVisible,
            boolean reshareWaiting, boolean reshareInProgress, boolean stopRequested) {
        return screensaverEnabled
                && screenCaptureLayerRequired
                && !capturedContentVisible
                && !reshareWaiting
                && !reshareInProgress
                && !stopRequested;
    }
}
