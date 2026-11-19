package com.syntxrr.streamtools;

/**
 * Pure process-level readiness rules and epoch-guarded tracker for Mode B session lifecycle.
 * A new session may start only when no session is active, no cleanup is pending, native
 * encoder/GL teardown completed without error, and overlay asset namespaces were deleted.
 */
final class ModeBSessionReadinessPolicy {
    private ModeBSessionReadinessPolicy() { }

    static boolean canStartNewSession(boolean sessionActive,
                                        boolean cleanupPending,
                                        boolean teardownCompleted,
                                        boolean assetCleanupCompleted) {
        return !sessionActive && !cleanupPending && teardownCompleted && assetCleanupCompleted;
    }

    static final class Tracker {
        private boolean sessionActive = false;
        private boolean cleanupPending = false;
        private boolean teardownCompleted = true;
        private boolean assetCleanupCompleted = true;
        private String failureReason = "";
        private long epoch = 0L;

        synchronized boolean canStartNewSession() {
            return ModeBSessionReadinessPolicy.canStartNewSession(
                    sessionActive, cleanupPending, teardownCompleted, assetCleanupCompleted);
        }

        synchronized long tryBeginSession() {
            if (!canStartNewSession()) {
                return -1L;
            }
            epoch += 1L;
            sessionActive = true;
            cleanupPending = false;
            teardownCompleted = false;
            assetCleanupCompleted = false;
            failureReason = "";
            return epoch;
        }

        synchronized long beginCleanup() {
            epoch += 1L;
            sessionActive = false;
            cleanupPending = true;
            teardownCompleted = false;
            assetCleanupCompleted = false;
            failureReason = "";
            return epoch;
        }

        synchronized void recordStreamTeardownResult(long cleanupEpoch, boolean success, String detail) {
            if (cleanupEpoch != this.epoch) {
                return;
            }
            this.teardownCompleted = success;
            if (!success && detail != null && !detail.trim().isEmpty()) {
                this.failureReason = appendDetail(this.failureReason, detail.trim());
            }
        }

        synchronized boolean markAssetCleanupSucceeded(long cleanupEpoch) {
            if (cleanupEpoch != this.epoch) {
                return false;
            }
            this.assetCleanupCompleted = true;
            this.cleanupPending = false;
            return canStartNewSession();
        }

        synchronized void markAssetCleanupFailed(long cleanupEpoch, String detail) {
            if (cleanupEpoch != this.epoch) {
                return;
            }
            this.assetCleanupCompleted = false;
            this.cleanupPending = false;
            if (detail != null && !detail.trim().isEmpty()) {
                this.failureReason = appendDetail(this.failureReason, detail.trim());
            }
        }

        synchronized String getBlockedReason() {
            if (canStartNewSession()) {
                return "";
            }
            if (sessionActive) {
                return "Sesi siaran Mode B masih aktif. Hentikan siaran terlebih dahulu sebelum memulai sesi baru.";
            }
            if (cleanupPending) {
                return "Pembersihan encoder, GL/renderer, dan cache aset sesi sebelumnya masih berlangsung. Tunggu sebentar lalu coba lagi.";
            }
            if (!teardownCompleted && !assetCleanupCompleted) {
                return withReason("Pembersihan encoder/renderer dan cache aset sesi sebelumnya gagal selesai");
            }
            if (!teardownCompleted) {
                return withReason("Pembersihan encoder/renderer Mode B sebelumnya gagal selesai");
            }
            if (!assetCleanupCompleted) {
                return withReason("Cache aset Mode B sebelumnya belum berhasil dibersihkan");
            }
            return "Encoder Mode B belum siap untuk memulai sesi baru.";
        }

        synchronized void resetForTests() {
            sessionActive = false;
            cleanupPending = false;
            teardownCompleted = true;
            assetCleanupCompleted = true;
            failureReason = "";
            epoch = 0L;
        }

        private String withReason(String base) {
            return failureReason.isEmpty() ? base + "." : base + ": " + failureReason;
        }

        private static String appendDetail(String existing, String addition) {
            if (existing == null || existing.isEmpty()) return addition;
            if (existing.contains(addition)) return existing;
            return existing + "; " + addition;
        }
    }
}
