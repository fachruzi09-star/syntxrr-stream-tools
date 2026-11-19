package com.syntxrr.streamtools;

/**
 * One safely published scene opacity shared by the background and overlay filters.
 * RootEncoder's MainRender invokes its filters sequentially on the same GL render pass;
 * the background filter is inserted before its matching overlay filter. The first layer
 * captures opacity for that output pass and the overlay reuses exactly that value.
 */
final class ModeBSceneLayerOpacityState {
    static final int ROLE_SINGLE = 0;
    static final int ROLE_BACKGROUND = 1;
    static final int ROLE_OVERLAY = 2;

    private volatile float opacity;
    private float outputFrameOpacity = 1f;
    private boolean backgroundSnapshotPending;

    ModeBSceneLayerOpacityState() {
        this(1f);
    }

    ModeBSceneLayerOpacityState(float initialOpacity) {
        set(initialOpacity);
    }

    void set(float nextOpacity) {
        if (Float.isNaN(nextOpacity) || Float.isInfinite(nextOpacity)) return;
        opacity = Math.max(0f, Math.min(1f, nextOpacity));
    }

    float snapshot() {
        return opacity;
    }

    /**
     * Called only from the GL render thread. A background draw starts a compositor-pass
     * snapshot; the matching overlay draw consumes it. If the overlay was skipped after a
     * failed background draw, the next background call replaces the stale snapshot.
     */
    synchronized float snapshotForOutputLayer(int role) {
        if (role == ROLE_BACKGROUND) {
            outputFrameOpacity = opacity;
            backgroundSnapshotPending = true;
            return outputFrameOpacity;
        }
        if (role == ROLE_OVERLAY && backgroundSnapshotPending) {
            backgroundSnapshotPending = false;
            return outputFrameOpacity;
        }
        return opacity;
    }
}
