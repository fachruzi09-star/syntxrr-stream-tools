package com.syntxrr.streamtools;

/** Bounded backoff for retrying a failed Mode B namespace deletion after all readers quiesce. */
final class ModeBAssetCleanupRetryPolicy {
    static final int MAX_RETRIES = 3;
    private static final long BASE_DELAY_MS = 250L;
    private static final long MAX_DELAY_MS = 1_000L;

    private ModeBAssetCleanupRetryPolicy() { }

    /** retriesScheduled counts retries already queued, not the initial deletion attempt. */
    static boolean shouldRetry(int retriesScheduled) {
        return retriesScheduled >= 0 && retriesScheduled < MAX_RETRIES;
    }

    /** Exponential backoff: 250 ms, 500 ms, then 1,000 ms. */
    static long retryDelayMs(int retryIndex) {
        if (retryIndex < 0) return BASE_DELAY_MS;
        if (retryIndex >= 2) return MAX_DELAY_MS;
        return Math.min(MAX_DELAY_MS, BASE_DELAY_MS << retryIndex);
    }
}
