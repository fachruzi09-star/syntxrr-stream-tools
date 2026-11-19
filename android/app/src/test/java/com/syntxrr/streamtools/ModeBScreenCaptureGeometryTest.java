package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

public final class ModeBScreenCaptureGeometryTest {
    private static ModeBScreenCaptureLayerSpec spec(float x, float y, float width, float height, int rotation) {
        return new ModeBScreenCaptureLayerSpec(true, x, y, width, height, rotation, 100f, 1f, "fit", false);
    }

    // Mirrors Sprite's normalized object-UV transform and the fragment shader's inverse
    // sampling map: output position = position + scale * R(-spriteRotation) * (sourceUV - center) + center.
    // The output top-left vertex is bound to source UV (0, 0), so a positive Sprite angle is
    // counterclockwise visually; native uses the inverse of Studio's clockwise-positive angle.
    private static float[] mapSourceUvToOutput(ModeBScreenCaptureGeometry.Result result,
                                                float sourceU, float sourceV) {
        double radians = Math.toRadians(-result.spriteRotation);
        float dx = sourceU - 0.5f;
        float dy = sourceV - 0.5f;
        float rotatedX = (float) (dx * Math.cos(radians) - dy * Math.sin(radians));
        float rotatedY = (float) (dx * Math.sin(radians) + dy * Math.cos(radians));
        return new float[] {
                result.positionXPercent + result.scaleXPercent * (0.5f + rotatedX),
                result.positionYPercent + result.scaleYPercent * (0.5f + rotatedY)
        };
    }

    @Test
    public void unrotatedFitKeepsStudioBounds() {
        ModeBScreenCaptureGeometry.Result result = ModeBScreenCaptureGeometry.fit(
                1280, 720, spec(10f, 20f, 40f, 40f, 0));
        assertEquals(40f, result.scaleXPercent, 0.001f);
        assertEquals(40f, result.scaleYPercent, 0.001f);
        assertEquals(10f, result.positionXPercent, 0.001f);
        assertEquals(20f, result.positionYPercent, 0.001f);
        assertEquals(0, result.spriteRotation);
        assertEquals(512f, result.fittedWidthPixels, 0.01f);
        assertEquals(288f, result.fittedHeightPixels, 0.01f);
    }

    @Test
    public void clockwiseQuarterTurnFitsPortraitContentInsideLandscapeCanvas() {
        ModeBScreenCaptureGeometry.Result result = ModeBScreenCaptureGeometry.fit(
                1280, 720, spec(0f, 0f, 100f, 100f, 90));
        assertEquals(31.640625f, result.scaleXPercent, 0.001f);
        assertEquals(100f, result.scaleYPercent, 0.001f);
        assertEquals(34.179688f, result.positionXPercent, 0.01f);
        assertEquals(0f, result.positionYPercent, 0.001f);
        assertEquals(270, result.spriteRotation);
        assertEquals(405f, 1280f * result.scaleXPercent / 100f, 0.01f);
        assertEquals(720f, 720f * result.scaleYPercent / 100f, 0.01f);
    }

    @Test
    public void quarterTurnKeepsTheCaptureRectangleAtItsStudioPosition() {
        ModeBScreenCaptureGeometry.Result result = ModeBScreenCaptureGeometry.fit(
                1280, 720, spec(0f, 0f, 50f, 50f, 90));
        assertEquals(result.fittedLeftPixels / 1280f * 100f, result.positionXPercent, 0.001f);
        assertEquals(result.fittedTopPixels / 720f * 100f, result.positionYPercent, 0.001f);
        assertEquals(result.fittedWidthPixels / 1280f * 100f, result.scaleXPercent, 0.001f);
        assertEquals(result.fittedHeightPixels / 720f * 100f, result.scaleYPercent, 0.001f);
    }

    @Test
    public void counterClockwiseQuarterTurnUsesInverseSpriteAngle() {
        ModeBScreenCaptureGeometry.Result result = ModeBScreenCaptureGeometry.fit(
                720, 1280, spec(20f, 10f, 40f, 70f, 270));
        assertEquals(90, result.spriteRotation);
        assertEquals(result.fittedWidthPixels / 720f * 100f, result.scaleXPercent, 0.001f);
        assertEquals(result.fittedHeightPixels / 1280f * 100f, result.scaleYPercent, 0.001f);
    }

    @Test
    public void halfTurnKeepsTheFittedRectangleInPlace() {
        ModeBScreenCaptureGeometry.Result result = ModeBScreenCaptureGeometry.fit(
                1280, 720, spec(10f, 20f, 30f, 40f, 180));
        assertEquals(180, result.spriteRotation);
        assertEquals(result.fittedLeftPixels / 1280f * 100f, result.positionXPercent, 0.001f);
        assertEquals(result.fittedTopPixels / 720f * 100f, result.positionYPercent, 0.001f);
    }

    @Test
    public void clockwiseStudioRotationMovesSourceTopLeftToOutputTopRight() {
        ModeBScreenCaptureGeometry.Result result = ModeBScreenCaptureGeometry.fit(
                1280, 720, spec(0f, 0f, 100f, 100f, 90));
        float[] mapped = mapSourceUvToOutput(result, 0f, 0f);
        assertEquals(result.positionXPercent + result.scaleXPercent, mapped[0], 0.001f);
        assertEquals(result.positionYPercent, mapped[1], 0.001f);
    }

    @Test
    public void counterClockwiseStudioRotationMovesSourceTopLeftToOutputBottomLeft() {
        ModeBScreenCaptureGeometry.Result result = ModeBScreenCaptureGeometry.fit(
                1280, 720, spec(0f, 0f, 100f, 100f, 270));
        float[] mapped = mapSourceUvToOutput(result, 0f, 0f);
        assertEquals(result.positionXPercent, mapped[0], 0.001f);
        assertEquals(result.positionYPercent + result.scaleYPercent, mapped[1], 0.001f);
    }

    @Test
    public void halfTurnMovesSourceTopLeftToOutputBottomRight() {
        ModeBScreenCaptureGeometry.Result result = ModeBScreenCaptureGeometry.fit(
                1280, 720, spec(0f, 0f, 100f, 100f, 180));
        float[] mapped = mapSourceUvToOutput(result, 0f, 0f);
        assertEquals(result.positionXPercent + result.scaleXPercent, mapped[0], 0.001f);
        assertEquals(result.positionYPercent + result.scaleYPercent, mapped[1], 0.001f);
    }

    @Test
    public void invalidCanvasDimensionsAreRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> ModeBScreenCaptureGeometry.fit(0, 720, spec(0f, 0f, 100f, 100f, 0)));
    }
}
