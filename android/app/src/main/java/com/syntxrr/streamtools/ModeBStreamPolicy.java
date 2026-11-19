package com.syntxrr.streamtools;

import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** Small platform-independent policy helpers for Mode B connection recovery. */
final class ModeBStreamPolicy {
    static final int MAX_OVERLAY_VIDEO_ASSETS = 2;

    private ModeBStreamPolicy() { }

    /**
     * Android playback capture documents RECORD_AUDIO as a prerequisite. Ask once for every
     * supported Mode B audio route; permission does not change which route is actually used.
     * Mode B owns its Internal playback-capture recorder lifecycle rather than allocating an
     * unused microphone AudioRecord during RootEncoder's prepareAudio() phase.
     */
    static boolean isSupportedAudioSource(String source) {
        return "mix".equals(source) || "internal".equals(source) || "microphone".equals(source);
    }

    static boolean requiresRecordAudioPermission(String source) {
        return isSupportedAudioSource(source);
    }

    /** Echo cancellation/noise suppression are microphone-path effects, not raw internal audio. */
    static boolean shouldEnableMicrophoneEffects(String source) {
        return "mix".equals(source) || "microphone".equals(source);
    }

    static boolean isAudioStartFailure(Throwable error) {
        Throwable current = error;
        for (int depth = 0; current != null && depth < 6; depth++, current = current.getCause()) {
            String message = current.getMessage();
            if (message == null) continue;
            String normalized = message.toLowerCase(Locale.ROOT);
            // The Mode B mix source uses this failure signal when Android rejects playback capture.
            // Keep matching narrow: RTMP, video and unrelated encoder failures must not swap audio.
            if (normalized.contains("failed to create playback capture audio source")
                    || normalized.contains("failed to start playback capture audio source")
                    || normalized.contains("playback capture")
                    || normalized.contains("audioplaybackcapture")
                    || (normalized.contains("record_audio") && normalized.contains("permission"))
                    || normalized.contains("microphone permission")) return true;
        }
        return false;
    }


    /** True when a visible Studio camera layer requires the Android Camera foreground-service type. */
    static boolean hasVisibleCameraOverlay(JSONArray elements) {
        if (elements == null) return false;
        for (int index = 0; index < elements.length(); index++) {
            JSONObject element = elements.optJSONObject(index);
            if (element == null) continue;
            if (requiresCameraPermission(element.optString("type", ""), element.optBoolean("visible", true))
                    && element.optDouble("width", 0d) > 0d
                    && element.optDouble("height", 0d) > 0d
                    && element.optDouble("opacity", 100d) > 0d) return true;
        }
        return false;
    }

    static boolean requiresCameraPermission(String elementType, boolean visible) {
        return visible && "camera".equalsIgnoreCase(elementType == null ? "" : elementType.trim());
    }

    static boolean hasVisibleCameraOverlay(String elementsJson) {
        if (elementsJson == null || elementsJson.trim().isEmpty()) return false;
        try {
            return hasVisibleCameraOverlay(new JSONArray(elementsJson));
        } catch (org.json.JSONException ignored) {
            return false;
        }
    }

    static boolean isValidOverlayAssetId(String id) {
        return id != null && id.matches("[A-Za-z0-9_-]{1,100}");
    }

    static boolean isSupportedOverlayImageMimeType(String mimeType) {
        if (mimeType == null) return false;
        String normalized = mimeType.toLowerCase(Locale.ROOT);
        return "image/png".equals(normalized) || "image/jpeg".equals(normalized)
                || "image/webp".equals(normalized) || "image/gif".equals(normalized);
    }

    static boolean isValidOverlayImageSize(long bytes) {
        return bytes > 0L && bytes <= 5L * 1024L * 1024L;
    }

    static boolean isValidOverlayImageTotal(long bytes) {
        return bytes > 0L && bytes <= 12L * 1024L * 1024L;
    }


    static boolean isSupportedOverlayVideoMimeType(String mimeType) {
        return mimeType != null && "video/mp4".equals(mimeType.toLowerCase(Locale.ROOT));
    }

    static boolean isValidOverlayVideoSize(long bytes) {
        return bytes > 0L && bytes <= 12L * 1024L * 1024L;
    }

    static boolean isValidOverlayVideoTotal(long bytes) {
        return bytes > 0L && bytes <= 12L * 1024L * 1024L;
    }

    /** The replacing asset is excluded from existingCount by the caller. */
    static boolean canStoreOverlayVideoAsset(int existingCount, boolean replacingExisting) {
        if (existingCount < 0) return false;
        return replacingExisting || existingCount < MAX_OVERLAY_VIDEO_ASSETS;
    }

    /** Accept ISO-BMFF MP4 files whose first box is a valid ftyp atom. */
    static boolean matchesMp4Signature(byte[] data) {
        if (data == null || data.length < 12) return false;
        long boxSize = ((long) (data[0] & 0xFF) << 24) | ((long) (data[1] & 0xFF) << 16)
                | ((long) (data[2] & 0xFF) << 8) | (long) (data[3] & 0xFF);
        return boxSize >= 12L && boxSize <= data.length
                && data[4] == 'f' && data[5] == 't' && data[6] == 'y' && data[7] == 'p';
    }

    static boolean isValidOverlayVideoDuration(long durationMs) {
        return durationMs >= 500L && durationMs <= 30_000L;
    }

    /** Returns a power-of-two BitmapFactory sample size before decode, or zero for invalid bounds. */
    static int calculateBitmapSampleSize(int width, int height, long maxPixels) {
        if (width <= 0 || height <= 0 || maxPixels <= 0L) return 0;
        int sampleSize = 1;
        while (sampleSize > 0) {
            long sampledWidth = (width + (long) sampleSize - 1L) / sampleSize;
            long sampledHeight = (height + (long) sampleSize - 1L) / sampleSize;
            if (sampledWidth * sampledHeight <= maxPixels) return sampleSize;
            if (sampleSize >= (1 << 29)) return 0;
            sampleSize <<= 1;
        }
        return 0;
    }

    /** Verify the file payload agrees with the declared image MIME type before storing it. */
    static boolean matchesImageSignature(byte[] data, String mimeType) {
        if (data == null || mimeType == null) return false;
        switch (mimeType.toLowerCase(Locale.ROOT)) {
            case "image/png":
                return data.length >= 8
                        && (data[0] & 0xFF) == 0x89 && data[1] == 0x50 && data[2] == 0x4E
                        && data[3] == 0x47 && data[4] == 0x0D && data[5] == 0x0A
                        && data[6] == 0x1A && data[7] == 0x0A;
            case "image/jpeg":
                return data.length >= 3 && (data[0] & 0xFF) == 0xFF
                        && (data[1] & 0xFF) == 0xD8 && (data[2] & 0xFF) == 0xFF;
            case "image/webp":
                return data.length >= 12 && data[0] == 'R' && data[1] == 'I' && data[2] == 'F'
                        && data[3] == 'F' && data[8] == 'W' && data[9] == 'E'
                        && data[10] == 'B' && data[11] == 'P';
            case "image/gif":
                return data.length >= 6 && ((data[0] == 'G' && data[1] == 'I' && data[2] == 'F')
                        && ((data[3] == '8' && data[4] == '7' && data[5] == 'a')
                        || (data[3] == '8' && data[4] == '9' && data[5] == 'a')));
            default:
                return false;
        }
    }

    static boolean isPermanentRtmpFailure(String reason) {
        if (reason == null) return false;
        String normalized = reason.toLowerCase(Locale.ROOT);
        return normalized.contains("endpoint malformed")
                || normalized.contains("netstream.publish.badname")
                || normalized.contains("netconnection.connect.rejected")
                || normalized.contains("authfail")
                || normalized.contains("nosuchuser")
                || normalized.contains("unauthorized")
                || normalized.contains("forbidden");
    }
}
