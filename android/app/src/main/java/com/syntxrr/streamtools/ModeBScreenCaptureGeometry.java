package com.syntxrr.streamtools;

/**
 * Maps a Studio screen-capture rectangle to RootEncoder 2.8.1 object-filter coordinates.
 *
 * RootEncoder's Sprite transforms object texture coordinates attached to a full-screen quad, and
 * the fragment shader samples the object at those transformed coordinates. The visible source is
 * therefore mapped through the inverse transform: a positive Sprite angle appears counterclockwise
 * on the output because its unrotated top-left sample is (0, 0). Studio/CSS positive angles are
 * clockwise, so the native Sprite angle uses the opposite sign. Quarter turns keep the fitted
 * region axis-aligned; arbitrary angles are rejected until a pixel-aspect-correct renderer can
 * preserve Studio's rotated bounds on non-square canvases.
 */
final class ModeBScreenCaptureGeometry {
    static final class Result {
        final float scaleXPercent;
        final float scaleYPercent;
        final float positionXPercent;
        final float positionYPercent;
        final int spriteRotation;
        final float fittedLeftPixels;
        final float fittedTopPixels;
        final float fittedWidthPixels;
        final float fittedHeightPixels;

        Result(float scaleXPercent, float scaleYPercent,
               float positionXPercent, float positionYPercent, int spriteRotation,
               float fittedLeftPixels, float fittedTopPixels,
               float fittedWidthPixels, float fittedHeightPixels) {
            this.scaleXPercent = scaleXPercent;
            this.scaleYPercent = scaleYPercent;
            this.positionXPercent = positionXPercent;
            this.positionYPercent = positionYPercent;
            this.spriteRotation = spriteRotation;
            this.fittedLeftPixels = fittedLeftPixels;
            this.fittedTopPixels = fittedTopPixels;
            this.fittedWidthPixels = fittedWidthPixels;
            this.fittedHeightPixels = fittedHeightPixels;
        }
    }

    private ModeBScreenCaptureGeometry() { }

    static Result fit(int canvasWidth, int canvasHeight, ModeBScreenCaptureLayerSpec spec) {
        if (canvasWidth <= 0 || canvasHeight <= 0 || spec == null) {
            throw new IllegalArgumentException("Ukuran canvas dan spesifikasi Tangkapan Layar harus valid.");
        }
        if (!spec.enabled || spec.opacity <= 0f) {
            throw new IllegalArgumentException("Layer Tangkapan Layar tidak aktif.");
        }

        float boxWidth = canvasWidth * spec.width / 100f;
        float boxHeight = canvasHeight * spec.height / 100f;
        float boxLeft = canvasWidth * spec.x / 100f;
        float boxTop = canvasHeight * spec.y / 100f;
        float sourceAspect = (spec.rotation == 90 || spec.rotation == 270)
                ? canvasHeight / (float) canvasWidth
                : canvasWidth / (float) canvasHeight;
        float targetAspect = boxWidth / Math.max(1f, boxHeight);

        float fittedWidth = boxWidth;
        float fittedHeight = boxHeight;
        if (sourceAspect > targetAspect) {
            fittedHeight = boxWidth / sourceAspect;
        } else {
            fittedWidth = boxHeight * sourceAspect;
        }
        float fittedLeft = boxLeft + (boxWidth - fittedWidth) / 2f;
        float fittedTop = boxTop + (boxHeight - fittedHeight) / 2f;

        // The object filter maps its texture UVs into this final axis-aligned rectangle. For
        // 90/270 degrees, the source aspect is inverted before Fit; the rectangle itself still
        // uses the fitted output width/height percentages (not the pre-rotation input axes).
        float scaleX = fittedWidth / canvasWidth * 100f;
        float scaleY = fittedHeight / canvasHeight * 100f;
        float positionX = fittedLeft / canvasWidth * 100f;
        float positionY = fittedTop / canvasHeight * 100f;

        // Sprite rotates object UV coordinates and the shader samples through that mapping.
        // This is an inverse visual transform: a positive Sprite angle is counterclockwise on the
        // output, while Studio/CSS positive angles are clockwise.
        int spriteRotation = ModeBScreenCaptureLayerSpec.normalizeRotation(-spec.rotation);
        return new Result(scaleX, scaleY, positionX, positionY, spriteRotation,
                fittedLeft, fittedTop, fittedWidth, fittedHeight);
    }
}
