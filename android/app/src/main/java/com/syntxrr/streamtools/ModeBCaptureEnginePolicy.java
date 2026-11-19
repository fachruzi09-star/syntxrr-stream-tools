package com.syntxrr.streamtools;

/** Chooses the capture path before consuming the one-shot MediaProjection token. */
final class ModeBCaptureEnginePolicy {
    enum Engine { NONE, DIRECT_SCREEN_SOURCE, COMPATIBILITY_OBJECT_LAYER }

    private static final float EPSILON = 0.01f;

    private ModeBCaptureEnginePolicy() { }

    static Engine resolve(ModeBScreenCaptureLayerSpec spec, boolean hasBackgroundAsset) {
        if (spec == null || !spec.enabled || spec.opacity <= 0f) return Engine.NONE;
        if (hasBackgroundAsset || spec.grouped || spec.rotation != 0 || spec.opacity < 99.99f) {
            return Engine.COMPATIBILITY_OBJECT_LAYER;
        }
        if (Math.abs(spec.x) > EPSILON || Math.abs(spec.y) > EPSILON
                || Math.abs(spec.width - 100f) > EPSILON || Math.abs(spec.height - 100f) > EPSILON) {
            return Engine.COMPATIBILITY_OBJECT_LAYER;
        }
        return Engine.DIRECT_SCREEN_SOURCE;
    }
}
