package com.syntxrr.streamtools;

import android.content.Context;
import android.graphics.SurfaceTexture;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.projection.MediaProjection;
import android.os.Handler;
import android.os.HandlerThread;
import android.view.Surface;

import com.pedro.encoder.input.sources.OrientationConfig;
import com.pedro.encoder.input.sources.OrientationForced;
import com.pedro.encoder.input.sources.video.VideoSource;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Direct MediaProjection source whose encoder Surface/SurfaceTexture survives a projection loss.
 * Every fresh consent token gets exactly one new VirtualDisplay; the GL input and RTMP encoder
 * stay alive between tokens.
 */
final class ModeBScreenCaptureVideoSource extends VideoSource {
    interface FrameForwarder {
        void onFrameAvailable(SurfaceTexture surfaceTexture);
    }

    interface FirstFrameCallback {
        void onFirstFrame(long projectionGeneration);
    }

    interface StoppedCallback {
        void onStopped(long projectionGeneration);
    }

    private final Object lock = new Object();
    private final Context context;
    private MediaProjection mediaProjection;
    private final FrameForwarder frameForwarder;
    private final FirstFrameCallback firstFrameCallback;
    private final StoppedCallback stoppedCallback;
    private final AtomicBoolean firstFrameDelivered = new AtomicBoolean(false);
    private final AtomicBoolean stopping = new AtomicBoolean(false);
    private final ModeBScreenCaptureCallbackGate frameCallbackGate =
            new ModeBScreenCaptureCallbackGate();
    private boolean creationAttempted;
    private HandlerThread handlerThread;
    private Handler handler;
    private SurfaceTexture inputTexture;
    private Surface producerSurface;
    private VirtualDisplay virtualDisplay;
    private long projectionGeneration;
    private int captureWidth;
    private int captureHeight;
    private int captureRotation;

    ModeBScreenCaptureVideoSource(Context context,
                                  MediaProjection mediaProjection,
                                  long projectionGeneration,
                                  FrameForwarder frameForwarder,
                                  FirstFrameCallback firstFrameCallback,
                                  StoppedCallback stoppedCallback) {
        this.context = context.getApplicationContext();
        this.mediaProjection = mediaProjection;
        this.projectionGeneration = projectionGeneration;
        this.frameForwarder = frameForwarder;
        this.firstFrameCallback = firstFrameCallback;
        this.stoppedCallback = stoppedCallback;
    }

    @Override
    protected boolean create(int width, int height, int fps, int rotation) {
        boolean valid = width > 0 && height > 0 && (width & 1) == 0 && (height & 1) == 0 && rotation == 0;
        if (!valid) return false;
        this.captureWidth = width;
        this.captureHeight = height;
        this.captureRotation = rotation;
        return true;
    }

    @Override
    public void start(SurfaceTexture surfaceTexture) {
        if (surfaceTexture == null) throw new IllegalArgumentException("SurfaceTexture Tangkapan Layar tidak tersedia.");
        synchronized (lock) {
            if (stopping.get()) throw new IllegalStateException("VideoSource Tangkapan Layar sudah dihentikan.");
            if (virtualDisplay != null) return;
            if (inputTexture != null) throw new IllegalStateException("VideoSource direct sudah memiliki SurfaceTexture.");
            inputTexture = surfaceTexture;
            handlerThread = new HandlerThread("SYNTXRR-DirectScreenSource");
            handlerThread.start();
            handler = new Handler(handlerThread.getLooper());
            producerSurface = new Surface(surfaceTexture);
            surfaceTexture.setDefaultBufferSize(captureWidth, captureHeight);
            installFrameListenerLocked(projectionGeneration);
            createVirtualDisplayLocked(projectionGeneration);
        }
    }


    /**
     * A callback may begin under one projection and finish after suspend/reattach has installed
     * another generation. Only a frame whose generation is still actively attached may satisfy
     * first-frame readiness; the service validates the same generation again on the main Looper.
     */
    private void installFrameListenerLocked(long expectedGeneration) {
        SurfaceTexture texture = inputTexture;
        Handler callbackHandler = handler;
        if (texture == null || callbackHandler == null) {
            throw new IllegalStateException("Listener frame direct tidak dapat dipasang tanpa SurfaceTexture dan Handler.");
        }
        // Capture the generation when the listener is installed, not when a queued callback
        // eventually runs. SurfaceTexture callbacks can be delayed on the HandlerThread.
        texture.setOnFrameAvailableListener(
                frame -> handleFrameAvailable(frame, expectedGeneration), callbackHandler);
    }

    private void handleFrameAvailable(SurfaceTexture frame, long callbackGeneration) {
        // The lease covers both GL forwarding and first-frame dispatch. suspendProjection()
        // pauses/drains this gate; stop() closes/drains it before releasing the encoder Surface.
        if (!frameCallbackGate.tryEnter()) return;
        try {
            synchronized (lock) {
                if (!ModeBProjectionFramePolicy.shouldAcceptFrame(
                        stopping.get(), mediaProjection != null && virtualDisplay != null,
                        callbackGeneration, projectionGeneration)) return;
            }

            try {
                if (frameForwarder != null) frameForwarder.onFrameAvailable(frame);
            } catch (RuntimeException renderQueueClosed) {
                if (!stopping.get()) throw renderQueueClosed;
                return;
            }

            final boolean deliverFirstFrame;
            synchronized (lock) {
                deliverFirstFrame = ModeBProjectionFramePolicy.shouldAcceptFrame(
                        stopping.get(), mediaProjection != null && virtualDisplay != null,
                        callbackGeneration, projectionGeneration)
                        && firstFrameDelivered.compareAndSet(false, true);
            }
            if (deliverFirstFrame && firstFrameCallback != null) {
                firstFrameCallback.onFirstFrame(callbackGeneration);
            }
        } finally {
            frameCallbackGate.exit();
        }
    }

    /** Detaches only the one-shot projection producer; the encoder input Surface stays alive. */
    void suspendProjection(long expectedGeneration) {
        synchronized (lock) {
            if (stopping.get() || expectedGeneration != projectionGeneration) return;
            // Detach and invalidate the generation before draining callbacks. A callback that
            // already acquired a lease will now fail its state check or finish its GL forward;
            // no old-generation callback may remain in flight when suspend returns.
            SurfaceTexture texture = inputTexture;
            if (texture != null) {
                try { texture.setOnFrameAvailableListener(null); } catch (RuntimeException ignored) { }
            }
            mediaProjection = null;
            creationAttempted = false;
            firstFrameDelivered.set(false);
        }
        frameCallbackGate.pauseAndAwait();
        synchronized (lock) {
            // Retire the producer only after the last admitted frame callback has left GL.
            releaseVirtualDisplayLocked();
        }
    }

    /** Attaches a fresh user-consented projection to the exact same encoder Surface. */
    void reattachProjection(MediaProjection projection, long newGeneration) {
        if (projection == null) throw new IllegalArgumentException("MediaProjection baru tidak tersedia.");

        final Handler callbackHandler;
        final HandlerThread callbackThread;
        synchronized (lock) {
            if (stopping.get()) throw new IllegalStateException("VideoSource direct sudah dihentikan.");
            if (inputTexture == null || producerSurface == null || !producerSurface.isValid()
                    || handler == null || handlerThread == null
                    || !handler.getLooper().getThread().isAlive()) {
                throw new IllegalStateException("Surface encoder direct tidak lagi tersedia untuk reshare.");
            }
            if (mediaProjection != null || virtualDisplay != null) {
                throw new IllegalStateException("Projection sebelumnya belum disuspend.");
            }
            callbackHandler = handler;
            callbackThread = handlerThread;
        }

        // A callback message queued by the previous VirtualDisplay must be dispatched while
        // the listener is detached, before a new generation-bound listener is installed.
        // Waiting is deliberately outside `lock`: a callback already in flight may need it
        // to observe the suspended state and return.
        if (!ModeBHandlerDrainPolicy.awaitBarrier(
                barrier -> callbackHandler.post(barrier), callbackThread, 200L)) {
            throw new IllegalStateException(
                    "Antrean callback tangkapan layar lama belum selesai; coba Bagikan Layar Lagi.");
        }

        RuntimeException attachFailure = null;
        synchronized (lock) {
            if (stopping.get()) throw new IllegalStateException("VideoSource direct sudah dihentikan.");
            if (handler != callbackHandler || handlerThread != callbackThread
                    || inputTexture == null || producerSurface == null || !producerSurface.isValid()
                    || mediaProjection != null || virtualDisplay != null) {
                throw new IllegalStateException("Keadaan Surface direct berubah sebelum reshare selesai.");
            }
            projectionGeneration = newGeneration;
            mediaProjection = projection;
            creationAttempted = false;
            firstFrameDelivered.set(false);
            frameCallbackGate.resume();
            try {
                installFrameListenerLocked(newGeneration);
                createVirtualDisplayLocked(newGeneration);
            } catch (RuntimeException failure) {
                // Do not leave a half-attached projection behind when Android rejects the
                // VirtualDisplay (or listener installation fails). The service will retire
                // the failed MediaProjection, but this source must become quiescent first.
                mediaProjection = null;
                firstFrameDelivered.set(false);
                attachFailure = failure;
            }
        }
        if (attachFailure != null) {
            final RuntimeException originalFailure = attachFailure;
            ModeBProjectionAttachFailureBarrier.rollback(
                    frameCallbackGate,
                    () -> {
                        synchronized (lock) {
                            SurfaceTexture texture = inputTexture;
                            if (texture != null) texture.setOnFrameAvailableListener(null);
                        }
                    },
                    () -> {
                        synchronized (lock) {
                            releaseVirtualDisplayLocked();
                        }
                    },
                    originalFailure);
            // Keep projectionGeneration at the failed attempt's generation. The caller's
            // return-to-waiting path can now suspend this exact generation idempotently.
            throw originalFailure;
        }
    }

    private void createVirtualDisplayLocked(long expectedGeneration) {
        if (mediaProjection == null || producerSurface == null || !producerSurface.isValid()) {
            throw new IllegalStateException("Projection atau Surface direct tidak valid.");
        }
        if (creationAttempted) throw new IllegalStateException("Token MediaProjection ini sudah membuat VirtualDisplay.");
        creationAttempted = true;
        try {
            int densityDpi = context.getResources().getDisplayMetrics().densityDpi;
            virtualDisplay = mediaProjection.createVirtualDisplay(
                    "SYNTXRR_Mode_B_Direct_Screen_Source",
                    captureWidth,
                    captureHeight,
                    densityDpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    producerSurface,
                    new VirtualDisplay.Callback() {
                        @Override public void onStopped() {
                            StoppedCallback callback;
                            synchronized (lock) {
                                if (stopping.get() || expectedGeneration != projectionGeneration) return;
                                callback = stoppedCallback;
                            }
                            if (callback != null) callback.onStopped(expectedGeneration);
                        }
                    },
                    handler
            );
            if (virtualDisplay == null) throw new IllegalStateException("Android gagal membuat VirtualDisplay direct source.");
        } catch (RuntimeException exception) {
            virtualDisplay = null;
            throw exception;
        }
    }

    @Override
    public void stop() {
        synchronized (lock) {
            stopping.set(true);
        }
        // First close admission and drain every callback that may still forward into RootEncoder's
        // GL interface. Only then release the producer Surface; the 200 ms thread join below is
        // merely worker retirement, not the safety barrier for in-flight GL access.
        frameCallbackGate.closeAndAwait();

        final HandlerThread threadToJoin;
        synchronized (lock) {
            threadToJoin = releaseLocked();
        }
        // Do not hold `lock` while joining: an already-queued VirtualDisplay callback may
        // still need it to observe `stopping` and exit. Frame callbacks are already quiescent.
        if (threadToJoin != null) {
            threadToJoin.quitSafely();
            boolean retired = ModeBThreadRetirementPolicy.joinThenRetire(
                    threadToJoin,
                    200L,
                    ModeBThreadJoinPolicy::join,
                    () -> {
                        synchronized (lock) {
                            // Keep ownership after a timeout/interruption so a later stop()/release()
                            // can retry joining the same worker. Clear only the exact thread that
                            // this call proved terminated; never discard a replacement reference.
                            if (handlerThread == threadToJoin) handlerThread = null;
                        }
                    });
            if (!retired) {
                // The frame callback gate above has already drained every callback that could
                // forward into RootEncoder GL, and releaseLocked() detached the listener,
                // VirtualDisplay and producer Surface. The quit worker may still be winding
                // down queued no-op callbacks, so do not let its bounded join abort the
                // remaining RootEncoder audio/video encoder and GL teardown sequence.
                // Keep ownership so the following RootEncoder stop/release calls and the
                // service's strict fallback can retry/verify this exact worker.
                android.util.Log.w("SYNTXRR-DirectScreenSource",
                        "Direct capture callback thread is still retiring; GL callback gate is drained. "
                                + "Allowing RootEncoder teardown to continue and retaining worker ownership.");
            }
        }
    }

    /**
     * Service-level final check. RootEncoder calls stop()/release() first so its encoder and GL
     * cleanup is not short-circuited by a slow, already-quiescent callback Looper. Only after
     * that sequence do we fail the session teardown if the callback worker is still alive.
     */
    void stopAndRequireWorkerRetired() {
        stop();
        final HandlerThread pendingThread;
        synchronized (lock) {
            pendingThread = handlerThread;
            if (pendingThread != null && !pendingThread.isAlive()
                    && handlerThread == pendingThread) {
                handlerThread = null;
            }
        }
        ModeBThreadRetirementPolicy.requireTerminated(pendingThread);
    }

    @Override public void release() { stop(); }

    @Override
    public boolean isRunning() {
        synchronized (lock) {
            return !stopping.get() && producerSurface != null && producerSurface.isValid();
        }
    }

    @Override
    public OrientationConfig getOrientationConfig() {
        boolean isPortrait = ((captureRotation == 90 || captureRotation == 270) != (captureHeight > captureWidth));
        return new OrientationConfig(0, isPortrait, OrientationForced.NONE);
    }

    private void releaseVirtualDisplayLocked() {
        VirtualDisplay display = virtualDisplay;
        virtualDisplay = null;
        if (display != null) {
            try { display.release(); } catch (RuntimeException ignored) { }
        }
    }

    private HandlerThread releaseLocked() {
        SurfaceTexture texture = inputTexture;
        inputTexture = null;
        if (texture != null) {
            try { texture.setOnFrameAvailableListener(null); } catch (RuntimeException ignored) { }
        }
        releaseVirtualDisplayLocked();
        mediaProjection = null;
        Surface surface = producerSurface;
        producerSurface = null;
        if (surface != null) {
            try { surface.release(); } catch (RuntimeException ignored) { }
        }
        // Do not clear handlerThread here. If the bounded join times out, the owner must retain
        // the exact worker reference so a subsequent stop()/release() can retry retirement.
        HandlerThread thread = handlerThread;
        handler = null;
        return thread;
    }
}
