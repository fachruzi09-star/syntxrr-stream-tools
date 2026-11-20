package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.Arrays;
import static org.junit.Assert.*;

public class ModeBLiveScenePolicyTest {
    @Test public void acceptsSupportedStaticOverlayTypes() {
        assertTrue(ModeBLiveScenePolicy.supportsStaticOverlayTypes(Arrays.asList(
                "text", "shape", "separator", "running_text", "counter", "event_feed", "progress_bar")));
    }

    @Test public void acceptsImageStickerVideoAndCameraWithSceneAssetNamespaces() {
        assertTrue(ModeBLiveScenePolicy.supportsStaticOverlayTypes(Arrays.asList("text", "image")));
        assertTrue(ModeBLiveScenePolicy.supportsStaticOverlayTypes(Arrays.asList("video")));
        assertTrue(ModeBLiveScenePolicy.supportsStaticOverlayTypes(Arrays.asList("sticker")));
        // Camera2 passes this type gate only; physical lens ownership is verified separately.
        assertTrue(ModeBLiveScenePolicy.supportsStaticOverlayTypes(Arrays.asList("camera")));
    }

    @Test public void rejectsUnknownTypesAndNullInput() {
        assertFalse(ModeBLiveScenePolicy.supportsStaticOverlayTypes(Arrays.asList("text", "browser_source")));
        assertFalse(ModeBLiveScenePolicy.supportsStaticOverlayTypes(null));
        assertFalse(ModeBLiveScenePolicy.supportsStaticOverlayType(null));
    }

    @Test public void allowsEmptyOverlayScene() {
        assertTrue(ModeBLiveScenePolicy.supportsStaticOverlayTypes(java.util.Collections.<String>emptyList()));
    }
}
