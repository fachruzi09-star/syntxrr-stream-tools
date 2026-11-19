package com.syntxrr.streamtools;

/**
 * Serializes StudioOverlayView drawing with native asset disposal.
 * A render pass already in progress must finish before Bitmap/decoder resources are released.
 */
final class ModeBOverlayRenderGuard {
    private final Object lock = new Object();
    private boolean released;

    boolean runWhileActive(Runnable renderPass) {
        if (renderPass == null) return false;
        synchronized (lock) {
            if (released) return false;
            renderPass.run();
            return true;
        }
    }

    void release(Runnable disposer) {
        synchronized (lock) {
            if (released) return;
            released = true;
            if (disposer != null) disposer.run();
        }
    }

    boolean isReleased() {
        synchronized (lock) {
            return released;
        }
    }
}
