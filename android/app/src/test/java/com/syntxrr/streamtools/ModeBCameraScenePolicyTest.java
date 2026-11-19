package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class ModeBCameraScenePolicyTest {
    @Test public void noCameraSceneMayReplaceNoCameraScene() {
        assertEquals(ModeBCameraScenePolicy.Decision.NONE,
                ModeBCameraScenePolicy.evaluate(false, false, false,
                        new ModeBCameraScenePolicy.Spec(false, false, false)));
    }

    @Test public void sameFacingCameraReusesExistingOwner() {
        assertEquals(ModeBCameraScenePolicy.Decision.REUSE_OWNER,
                ModeBCameraScenePolicy.evaluate(true, true, true,
                        new ModeBCameraScenePolicy.Spec(true, true, false)));
    }

    @Test public void sceneMayRemoveCameraAfterOldFilterRetires() {
        assertEquals(ModeBCameraScenePolicy.Decision.REMOVE_OWNER,
                ModeBCameraScenePolicy.evaluate(true, false, true,
                        new ModeBCameraScenePolicy.Spec(false, false, false)));
    }

    @Test public void addingCameraToSessionThatStartedWithoutCameraIsRejected() {
        assertEquals(ModeBCameraScenePolicy.Decision.REJECT,
                ModeBCameraScenePolicy.evaluate(false, false, false,
                        new ModeBCameraScenePolicy.Spec(true, true, false)));
    }

    @Test public void changingFacingIsRejected() {
        assertEquals(ModeBCameraScenePolicy.Decision.REJECT,
                ModeBCameraScenePolicy.evaluate(true, true, true,
                        new ModeBCameraScenePolicy.Spec(true, false, false)));
    }

    @Test public void missingCameraOwnerIsRejected() {
        assertEquals(ModeBCameraScenePolicy.Decision.REJECT,
                ModeBCameraScenePolicy.evaluate(true, true, false,
                        new ModeBCameraScenePolicy.Spec(true, true, false)));
    }

    @Test public void conflictingFacingElementsAreRejected() {
        assertEquals(ModeBCameraScenePolicy.Decision.REJECT,
                ModeBCameraScenePolicy.evaluate(true, true, true,
                        new ModeBCameraScenePolicy.Spec(true, true, true)));
    }
    @Test public void inspectReadsFrontFacingFromVisibleCameraElement() throws Exception {
        org.json.JSONObject camera = new org.json.JSONObject()
                .put("type", "camera").put("visible", true)
                .put("width", 50).put("height", 40).put("opacity", 100)
                .put("properties", new org.json.JSONObject().put("facingMode", "user"));
        ModeBCameraScenePolicy.Spec spec = ModeBCameraScenePolicy.inspect(
                new org.json.JSONArray().put(camera));
        assertEquals(true, spec.hasCamera);
        assertEquals(true, spec.frontFacing);
        assertEquals(false, spec.conflictingFacing);
    }

    @Test public void inspectDetectsMixedVisibleCameraFacings() throws Exception {
        org.json.JSONObject front = new org.json.JSONObject()
                .put("type", "camera").put("visible", true).put("width", 40).put("height", 40)
                .put("properties", new org.json.JSONObject().put("facingMode", "user"));
        org.json.JSONObject back = new org.json.JSONObject()
                .put("type", "camera").put("visible", true).put("width", 40).put("height", 40)
                .put("properties", new org.json.JSONObject().put("facingMode", "environment"));
        ModeBCameraScenePolicy.Spec spec = ModeBCameraScenePolicy.inspect(
                new org.json.JSONArray().put(front).put(back));
        assertEquals(true, spec.conflictingFacing);
    }

}
