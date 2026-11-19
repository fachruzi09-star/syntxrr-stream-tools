package com.syntxrr.streamtools;

/** Keeps worker ownership until a bounded join has actually observed thread termination. */
final class ModeBThreadRetirementPolicy {
    interface Joiner {
        boolean join(Thread thread, long timeoutMs);
    }

    interface Retirement {
        void onRetired();
    }

    private ModeBThreadRetirementPolicy() { }

    /**
     * Runs the retirement callback only after the joiner confirms termination. A timeout,
     * interruption, or join failure leaves the caller's thread reference untouched so another
     * stop/release pass can retry the same worker.
     */
    static boolean joinThenRetire(Thread thread, long timeoutMs, Joiner joiner, Retirement retirement) {
        if (thread == null) return true;
        if (joiner == null) throw new IllegalArgumentException("Thread joiner tidak tersedia.");
        if (!joiner.join(thread, timeoutMs)) return false;
        if (retirement != null) retirement.onRetired();
        return true;
    }

    /**
     * Strict owner-side check used after RootEncoder has had its chance to stop encoders and GL.
     * A pending, already-quit callback worker is not allowed to block that internal teardown,
     * but it must still be reported to the service if it has not terminated afterwards.
     */
    static void requireTerminated(Thread thread) {
        if (thread != null && thread.isAlive()) {
            throw new IllegalStateException(
                    "Thread callback direct screen masih hidup setelah permintaan berhenti.");
        }
    }
}
