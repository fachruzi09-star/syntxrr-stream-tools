package com.syntxrr.streamtools;

import java.util.List;

/**
 * Best-effort MainRender cleanup used only while RootEncoder's root EGL context is still alive.
 * Each render resource is attempted independently so one failing filter does not skip later
 * filters or ScreenRender. This helper never creates or resurrects an EGL context.
 */
final class ModeBMainRenderRecovery {
    interface Access {
        boolean isReady();
        boolean makeRootContextCurrent();
        void markNotReady();
        void releaseCameraRender();
        List<?> snapshotFilters();
        void releaseFilter(Object filter);
        void clearFilters();
        void releaseScreenRender();
    }

    private ModeBMainRenderRecovery() { }

    /**
     * @return true when a previously-ready MainRender was independently cleaned; false when
     *         RootEncoder had not initialized it or its MainRender release is already complete.
     */
    static boolean releaseIfPending(Access access) {
        if (access == null) throw new IllegalArgumentException("MainRender recovery access is required.");
        if (!access.isReady()) {
            // MainRender.release() clears its running flag before it releases camera/filter/screen
            // resources. A false readiness flag therefore does not prove that release completed.
            // The upstream filter list is cleared only after every filter release returns.
            List<?> pendingFilters;
            try {
                pendingFilters = access.snapshotFilters();
            } catch (RuntimeException | Error failure) {
                throw new IllegalStateException(
                        "MainRender tidak ready dan status filter yang tersisa tidak dapat diverifikasi.",
                        failure);
            }
            if (pendingFilters == null || !pendingFilters.isEmpty()) {
                throw new IllegalStateException(
                        "MainRender tidak ready tetapi filter masih tersimpan; release RootEncoder mungkin terhenti.");
            }
            return false;
        }
        if (!access.makeRootContextCurrent()) {
            throw new IllegalStateException(
                    "Root EGL context tidak dapat dibuat current; cleanup MainRender dibatalkan.");
        }

        Throwable firstFailure = attempt(access::markNotReady, null);
        firstFailure = attempt(access::releaseCameraRender, firstFailure);

        List<?> filters = null;
        try {
            filters = access.snapshotFilters();
            if (filters == null) throw new IllegalStateException("Daftar filter MainRender tidak tersedia.");
        } catch (RuntimeException | Error failure) {
            firstFailure = append(firstFailure, failure);
        }

        boolean allFiltersReleased = filters != null;
        if (filters != null) {
            for (Object filter : filters) {
                if (filter == null) {
                    allFiltersReleased = false;
                    firstFailure = append(firstFailure,
                            new IllegalStateException("MainRender berisi filter null saat cleanup."));
                    continue;
                }
                Throwable filterFailure = attempt(() -> access.releaseFilter(filter), null);
                if (filterFailure != null) {
                    allFiltersReleased = false;
                    firstFailure = append(firstFailure, filterFailure);
                }
            }
        }
        if (allFiltersReleased) {
            firstFailure = attempt(access::clearFilters, firstFailure);
        }
        firstFailure = attempt(access::releaseScreenRender, firstFailure);

        if (firstFailure != null) {
            throw new IllegalStateException(
                    "Recovery MainRender selesai dengan satu atau lebih resource yang gagal dilepas.",
                    firstFailure);
        }
        return true;
    }

    private static Throwable attempt(Runnable operation, Throwable firstFailure) {
        try {
            operation.run();
            return firstFailure;
        } catch (RuntimeException | Error failure) {
            return append(firstFailure, failure);
        }
    }

    private static Throwable append(Throwable first, Throwable next) {
        if (next == null) return first;
        if (first == null) return next;
        if (first != next) first.addSuppressed(next);
        return first;
    }
}
