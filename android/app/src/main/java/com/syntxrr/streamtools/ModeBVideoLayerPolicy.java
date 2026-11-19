package com.syntxrr.streamtools;

/**
 * Admission policy for native MP4 overlay decoding.
 * A decoder is only useful when its element can contribute visible pixels to the canvas.
 * Visibility=false is filtered by StudioOverlayView before this policy is consulted.
 */
final class ModeBVideoLayerPolicy {
    private ModeBVideoLayerPolicy() { }

    static boolean shouldDecode(float x, float y, float width, float height, float opacity) {
        return isFinite(x) && isFinite(y) && isFinite(width) && isFinite(height) && isFinite(opacity)
                && x >= 0f && x < 100f
                && y >= 0f && y < 100f
                && width > 0f && height > 0f
                && opacity > 0f;
    }

    private static boolean isFinite(float value) {
        return !Float.isNaN(value) && !Float.isInfinite(value);
    }
}
