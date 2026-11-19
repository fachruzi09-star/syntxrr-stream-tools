package com.syntxrr.streamtools;

import org.json.JSONException;
import org.json.JSONObject;

/** Bounded canvas geometry for the dedicated MediaProjection layer in Mode B. */
final class ModeBScreenCaptureLayerSpec {
    final boolean enabled;
    final float x;
    final float y;
    final float width;
    final float height;
    final int rotation;
    final float opacity;
    final float layer;
    final String cropMode;
    final boolean grouped;

    ModeBScreenCaptureLayerSpec(boolean enabled, float x, float y, float width, float height,
                                int rotation, float opacity, float layer, String cropMode, boolean grouped) {
        this.enabled = enabled;
        this.x = clamp(x, 0f, 100f, 0f);
        this.y = clamp(y, 0f, 100f, 0f);
        this.width = clamp(width, 1f, 100f, 100f);
        this.height = clamp(height, 1f, 100f, 100f);
        this.rotation = normalizeRotation(rotation);
        if (!isSupportedQuarterTurn(this.rotation)) {
            throw new IllegalArgumentException("Rotasi Tangkapan Layar Mode B saat ini hanya mendukung 0°, 90°, 180°, atau 270°.");
        }
        this.opacity = clamp(opacity, 0f, 100f, 100f);
        this.layer = Float.isFinite(layer) ? layer : 0f;
        this.cropMode = "fit".equals(cropMode) ? cropMode : "fit";
        this.grouped = grouped;
    }

    static ModeBScreenCaptureLayerSpec fullFrame() {
        return new ModeBScreenCaptureLayerSpec(true, 0f, 0f, 100f, 100f, 0, 100f,
                Float.NEGATIVE_INFINITY, "fit", false);
    }

    static ModeBScreenCaptureLayerSpec disabled() {
        return new ModeBScreenCaptureLayerSpec(false, 0f, 0f, 100f, 100f, 0, 0f,
                Float.POSITIVE_INFINITY, "fit", false);
    }

    boolean hasSameConfiguration(ModeBScreenCaptureLayerSpec other) {
        if (other == null) return false;
        return enabled == other.enabled
                && Float.compare(x, other.x) == 0
                && Float.compare(y, other.y) == 0
                && Float.compare(width, other.width) == 0
                && Float.compare(height, other.height) == 0
                && rotation == other.rotation
                && Float.compare(opacity, other.opacity) == 0
                && Float.compare(layer, other.layer) == 0
                && cropMode.equals(other.cropMode)
                && grouped == other.grouped;
    }

    static ModeBScreenCaptureLayerSpec fromJson(String json) {
        if (json == null || json.trim().isEmpty()) return fullFrame();
        try {
            JSONObject object = new JSONObject(json);
            boolean enabled = object.optBoolean("enabled", true);
            String cropMode = object.optString("cropMode", "fit");
            if (!"fit".equals(cropMode)) {
                throw new IllegalArgumentException("Crop Mode Tangkapan Layar Mode B hanya mendukung Fit.");
            }
            return new ModeBScreenCaptureLayerSpec(
                    enabled,
                    finite(object.optDouble("x", 0d), 0f),
                    finite(object.optDouble("y", 0d), 0f),
                    finite(object.optDouble("width", 100d), 100f),
                    finite(object.optDouble("height", 100d), 100f),
                    object.optInt("rotation", 0),
                    finite(object.optDouble("opacity", 100d), 100f),
                    finite(object.optDouble("layer", 0d), 0f),
                    cropMode,
                    object.optBoolean("grouped", false)
            );
        } catch (JSONException exception) {
            throw new IllegalArgumentException("Konfigurasi layer Tangkapan Layar Mode B tidak valid.", exception);
        }
    }

    static int normalizeRotation(int value) {
        return ((value % 360) + 360) % 360;
    }

    static boolean isSupportedQuarterTurn(int normalizedDegrees) {
        return normalizedDegrees == 0 || normalizedDegrees == 90
                || normalizedDegrees == 180 || normalizedDegrees == 270;
    }

    private static float finite(double value, float fallback) {
        return Double.isFinite(value) ? (float) value : fallback;
    }

    private static float clamp(float value, float min, float max, float fallback) {
        return Float.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    }
}
