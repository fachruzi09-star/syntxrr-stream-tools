package com.syntxrr.streamtools;

/**
 * Runs a bounded GL recovery attempt, then independently verifies worker retirement before
 * touching any captured EGL SurfaceManager. A stop exception must not skip the worker check;
 * a worker-retirement failure must never permit EGL calls on a possibly active GL thread.
 */
final class ModeBGlResourceRecovery {
    private ModeBGlResourceRecovery() { }

    static void run(Runnable stopGl, Runnable requireWorkerRetired,
            Runnable releaseOutstandingManagers) {
        if (stopGl == null) throw new IllegalArgumentException("Stop GL callback is required.");
        if (requireWorkerRetired == null) {
            throw new IllegalArgumentException("GL worker retirement check is required.");
        }
        if (releaseOutstandingManagers == null) {
            throw new IllegalArgumentException("EGL manager recovery callback is required.");
        }

        Throwable firstFailure = attempt(stopGl, null);
        boolean workerRetired = false;
        try {
            requireWorkerRetired.run();
            workerRetired = true;
        } catch (RuntimeException | Error workerFailure) {
            firstFailure = append(firstFailure, workerFailure);
        }

        if (workerRetired) {
            firstFailure = attempt(releaseOutstandingManagers, firstFailure);
        }

        if (firstFailure != null) {
            throw new IllegalStateException(
                    workerRetired
                            ? "Recovery GL/EGL tidak menyelesaikan seluruh tahap independen."
                            : "Recovery EGL dibatalkan karena worker GL belum terbukti berhenti.",
                    firstFailure);
        }
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
