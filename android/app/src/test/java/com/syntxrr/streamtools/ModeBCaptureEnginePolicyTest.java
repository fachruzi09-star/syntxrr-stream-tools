package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public final class ModeBCaptureEnginePolicyTest {
    private ModeBScreenCaptureLayerSpec spec(boolean enabled, float x, float y, float width, float height,
                                              int rotation, float opacity, boolean grouped) {
        return new ModeBScreenCaptureLayerSpec(enabled, x, y, width, height,
                rotation, opacity, 0f, "fit", grouped);
    }

    @Test public void fullCanvasUngroupedUnmodifiedCaptureUsesDirectSource() {
        assertEquals(ModeBCaptureEnginePolicy.Engine.DIRECT_SCREEN_SOURCE,
                ModeBCaptureEnginePolicy.resolve(spec(true, 0f, 0f, 100f, 100f, 0, 100f, false), false));
    }

    @Test public void presetBackgroundUsesCompatibilityObjectLayer() {
        assertEquals(ModeBCaptureEnginePolicy.Engine.COMPATIBILITY_OBJECT_LAYER,
                ModeBCaptureEnginePolicy.resolve(spec(true, 0f, 0f, 100f, 100f, 0, 100f, false), true));
    }

    @Test public void groupedScreenCaptureUsesCompatibilityObjectLayer() {
        assertEquals(ModeBCaptureEnginePolicy.Engine.COMPATIBILITY_OBJECT_LAYER,
                ModeBCaptureEnginePolicy.resolve(spec(true, 0f, 0f, 100f, 100f, 0, 100f, true), false));
    }

    @Test public void transformedCaptureUsesCompatibilityObjectLayer() {
        assertEquals(ModeBCaptureEnginePolicy.Engine.COMPATIBILITY_OBJECT_LAYER,
                ModeBCaptureEnginePolicy.resolve(spec(true, 10f, 5f, 80f, 90f, 0, 100f, false), false));
    }

    @Test public void quarterTurnCaptureUsesCompatibilityObjectLayer() {
        assertEquals(ModeBCaptureEnginePolicy.Engine.COMPATIBILITY_OBJECT_LAYER,
                ModeBCaptureEnginePolicy.resolve(spec(true, 0f, 0f, 100f, 100f, 90, 100f, false), false));
    }

    @Test public void partialOpacityUsesCompatibilityObjectLayer() {
        assertEquals(ModeBCaptureEnginePolicy.Engine.COMPATIBILITY_OBJECT_LAYER,
                ModeBCaptureEnginePolicy.resolve(spec(true, 0f, 0f, 100f, 100f, 0, 50f, false), false));
    }

    @Test public void disabledCaptureUsesNoCaptureEngine() {
        assertEquals(ModeBCaptureEnginePolicy.Engine.NONE,
                ModeBCaptureEnginePolicy.resolve(spec(false, 0f, 0f, 100f, 100f, 0, 0f, false), false));
    }
}
