package com.syntxrr.streamtools;

/**
 * Bounded, interrupt-assisted acknowledgement that a renderer worker has fully terminated.
 * Callers must retain the same Thread reference when this method throws so a later teardown
 * attempt can verify retirement again. A timeout is not treated as successful cancellation.
 */
final class ModeBRenderWorkerRetirement {
    private ModeBRenderWorkerRetirement() { }

    static void requireRetired(Thread worker, long timeoutMs) {
        if (timeoutMs <= 0L) {
            throw new IllegalArgumentException("Batas waktu retirement renderer harus positif.");
        }
        if (worker == null || !worker.isAlive()) return;
        if (worker == Thread.currentThread()) {
            throw new IllegalStateException("Worker renderer tidak dapat menunggu terminasi dirinya sendiri.");
        }

        worker.interrupt();
        try {
            worker.join(timeoutMs);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(
                    "Penungguan retirement worker renderer terinterupsi; referensi worker dipertahankan.",
                    interrupted);
        }

        if (worker.isAlive()) {
            throw new IllegalStateException(
                    "Worker renderer belum berhenti setelah " + timeoutMs
                            + " ms; Surface tidak boleh dilepas.");
        }
    }
}
