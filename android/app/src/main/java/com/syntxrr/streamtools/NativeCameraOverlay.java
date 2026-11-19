package com.syntxrr.streamtools;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Matrix;
import android.hardware.camera2.CameraAccessException;
import android.hardware.display.DisplayManager;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Range;
import android.util.Size;
import android.view.Display;
import android.view.Surface;
import android.view.WindowManager;

import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.nio.ByteBuffer;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Bounded Camera2 YUV-frame source for the Studio canvas compositor.
 * One physical lens is opened per Mode B session; multiple Studio camera layers may reuse it.
 */
final class NativeCameraOverlay {
    interface Listener {
        void onFrame(Bitmap bitmap);
        void onFailure(String message);
    }

    private static final int MAX_CAPTURE_EDGE = ModeBBitmapBudget.CAMERA_MAX_CAPTURE_WIDTH;
    private static final long MAX_CAPTURE_PIXELS = (long) ModeBBitmapBudget.CAMERA_MAX_CAPTURE_WIDTH
            * ModeBBitmapBudget.CAMERA_MAX_CAPTURE_HEIGHT;
    static final int MAX_OUTPUT_WIDTH = ModeBBitmapBudget.CAMERA_MAX_OUTPUT_WIDTH;
    static final int MAX_OUTPUT_HEIGHT = ModeBBitmapBudget.CAMERA_MAX_OUTPUT_HEIGHT;
    private static final long MAX_OUTPUT_PIXELS = (long) MAX_OUTPUT_WIDTH * MAX_OUTPUT_HEIGHT;
    static final long MAX_YUV_FRAME_BYTES = ModeBBitmapBudget.CAMERA_MAX_YUV_FRAME_BYTES;
    private static final long FRAME_INTERVAL_MS = 125L; // capped at 8 fps
    private static final long RELEASE_WAIT_MS = 1800L;

    private final Context context;
    private final boolean frontFacing;
    private final Object listenerLock = new Object();
    private Listener listener;
    private final ModeBVisualWorker visualWorker;
    private final ModeBBitmapBudget.Reservation memoryReservation;
    private final String frameSourceId;
    private final ModeBCameraFrameGate frameGate = new ModeBCameraFrameGate();
    private final AtomicBoolean released = new AtomicBoolean(false);
    private volatile String failure = "";
    private volatile HandlerThread thread;
    private volatile Handler handler;
    private CameraDevice camera;
    private DisplayManager displayManager;
    private ModeBCameraRotationState rotationState;
    private CameraCaptureSession session;
    private ImageReader imageReader;
    private String selectedCameraId;
    private long lastFrameAtMs;
    private volatile int cameraFrameRotation;
    // Accessed only on the shared visual worker; conversion is single-flight per camera.
    private int[] argbScratch;
    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        @Override public void onDisplayAdded(int displayId) { }
        @Override public void onDisplayRemoved(int displayId) { }
        @Override public void onDisplayChanged(int displayId) {
            if (displayId != Display.DEFAULT_DISPLAY || released.get()) return;
            Handler current = handler;
            if (current != null) current.post(NativeCameraOverlay.this::updateCameraFrameRotation);
        }
    };

    NativeCameraOverlay(Context context, boolean frontFacing, ModeBVisualWorker visualWorker,
            ModeBBitmapBudget.Reservation memoryReservation, Listener listener) {
        if (visualWorker == null) throw new IllegalArgumentException("Shared visual worker tidak tersedia.");
        if (memoryReservation == null) throw new IllegalArgumentException("Anggaran memori kamera tidak tersedia.");
        this.context = context.getApplicationContext();
        this.frontFacing = frontFacing;
        this.visualWorker = visualWorker;
        this.memoryReservation = memoryReservation;
        this.frameSourceId = "camera:" + Integer.toHexString(System.identityHashCode(this));
        this.listener = listener;
    }

    void start() {
        if (released.get() || thread != null) return;
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            fail("Izin kamera belum diberikan.");
            return;
        }
        thread = new HandlerThread("SYNTXRR-CameraOverlay");
        thread.start();
        handler = new Handler(thread.getLooper());
        displayManager = (DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE);
        if (displayManager != null) {
            try { displayManager.registerDisplayListener(displayListener, handler); }
            catch (RuntimeException ignored) { displayManager = null; }
        }
        handler.post(this::openCamera);
    }

    String getFailure() {
        return failure;
    }

    boolean isActive() {
        return !released.get();
    }

    /**
     * Retargets frame delivery without reopening Camera2. The transfer callback runs while
     * listener delivery is blocked, so the last bitmap can move atomically with its owner.
     */
    boolean transferListener(Listener next, Runnable transferOwnership) {
        if (next == null || transferOwnership == null) return false;
        synchronized (listenerLock) {
            if (released.get()) return false;
            transferOwnership.run();
            listener = next;
            return true;
        }
    }

    private boolean dispatchFrame(Bitmap bitmap) {
        synchronized (listenerLock) {
            if (released.get() || listener == null) return false;
            listener.onFrame(bitmap);
            return true;
        }
    }

    private void dispatchFailure(String message) {
        synchronized (listenerLock) {
            Listener current = listener;
            if (current != null) current.onFailure(message);
        }
    }

    private void openCamera() {
        if (released.get()) return;
        try {
            CameraManager manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
            if (manager == null) throw new IllegalStateException("Layanan kamera Android tidak tersedia.");
            String cameraId = findCameraId(manager);
            if (cameraId == null) throw new IllegalStateException(frontFacing
                    ? "Kamera depan tidak tersedia." : "Kamera belakang tidak tersedia.");

            selectedCameraId = cameraId;
            CameraCharacteristics characteristics = manager.getCameraCharacteristics(cameraId);
            Integer sensorOrientation = characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION);
            int sensorDegrees = sensorOrientation == null ? 0 : sensorOrientation;
            // YUV preview buffers are not JPEG-rotated. Keep the relative rotation current
            // as the user rotates the display during a live session.
            rotationState = new ModeBCameraRotationState(sensorDegrees, frontFacing, getDisplayRotationDegrees());
            cameraFrameRotation = rotationState.getRotationDegrees();
            android.hardware.camera2.params.StreamConfigurationMap map = characteristics.get(
                    CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            if (map == null) throw new IllegalStateException("Konfigurasi kamera tidak didukung.");
            Size size = chooseYuvSize(map.getOutputSizes(android.graphics.ImageFormat.YUV_420_888));
            if (size == null) throw new IllegalStateException("Kamera tidak menyediakan ukuran frame YUV dalam batas aman 1280×720.");
            imageReader = ImageReader.newInstance(size.getWidth(), size.getHeight(),
                    android.graphics.ImageFormat.YUV_420_888, ModeBBitmapBudget.CAMERA_IMAGE_READER_MAX_IMAGES);
            imageReader.setOnImageAvailableListener(this::onImageAvailable, handler);

            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) {
                throw new SecurityException("Izin kamera dicabut sebelum kamera dibuka.");
            }
            manager.openCamera(cameraId, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice device) {
                    if (released.get()) {
                        device.close();
                        return;
                    }
                    camera = device;
                    createCaptureSession();
                }

                @Override public void onDisconnected(CameraDevice device) {
                    device.close();
                    if (camera == device) camera = null;
                    if (!released.get()) fail("Kamera terputus dari perangkat.");
                }

                @Override public void onError(CameraDevice device, int error) {
                    device.close();
                    if (camera == device) camera = null;
                    if (!released.get()) fail("Kamera gagal dibuka (kode " + error + ").");
                }
            }, handler);
        } catch (SecurityException exception) {
            fail("Android menolak izin kamera. Aktifkan izin Kamera lalu mulai siaran lagi.");
        } catch (Exception exception) {
            String message = exception.getMessage();
            fail(message == null || message.trim().isEmpty()
                    ? "Kamera tidak dapat dimulai pada perangkat ini." : message);
        }
    }

    private String findCameraId(CameraManager manager) throws CameraAccessException {
        for (String id : manager.getCameraIdList()) {
            CameraCharacteristics info = manager.getCameraCharacteristics(id);
            Integer facing = info.get(CameraCharacteristics.LENS_FACING);
            if (facing == null) continue;
            boolean matches = frontFacing
                    ? facing == CameraCharacteristics.LENS_FACING_FRONT
                    : facing == CameraCharacteristics.LENS_FACING_BACK;
            if (matches) return id;
        }
        // Never silently substitute the opposite lens requested by the Studio element.
        return null;
    }

    private Size chooseYuvSize(Size[] sizes) {
        if (sizes == null || sizes.length == 0) return null;
        List<Size> bounded = new ArrayList<>();
        for (Size size : sizes) {
            if (size == null) continue;
            if (ModeBCameraFramePolicy.isSafeCaptureSize(
                    size.getWidth(), size.getHeight(), MAX_CAPTURE_EDGE, MAX_CAPTURE_PIXELS)) {
                bounded.add(size);
            }
        }
        if (bounded.isEmpty()) return null;
        bounded.sort((left, right) -> Long.compare(
                (long) right.getWidth() * right.getHeight(),
                (long) left.getWidth() * left.getHeight()));
        return bounded.get(0);
    }

    private void createCaptureSession() {
        if (released.get() || camera == null || imageReader == null) return;
        try {
            camera.createCaptureSession(Arrays.asList(imageReader.getSurface()),
                    new CameraCaptureSession.StateCallback() {
                        @Override public void onConfigured(CameraCaptureSession configured) {
                            if (released.get()) {
                                configured.close();
                                return;
                            }
                            session = configured;
                            try {
                                CaptureRequest.Builder request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                                request.addTarget(imageReader.getSurface());
                                request.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO);
                                Range<Integer> fpsRange = chooseFpsRange(selectedCameraId);
                                if (fpsRange != null) request.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, fpsRange);
                                configured.setRepeatingRequest(request.build(), null, handler);
                            } catch (Exception exception) {
                                fail("Kamera gagal memulai pengambilan frame.");
                            }
                        }

                        @Override public void onConfigureFailed(CameraCaptureSession failed) {
                            failed.close();
                            fail("Kamera tidak dapat membuat sesi capture.");
                        }
                    }, handler);
        } catch (Exception exception) {
            fail("Sesi kamera gagal disiapkan.");
        }
    }

    private void updateCameraFrameRotation() {
        if (released.get()) return;
        ModeBCameraRotationState current = rotationState;
        if (current != null) cameraFrameRotation = current.updateDisplayRotation(getDisplayRotationDegrees());
    }

    private int getDisplayRotationDegrees() {
        try {
            WindowManager manager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
            if (manager == null || manager.getDefaultDisplay() == null) return 0;
            switch (manager.getDefaultDisplay().getRotation()) {
                case Surface.ROTATION_90: return 90;
                case Surface.ROTATION_180: return 180;
                case Surface.ROTATION_270: return 270;
                default: return 0;
            }
        } catch (Exception ignored) {
            return 0;
        }
    }

    private Range<Integer> chooseFpsRange(String cameraId) {
        try {
            CameraManager manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
            if (manager == null) return null;
            Range<Integer>[] ranges = manager.getCameraCharacteristics(cameraId)
                    .get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);
            if (ranges == null || ranges.length == 0) return null;
            Range<Integer> best = ranges[0];
            int bestScore = Integer.MAX_VALUE;
            for (Range<Integer> range : ranges) {
                // Prefer an advertised range with an upper bound at or below 15 fps.
                int upper = range.getUpper();
                int lower = range.getLower();
                int score = upper <= 15 ? (15 - upper) : (100 + Math.abs(upper - 15) + Math.max(0, lower - 15));
                if (score < bestScore) { best = range; bestScore = score; }
            }
            return best;
        } catch (CameraAccessException ignored) {
            return null;
        }
    }

    /**
     * Camera2 callbacks remain on their owning handler. This method only acquires the newest
     * bounded YUV frame, copies its plane bytes, and submits the expensive color conversion to
     * the same session worker used by MP4 decoders. At most one camera conversion may be queued.
     */
    private void onImageAvailable(ImageReader reader) {
        Image image = null;
        boolean ownsPendingSlot = false;
        boolean transferredToWorker = false;
        try {
            image = reader.acquireLatestImage();
            if (image == null || released.get()) return;
            long now = android.os.SystemClock.elapsedRealtime();
            if (now - lastFrameAtMs < FRAME_INTERVAL_MS || !frameGate.tryAcquire()) return;
            ownsPendingSlot = true;

            Image.Plane[] planes = image.getPlanes();
            if (planes == null || planes.length < 3) return;
            android.graphics.Rect crop = image.getCropRect();
            if (crop == null || crop.width() <= 0 || crop.height() <= 0) return;

            double scale = Math.min(1d, Math.min(
                    MAX_OUTPUT_WIDTH / (double) crop.width(),
                    MAX_OUTPUT_HEIGHT / (double) crop.height()));
            int outputWidth = Math.max(1, (int) Math.round(crop.width() * scale));
            int outputHeight = Math.max(1, (int) Math.round(crop.height() * scale));
            if ((long) outputWidth * outputHeight > MAX_OUTPUT_PIXELS) return;

            // Plane memory is owned by Image. Copy only bounded plane payloads before closing
            // Image; YUV conversion and Bitmap allocation happen later on the shared visual worker.
            ByteBuffer yBuffer = planes[0].getBuffer();
            ByteBuffer uBuffer = planes[1].getBuffer();
            ByteBuffer vBuffer = planes[2].getBuffer();
            long frameBytes = (long) yBuffer.remaining() + uBuffer.remaining() + vBuffer.remaining();
            if (frameBytes <= 0L || frameBytes > MAX_YUV_FRAME_BYTES) return;
            CameraFrameData frame = new CameraFrameData(
                    copyRemaining(yBuffer), planes[0].getRowStride(), planes[0].getPixelStride(),
                    copyRemaining(uBuffer), planes[1].getRowStride(), planes[1].getPixelStride(),
                    copyRemaining(vBuffer), planes[2].getRowStride(), planes[2].getPixelStride(),
                    image.getWidth(), image.getHeight(), crop.left, crop.top, crop.width(), crop.height(),
                    outputWidth, outputHeight, cameraFrameRotation);
            image.close();
            image = null;
            lastFrameAtMs = now;
            boolean posted = visualWorker.postFrame(frameSourceId, () -> convertAndDeliver(frame));
            if (!posted) {
                if (!released.get()) fail("Worker visual berhenti sebelum frame kamera diproses.");
                return;
            }
            transferredToWorker = true;
        } catch (OutOfMemoryError memoryError) {
            if (!released.get()) fail("Memori perangkat tidak cukup untuk menyiapkan frame kamera.");
        } catch (Exception exception) {
            if (!released.get()) fail("Frame kamera YUV tidak dapat disiapkan.");
        } finally {
            if (image != null) image.close();
            if (ownsPendingSlot && !transferredToWorker) frameGate.release();
        }
    }

    private static byte[] copyRemaining(ByteBuffer source) {
        if (source == null) throw new IllegalArgumentException("Buffer kamera kosong.");
        ByteBuffer copy = source.duplicate();
        byte[] bytes = new byte[copy.remaining()];
        copy.get(bytes);
        return bytes;
    }

    private void convertAndDeliver(CameraFrameData frame) {
        Bitmap bitmap = null;
        boolean delivered = false;
        try {
            if (released.get()) return;
            int[] argb = ModeBCameraYuvConverter.toArgb(
                    ByteBuffer.wrap(frame.y), frame.yRowStride, frame.yPixelStride,
                    ByteBuffer.wrap(frame.u), frame.uRowStride, frame.uPixelStride,
                    ByteBuffer.wrap(frame.v), frame.vRowStride, frame.vPixelStride,
                    frame.frameWidth, frame.frameHeight,
                    frame.cropLeft, frame.cropTop, frame.cropWidth, frame.cropHeight,
                    frame.outputWidth, frame.outputHeight, MAX_OUTPUT_PIXELS, argbScratch);
            if (argb == null) throw new IllegalArgumentException("Buffer YUV kamera tidak valid.");
            // Camera conversions are serialized on ModeBVisualWorker and frameGate permits
            // only one queued/in-flight camera conversion, so this scratch array is reusable.
            argbScratch = argb;

            bitmap = Bitmap.createBitmap(argb, frame.outputWidth, frame.outputHeight, Bitmap.Config.ARGB_8888);
            if (frame.rotationDegrees != 0) {
                Matrix transform = new Matrix();
                transform.postRotate(frame.rotationDegrees);
                Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0,
                        bitmap.getWidth(), bitmap.getHeight(), transform, true);
                if (rotated != bitmap) bitmap.recycle();
                bitmap = rotated;
            }
            if (released.get()) return;
            delivered = dispatchFrame(bitmap);
        } catch (OutOfMemoryError memoryError) {
            reportWorkerFailure("Memori perangkat tidak cukup untuk mengonversi frame kamera.");
        } catch (Exception exception) {
            reportWorkerFailure("Frame kamera YUV tidak dapat dikonversi.");
        } finally {
            if (!delivered && bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            frameGate.release();
        }
    }

    private void reportWorkerFailure(String message) {
        if (released.get()) return;
        Handler current = handler;
        if (current != null && current.post(() -> fail(message))) return;
        failure = message;
        if (!released.get()) dispatchFailure(message);
    }

    private static final class CameraFrameData {
        final byte[] y, u, v;
        final int yRowStride, yPixelStride, uRowStride, uPixelStride, vRowStride, vPixelStride;
        final int frameWidth, frameHeight, cropLeft, cropTop, cropWidth, cropHeight;
        final int outputWidth, outputHeight, rotationDegrees;

        CameraFrameData(byte[] y, int yRowStride, int yPixelStride,
                byte[] u, int uRowStride, int uPixelStride,
                byte[] v, int vRowStride, int vPixelStride,
                int frameWidth, int frameHeight, int cropLeft, int cropTop, int cropWidth, int cropHeight,
                int outputWidth, int outputHeight, int rotationDegrees) {
            this.y = y; this.yRowStride = yRowStride; this.yPixelStride = yPixelStride;
            this.u = u; this.uRowStride = uRowStride; this.uPixelStride = uPixelStride;
            this.v = v; this.vRowStride = vRowStride; this.vPixelStride = vPixelStride;
            this.frameWidth = frameWidth; this.frameHeight = frameHeight;
            this.cropLeft = cropLeft; this.cropTop = cropTop;
            this.cropWidth = cropWidth; this.cropHeight = cropHeight;
            this.outputWidth = outputWidth; this.outputHeight = outputHeight;
            this.rotationDegrees = rotationDegrees;
        }
    }

    private void fail(String message) {
        if (!released.compareAndSet(false, true)) return;
        failure = message == null ? "Kamera tidak tersedia." : message;
        dispatchFailure(failure);
        closeCameraResources();
        unregisterDisplayListener();
        releaseVisualFrameState();
        HandlerThread currentThread = thread;
        thread = null;
        handler = null;
        if (currentThread != null) currentThread.quitSafely();
    }

    /**
     * Close Camera2 resources on their owning handler before the service stops MediaProjection.
     * Image callbacks and CameraDevice state callbacks are serialized on this same handler, so
     * posting the disposer also drains any callback already ahead of it in the queue.
     */
    void release() {
        if (!released.compareAndSet(false, true)) return;
        // Drop a camera frame that has not started yet and return its one-frame gate.
        visualWorker.removeFrameSource(frameSourceId);
        frameGate.release();
        final Handler currentHandler = handler;
        final HandlerThread currentThread = thread;
        handler = null;
        thread = null;

        if (currentHandler == null) {
            // A failed open/configure path closes its resources synchronously before clearing
            // these references. Keep this idempotent for partially initialized instances.
            closeCameraResources();
            unregisterDisplayListener();
            releaseVisualFrameState();
            if (currentThread != null) currentThread.quitSafely();
            return;
        }

        Runnable disposer = () -> {
            try {
                closeCameraResources();
                unregisterDisplayListener();
            } finally {
                if (currentThread != null) currentThread.quitSafely();
            }
        };

        if (Looper.myLooper() == currentHandler.getLooper()) {
            disposer.run();
            releaseVisualFrameState();
            return;
        }

        CountDownLatch completed = new CountDownLatch(1);
        boolean posted = currentHandler.post(() -> {
            try {
                disposer.run();
            } finally {
                completed.countDown();
            }
        });
        if (!posted) {
            // The handler has already shut down. Its failure path closes Camera2 resources
            // before quitting, so there is no outstanding handler-owned cleanup to await.
            if (currentThread != null) currentThread.quitSafely();
            releaseVisualFrameState();
            return;
        }

        boolean interrupted = false;
        try {
            if (!completed.await(RELEASE_WAIT_MS, TimeUnit.MILLISECONDS)) {
                // Never block service teardown indefinitely on a vendor Camera2 implementation.
                // The disposer remains queued and will close resources when the handler resumes.
            }
        } catch (InterruptedException exception) {
            interrupted = true;
        } finally {
            if (interrupted) Thread.currentThread().interrupt();
        }
        // The Camera2 handler has now drained callbacks queued before its disposer. Remove
        // any frame that raced the first removal, then release the reusable conversion buffer
        // on its owning worker after any conversion already in flight has finished.
        releaseVisualFrameState();
    }

    private void releaseVisualFrameState() {
        visualWorker.removeFrameSource(frameSourceId);
        frameGate.release();
        // The scratch array belongs to the shared visual worker. Release its reservation on
        // that same queue, after any in-flight conversion, before the session worker shuts down.
        if (!visualWorker.post(() -> {
            argbScratch = null;
            memoryReservation.close();
        })) {
            // A rejected post means the session worker has already stopped accepting work.
            memoryReservation.close();
        }
    }

    private void unregisterDisplayListener() {
        DisplayManager manager = displayManager;
        displayManager = null;
        if (manager != null) {
            try { manager.unregisterDisplayListener(displayListener); } catch (RuntimeException ignored) { }
        }
    }

    private void closeCameraResources() {
        if (session != null) {
            try { session.stopRepeating(); } catch (Exception ignored) { }
            try { session.close(); } catch (Exception ignored) { }
            session = null;
        }
        if (camera != null) {
            try { camera.close(); } catch (Exception ignored) { }
            camera = null;
        }
        if (imageReader != null) {
            try { imageReader.setOnImageAvailableListener(null, null); } catch (Exception ignored) { }
            try { imageReader.close(); } catch (Exception ignored) { }
            imageReader = null;
        }
    }
}
