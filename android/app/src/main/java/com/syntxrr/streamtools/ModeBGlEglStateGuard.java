package com.syntxrr.streamtools;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Recovers pending RootEncoder 2.8.1 MainRender resources before retiring the root EGL manager,
 * then verifies Java-side retirement of every captured SurfaceManager. This deliberately does
 * not claim EGL driver success: SurfaceManager.release() ignores EGL14 boolean results.
 */
final class ModeBGlEglStateGuard {
    private static final String[] SURFACE_MANAGER_FIELDS = {
            "surfaceManager",
            "surfaceManagerEncoder",
            "surfaceManagerEncoderRecord",
            "surfaceManagerPhoto",
            "surfaceManagerPreview"
    };

    private ModeBGlEglStateGuard() { }

    static Guard capture(Object glInterface) {
        try {
            Class<?> egl14 = Class.forName("android.opengl.EGL14");
            Object noDisplay = staticField(egl14, "EGL_NO_DISPLAY");
            Object noContext = staticField(egl14, "EGL_NO_CONTEXT");
            Object noSurface = staticField(egl14, "EGL_NO_SURFACE");
            return capture(glInterface, noDisplay, noContext, noSurface);
        } catch (ReflectiveOperationException | RuntimeException failure) {
            throw new IllegalStateException(
                    "Sentinel EGL Android tidak dapat dibaca; status EGL harus fail-closed.", failure);
        }
    }

    /** Test seam: production always obtains the sentinels from Android EGL14. */
    static Guard capture(Object glInterface, Object noDisplay, Object noContext, Object noSurface) {
        // Android exposes EGL_NO_DISPLAY / EGL_NO_CONTEXT / EGL_NO_SURFACE as null
        // references; null is therefore a valid sentinel and must be compared by identity.
        if (glInterface == null) {
            throw new IllegalArgumentException("Objek GL tidak tersedia.");
        }
        try {
            List<ManagerSnapshot> managers = new ArrayList<>();
            for (String fieldName : SURFACE_MANAGER_FIELDS) {
                Field field = declaredField(glInterface.getClass(), fieldName);
                Object manager = field.get(glInterface);
                if (manager == null) {
                    throw new IllegalStateException("SurfaceManager RootEncoder null: " + fieldName);
                }
                managers.add(snapshot(manager, fieldName, releaseOrder(fieldName), noDisplay, noContext, noSurface));
            }

            Field multiMapField = declaredField(glInterface.getClass(), "multiPreviewSurfaceManagers");
            Object rawMap = multiMapField.get(glInterface);
            if (!(rawMap instanceof Map)) {
                throw new IllegalStateException("Daftar multi-preview EGL bukan Map.");
            }
            Map<?, ?> multiMap = (Map<?, ?>) rawMap;
            for (Object previewInfo : multiMap.values()) {
                if (previewInfo == null) {
                    throw new IllegalStateException("Data multi-preview EGL berisi entry null.");
                }
                Field managerField = declaredField(previewInfo.getClass(), "surfaceManager");
                Object manager = managerField.get(previewInfo);
                if (manager == null) {
                    throw new IllegalStateException("SurfaceManager multi-preview tidak tersedia.");
                }
                managers.add(snapshot(manager, "multiPreviewSurfaceManagers", 3, noDisplay, noContext, noSurface));
            }
            Object mainRender = declaredField(glInterface.getClass(), "mainRender").get(glInterface);
            if (mainRender == null) {
                throw new IllegalStateException("MainRender RootEncoder tidak tersedia.");
            }
            ManagerSnapshot rootManager = null;
            for (ManagerSnapshot manager : managers) {
                if ("surfaceManager".equals(manager.label)) {
                    rootManager = manager;
                    break;
                }
            }
            if (rootManager == null) {
                throw new IllegalStateException("Root SurfaceManager tidak ditemukan.");
            }
            ModeBMainRenderRecovery.Access mainRenderRecovery =
                    new ReflectiveMainRenderAccess(mainRender, rootManager);
            return new Guard(glInterface, multiMapField, managers, mainRenderRecovery);
        } catch (ReflectiveOperationException | RuntimeException failure) {
            throw new IllegalStateException(
                    "Struktur SurfaceManager RootEncoder 2.8.1 tidak dapat diverifikasi; cleanup fail-closed.",
                    failure);
        }
    }

    private static Object staticField(Class<?> owner, String name) throws ReflectiveOperationException {
        Field field = owner.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(null);
    }

    private static Field declaredField(Class<?> owner, String name) throws NoSuchFieldException {
        Class<?> current = owner;
        while (current != null) {
            try {
                Field field = current.getDeclaredField(name);
                field.setAccessible(true);
                return field;
            } catch (NoSuchFieldException missing) {
                current = current.getSuperclass();
            }
        }
        throw new NoSuchFieldException(owner.getName() + "." + name);
    }

    private static int releaseOrder(String fieldName) {
        // Matches RootEncoder 2.8.1 releaseSurfaceManagers() ordering.
        if ("surfaceManagerPhoto".equals(fieldName)) return 0;
        if ("surfaceManagerEncoder".equals(fieldName)) return 1;
        if ("surfaceManagerEncoderRecord".equals(fieldName)) return 2;
        if ("surfaceManagerPreview".equals(fieldName)) return 4;
        if ("surfaceManager".equals(fieldName)) return 5;
        throw new IllegalArgumentException("Unknown SurfaceManager field: " + fieldName);
    }

    private static ManagerSnapshot snapshot(Object manager, String label, int releaseOrder,
            Object noDisplay, Object noContext, Object noSurface) throws ReflectiveOperationException {
        Class<?> type = manager.getClass();
        return new ManagerSnapshot(
                declaredField(type, "eglDisplay"),
                declaredField(type, "eglContext"),
                declaredField(type, "eglSurface"),
                declaredField(type, "isReady"),
                manager, label, releaseOrder, noDisplay, noContext, noSurface);
    }

    static final class Guard {
        private final Field multiMapField;
        private final Object glInterface;
        private final List<ManagerSnapshot> managers;
        private final ModeBMainRenderRecovery.Access mainRenderRecovery;

        private Guard(Object glInterface, Field multiMapField, List<ManagerSnapshot> managers,
                ModeBMainRenderRecovery.Access mainRenderRecovery) {
            this.glInterface = glInterface;
            this.multiMapField = multiMapField;
            this.managers = managers;
            this.mainRenderRecovery = mainRenderRecovery;
        }

        /**
         * Confirms every captured Java wrapper dropped its EGL handles and readiness flag,
         * and RootEncoder cleared the live multi-preview map. It cannot observe ignored EGL
         * driver return values; the audit must retain that boundary explicitly.
         */
        void requireReleased() {
            try {
                Object current = multiMapField.get(glInterface);
                if (!(current instanceof Map) || !((Map<?, ?>) current).isEmpty()) {
                    throw new IllegalStateException("Daftar multi-preview EGL masih menyimpan surface.");
                }
                for (ManagerSnapshot manager : managers) manager.requireReleased();
            } catch (IllegalAccessException failure) {
                throw new IllegalStateException("Status objek EGL tidak dapat dibaca.", failure);
            }
        }

        /**
         * Recovery for RootEncoder 2.8.1's sequential releaseSurfaceManagers() loop.
         * Call only after ModeBGlTeardownGuard confirms the original GL executor is terminated.
         * Each captured manager is retried independently so one throwing release() cannot
         * prevent the remaining EGL wrappers from receiving their release attempt. Already
         * retired managers are skipped. The live multi-preview map is cleared after every
         * captured entry has been attempted; snapshots remain available for the final check.
         *
         * This can recover Java-side release exceptions. It cannot observe EGL14 boolean
         * failures which the pinned library discards before resetting its own fields.
         */
        void releaseOutstandingManagers() {
            Throwable firstFailure = null;
            // Avoid depending on a newer Android Comparator helper; preserve the exact
            // upstream order with a small bounded pass over the captured snapshot.
            for (int order = 0; order <= 5; order++) {
                if (order == 5) {
                    // RootEncoder releases its root EGL context immediately before calling
                    // MainRender.release(). Recover pending render resources while that context
                    // is still valid; never try to recreate/use it after root-manager release.
                    try {
                        ModeBMainRenderRecovery.releaseIfPending(mainRenderRecovery);
                    } catch (RuntimeException | Error failure) {
                        firstFailure = appendFailure(firstFailure, failure);
                    }
                }
                for (ManagerSnapshot manager : managers) {
                    if (manager.releaseOrder != order) continue;
                    try {
                        manager.releaseWithOneRetry();
                    } catch (RuntimeException | Error failure) {
                        firstFailure = appendFailure(firstFailure, failure);
                    }
                }
            }
            try {
                Object current = multiMapField.get(glInterface);
                if (!(current instanceof Map)) {
                    throw new IllegalStateException("Daftar multi-preview EGL bukan Map saat recovery.");
                }
                ((Map<?, ?>) current).clear();
            } catch (RuntimeException | IllegalAccessException failure) {
                firstFailure = appendFailure(firstFailure, failure);
            }
            if (firstFailure != null) {
                throw new IllegalStateException(
                        "Satu atau lebih resource EGL/MainRender gagal pada recovery EGL independen.",
                        firstFailure);
            }
        }

        private Throwable appendFailure(Throwable first, Throwable next) {
            if (first == null) return next;
            if (first != next) first.addSuppressed(next);
            return first;
        }

    }

    private static final class ReflectiveMainRenderAccess implements ModeBMainRenderRecovery.Access {
        private final Object mainRender;
        private final ManagerSnapshot rootManager;
        private final Field runningField;
        private final Field cameraRenderField;
        private final Field filterRendersField;
        private final Field screenRenderField;

        private ReflectiveMainRenderAccess(Object mainRender, ManagerSnapshot rootManager)
                throws ReflectiveOperationException {
            this.mainRender = mainRender;
            this.rootManager = rootManager;
            Class<?> type = mainRender.getClass();
            runningField = declaredField(type, "running");
            cameraRenderField = declaredField(type, "cameraRender");
            filterRendersField = declaredField(type, "filterRenders");
            screenRenderField = declaredField(type, "screenRender");
        }

        @Override public boolean isReady() {
            return Boolean.TRUE.equals(invoke(mainRender, "isReady"));
        }

        @Override public boolean makeRootContextCurrent() {
            return rootManager.makeCurrentIfUsable();
        }

        @Override public void markNotReady() {
            try {
                Object running = runningField.get(mainRender);
                if (!(running instanceof AtomicBoolean)) {
                    throw new IllegalStateException("MainRender.running bukan AtomicBoolean.");
                }
                ((AtomicBoolean) running).set(false);
            } catch (IllegalAccessException failure) {
                throw new IllegalStateException("Status MainRender tidak dapat diperbarui.", failure);
            }
        }

        @Override public void releaseCameraRender() {
            invokeRelease(readField(cameraRenderField));
        }

        @Override public List<?> snapshotFilters() {
            Object value = readField(filterRendersField);
            if (!(value instanceof List)) {
                throw new IllegalStateException("MainRender.filterRenders bukan List.");
            }
            return new ArrayList<>((List<?>) value);
        }

        @Override public void releaseFilter(Object filter) {
            invokeRelease(filter);
        }

        @Override public void clearFilters() {
            Object value = readField(filterRendersField);
            if (!(value instanceof List)) {
                throw new IllegalStateException("MainRender.filterRenders bukan List saat clear.");
            }
            ((List<?>) value).clear();
        }

        @Override public void releaseScreenRender() {
            invokeRelease(readField(screenRenderField));
        }

        private Object readField(Field field) {
            try {
                return field.get(mainRender);
            } catch (IllegalAccessException failure) {
                throw new IllegalStateException("Resource MainRender tidak dapat dibaca: " + field.getName(),
                        failure);
            }
        }

        private static Object invoke(Object target, String methodName) {
            try {
                Method method = target.getClass().getMethod(methodName);
                method.setAccessible(true);
                return method.invoke(target);
            } catch (InvocationTargetException invocationFailure) {
                Throwable cause = invocationFailure.getCause() == null
                        ? invocationFailure : invocationFailure.getCause();
                if (cause instanceof RuntimeException) throw (RuntimeException) cause;
                if (cause instanceof Error) throw (Error) cause;
                throw new IllegalStateException("MainRender " + methodName + " gagal.", cause);
            } catch (ReflectiveOperationException | RuntimeException failure) {
                throw new IllegalStateException("MainRender " + methodName + " tidak dapat dipanggil.",
                        failure);
            }
        }

        private static void invokeRelease(Object target) {
            if (target == null) throw new IllegalStateException("Resource render bernilai null.");
            invoke(target, "release");
        }
    }

    private static final class ManagerSnapshot {
        private final Field displayField;
        private final Field contextField;
        private final Field surfaceField;
        private final Field readyField;
        private final Object manager;
        private final String label;
        private final int releaseOrder;
        private final Object noDisplay;
        private final Object noContext;
        private final Object noSurface;

        private ManagerSnapshot(Field displayField, Field contextField, Field surfaceField,
                Field readyField, Object manager, String label, int releaseOrder,
                Object noDisplay, Object noContext, Object noSurface) {
            this.displayField = displayField;
            this.contextField = contextField;
            this.surfaceField = surfaceField;
            this.readyField = readyField;
            this.manager = manager;
            this.label = label;
            this.releaseOrder = releaseOrder;
            this.noDisplay = noDisplay;
            this.noContext = noContext;
            this.noSurface = noSurface;
        }

        private boolean isReleased() {
            try {
                Object ready = readyField.get(manager);
                return displayField.get(manager) == noDisplay
                        && contextField.get(manager) == noContext
                        && surfaceField.get(manager) == noSurface
                        && ready instanceof AtomicBoolean
                        && !((AtomicBoolean) ready).get();
            } catch (IllegalAccessException failure) {
                throw new IllegalStateException("Status SurfaceManager tidak dapat dibaca: " + label, failure);
            }
        }

        private boolean makeCurrentIfUsable() {
            if (isReleased()) return false;
            try {
                Object ready = readyField.get(manager);
                if (!(ready instanceof AtomicBoolean) || !((AtomicBoolean) ready).get()) return false;
                if (displayField.get(manager) == noDisplay
                        || contextField.get(manager) == noContext
                        || surfaceField.get(manager) == noSurface) return false;
                Method makeCurrent = manager.getClass().getMethod("makeCurrent");
                makeCurrent.setAccessible(true);
                return Boolean.TRUE.equals(makeCurrent.invoke(manager));
            } catch (InvocationTargetException invocationFailure) {
                Throwable cause = invocationFailure.getCause() == null
                        ? invocationFailure : invocationFailure.getCause();
                if (cause instanceof RuntimeException) throw (RuntimeException) cause;
                if (cause instanceof Error) throw (Error) cause;
                throw new IllegalStateException("Root EGL makeCurrent gagal: " + label, cause);
            } catch (ReflectiveOperationException | RuntimeException failure) {
                throw new IllegalStateException("Root EGL makeCurrent tidak dapat diverifikasi: " + label,
                        failure);
            }
        }

        private void releaseWithOneRetry() {
            if (isReleased()) return;
            Throwable firstFailure;
            try {
                invokeRelease();
                if (isReleased()) return;
                firstFailure = new IllegalStateException(
                        "SurfaceManager masih menyimpan handle setelah release(): " + label);
            } catch (RuntimeException | Error failure) {
                firstFailure = failure;
            }

            // SurfaceManager.release() updates its Java handles only at the end. If a call
            // throws part-way through, a single bounded retry is safe after the GL worker is
            // retired and may complete the remaining destroy/terminate sequence.
            if (isReleased()) return;
            try {
                invokeRelease();
            } catch (RuntimeException | Error retryFailure) {
                if (firstFailure != retryFailure) firstFailure.addSuppressed(retryFailure);
                throw new IllegalStateException("SurfaceManager gagal setelah satu retry: " + label,
                        firstFailure);
            }
            if (!isReleased()) {
                throw new IllegalStateException("SurfaceManager masih menyimpan handle setelah retry: " + label,
                        firstFailure);
            }
        }

        private void invokeRelease() {
            try {
                Method release = manager.getClass().getMethod("release");
                release.setAccessible(true);
                release.invoke(manager);
            } catch (InvocationTargetException invocationFailure) {
                Throwable cause = invocationFailure.getCause() == null
                        ? invocationFailure : invocationFailure.getCause();
                if (cause instanceof RuntimeException) throw (RuntimeException) cause;
                if (cause instanceof Error) throw (Error) cause;
                throw new IllegalStateException("SurfaceManager release gagal: " + label, cause);
            } catch (ReflectiveOperationException | RuntimeException failure) {
                throw new IllegalStateException("SurfaceManager release tidak dapat dipanggil: " + label, failure);
            }
        }

        private void requireReleased() {
            try {
                if (displayField.get(manager) != noDisplay) {
                    throw new IllegalStateException("SurfaceManager masih menyimpan EGLDisplay.");
                }
                if (contextField.get(manager) != noContext) {
                    throw new IllegalStateException("SurfaceManager masih menyimpan EGLContext.");
                }
                if (surfaceField.get(manager) != noSurface) {
                    throw new IllegalStateException("SurfaceManager masih menyimpan EGLSurface.");
                }
                Object ready = readyField.get(manager);
                if (!(ready instanceof AtomicBoolean) || ((AtomicBoolean) ready).get()) {
                    throw new IllegalStateException("SurfaceManager masih ditandai siap.");
                }
            } catch (IllegalAccessException failure) {
                throw new IllegalStateException("Handle SurfaceManager tidak dapat diverifikasi.", failure);
            }
        }
    }
}
