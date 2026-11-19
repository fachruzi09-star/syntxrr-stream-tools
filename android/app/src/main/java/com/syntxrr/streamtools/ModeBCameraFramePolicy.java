package com.syntxrr.streamtools;

/** Platform-independent camera frame bounds and Camera2 preview-frame orientation. */
final class ModeBCameraFramePolicy {
    private ModeBCameraFramePolicy() { }

    static boolean isSafeCaptureSize(int width, int height, int maxEdge, long maxPixels) {
        if (width <= 0 || height <= 0 || maxEdge <= 0 || maxPixels <= 0L) return false;
        if (width > maxEdge || height > maxEdge) return false;
        return (long) width * (long) height <= maxPixels;
    }

    static int calculatePreviewRotation(int sensorOrientation, int displayRotation, boolean frontFacing) {
        int sensor = normalizeRotation(sensorOrientation);
        int display = normalizeRotation(displayRotation);
        return normalizeRotation(sensor + (frontFacing ? -display : display));
    }

    static int normalizeRotation(int degrees) {
        int normalized = ((degrees % 360) + 360) % 360;
        return normalized == 90 || normalized == 180 || normalized == 270 ? normalized : 0;
    }
}
