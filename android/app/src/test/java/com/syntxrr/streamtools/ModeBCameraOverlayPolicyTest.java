package com.syntxrr.streamtools;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ModeBCameraOverlayPolicyTest {
    @Test public void visibleCameraRequiresPermission() {
        assertTrue(ModeBStreamPolicy.requiresCameraPermission("camera", true));
        assertTrue(ModeBStreamPolicy.requiresCameraPermission("CAMERA", true));
    }

    @Test public void hiddenCameraDoesNotRequirePermission() {
        assertFalse(ModeBStreamPolicy.requiresCameraPermission("camera", false));
    }

    @Test public void nonCameraLayersDoNotRequirePermission() {
        assertFalse(ModeBStreamPolicy.requiresCameraPermission("text", true));
        assertFalse(ModeBStreamPolicy.requiresCameraPermission("video", true));
    }

    @Test public void nullLayerTypeDoesNotRequirePermission() {
        assertFalse(ModeBStreamPolicy.requiresCameraPermission(null, true));
    }
}
