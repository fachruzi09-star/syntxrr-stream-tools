package com.syntxrr.streamtools;

import org.json.JSONException;
import org.json.JSONObject;

/** Bounded text and static-image runtime policy for the preset-level host-wait screensaver. */
final class ModeBScreensaverPolicy {
    static final int DEFAULT_FADE_MS = 300;
    static final int MIN_FADE_MS = 100;
    static final int MAX_FADE_MS = 1200;
    static final String DEFAULT_TEXT = "Sedang menunggu host";

    final boolean enabled;
    final String text;
    final boolean mediaRequested;
    final String mediaAssetId;
    final String mediaType;
    final boolean mediaSound;
    final int enterDurationMs;
    final int exitDurationMs;

    private ModeBScreensaverPolicy(boolean enabled, String text, boolean mediaRequested,
            String mediaAssetId, String mediaType, boolean mediaSound, int enterDurationMs, int exitDurationMs) {
        this.enabled = enabled;
        this.text = text == null || text.trim().isEmpty() ? DEFAULT_TEXT : text.trim();
        this.mediaRequested = mediaRequested;
        this.mediaAssetId = mediaAssetId == null ? "" : mediaAssetId;
        this.mediaType = "video".equals(mediaType) ? "video" : "image";
        this.mediaSound = mediaSound;
        this.enterDurationMs = enterDurationMs;
        this.exitDurationMs = exitDurationMs;
    }

    static ModeBScreensaverPolicy disabled() {
        return new ModeBScreensaverPolicy(false, DEFAULT_TEXT, false, "", "image", false,
                DEFAULT_FADE_MS, DEFAULT_FADE_MS);
    }

    static ModeBScreensaverPolicy fromJson(String json) {
        if (json == null || json.trim().isEmpty()) return disabled();
        try {
            JSONObject object = new JSONObject(json);
            boolean enabled = object.optBoolean("on", false);
            Object textValue = object.opt("text");
            String text = textValue instanceof String ? (String) textValue : "";
            if (text.length() > 180) throw new IllegalArgumentException("Tulisan layar tunggu maksimal 180 karakter.");
            Object mediaValue = object.opt("media");
            String media = mediaValue instanceof String ? ((String) mediaValue).trim() : "";
            String mediaAssetId = mediaAssetIdFromReference(media);
            String mediaType = "video".equalsIgnoreCase(object.optString("mediaType", "image")) ? "video" : "image";
            int enter = readTransition(object.opt("enter"), "Transisi masuk layar tunggu");
            int exit = readTransition(object.opt("exit"), "Transisi keluar layar tunggu");
            return new ModeBScreensaverPolicy(enabled, text, !media.isEmpty(), mediaAssetId, mediaType,
                    object.optBoolean("mediaSound", false), enter, exit);
        } catch (JSONException exception) {
            throw new IllegalArgumentException("Pengaturan layar tunggu preset tidak valid.", exception);
        }
    }

    private static String mediaAssetIdFromReference(String media) {
        if (media == null || media.trim().isEmpty()) return "";
        String value = media.trim();
        final String prefix = "studio-media://";
        if (value.startsWith(prefix)) value = value.substring(prefix.length());
        return ModeBStreamPolicy.isValidOverlayAssetId(value) ? value : "";
    }

    static int readTransition(Object raw, String label) {
        if (raw == null || raw == JSONObject.NULL) return DEFAULT_FADE_MS;
        String type;
        int duration = DEFAULT_FADE_MS;
        if (raw instanceof String) {
            type = ((String) raw).trim();
        } else if (raw instanceof JSONObject) {
            JSONObject transition = (JSONObject) raw;
            type = transition.optString("type", "");
            Object durationValue = transition.has("duration") ? transition.opt("duration") : transition.opt("durationMs");
            if (durationValue != null && durationValue != JSONObject.NULL) {
                if (!(durationValue instanceof Number)) throw new IllegalArgumentException(label + ": durasi harus berupa angka.");
                double numeric = ((Number) durationValue).doubleValue();
                if (!Double.isFinite(numeric) || numeric != Math.rint(numeric)) {
                    throw new IllegalArgumentException(label + ": durasi harus berupa bilangan bulat.");
                }
                duration = (int) numeric;
            }
        } else {
            throw new IllegalArgumentException(label + ": format transisi tidak didukung.");
        }
        String normalized = type == null ? "" : type.trim().toLowerCase(java.util.Locale.ROOT);
        if (normalized.isEmpty() || "cut".equals(normalized) || "none".equals(normalized)) return 0;
        if (!"fade".equals(normalized)) {
            throw new IllegalArgumentException(label + ": Saat ini hanya mendukung fade atau cut.");
        }
        if (duration < MIN_FADE_MS || duration > MAX_FADE_MS) {
            throw new IllegalArgumentException(label + ": durasi fade harus 100–1200 ms.");
        }
        return duration;
    }

    String runtimeNotice() {
        if (!enabled) return "";
        if (mediaSound) return " Audio media layar tunggu belum didukung; video MP4 diputar senyap.";
        if (mediaRequested && mediaAssetId.isEmpty()) {
            return " Referensi media layar tunggu tidak valid; kartu teks digunakan.";
        }
        return "";
    }
}
