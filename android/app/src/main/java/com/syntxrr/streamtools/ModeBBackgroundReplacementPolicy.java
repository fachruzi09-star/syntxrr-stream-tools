package com.syntxrr.streamtools;

/** Guards background handoff against covering an opaque direct MediaProjection video source. */
final class ModeBBackgroundReplacementPolicy {
    private ModeBBackgroundReplacementPolicy() { }

    static boolean canReplace(boolean directScreenSource, boolean currentHasBackground, boolean nextHasBackground) {
        if (currentHasBackground == nextHasBackground) return true;
        // A direct VideoSource is composed before GL filters; a full-frame background filter
        // would therefore cover it. Compatibility mode keeps MediaProjection as an ordered GL
        // object layer, while a session without capture has no screen source to cover.
        return !directScreenSource;
    }

    static boolean hasConsistentActiveState(boolean hasBackgroundId, boolean hasBackgroundNamespace,
            boolean hasBackgroundView, boolean hasBackgroundFilter) {
        return hasBackgroundId == hasBackgroundNamespace
                && hasBackgroundId == hasBackgroundView
                && hasBackgroundId == hasBackgroundFilter;
    }

    static boolean canKeepCompatibilityEngine(boolean sameCaptureConfiguration,
            boolean currentIsCompatibilityEngine) {
        // Keep the already-running compatibility graph when its capture configuration is
        // unchanged, even if the new scene no longer needs a background. Rebuilding the source
        // can consume or replace the one-shot MediaProjection path unnecessarily.
        return sameCaptureConfiguration && currentIsCompatibilityEngine;
    }
}
