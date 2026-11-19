package com.syntxrr.streamtools;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ModeBStreamHealthPolicyTest {
    @Test
    public void detectsOnlyChangedSuccessfulSendByteCounterAsProgress() {
        assertTrue(ModeBStreamHealthPolicy.hasSendProgress(100L, 99L));
        assertTrue(ModeBStreamHealthPolicy.hasSendProgress(0L, 500L)); // counter reset on session reset
        assertTrue(ModeBStreamHealthPolicy.hasSendProgress(10L, -1L)); // first sample
        assertFalse(ModeBStreamHealthPolicy.hasSendProgress(100L, 100L));
    }

    @Test
    public void requiresFullStallWindowBeforeRetry() {
        assertFalse(ModeBStreamHealthPolicy.isSendStalled(19_999L, 0L, 20_000L));
        assertTrue(ModeBStreamHealthPolicy.isSendStalled(20_001L, 1L, 20_000L));
        assertTrue(ModeBStreamHealthPolicy.isSendStalled(35_000L, 15_000L, 20_000L));
    }

    @Test
    public void rejectsInvalidMonotonicClockOrTimeoutValues() {
        assertFalse(ModeBStreamHealthPolicy.isSendStalled(100L, 0L, 20_000L));
        assertFalse(ModeBStreamHealthPolicy.isSendStalled(100L, 200L, 20_000L));
        assertFalse(ModeBStreamHealthPolicy.isSendStalled(100L, 50L, 0L));
    }
}
