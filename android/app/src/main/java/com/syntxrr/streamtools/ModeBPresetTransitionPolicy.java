package com.syntxrr.streamtools;

/** Fail-closed runtime support for the bounded preset fade transition. */
final class ModeBPresetTransitionPolicy {
    static final int DEFAULT_DURATION_MS = 300;
    static final int MIN_DURATION_MS = 100;
    static final int MAX_DURATION_MS = 1200;

    private ModeBPresetTransitionPolicy() { }

    static int resolveDuration(String type, int durationMs) {
        String normalized = type == null ? "" : type.trim().toLowerCase(java.util.Locale.ROOT);
        if (normalized.isEmpty() || "none".equals(normalized) || "cut".equals(normalized)) return 0;
        if (!"fade".equals(normalized)) throw new IllegalArgumentException("Jenis transisi preset belum didukung saat LIVE.");
        if (durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) {
            throw new IllegalArgumentException("Durasi fade LIVE harus antara 100 dan 1200 ms.");
        }
        return durationMs;
    }

    static boolean hasTransition(int transitionOutMs, int transitionInMs) {
        return transitionOutMs > 0 || transitionInMs > 0;
    }

    static boolean isDurationValid(int durationMs) {
        return durationMs == 0 || (durationMs >= MIN_DURATION_MS && durationMs <= MAX_DURATION_MS);
    }
}
