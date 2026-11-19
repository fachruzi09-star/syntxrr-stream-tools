package com.syntxrr.streamtools;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.PointF;
import android.graphics.PorterDuff;
import android.graphics.SurfaceTexture;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.Matrix;
import android.os.Build;
import android.os.SystemClock;
import android.view.Surface;
import android.view.View;

import androidx.annotation.RequiresApi;

import com.pedro.encoder.R;
import com.pedro.encoder.input.gl.Sprite;
import com.pedro.encoder.input.gl.render.filters.BaseFilterRender;
import com.pedro.encoder.utils.gl.GlUtil;
import com.pedro.encoder.utils.gl.TranslateTo;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * SYNTXRR-owned equivalent of RootEncoder's ViewFilterRender with an acknowledged draw-worker
 * retirement. Unlike the pinned upstream renderer, this class never dispatches a failed draw to
 * Dispatchers.Main; release() can therefore wait on its private worker without a Main/GL cycle.
 */
@RequiresApi(api = Build.VERSION_CODES.JELLY_BEAN_MR2)
class ModeBRetirableViewFilterRender extends BaseFilterRender {
    private static final long WORKER_RETIRE_TIMEOUT_MS = 2_500L;
    private static final String VIEW_FRAGMENT_SHADER =
            "#extension GL_OES_EGL_image_external : require\n" +
            "precision mediump float;\n" +
            "uniform samplerExternalOES uSamplerView;\n" +
            "uniform sampler2D uSampler;\n" +
            "uniform float uSceneOpacity;\n" +
            "varying vec2 vTextureCoord;\n" +
            "void main() {\n" +
            "  vec4 color = texture2D(uSampler, vTextureCoord);\n" +
            "  vec4 viewColor = texture2D(uSamplerView, vec2(vTextureCoord.x, 1.0 - vTextureCoord.y));\n" +
            "  viewColor *= clamp(uSceneOpacity, 0.0, 1.0);\n" +
            "  color.rgb *= 1.0 - viewColor.a;\n" +
            "  gl_FragColor = color + viewColor;\n" +
            "}\n";

    private static final float[] VERTICES = {
            -1f, -1f, 0f, 0f, 0f,
             1f, -1f, 0f, 1f, 0f,
            -1f,  1f, 0f, 0f, 1f,
             1f,  1f, 0f, 1f, 1f
    };

    private final Object workerLock = new Object();
    private final AtomicBoolean frameAvailable = new AtomicBoolean(false);
    private final AtomicBoolean renderFailureDispatched = new AtomicBoolean(false);
    private final ModeBFramePacingGate framePacingGate = new ModeBFramePacingGate();
    private final FloatBuffer vertexBuffer;
    private final Sprite sprite = new Sprite();
    private final int[] viewTextureId = {-1};

    private volatile View view;
    private volatile Surface surface;
    private volatile SurfaceTexture surfaceTexture;
    private volatile boolean stopRequested;
    private volatile boolean releaseRequested;
    private volatile int targetFps = 30;
    private volatile boolean hardwareMode = true;
    private volatile RuntimeException lastDrawFailure;
    private volatile RenderFailureListener renderFailureListener;
    private volatile ModeBSceneLayerOpacityState sceneLayerOpacityState;
    private volatile int sceneLayerOpacityRole = ModeBSceneLayerOpacityState.ROLE_SINGLE;
    // Accessed only by RootEncoder's GL draw thread, between drawFilter() and draw() return.
    private boolean freshInputFrameLatchedThisDraw;

    interface RenderFailureListener {
        void onRenderFailure(RuntimeException failure);
    }

    private Thread renderThread;
    private int program = -1;
    private int aPositionHandle = -1;
    private int aTextureHandle = -1;
    private int uMvpMatrixHandle = -1;
    private int uStMatrixHandle = -1;
    private int uSamplerHandle = -1;
    private int uSamplerViewHandle = -1;
    private int uSceneOpacityHandle = -1;
    private boolean releaseCompleted;

    ModeBRetirableViewFilterRender() {
        vertexBuffer = ByteBuffer.allocateDirect(VERTICES.length * FLOAT_SIZE_BYTES)
                .order(ByteOrder.nativeOrder()).asFloatBuffer();
        vertexBuffer.put(VERTICES).position(0);
        Matrix.setIdentityM(MVPMatrix, 0);
        Matrix.setIdentityM(STMatrix, 0);
    }

    /** Sets or replaces the view without starting a second producer thread. */
    void setView(View nextView) {
        synchronized (workerLock) {
            if (releaseRequested && nextView != null) {
                throw new IllegalStateException("Renderer sedang dilepas; View baru ditolak.");
            }
            view = nextView;
            if (nextView == null) {
                // Detachment is non-blocking (it may be requested from the main thread).
                // The worker's finally block clears ownership and supports a later re-attach.
                stopRequested = true;
                Thread worker = renderThread;
                if (worker != null) worker.interrupt();
            } else if (surface != null) {
                startWorkerLocked();
            }
        }
    }

    void setPosition(float x, float y) { sprite.translate(x, y); }

    void setPosition(TranslateTo position) { sprite.translate(position); }

    void setScale(float x, float y) { sprite.scale(x, y); }

    void setRotation(int degrees) { sprite.setRotation(degrees); }

    PointF getPosition() { return sprite.getTranslation(); }

    PointF getScale() { return sprite.getScale(); }

    int getRotation() { return sprite.getRotation(); }

    void setTargetFps(int value) {
        if (value <= 0) throw new IllegalArgumentException("Target FPS harus minimal 1.");
        targetFps = value;
    }

    int getTargetFps() { return targetFps; }

    void bindSceneLayerOpacityState(ModeBSceneLayerOpacityState state, int role) {
        if (role != ModeBSceneLayerOpacityState.ROLE_SINGLE
                && role != ModeBSceneLayerOpacityState.ROLE_BACKGROUND
                && role != ModeBSceneLayerOpacityState.ROLE_OVERLAY) {
            throw new IllegalArgumentException("Peran opacity scene tidak valid.");
        }
        sceneLayerOpacityState = state;
        sceneLayerOpacityRole = role;
    }

    void setHardwareMode(boolean enabled) { hardwareMode = enabled; }

    boolean isHardwareMode() { return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && hardwareMode; }

    RuntimeException getLastDrawFailure() { return lastDrawFailure; }

    void setOnRenderFailureListener(RenderFailureListener listener) {
        renderFailureListener = listener;
        dispatchRenderFailureIfReady();
    }

    @Override
    protected void initGlFilter(Context context) {
        String vertexShader = GlUtil.getStringFromRaw(context, R.raw.simple_vertex);
        program = GlUtil.createProgram(vertexShader, VIEW_FRAGMENT_SHADER);
        aPositionHandle = GLES20.glGetAttribLocation(program, "aPosition");
        aTextureHandle = GLES20.glGetAttribLocation(program, "aTextureCoord");
        uMvpMatrixHandle = GLES20.glGetUniformLocation(program, "uMVPMatrix");
        uStMatrixHandle = GLES20.glGetUniformLocation(program, "uSTMatrix");
        uSamplerHandle = GLES20.glGetUniformLocation(program, "uSampler");
        uSamplerViewHandle = GLES20.glGetUniformLocation(program, "uSamplerView");
        uSceneOpacityHandle = GLES20.glGetUniformLocation(program, "uSceneOpacity");
        validateRequiredShaderLocations();

        try {
            GlUtil.createExternalTextures(viewTextureId.length, viewTextureId, 0);
            ModeBGlErrorGuard.requireNoError("alokasi external texture ViewFilter", GLES20::glGetError);
            if (viewTextureId[0] <= 0) {
                throw new IllegalStateException("GLES tidak menghasilkan external texture ViewFilter yang valid.");
            }

            SurfaceTexture createdTexture = new SurfaceTexture(viewTextureId[0]);
            surfaceTexture = createdTexture;
            createdTexture.setOnFrameAvailableListener(ignored -> frameAvailable.set(true));
            Surface createdSurface = new Surface(createdTexture);
            surface = createdSurface;
            if (!createdSurface.isValid()) {
                throw new IllegalStateException("Surface producer ViewFilter tidak valid setelah inisialisasi.");
            }

            synchronized (workerLock) {
                if (view != null) startWorkerLocked();
            }
        } catch (RuntimeException | Error failure) {
            cleanupFailedGlInitialization(failure);
            throw failure;
        }
    }

    private void cleanupFailedGlInitialization(Throwable originalFailure) {
        Surface failedSurface = surface;
        surface = null;
        if (failedSurface != null) {
            try {
                failedSurface.release();
            } catch (RuntimeException | Error cleanupFailure) {
                if (cleanupFailure != originalFailure) originalFailure.addSuppressed(cleanupFailure);
            }
        }

        SurfaceTexture failedTexture = surfaceTexture;
        surfaceTexture = null;
        if (failedTexture != null) {
            try {
                failedTexture.setOnFrameAvailableListener(null);
            } catch (RuntimeException | Error cleanupFailure) {
                if (cleanupFailure != originalFailure) originalFailure.addSuppressed(cleanupFailure);
            }
            try {
                failedTexture.release();
            } catch (RuntimeException | Error cleanupFailure) {
                if (cleanupFailure != originalFailure) originalFailure.addSuppressed(cleanupFailure);
            }
        }

        if (viewTextureId[0] > 0) {
            try {
                GLES20.glDeleteTextures(1, viewTextureId, 0);
            } catch (RuntimeException | Error cleanupFailure) {
                if (cleanupFailure != originalFailure) originalFailure.addSuppressed(cleanupFailure);
            }
        }
        viewTextureId[0] = -1;
        if (program >= 0) {
            try {
                GLES20.glDeleteProgram(program);
            } catch (RuntimeException | Error cleanupFailure) {
                if (cleanupFailure != originalFailure) originalFailure.addSuppressed(cleanupFailure);
            }
        }
        program = -1;
    }

    @Override
    public void initFBOLink() {
        ModeBGlErrorGuard.requireNoError("sebelum inisialisasi FBO ViewFilter", GLES20::glGetError);
        super.initFBOLink();
        ModeBGlErrorGuard.requireNoError("sesudah inisialisasi FBO ViewFilter", GLES20::glGetError);
    }

    /** Fail during GL setup instead of silently ignoring a shader input whose location is -1. */
    private void validateRequiredShaderLocations() {
        try {
            ModeBGlShaderInterfaceGuard.requireResolvedLocations(
                    "SYNTXRR ViewFilter ES 2.0",
                    new String[] { "aPosition", "aTextureCoord", "uMVPMatrix", "uSTMatrix",
                            "uSampler", "uSamplerView", "uSceneOpacity" },
                    new int[] { aPositionHandle, aTextureHandle, uMvpMatrixHandle, uStMatrixHandle,
                            uSamplerHandle, uSamplerViewHandle, uSceneOpacityHandle });
        } catch (RuntimeException | Error failure) {
            if (program >= 0) {
                try {
                    GLES20.glDeleteProgram(program);
                } catch (RuntimeException | Error cleanupFailure) {
                    if (cleanupFailure != failure) failure.addSuppressed(cleanupFailure);
                }
            }
            program = -1;
            throw failure;
        }
    }

    @Override
    public void draw() {
        freshInputFrameLatchedThisDraw = false;
        ModeBGlErrorGuard.requireNoError("sebelum draw ViewFilter", GLES20::glGetError);

        Throwable drawFailure = null;
        try {
            super.draw();
        } catch (RuntimeException | Error failure) {
            drawFailure = failure;
        }

        Throwable glFailure = null;
        try {
            // RootEncoder 2.8.1 disables GlUtil.checkGlError() by default. Explicitly inspect the
            // GLES queue so bad framebuffer binds, texture operations, uniforms, or draw calls
            // cannot be mistaken for a successfully rendered scene replacement.
            ModeBGlErrorGuard.requireNoError("sesudah draw ViewFilter", GLES20::glGetError);
        } catch (RuntimeException | Error failure) {
            glFailure = failure;
        }

        if (drawFailure != null) {
            if (glFailure != null && glFailure != drawFailure) drawFailure.addSuppressed(glFailure);
            rethrowDrawFailure(drawFailure);
        }
        if (glFailure != null) rethrowDrawFailure(glFailure);
    }

    private static void rethrowDrawFailure(Throwable failure) {
        if (failure instanceof RuntimeException) throw (RuntimeException) failure;
        if (failure instanceof Error) throw (Error) failure;
        throw new IllegalStateException("Render ViewFilter gagal.", failure);
    }

    @Override
    protected void drawFilter() {
        RuntimeException workerFailure = lastDrawFailure;
        if (workerFailure != null) {
            throw new IllegalStateException("Worker ViewFilter gagal sebelum frame GL diproses.", workerFailure);
        }
        SurfaceTexture currentTexture = surfaceTexture;
        if (currentTexture != null) {
            currentTexture.setDefaultBufferSize(getPreviewWidth(), getPreviewHeight());
            if (frameAvailable.get()) {
                // SurfaceTexture can notify before unlockCanvasAndPost() returns. Keep the callback
                // latched until the producer explicitly confirms that the post succeeded; a failed
                // or partial post must never be counted by the scene fence.
                long pendingSequence = framePacingGate.confirmedPendingFrameSequence();
                if (pendingSequence != ModeBFramePacingGate.NO_PENDING_FRAME
                        && frameAvailable.compareAndSet(true, false)) {
                    currentTexture.updateTexImage();
                    // Do not advance the scene-output fence unless the exact confirmed post
                    // sequence is still pending and can be acknowledged by this GL consumer.
                    if (!framePacingGate.acknowledgeConsumed(pendingSequence)) {
                        throw new IllegalStateException(
                                "Acknowledgement frame Surface tidak cocok setelah updateTexImage().");
                    }
                    freshInputFrameLatchedThisDraw = true;
                    // BufferQueue may accept the next producer frame only after GL has latched
                    // this one. This bounds producer backlog without claiming GPU/encoder completion.
                }
            }
        }

        GLES20.glUseProgram(program);
        ModeBSceneLayerOpacityState opacityState = sceneLayerOpacityState;
        float sceneOpacity = opacityState == null ? 1f
                : opacityState.snapshotForOutputLayer(sceneLayerOpacityRole);
        GLES20.glUniform1f(uSceneOpacityHandle, sceneOpacity);
        vertexBuffer.position(SQUARE_VERTEX_DATA_POS_OFFSET);
        GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false,
                SQUARE_VERTEX_DATA_STRIDE_BYTES, vertexBuffer);
        GLES20.glEnableVertexAttribArray(aPositionHandle);

        vertexBuffer.position(SQUARE_VERTEX_DATA_UV_OFFSET);
        GLES20.glVertexAttribPointer(aTextureHandle, 2, GLES20.GL_FLOAT, false,
                SQUARE_VERTEX_DATA_STRIDE_BYTES, vertexBuffer);
        GLES20.glEnableVertexAttribArray(aTextureHandle);

        GLES20.glUniformMatrix4fv(uMvpMatrixHandle, 1, false, MVPMatrix, 0);
        GLES20.glUniformMatrix4fv(uStMatrixHandle, 1, false, STMatrix, 0);
        GLES20.glUniform1i(uSamplerHandle, 0);
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, previousTexId);
        GLES20.glUniform1i(uSamplerViewHandle, 1);
        GLES20.glActiveTexture(GLES20.GL_TEXTURE1);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, viewTextureId[0]);
    }

    /**
     * Consumed by the scene-output fence after BaseFilterRender.draw() returns successfully.
     * A repeated GL draw that reuses the previous external-texture image is not a fresh scene
     * frame and must not acknowledge scene readiness.
     */
    protected final boolean consumeFreshInputFrameForOutputFence() {
        boolean fresh = freshInputFrameLatchedThisDraw;
        freshInputFrameLatchedThisDraw = false;
        return fresh;
    }

    @Override
    protected void disableResources() {
        GlUtil.disableResources(aTextureHandle, aPositionHandle);
    }

    @Override
    public void release() {
        if (releaseCompleted) return;
        retireRenderWorker();

        Throwable firstFailure = null;
        if (program >= 0) {
            try {
                GLES20.glDeleteProgram(program);
                program = -1;
            } catch (RuntimeException | Error failure) {
                firstFailure = append(firstFailure, failure);
            }
        }

        Surface currentSurface = surface;
        if (currentSurface != null) {
            try {
                currentSurface.release();
                surface = null;
            } catch (RuntimeException | Error failure) {
                firstFailure = append(firstFailure, failure);
            }
        }

        SurfaceTexture currentTexture = surfaceTexture;
        if (currentTexture != null) {
            try {
                currentTexture.setOnFrameAvailableListener(null);
            } catch (RuntimeException | Error failure) {
                firstFailure = append(firstFailure, failure);
            }
            try {
                currentTexture.release();
                surfaceTexture = null;
            } catch (RuntimeException | Error failure) {
                firstFailure = append(firstFailure, failure);
            }
        }

        if (firstFailure != null) {
            throw new IllegalStateException(
                    "Resource ViewFilter SYNTXRR gagal dilepas setelah worker terverifikasi berhenti.",
                    firstFailure);
        }
        viewTextureId[0] = -1;
        frameAvailable.set(false);
        releaseCompleted = true;
    }

    private void startWorkerLocked() {
        if (releaseRequested || surface == null || renderThread != null && renderThread.isAlive()) return;
        stopRequested = false;
        Thread worker = new Thread(this::renderLoop, "SYNTXRR-ViewFilterDraw");
        worker.setDaemon(true);
        renderThread = worker;
        worker.start();
    }

    private void retireRenderWorker() {
        final Thread worker;
        synchronized (workerLock) {
            releaseRequested = true;
            stopRequested = true;
            view = null;
            framePacingGate.close();
            worker = renderThread;
        }
        ModeBRenderWorkerRetirement.requireRetired(worker, WORKER_RETIRE_TIMEOUT_MS);
        synchronized (workerLock) {
            if (renderThread == worker && (worker == null || !worker.isAlive())) renderThread = null;
        }
    }

    private void renderLoop() {
        try {
            while (!stopRequested) {
                try {
                    // Do not queue another Surface buffer while the previous one is still waiting
                    // for updateTexImage(). GL slowdown therefore back-pressures this producer.
                    if (!framePacingGate.awaitProducerTurn()) break;
                } catch (InterruptedException interrupted) {
                    if (stopRequested) break;
                    // An unrelated interrupt only cancels this wait; the next loop rechecks state.
                    continue;
                }
                if (stopRequested) break;
                long frameStart = SystemClock.uptimeMillis();
                Surface currentSurface = surface;
                View currentView = view;
                if (currentSurface != null && currentView != null && currentSurface.isValid()) {
                    Canvas canvas = null;
                    RuntimeException frameFailure = null;
                    try {
                        canvas = isHardwareMode() ? currentSurface.lockHardwareCanvas() : currentSurface.lockCanvas(null);
                        if (canvas == null) {
                            throw new IllegalStateException("Surface mengembalikan Canvas kosong untuk ViewFilter.");
                        }
                        drawViewFrame(canvas, currentView);
                    } catch (RuntimeException failure) {
                        frameFailure = failure;
                        if (!stopRequested && !releaseRequested) reportWorkerFailure(failure);
                    } finally {
                        if (canvas != null) {
                            // Even after a drawing exception, always unlock the acquired Canvas.
                            // A failed draw is reported BEFORE unlock/post so a racing GL callback
                            // cannot treat its partial buffer as a healthy output-fence frame.
                            long postingSequence = ModeBFramePacingGate.NO_PENDING_FRAME;
                            if (frameFailure == null) {
                                try {
                                    // Reserve a sequence before posting because SurfaceTexture may
                                    // notify synchronously/quickly, but do not expose it to GL yet.
                                    postingSequence = framePacingGate.beginFramePost();
                                } catch (RuntimeException failure) {
                                    frameFailure = failure;
                                    if (!stopRequested && !releaseRequested) reportWorkerFailure(failure);
                                }
                            }
                            boolean postSucceeded = false;
                            try {
                                currentSurface.unlockCanvasAndPost(canvas);
                                postSucceeded = true;
                            } catch (RuntimeException failure) {
                                // A failed post has an ambiguous BufferQueue outcome. The reserved
                                // sequence remains unconfirmed, so GL cannot latch or count it.
                                frameFailure = combineFrameFailures(frameFailure, failure);
                                if (!stopRequested && !releaseRequested) reportWorkerFailure(failure);
                            }
                            if (postSucceeded && frameFailure == null
                                    && postingSequence != ModeBFramePacingGate.NO_PENDING_FRAME
                                    && !framePacingGate.confirmFramePosted(postingSequence)) {
                                RuntimeException failure = new IllegalStateException(
                                        "Konfirmasi post frame Surface tidak cocok dengan sequence yang tertunda.");
                                frameFailure = failure;
                                if (!stopRequested && !releaseRequested) reportWorkerFailure(failure);
                            }
                        }
                    }
                }

                long sleepMs = Math.max(0L, 1_000L / Math.max(1, targetFps)
                        - (SystemClock.uptimeMillis() - frameStart));
                if (sleepMs > 0L) {
                    try {
                        Thread.sleep(sleepMs);
                    } catch (InterruptedException interrupted) {
                        if (stopRequested) break;
                    }
                }
            }
        } finally {
            synchronized (workerLock) {
                if (renderThread == Thread.currentThread()) renderThread = null;
                // A view may have been reattached while the previous worker was retiring.
                if (!releaseRequested && view != null && surface != null) startWorkerLocked();
            }
        }
    }

    private RuntimeException combineFrameFailures(RuntimeException first, RuntimeException next) {
        if (first == null) return next;
        if (first != next) first.addSuppressed(next);
        return first;
    }

    private void reportWorkerFailure(RuntimeException failure) {
        RuntimeException previous = lastDrawFailure;
        if (previous == null) {
            lastDrawFailure = failure;
        } else if (previous != failure) {
            previous.addSuppressed(failure);
        }
        stopRequested = true;
        dispatchRenderFailureIfReady();
    }

    private void dispatchRenderFailureIfReady() {
        final RuntimeException failure = lastDrawFailure;
        final RenderFailureListener listener = renderFailureListener;
        if (failure == null || listener == null || !renderFailureDispatched.compareAndSet(false, true)) return;
        try {
            listener.onRenderFailure(failure);
        } catch (RuntimeException | Error callbackFailure) {
            if (callbackFailure != failure) failure.addSuppressed(callbackFailure);
        }
    }

    private void drawViewFrame(Canvas canvas, View currentView) {
        float previewWidth = Math.max(1, getPreviewWidth());
        float previewHeight = Math.max(1, getPreviewHeight());
        float viewWidth = currentView.getWidth();
        float viewHeight = currentView.getHeight();
        if (viewWidth <= 0f || viewHeight <= 0f) return;

        PointF spritePosition = sprite.getTranslation();
        PointF spriteScale = sprite.getScale();
        float positionX = previewWidth * spritePosition.x / 100f;
        float positionY = previewHeight * spritePosition.y / 100f;
        float scaleFactorX = 100f * viewWidth / previewWidth;
        float scaleFactorY = 100f * viewHeight / previewHeight;
        if (scaleFactorX <= 0f || scaleFactorY <= 0f) return;
        float scaleX = spriteScale.x / scaleFactorX;
        float scaleY = spriteScale.y / scaleFactorY;

        canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR);
        canvas.translate(positionX, positionY);
        canvas.scale(scaleX, scaleY);
        canvas.rotate(-sprite.getRotation(), viewWidth / 2f, viewHeight / 2f);
        currentView.draw(canvas);
    }

    private static Throwable append(Throwable first, Throwable next) {
        if (next == null) return first;
        if (first == null) return next;
        if (first != next) first.addSuppressed(next);
        return first;
    }
}
