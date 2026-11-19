package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class ModeBFilterRemovalBatchTest {
    @Test public void attemptsLaterRemovalWhenFirstRequestThrows() {
        AtomicInteger first = new AtomicInteger();
        AtomicInteger second = new AtomicInteger();
        RuntimeException failure = ModeBFilterRemovalBatch.attemptAll(
                () -> { first.incrementAndGet(); throw new IllegalStateException("overlay"); },
                second::incrementAndGet);
        assertNotNull(failure);
        assertEquals("overlay", failure.getMessage());
        assertEquals(1, first.get());
        assertEquals(1, second.get());
    }

    @Test public void aggregatesIndependentRemovalFailuresAsSuppressed() {
        RuntimeException failure = ModeBFilterRemovalBatch.attemptAll(
                () -> { throw new IllegalStateException("overlay"); },
                () -> { throw new IllegalArgumentException("background"); });
        assertNotNull(failure);
        assertEquals("overlay", failure.getMessage());
        assertEquals(1, failure.getSuppressed().length);
        assertEquals("background", failure.getSuppressed()[0].getMessage());
    }

    @Test public void successfulRemovalsRunExactlyOnceAndReturnNoFailure() {
        AtomicInteger count = new AtomicInteger();
        RuntimeException failure = ModeBFilterRemovalBatch.attemptAll(count::incrementAndGet,
                count::incrementAndGet);
        assertNull(failure);
        assertEquals(2, count.get());
    }

    @Test public void nullRemovalSlotsAreIgnoredWithoutSkippingOtherRequests() {
        AtomicInteger count = new AtomicInteger();
        RuntimeException failure = ModeBFilterRemovalBatch.attemptAll(null, count::incrementAndGet, null);
        assertNull(failure);
        assertEquals(1, count.get());
    }

    @Test public void retriesTransientRemovalFailureOnceAndContinuesBatch() {
        AtomicInteger first = new AtomicInteger();
        AtomicInteger second = new AtomicInteger();
        RuntimeException failure = ModeBFilterRemovalBatch.attemptAllWithRetry(2,
                () -> {
                    if (first.incrementAndGet() == 1) throw new IllegalStateException("transient");
                },
                second::incrementAndGet);
        assertNull(failure);
        assertEquals(2, first.get());
        assertEquals(1, second.get());
    }

    @Test public void persistentFailureIsReportedAfterBoundedAttempts() {
        AtomicInteger first = new AtomicInteger();
        AtomicInteger second = new AtomicInteger();
        RuntimeException failure = ModeBFilterRemovalBatch.attemptAllWithRetry(2,
                () -> { first.incrementAndGet(); throw new IllegalStateException("overlay"); },
                second::incrementAndGet);
        assertNotNull(failure);
        assertEquals("overlay", failure.getMessage());
        assertEquals(1, failure.getSuppressed().length);
        assertEquals(2, first.get());
        assertEquals(1, second.get());
    }

    @Test public void nullEntriesDoNotConsumeAttemptsOrBlockRetry() {
        AtomicInteger calls = new AtomicInteger();
        RuntimeException failure = ModeBFilterRemovalBatch.attemptAllWithRetry(2,
                null,
                () -> { if (calls.incrementAndGet() == 1) throw new IllegalStateException("once"); });
        assertNull(failure);
        assertEquals(2, calls.get());
    }

    @Test public void emptyBatchSucceedsAndNullBatchIsRejected() {
        assertNull(ModeBFilterRemovalBatch.attemptAll());
        assertNotNull(ModeBFilterRemovalBatch.attemptAll((Runnable[]) null));
    }
}
