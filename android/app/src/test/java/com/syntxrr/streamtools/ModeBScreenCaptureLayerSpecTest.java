package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBScreenCaptureLayerSpecTest {
    @Test public void normalizesBoundsRotationAndOpacity() {
        ModeBScreenCaptureLayerSpec spec = new ModeBScreenCaptureLayerSpec(
                true, -10f, 120f, 160f, 0f, -90, 130f, 3f, "fit", false);
        assertEquals(0f, spec.x, 0f);
        assertEquals(100f, spec.y, 0f);
        assertEquals(100f, spec.width, 0f);
        assertEquals(1f, spec.height, 0f);
        assertEquals(270, spec.rotation);
        assertEquals(100f, spec.opacity, 0f);
        assertEquals("fit", spec.cropMode);
    }

    @Test public void fullFrameDefaultsRemainEnabled() {
        ModeBScreenCaptureLayerSpec spec = ModeBScreenCaptureLayerSpec.fullFrame();
        assertTrue(spec.enabled);
        assertEquals(0f, spec.x, 0f);
        assertEquals(0f, spec.y, 0f);
        assertEquals(100f, spec.width, 0f);
        assertEquals(100f, spec.height, 0f);
        assertEquals(100f, spec.opacity, 0f);
    }

    @Test public void disabledSpecDoesNotRenderCapture() {
        ModeBScreenCaptureLayerSpec spec = ModeBScreenCaptureLayerSpec.disabled();
        assertFalse(spec.enabled);
        assertEquals(0f, spec.opacity, 0f);
    }

    @Test public void acceptsOnlyQuarterTurnRotationForCurrentSpriteRenderer() {
        assertEquals(270, ModeBScreenCaptureLayerSpec.normalizeRotation(-90));
        assertTrue(ModeBScreenCaptureLayerSpec.isSupportedQuarterTurn(0));
        assertTrue(ModeBScreenCaptureLayerSpec.isSupportedQuarterTurn(90));
        assertTrue(ModeBScreenCaptureLayerSpec.isSupportedQuarterTurn(180));
        assertTrue(ModeBScreenCaptureLayerSpec.isSupportedQuarterTurn(270));
        assertFalse(ModeBScreenCaptureLayerSpec.isSupportedQuarterTurn(45));
        assertFalse(ModeBScreenCaptureLayerSpec.isSupportedQuarterTurn(359));
        assertThrows(IllegalArgumentException.class, () -> new ModeBScreenCaptureLayerSpec(
                true, 0f, 0f, 100f, 100f, 45, 100f, 1f, "fit", false));
    }
}
