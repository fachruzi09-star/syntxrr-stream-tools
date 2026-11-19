package com.syntxrr.streamtools;

import java.util.concurrent.atomic.AtomicReference;

/**
 * SYNTXRR-owned retirable view filter with one-shot output readiness and release notifications.
 */
final class ModeBSceneReplacementFilter extends ModeBRetirableViewFilterRender {
    private final ModeBSceneReplacementFence outputFence = new ModeBSceneReplacementFence();
    private final ModeBFilterReleaseGuard releaseGuard = new ModeBFilterReleaseGuard();
    private final AtomicReference<Runnable> releasedListener = new AtomicReference<>();

    void setNextOutputFrameListener(Runnable listener) {
        if (listener == null) outputFence.disarm();
        else outputFence.arm(listener);
    }

    void setOnReleasedListener(Runnable listener) {
        releasedListener.set(listener);
        dispatchReleasedListenerIfReady();
    }

    private void dispatchReleasedListenerIfReady() {
        if (!releaseGuard.isReleaseCompleted()) return;
        Runnable listener = releasedListener.getAndSet(null);
        if (listener != null) listener.run();
    }

    @Override
    public void draw() {
        long frameGeneration = outputFence.beginOutputFrame();
        super.draw();
        // Count only a distinct source frame latched from this filter's SurfaceTexture. RootEncoder
        // may redraw the compositor many times while the View worker has not posted a new frame.
        outputFence.onOutputFrameDrawn(frameGeneration, consumeFreshInputFrameForOutputFence());
    }

    @Override
    public void release() {
        // The renderer's release() interrupts and joins its private draw worker before it touches
        // the Surface/SurfaceTexture. One bounded retry covers a transient interrupted wait.
        if (releaseGuard.beginRelease()) {
            RuntimeException firstFailure = null;
            for (int attempt = 0; attempt < 2; attempt++) {
                try {
                    super.release();
                    releaseGuard.markReleaseCompleted();
                    firstFailure = null;
                    break;
                } catch (RuntimeException failure) {
                    if (firstFailure == null) firstFailure = failure;
                    else if (firstFailure != failure) firstFailure.addSuppressed(failure);
                    releaseGuard.markReleaseFailed();
                    if (attempt == 0 && releaseGuard.beginRelease()) continue;
                    throw firstFailure;
                } catch (Error failure) {
                    releaseGuard.markReleaseFailed();
                    throw failure;
                }
            }
        }
        dispatchReleasedListenerIfReady();
    }
}
