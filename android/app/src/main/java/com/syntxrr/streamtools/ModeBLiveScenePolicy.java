package com.syntxrr.streamtools;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * Safe live-scene replacement type allowlist. Image/video assets use isolated per-scene
 * namespaces. Camera2 passes this type gate only; the service separately verifies and transfers
 * the active same-facing physical owner before attaching the staged scene.
 */
final class ModeBLiveScenePolicy {
    private static final Set<String> STATIC_OVERLAY_TYPES = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList(
                    "shape", "separator", "text", "running_text", "dynamic_text", "live_text",
                    "username", "counter", "live_viewer_counter", "combo_counter", "chat_message",
                    "event_feed", "event_alert", "progress_bar", "image", "sticker", "video", "camera"
            ))
    );

    private ModeBLiveScenePolicy() { }

    static boolean supportsStaticOverlayType(String type) {
        return type != null && STATIC_OVERLAY_TYPES.contains(type.trim().toLowerCase(java.util.Locale.ROOT));
    }

    static boolean supportsStaticOverlayTypes(Iterable<String> types) {
        if (types == null) return false;
        for (String type : types) {
            if (!supportsStaticOverlayType(type)) return false;
        }
        return true;
    }
}
