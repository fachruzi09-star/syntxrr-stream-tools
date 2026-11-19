package com.syntxrr.streamtools;

import java.nio.ByteBuffer;

/**
 * Converts Camera2 YUV_420_888 planes to a bounded ARGB frame.
 * Plane row/pixel strides and crop rectangles are honored; no JPEG encode/decode is used.
 */
final class ModeBCameraYuvConverter {
    private ModeBCameraYuvConverter() { }

    static int[] toArgb(
            ByteBuffer yBuffer, int yRowStride, int yPixelStride,
            ByteBuffer uBuffer, int uRowStride, int uPixelStride,
            ByteBuffer vBuffer, int vRowStride, int vPixelStride,
            int frameWidth, int frameHeight,
            int cropLeft, int cropTop, int cropWidth, int cropHeight,
            int outputWidth, int outputHeight, long maxOutputPixels) {
        return toArgb(yBuffer, yRowStride, yPixelStride,
                uBuffer, uRowStride, uPixelStride,
                vBuffer, vRowStride, vPixelStride,
                frameWidth, frameHeight, cropLeft, cropTop, cropWidth, cropHeight,
                outputWidth, outputHeight, maxOutputPixels, null);
    }

    /**
     * Converts into a caller-owned reusable ARGB array when its capacity is sufficient.
     * Only the active output area is overwritten; callers must use outputWidth/outputHeight
     * when creating the Bitmap. The buffer is safe to reuse only while conversion is serialized.
     */
    static int[] toArgb(
            ByteBuffer yBuffer, int yRowStride, int yPixelStride,
            ByteBuffer uBuffer, int uRowStride, int uPixelStride,
            ByteBuffer vBuffer, int vRowStride, int vPixelStride,
            int frameWidth, int frameHeight,
            int cropLeft, int cropTop, int cropWidth, int cropHeight,
            int outputWidth, int outputHeight, long maxOutputPixels, int[] reusablePixels) {
        if (yBuffer == null || uBuffer == null || vBuffer == null) return null;
        if (frameWidth <= 0 || frameHeight <= 0 || cropLeft < 0 || cropTop < 0
                || cropWidth <= 0 || cropHeight <= 0 || outputWidth <= 0 || outputHeight <= 0
                || cropLeft + (long) cropWidth > frameWidth
                || cropTop + (long) cropHeight > frameHeight
                || yRowStride <= 0 || yPixelStride <= 0 || uRowStride <= 0
                || uPixelStride <= 0 || vRowStride <= 0 || vPixelStride <= 0
                || maxOutputPixels <= 0L
                || (long) outputWidth * outputHeight > maxOutputPixels
                || (long) outputWidth * outputHeight > Integer.MAX_VALUE) return null;

        ByteBuffer y = yBuffer.duplicate();
        ByteBuffer u = uBuffer.duplicate();
        ByteBuffer v = vBuffer.duplicate();
        final int yBase = y.position();
        final int uBase = u.position();
        final int vBase = v.position();
        final int requiredPixels = outputWidth * outputHeight;
        final int[] pixels = reusablePixels != null && reusablePixels.length >= requiredPixels
                ? reusablePixels : new int[requiredPixels];

        try {
            for (int outY = 0; outY < outputHeight; outY++) {
                int sourceY = cropTop + Math.min(cropHeight - 1,
                        (int) ((long) outY * cropHeight / outputHeight));
                int yRow = yBase + sourceY * yRowStride;
                int chromaRow = uBase + (sourceY >> 1) * uRowStride;
                int vChromaRow = vBase + (sourceY >> 1) * vRowStride;
                for (int outX = 0; outX < outputWidth; outX++) {
                    int sourceX = cropLeft + Math.min(cropWidth - 1,
                            (int) ((long) outX * cropWidth / outputWidth));
                    int yIndex = yRow + sourceX * yPixelStride;
                    int chromaX = sourceX >> 1;
                    int uIndex = chromaRow + chromaX * uPixelStride;
                    int vIndex = vChromaRow + chromaX * vPixelStride;
                    if (yIndex < yBase || yIndex >= y.limit()
                            || uIndex < uBase || uIndex >= u.limit()
                            || vIndex < vBase || vIndex >= v.limit()) return null;

                    int luminance = y.get(yIndex) & 0xFF;
                    int blueDifference = (u.get(uIndex) & 0xFF) - 128;
                    int redDifference = (v.get(vIndex) & 0xFF) - 128;
                    // Android documents the YUV_420_888 conversion as JFIF / Rec.601 full range.
                    int red = clamp((int) Math.round(luminance + 1.402d * redDifference));
                    int green = clamp((int) Math.round(luminance - 0.344136d * blueDifference
                            - 0.714136d * redDifference));
                    int blue = clamp((int) Math.round(luminance + 1.772d * blueDifference));
                    pixels[outY * outputWidth + outX] = 0xFF000000 | (red << 16) | (green << 8) | blue;
                }
            }
        } catch (IndexOutOfBoundsException exception) {
            return null;
        }
        return pixels;
    }

    private static int clamp(int value) {
        return value < 0 ? 0 : Math.min(value, 255);
    }
}
