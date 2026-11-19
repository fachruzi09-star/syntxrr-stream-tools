package com.syntxrr.streamtools;

/** Exception-safe wrapper for RootEncoder AudioSource replacement. */
final class ModeBAudioSourceSwap {
    interface Replacement {
        void run();
    }

    interface RecoveryHealth {
        boolean previousSourceIsRunning();
    }

    interface LiveSessionHealth {
        /** True only while the exact RTMP stream instance remains active. */
        boolean sameLiveSessionIsRunning();
    }

    private ModeBAudioSourceSwap() { }

    /** A fallback source may be attempted only when cleanup and previous-source rollback are certain. */
    static boolean isRecoverySafe(Throwable failure) {
        return failure != null && failure.getSuppressed().length == 0;
    }

    /**
     * RootEncoder restores the old source when a replacement start fails, but leaves the
     * failed candidate to its caller. It also swallows a failure while restarting the old
     * source, so the caller must verify that the restored source is actually running.
     */
    static void replace(Replacement replacement, Replacement failedCandidateCleanup,
            RecoveryHealth recoveryHealth) {
        replace(replacement, failedCandidateCleanup, recoveryHealth, null);
    }

    /**
     * Live swaps must keep the same RTMP stream instance active throughout the operation.
     * This guard does not restart the transport; it fails closed if the service's live session
     * disappears or is replaced while RootEncoder changes only its AudioSource.
     */
    static void replace(Replacement replacement, Replacement failedCandidateCleanup,
            RecoveryHealth recoveryHealth, LiveSessionHealth liveSessionHealth) {
        if (liveSessionHealth != null && !liveSessionHealth.sameLiveSessionIsRunning()) {
            throw new IllegalStateException("Pergantian audio hanya diizinkan pada sesi RTMP LIVE yang sama.");
        }
        try {
            replacement.run();
            if (liveSessionHealth != null && !liveSessionHealth.sameLiveSessionIsRunning()) {
                throw new IllegalStateException("Sesi RTMP berubah atau berhenti selama pergantian sumber audio.");
            }
        } catch (RuntimeException | Error failure) {
            try {
                failedCandidateCleanup.run();
            } catch (RuntimeException | Error cleanupFailure) {
                failure.addSuppressed(cleanupFailure);
            }
            try {
                if (recoveryHealth == null || !recoveryHealth.previousSourceIsRunning()) {
                    failure.addSuppressed(new IllegalStateException(
                            "RootEncoder tidak berhasil memulihkan sumber audio sebelumnya."));
                }
            } catch (RuntimeException | Error recoveryFailure) {
                failure.addSuppressed(recoveryFailure);
            }
            try {
                if (liveSessionHealth != null && !liveSessionHealth.sameLiveSessionIsRunning()) {
                    failure.addSuppressed(new IllegalStateException(
                            "Sesi RTMP LIVE yang sama tidak lagi aktif setelah kegagalan pergantian audio."));
                }
            } catch (RuntimeException | Error sessionFailure) {
                failure.addSuppressed(sessionFailure);
            }
            throw failure;
        }
    }

    /** Compatibility overload for isolated policy tests without a live stream. */
    static void replace(Replacement replacement, Replacement failedCandidateCleanup) {
        replace(replacement, failedCandidateCleanup, () -> true, null);
    }
}
