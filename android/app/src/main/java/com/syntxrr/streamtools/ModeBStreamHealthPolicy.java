package com.syntxrr.streamtools;

/** Pure policy for detecting a sustained lack of successful RTMP packet writes. */
final class ModeBStreamHealthPolicy {
    private ModeBStreamHealthPolicy() { }

    static boolean hasSendProgress(long currentBytes, long previousBytes) {
        return previousBytes < 0L || currentBytes != previousBytes;
    }

    static boolean isSendStalled(long nowMs, long lastProgressAtMs, long timeoutMs) {
        if (lastProgressAtMs <= 0L || timeoutMs <= 0L || nowMs < lastProgressAtMs) return false;
        return nowMs - lastProgressAtMs >= timeoutMs;
    }
}
