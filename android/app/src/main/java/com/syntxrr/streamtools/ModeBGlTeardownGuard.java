package com.syntxrr.streamtools;

import java.lang.reflect.Field;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Observes the GL executor owned by the pinned RootEncoder 2.8.1 GlStreamInterface.
 * RootEncoder's secureSubmit(100) swallows timeout/errors and stop() calls shutdownNow()
 * without awaiting termination. Keeping this executor snapshot lets the service verify
 * that no GL work remains in flight before allowing the next session to reuse resources.
 */
final class ModeBGlTeardownGuard {
    static final long DEFAULT_TIMEOUT_MS = 2500L;
    private static final String EXECUTOR_FIELD = "executor";

    private ModeBGlTeardownGuard() { }

    static Guard capture(Object glInterface) {
        if (glInterface == null) {
            throw new IllegalArgumentException("RootEncoder GL interface tidak tersedia.");
        }
        try {
            Field field = glInterface.getClass().getDeclaredField(EXECUTOR_FIELD);
            field.setAccessible(true);
            Object value = field.get(glInterface);
            if (value != null && !(value instanceof ExecutorService)) {
                throw new IllegalStateException("Tipe executor GL RootEncoder tidak dikenali.");
            }
            return new Guard(glInterface, field, (ExecutorService) value);
        } catch (ReflectiveOperationException | RuntimeException failure) {
            throw new IllegalStateException(
                    "Executor GL RootEncoder 2.8.1 tidak dapat dipantau; cleanup harus fail-closed.",
                    failure);
        }
    }

    static final class Guard {
        private final Object glInterface;
        private final Field executorField;
        private final ExecutorService originalExecutor;

        private Guard(Object glInterface, Field executorField, ExecutorService originalExecutor) {
            this.glInterface = glInterface;
            this.executorField = executorField;
            this.originalExecutor = originalExecutor;
        }

        /**
         * Checks the executor after the RootEncoder release sequence. A successful return
         * means the captured executor was shut down and its worker has actually terminated;
         * it does not pretend to expose EGL driver-level success hidden by RootEncoder.
         */
        void requireTerminated(long timeoutMs) {
            if (originalExecutor == null) return;
            if (!originalExecutor.isShutdown()) {
                throw new IllegalStateException(
                        "Executor renderer GL masih aktif setelah RootEncoder release().");
            }
            awaitTermination(originalExecutor, timeoutMs);
            if (!originalExecutor.isTerminated()) {
                throw new IllegalStateException("Worker executor renderer GL belum berhenti.");
            }
            if (readCurrentExecutor() != null) {
                throw new IllegalStateException(
                        "RootEncoder masih menyimpan executor GL setelah proses stop.");
            }
        }

        /**
         * Recovery used only when RtmpStream.release() failed. If RootEncoder already shut
         * down its executor, wait until that worker is gone before retrying stop() on the
         * caller thread. If it has not yet been shut down, stop() performs the normal bounded
         * RootEncoder stop, then we wait before issuing the synchronous retry.
         */
        void stopAndRetry(Runnable stopGl, long timeoutMs) {
            if (stopGl == null) throw new IllegalArgumentException("Operasi stop GL tidak tersedia.");
            boolean hadActiveExecutor = originalExecutor != null && !originalExecutor.isShutdown();
            if (originalExecutor != null && !hadActiveExecutor) {
                awaitTermination(originalExecutor, timeoutMs);
            }
            // A concurrent/previous stop can leave the shutdown executor in the private field
            // briefly. In that state RootEncoder's next stop only clears the stale field; a
            // further call is required to enter the synchronous releaseSurfaceManagers path.
            boolean needsSynchronousRetry = originalExecutor != null
                    && (hadActiveExecutor || readCurrentExecutor() != null);

            stopGl.run();

            if (originalExecutor != null) {
                if (!originalExecutor.isShutdown()) {
                    throw new IllegalStateException(
                            "RootEncoder tidak menutup executor GL setelah stop renderer.");
                }
                awaitTermination(originalExecutor, timeoutMs);
                if (!originalExecutor.isTerminated()) {
                    throw new IllegalStateException("Worker GL masih aktif setelah retry stop.");
                }
                if (readCurrentExecutor() != null) {
                    throw new IllegalStateException(
                            "Executor GL baru masih terpasang setelah retry stop.");
                }
                if (needsSynchronousRetry) {
                    // The first RootEncoder stop may have timed out/cancelled its EGL-release
                    // task. Once its worker is definitely gone and the private executor field
                    // is clear, a second stop() runs releaseSurfaceManagers() synchronously.
                    stopGl.run();
                }
            }
        }

        private ExecutorService readCurrentExecutor() {
            try {
                Object value = executorField.get(glInterface);
                if (value == null) return null;
                if (!(value instanceof ExecutorService)) {
                    throw new IllegalStateException("Executor GL pengganti memiliki tipe yang tidak dikenal.");
                }
                return (ExecutorService) value;
            } catch (IllegalAccessException failure) {
                throw new IllegalStateException("Status executor GL tidak dapat dibaca.", failure);
            }
        }
    }

    private static void awaitTermination(ExecutorService executor, long timeoutMs) {
        if (executor.isTerminated()) return;
        if (!executor.isShutdown()) {
            throw new IllegalStateException("Executor GL belum menerima permintaan shutdown.");
        }
        try {
            if (!executor.awaitTermination(Math.max(0L, timeoutMs), TimeUnit.MILLISECONDS)) {
                throw new IllegalStateException(
                        "Worker renderer GL melewati batas waktu penghentian " + timeoutMs + " ms.");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(
                    "Pemeriksaan penghentian worker GL terinterupsi.", interrupted);
        }
    }
}
