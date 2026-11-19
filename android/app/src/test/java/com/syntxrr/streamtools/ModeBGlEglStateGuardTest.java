package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;

public class ModeBGlEglStateGuardTest {
    private static final Object NO_DISPLAY = new Object();
    private static final Object NO_CONTEXT = new Object();
    private static final Object NO_SURFACE = new Object();

    private static final class FakeSurfaceManager {
        private Object eglDisplay = NO_DISPLAY;
        private Object eglContext = NO_CONTEXT;
        private Object eglSurface = NO_SURFACE;
        private final AtomicBoolean isReady = new AtomicBoolean(false);
        private final String label;
        private final java.util.List<String> releaseLog;
        private int releaseAttempts;
        private boolean failNextRelease;
        private boolean failAlways;
        private boolean makeCurrentSucceeds = true;

        FakeSurfaceManager(boolean ready) { this("unnamed", null, ready); }

        FakeSurfaceManager(String label, java.util.List<String> releaseLog, boolean ready) {
            this.label = label;
            this.releaseLog = releaseLog;
            if (ready) {
                eglDisplay = new Object();
                eglContext = new Object();
                eglSurface = new Object();
                isReady.set(true);
            }
        }

        public boolean makeCurrent() {
            return isReady.get() && makeCurrentSucceeds;
        }

        public void release() {
            releaseAttempts++;
            if (releaseLog != null) releaseLog.add(label);
            if (failAlways || failNextRelease) {
                failNextRelease = false;
                throw new IllegalStateException("release failed: " + label);
            }
            releaseState();
        }

        void releaseState() {
            eglDisplay = NO_DISPLAY;
            eglContext = NO_CONTEXT;
            eglSurface = NO_SURFACE;
            isReady.set(false);
        }
    }

    private static final class FakePreviewInfo {
        private final Object surfaceManager;
        FakePreviewInfo(Object surfaceManager) { this.surfaceManager = surfaceManager; }
    }

    private static final class FakeRenderResource {
        private final String label;
        private final java.util.List<String> releaseLog;
        private boolean failRelease;

        FakeRenderResource(String label, java.util.List<String> releaseLog) {
            this.label = label;
            this.releaseLog = releaseLog;
        }

        public void release() {
            releaseLog.add(label);
            if (failRelease) throw new IllegalStateException("render release failed: " + label);
        }
    }

    private static final class FakeMainRender {
        private final AtomicBoolean running = new AtomicBoolean(true);
        private final FakeRenderResource cameraRender;
        private final java.util.List<FakeRenderResource> filterRenders = new java.util.ArrayList<>();
        private final FakeRenderResource screenRender;

        FakeMainRender(java.util.List<String> releaseLog) {
            cameraRender = new FakeRenderResource("camera", releaseLog);
            filterRenders.add(new FakeRenderResource("filter", releaseLog));
            screenRender = new FakeRenderResource("screen", releaseLog);
        }

        public boolean isReady() { return running.get(); }
    }

    private static final class FakeGlInterface {
        private final java.util.List<String> releaseLog = new java.util.ArrayList<>();
        private final FakeSurfaceManager surfaceManager;
        private final FakeSurfaceManager surfaceManagerEncoder;
        private final FakeSurfaceManager surfaceManagerEncoderRecord;
        private final FakeSurfaceManager surfaceManagerPhoto;
        private final FakeSurfaceManager surfaceManagerPreview;
        private final Map<Object, Object> multiPreviewSurfaceManagers = new LinkedHashMap<>();
        private final FakeMainRender mainRender;

        FakeGlInterface() {
            surfaceManager = new FakeSurfaceManager("primary", releaseLog, true);
            surfaceManagerEncoder = new FakeSurfaceManager("encoder", releaseLog, true);
            surfaceManagerEncoderRecord = new FakeSurfaceManager("record", releaseLog, true);
            surfaceManagerPhoto = new FakeSurfaceManager("photo", releaseLog, true);
            surfaceManagerPreview = new FakeSurfaceManager("preview", releaseLog, true);
            mainRender = new FakeMainRender(releaseLog);
        }
    }

    private ModeBGlEglStateGuard.Guard capture(FakeGlInterface gl) {
        return ModeBGlEglStateGuard.capture(gl, NO_DISPLAY, NO_CONTEXT, NO_SURFACE);
    }

    @Test public void acceptsAllSurfaceManagersOnlyAfterEveryHandleIsCleared() {
        FakeGlInterface gl = new FakeGlInterface();
        FakeSurfaceManager multi = new FakeSurfaceManager(true);
        gl.multiPreviewSurfaceManagers.put("preview", new FakePreviewInfo(multi));
        ModeBGlEglStateGuard.Guard guard = capture(gl);
        gl.surfaceManager.releaseState();
        gl.surfaceManagerEncoder.releaseState();
        gl.surfaceManagerEncoderRecord.releaseState();
        gl.surfaceManagerPhoto.releaseState();
        gl.surfaceManagerPreview.releaseState();
        multi.releaseState();
        gl.multiPreviewSurfaceManagers.clear();
        guard.requireReleased();
    }


    @Test public void acceptsAndroidNullEglSentinels() {
        FakeGlInterface gl = new FakeGlInterface();
        gl.surfaceManager.eglDisplay = null;
        gl.surfaceManager.eglContext = null;
        gl.surfaceManager.eglSurface = null;
        gl.surfaceManager.isReady.set(false);
        gl.surfaceManagerEncoder.releaseState();
        gl.surfaceManagerEncoderRecord.releaseState();
        gl.surfaceManagerPhoto.releaseState();
        gl.surfaceManagerPreview.releaseState();
        ModeBGlEglStateGuard.Guard guard = ModeBGlEglStateGuard.capture(gl, null, null, null);
        gl.surfaceManagerEncoder.eglDisplay = null;
        gl.surfaceManagerEncoder.eglContext = null;
        gl.surfaceManagerEncoder.eglSurface = null;
        gl.surfaceManagerEncoderRecord.eglDisplay = null;
        gl.surfaceManagerEncoderRecord.eglContext = null;
        gl.surfaceManagerEncoderRecord.eglSurface = null;
        gl.surfaceManagerPhoto.eglDisplay = null;
        gl.surfaceManagerPhoto.eglContext = null;
        gl.surfaceManagerPhoto.eglSurface = null;
        gl.surfaceManagerPreview.eglDisplay = null;
        gl.surfaceManagerPreview.eglContext = null;
        gl.surfaceManagerPreview.eglSurface = null;
        guard.requireReleased();
    }

    @Test public void rejectsRetainedEglDisplay() {
        FakeGlInterface gl = new FakeGlInterface();
        ModeBGlEglStateGuard.Guard guard = capture(gl);
        gl.surfaceManager.releaseState();
        gl.surfaceManagerEncoder.releaseState();
        gl.surfaceManagerEncoderRecord.releaseState();
        gl.surfaceManagerPhoto.releaseState();
        gl.surfaceManagerPreview.releaseState();
        // Keep display handle alive on one manager.
        gl.surfaceManager.eglDisplay = new Object();
        try { guard.requireReleased(); fail("retained EGLDisplay must fail closed"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("EGLDisplay")); }
    }

    @Test public void rejectsRetainedEglContext() {
        FakeGlInterface gl = new FakeGlInterface();
        ModeBGlEglStateGuard.Guard guard = capture(gl);
        releaseAllExcept(gl, gl.surfaceManager);
        gl.surfaceManager.eglDisplay = NO_DISPLAY;
        gl.surfaceManager.eglSurface = NO_SURFACE;
        gl.surfaceManager.eglContext = new Object();
        try { guard.requireReleased(); fail("retained EGLContext must fail closed"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("EGLContext")); }
    }

    @Test public void rejectsRetainedEglSurface() {
        FakeGlInterface gl = new FakeGlInterface();
        ModeBGlEglStateGuard.Guard guard = capture(gl);
        releaseAllExcept(gl, gl.surfaceManager);
        gl.surfaceManager.eglDisplay = NO_DISPLAY;
        gl.surfaceManager.eglContext = NO_CONTEXT;
        gl.surfaceManager.eglSurface = new Object();
        try { guard.requireReleased(); fail("retained EGLSurface must fail closed"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("EGLSurface")); }
    }

    @Test public void rejectsReadyFlagAfterHandlesWereCleared() {
        FakeGlInterface gl = new FakeGlInterface();
        ModeBGlEglStateGuard.Guard guard = capture(gl);
        releaseAll(gl);
        gl.surfaceManager.isReady.set(true);
        try { guard.requireReleased(); fail("ready SurfaceManager must fail closed"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("ditandai siap")); }
    }

    @Test public void rejectsMultiPreviewMapNotCleared() {
        FakeGlInterface gl = new FakeGlInterface();
        FakeSurfaceManager multi = new FakeSurfaceManager(true);
        gl.multiPreviewSurfaceManagers.put("preview", new FakePreviewInfo(multi));
        ModeBGlEglStateGuard.Guard guard = capture(gl);
        releaseManagersOnly(gl);
        multi.releaseState();
        try { guard.requireReleased(); fail("multi preview map must be emptied"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("multi-preview")); }
    }

    @Test public void rejectsMultiPreviewManagerRetainingAnyHandle() {
        FakeGlInterface gl = new FakeGlInterface();
        FakeSurfaceManager multi = new FakeSurfaceManager(true);
        gl.multiPreviewSurfaceManagers.put("preview", new FakePreviewInfo(multi));
        ModeBGlEglStateGuard.Guard guard = capture(gl);
        releaseAll(gl);
        multi.releaseState();
        multi.eglSurface = new Object();
        gl.multiPreviewSurfaceManagers.clear();
        try { guard.requireReleased(); fail("captured multi preview handle must be checked"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("EGLSurface")); }
    }

    @Test public void rejectsUnknownGlShapeInsteadOfSkippingChecks() {
        try {
            ModeBGlEglStateGuard.capture(new Object(), NO_DISPLAY, NO_CONTEXT, NO_SURFACE);
            fail("unknown GL implementation must fail closed");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("tidak dapat diverifikasi"));
        }
    }

    @Test public void rejectsNullSurfaceManagerReference() {
        FakeGlInterface gl = new FakeGlInterface();
        gl.multiPreviewSurfaceManagers.put("null", null);
        try {
            capture(gl);
            fail("null preview entry must fail closed");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("tidak dapat diverifikasi"));
        }
    }

    @Test public void releaseRecoveryAttemptsEveryManagerAfterOneThrows() {
        FakeGlInterface gl = new FakeGlInterface();
        FakeSurfaceManager multi = new FakeSurfaceManager("multi", gl.releaseLog, true);
        gl.multiPreviewSurfaceManagers.put("preview", new FakePreviewInfo(multi));
        gl.surfaceManagerPhoto.failNextRelease = true;
        ModeBGlEglStateGuard.Guard guard = capture(gl);

        guard.releaseOutstandingManagers();
        guard.requireReleased();

        assertEquals(java.util.Arrays.asList("photo", "photo", "encoder", "record", "multi", "preview",
                "camera", "filter", "screen", "primary"), gl.releaseLog);
        assertFalse(gl.mainRender.isReady());
        assertTrue(gl.mainRender.filterRenders.isEmpty());
        assertEquals(2, gl.surfaceManagerPhoto.releaseAttempts);
        assertEquals(1, gl.surfaceManagerEncoder.releaseAttempts);
        assertEquals(1, gl.surfaceManagerEncoderRecord.releaseAttempts);
        assertEquals(1, multi.releaseAttempts);
        assertEquals(1, gl.surfaceManagerPreview.releaseAttempts);
        assertEquals(1, gl.surfaceManager.releaseAttempts);
        assertTrue(gl.multiPreviewSurfaceManagers.isEmpty());
    }

    @Test public void retryOnlyReleasesManagersThatStillRetainHandles() {
        FakeGlInterface gl = new FakeGlInterface();
        FakeSurfaceManager multi = new FakeSurfaceManager("multi", gl.releaseLog, true);
        gl.multiPreviewSurfaceManagers.put("preview", new FakePreviewInfo(multi));
        gl.surfaceManagerPhoto.failAlways = true;
        ModeBGlEglStateGuard.Guard guard = capture(gl);

        try { guard.releaseOutstandingManagers(); fail("persistent first pass should report photo failure"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("recovery EGL independen")); }
        gl.surfaceManagerPhoto.failAlways = false;
        guard.releaseOutstandingManagers();
        guard.requireReleased();

        assertEquals(3, gl.surfaceManagerPhoto.releaseAttempts);
        assertEquals(1, gl.surfaceManagerEncoder.releaseAttempts);
        assertEquals(1, gl.surfaceManagerEncoderRecord.releaseAttempts);
        assertEquals(1, multi.releaseAttempts);
        assertEquals(1, gl.surfaceManagerPreview.releaseAttempts);
        assertEquals(1, gl.surfaceManager.releaseAttempts);
    }

    @Test public void recoveryAggregatesMultipleManagerFailuresAndStillClearsPreviewMap() {
        FakeGlInterface gl = new FakeGlInterface();
        FakeSurfaceManager multi = new FakeSurfaceManager("multi", gl.releaseLog, true);
        gl.multiPreviewSurfaceManagers.put("preview", new FakePreviewInfo(multi));
        gl.surfaceManagerPhoto.failAlways = true;
        multi.failAlways = true;
        gl.surfaceManagerPreview.failAlways = true;
        ModeBGlEglStateGuard.Guard guard = capture(gl);

        try {
            guard.releaseOutstandingManagers();
            fail("all independent failures must be aggregated");
        } catch (IllegalStateException expected) {
            Throwable first = expected.getCause();
            assertNotNull(first);
            assertTrue(first.getSuppressed().length >= 2);
        }
        assertEquals(12, gl.releaseLog.size());
        assertTrue(gl.multiPreviewSurfaceManagers.isEmpty());
        assertEquals(1, gl.surfaceManagerEncoder.releaseAttempts);
        assertEquals(1, gl.surfaceManagerEncoderRecord.releaseAttempts);
        assertEquals(1, gl.surfaceManager.releaseAttempts);
        assertEquals(2, gl.surfaceManagerPhoto.releaseAttempts);
        assertEquals(2, multi.releaseAttempts);
        assertEquals(2, gl.surfaceManagerPreview.releaseAttempts);
        try { guard.requireReleased(); fail("unreleased managers must remain visible"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("EGLDisplay")); }
    }

    @Test public void mainRenderRecoveryContinuesAfterCameraFailureAndReleasesLaterFiltersAndScreen() {
        FakeGlInterface gl = new FakeGlInterface();
        gl.mainRender.cameraRender.failRelease = true;
        ModeBGlEglStateGuard.Guard guard = capture(gl);

        try {
            guard.releaseOutstandingManagers();
            fail("camera release failure must be reported after independent attempts");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("recovery EGL independen"));
            assertNotNull(expected.getCause());
        }

        assertEquals(java.util.Arrays.asList("camera", "filter", "screen"),
                gl.releaseLog.subList(gl.releaseLog.size() - 4, gl.releaseLog.size() - 1));
        assertTrue(gl.mainRender.filterRenders.isEmpty());
        assertFalse(gl.mainRender.isReady());
        guard.requireReleased();
    }

    @Test public void skipsMainRenderWhenRootEncoderAlreadyCompletedItsRelease() {
        FakeGlInterface gl = new FakeGlInterface();
        gl.mainRender.running.set(false);
        // RootEncoder clears filterRenders only after all filter releases return.
        gl.mainRender.filterRenders.clear();
        ModeBGlEglStateGuard.Guard guard = capture(gl);

        guard.releaseOutstandingManagers();
        guard.requireReleased();

        assertFalse(gl.releaseLog.contains("camera"));
        assertFalse(gl.releaseLog.contains("filter"));
        assertFalse(gl.releaseLog.contains("screen"));
    }

    @Test public void refusesMainRenderGlCallsWhenRootContextCannotBeMadeCurrent() {
        FakeGlInterface gl = new FakeGlInterface();
        gl.surfaceManager.makeCurrentSucceeds = false;
        ModeBGlEglStateGuard.Guard guard = capture(gl);

        try {
            guard.releaseOutstandingManagers();
            fail("MainRender GL cleanup must fail closed without a current root context");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("recovery EGL independen"));
        }

        assertFalse(gl.releaseLog.contains("camera"));
        assertFalse(gl.releaseLog.contains("filter"));
        assertFalse(gl.releaseLog.contains("screen"));
        guard.requireReleased();
    }

    private static void releaseAll(FakeGlInterface gl) {
        gl.surfaceManager.releaseState();
        gl.surfaceManagerEncoder.releaseState();
        gl.surfaceManagerEncoderRecord.releaseState();
        gl.surfaceManagerPhoto.releaseState();
        gl.surfaceManagerPreview.releaseState();
        gl.multiPreviewSurfaceManagers.clear();
    }

    private static void releaseManagersOnly(FakeGlInterface gl) {
        gl.surfaceManager.releaseState();
        gl.surfaceManagerEncoder.releaseState();
        gl.surfaceManagerEncoderRecord.releaseState();
        gl.surfaceManagerPhoto.releaseState();
        gl.surfaceManagerPreview.releaseState();
    }

    private static void releaseAllExcept(FakeGlInterface gl, FakeSurfaceManager except) {
        if (gl.surfaceManager != except) gl.surfaceManager.releaseState();
        if (gl.surfaceManagerEncoder != except) gl.surfaceManagerEncoder.releaseState();
        if (gl.surfaceManagerEncoderRecord != except) gl.surfaceManagerEncoderRecord.releaseState();
        if (gl.surfaceManagerPhoto != except) gl.surfaceManagerPhoto.releaseState();
        if (gl.surfaceManagerPreview != except) gl.surfaceManagerPreview.releaseState();
        gl.multiPreviewSurfaceManagers.clear();
    }
}
