package com.syntxrr.streamtools;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ModeBVideoLayerPolicyTest {
    @Test
    public void decodesVisibleLayerWithPositiveBoundsAndOpacity() {
        assertTrue(ModeBVideoLayerPolicy.shouldDecode(10f, 15f, 45f, 30f, 100f));
        assertTrue(ModeBVideoLayerPolicy.shouldDecode(99f, 99f, 1f, 1f, 1f));
    }

    @Test
    public void skipsTransparentLayerBeforeAllocatingDecoder() {
        assertFalse(ModeBVideoLayerPolicy.shouldDecode(10f, 15f, 45f, 30f, 0f));
    }

    @Test
    public void skipsZeroOrNegativeDimensions() {
        assertFalse(ModeBVideoLayerPolicy.shouldDecode(0f, 0f, 0f, 30f, 100f));
        assertFalse(ModeBVideoLayerPolicy.shouldDecode(0f, 0f, 30f, 0f, 100f));
        assertFalse(ModeBVideoLayerPolicy.shouldDecode(0f, 0f, -1f, 30f, 100f));
    }

    @Test
    public void skipsElementsWhoseOriginIsOutsideCanvas() {
        assertFalse(ModeBVideoLayerPolicy.shouldDecode(100f, 0f, 20f, 20f, 100f));
        assertFalse(ModeBVideoLayerPolicy.shouldDecode(0f, 100f, 20f, 20f, 100f));
    }

    @Test
    public void rejectsNonFiniteGeometryAndOpacity() {
        assertFalse(ModeBVideoLayerPolicy.shouldDecode(Float.NaN, 0f, 20f, 20f, 100f));
        assertFalse(ModeBVideoLayerPolicy.shouldDecode(0f, Float.POSITIVE_INFINITY, 20f, 20f, 100f));
        assertFalse(ModeBVideoLayerPolicy.shouldDecode(0f, 0f, 20f, 20f, Float.NaN));
    }
}
