package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ModeBCameraFramePolicyTest {
    @Test public void acceptsOnlyCaptureSizesInsideBothEdgeAndPixelBudgets() {
        assertTrue(ModeBCameraFramePolicy.isSafeCaptureSize(1280, 720, 1280, 1280L * 720L));
        assertTrue(ModeBCameraFramePolicy.isSafeCaptureSize(720, 1280, 1280, 1280L * 720L));
        assertFalse(ModeBCameraFramePolicy.isSafeCaptureSize(1920, 1080, 1280, 1280L * 720L));
        assertFalse(ModeBCameraFramePolicy.isSafeCaptureSize(1280, 1280, 1280, 1280L * 720L));
    }

    @Test public void rejectsInvalidCaptureDimensions() {
        assertFalse(ModeBCameraFramePolicy.isSafeCaptureSize(0, 480, 1280, 1280L * 720L));
        assertFalse(ModeBCameraFramePolicy.isSafeCaptureSize(640, -1, 1280, 1280L * 720L));
    }

    @Test public void calculatesCamera2PreviewRotationForFrontAndBackLenses() {
        assertEquals(90, ModeBCameraFramePolicy.calculatePreviewRotation(90, 0, false));
        assertEquals(180, ModeBCameraFramePolicy.calculatePreviewRotation(90, 90, false));
        assertEquals(270, ModeBCameraFramePolicy.calculatePreviewRotation(270, 0, true));
        assertEquals(180, ModeBCameraFramePolicy.calculatePreviewRotation(270, 90, true));
    }

    @Test public void normalizesPreviewRotationForUnexpectedSensorValues() {
        assertEquals(0, ModeBCameraFramePolicy.calculatePreviewRotation(0, 45, false));
        assertEquals(270, ModeBCameraFramePolicy.calculatePreviewRotation(270, 0, true));
    }

    @Test public void computesEveryQuarterTurnForBothLensDirections() {
        assertEquals(90, ModeBCameraFramePolicy.calculatePreviewRotation(90, 0, false));
        assertEquals(180, ModeBCameraFramePolicy.calculatePreviewRotation(90, 90, false));
        assertEquals(270, ModeBCameraFramePolicy.calculatePreviewRotation(90, 180, false));
        assertEquals(0, ModeBCameraFramePolicy.calculatePreviewRotation(90, 270, false));
        assertEquals(270, ModeBCameraFramePolicy.calculatePreviewRotation(270, 0, true));
        assertEquals(180, ModeBCameraFramePolicy.calculatePreviewRotation(270, 90, true));
        assertEquals(90, ModeBCameraFramePolicy.calculatePreviewRotation(270, 180, true));
        assertEquals(0, ModeBCameraFramePolicy.calculatePreviewRotation(270, 270, true));
    }
    @Test public void updatesPreviewOrientationDuringAnActiveSession() {
        ModeBCameraRotationState back = new ModeBCameraRotationState(90, false, 0);
        assertEquals(90, back.getRotationDegrees());
        assertEquals(180, back.updateDisplayRotation(90));
        assertEquals(270, back.updateDisplayRotation(180));
        assertEquals(0, back.updateDisplayRotation(270));

        ModeBCameraRotationState front = new ModeBCameraRotationState(270, true, 0);
        assertEquals(270, front.getRotationDegrees());
        assertEquals(180, front.updateDisplayRotation(90));
        assertEquals(90, front.updateDisplayRotation(180));
        assertEquals(0, front.updateDisplayRotation(270));
    }

    @Test public void normalizesDisplayRotationWhenItChanges() {
        ModeBCameraRotationState state = new ModeBCameraRotationState(90, false, 45);
        assertEquals(90, state.getRotationDegrees());
        assertEquals(90, state.updateDisplayRotation(45));
    }

}

