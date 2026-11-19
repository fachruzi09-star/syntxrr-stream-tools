package com.syntxrr.streamtools;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Camera2 scene-switch policy. A Mode B session owns at most one physical camera.
 * A live swap may retain that owner only when both scenes request the same lens.
 */
final class ModeBCameraScenePolicy {
    enum Decision { NONE, REUSE_OWNER, REMOVE_OWNER, REJECT }

    static final class Spec {
        final boolean hasCamera;
        final boolean frontFacing;
        final boolean conflictingFacing;

        Spec(boolean hasCamera, boolean frontFacing, boolean conflictingFacing) {
            this.hasCamera = hasCamera;
            this.frontFacing = frontFacing;
            this.conflictingFacing = conflictingFacing;
        }
    }

    private ModeBCameraScenePolicy() { }

    static Spec inspect(JSONArray elements) {
        if (elements == null) return new Spec(false, false, true);
        boolean found = false;
        boolean front = false;
        boolean conflict = false;
        for (int index = 0; index < elements.length(); index++) {
            JSONObject element = elements.optJSONObject(index);
            if (element == null || !element.optBoolean("visible", true)
                    || !"camera".equalsIgnoreCase(element.optString("type", ""))) continue;
            if (element.optDouble("width", 0d) <= 0d || element.optDouble("height", 0d) <= 0d
                    || element.optDouble("opacity", 100d) <= 0d) continue;
            JSONObject properties = element.optJSONObject("properties");
            String facingMode = properties == null ? "user" : properties.optString("facingMode", "user");
            boolean requestedFront = !"environment".equalsIgnoreCase(facingMode);
            if (!found) {
                found = true;
                front = requestedFront;
            } else if (front != requestedFront) {
                conflict = true;
            }
        }
        return new Spec(found, front, conflict);
    }

    static Decision evaluate(boolean activeHasCamera, boolean activeFrontFacing,
            boolean activeOwnerUsable, Spec next) {
        if (next == null || next.conflictingFacing) return Decision.REJECT;
        if (!activeHasCamera && !next.hasCamera) return Decision.NONE;
        if (activeHasCamera && !next.hasCamera) return Decision.REMOVE_OWNER;
        if (!activeHasCamera && next.hasCamera) return Decision.REJECT;
        if (activeFrontFacing != next.frontFacing || !activeOwnerUsable) return Decision.REJECT;
        return Decision.REUSE_OWNER;
    }
}
