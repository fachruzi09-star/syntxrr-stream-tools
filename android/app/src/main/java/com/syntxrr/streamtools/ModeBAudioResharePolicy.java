package com.syntxrr.streamtools;

/**
 * Keeps projection-dependent audio routing rules explicit during screen-permission loss and
 * reshare. Internal and Mix require a fresh MediaProjection; microphone-only capture does not.
 */
final class ModeBAudioResharePolicy {
    private static final String INTERNAL = "internal";
    private static final String MIX = "mix";

    private ModeBAudioResharePolicy() { }

    static boolean requiresProjectionAudio(String route) {
        return INTERNAL.equals(route) || MIX.equals(route);
    }

    static boolean shouldSilenceForProjectionLoss(String route, boolean alreadySilenced) {
        return requiresProjectionAudio(route) && !alreadySilenced;
    }

    static boolean shouldRestoreAfterReshare(String route, boolean currentlySilenced) {
        return currentlySilenced && requiresProjectionAudio(route);
    }

    /** Only Mix is allowed to fall back to microphone when playback capture is rejected. */
    static boolean allowsMicrophoneFallback(String route) {
        return MIX.equals(route);
    }
}
