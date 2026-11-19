package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public final class ModeBAssetCleanupRetryPolicyTest {
    @Test public void allowsOnlyThreeRetriesAfterInitialDeleteAttempt() {
        assertTrue(ModeBAssetCleanupRetryPolicy.shouldRetry(0));
        assertTrue(ModeBAssetCleanupRetryPolicy.shouldRetry(1));
        assertTrue(ModeBAssetCleanupRetryPolicy.shouldRetry(2));
        assertFalse(ModeBAssetCleanupRetryPolicy.shouldRetry(3));
        assertFalse(ModeBAssetCleanupRetryPolicy.shouldRetry(-1));
    }

    @Test public void usesIncreasingBoundedRetryDelays() {
        assertEquals(250L, ModeBAssetCleanupRetryPolicy.retryDelayMs(0));
        assertEquals(500L, ModeBAssetCleanupRetryPolicy.retryDelayMs(1));
        assertEquals(1_000L, ModeBAssetCleanupRetryPolicy.retryDelayMs(2));
        assertEquals(1_000L, ModeBAssetCleanupRetryPolicy.retryDelayMs(9));
        assertEquals(250L, ModeBAssetCleanupRetryPolicy.retryDelayMs(-1));
    }
}
