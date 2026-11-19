package com.syntxrr.streamtools;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class ModeBWorkerQuiescenceBarrierTest {
    @Test public void acceptedFifoMarkerRunsCleanupWithoutUsingTerminationFallback() {
        final Runnable[] queued = { null };
        AtomicInteger cleanupCalls = new AtomicInteger();
        AtomicInteger fallbackCalls = new AtomicInteger();

        boolean scheduled = ModeBWorkerQuiescenceBarrier.enqueue(task -> {
            queued[0] = task;
            return true;
        }, callback -> {
            fallbackCalls.incrementAndGet();
            return true;
        }, cleanupCalls::incrementAndGet);

        assertTrue(scheduled);
        assertEquals(0, cleanupCalls.get());
        assertEquals(0, fallbackCalls.get());
        queued[0].run();
        assertEquals(1, cleanupCalls.get());
    }

    @Test public void rejectedPostDefersCleanupUntilQuiescenceCallback() {
        final Runnable[] awaitCallback = { null };
        AtomicInteger cleanupCalls = new AtomicInteger();

        boolean scheduled = ModeBWorkerQuiescenceBarrier.enqueue(task -> false, callback -> {
            awaitCallback[0] = callback;
            return true;
        }, cleanupCalls::incrementAndGet);

        assertTrue(scheduled);
        assertEquals(0, cleanupCalls.get());
        awaitCallback[0].run();
        assertEquals(1, cleanupCalls.get());
    }

    @Test public void cleanupWaitsForActualWorkerThreadTermination() throws Exception {
        CountDownLatch workerStarted = new CountDownLatch(1);
        CountDownLatch allowWorkerExit = new CountDownLatch(1);
        CountDownLatch cleanupDone = new CountDownLatch(1);
        Thread worker = new Thread(() -> {
            workerStarted.countDown();
            try { allowWorkerExit.await(); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        }, "fake-visual-worker");
        worker.start();
        assertTrue(workerStarted.await(1, TimeUnit.SECONDS));

        boolean scheduled = ModeBWorkerQuiescenceBarrier.awaitThreadTermination(worker,
                cleanupDone::countDown);
        assertTrue(scheduled);
        assertFalse(cleanupDone.await(30, TimeUnit.MILLISECONDS));

        allowWorkerExit.countDown();
        assertTrue(cleanupDone.await(1, TimeUnit.SECONDS));
        worker.join(1_000L);
        assertFalse(worker.isAlive());
    }

    @Test public void duplicateQueuedAndFallbackSignalsCannotRunCleanupTwice() {
        final Runnable[] queued = { null };
        final Runnable[] fallback = { null };
        AtomicInteger cleanupCalls = new AtomicInteger();

        boolean scheduled = ModeBWorkerQuiescenceBarrier.enqueue(task -> {
            queued[0] = task;
            return false;
        }, callback -> {
            fallback[0] = callback;
            return true;
        }, cleanupCalls::incrementAndGet);

        assertTrue(scheduled);
        fallback[0].run();
        queued[0].run();
        fallback[0].run();
        assertEquals(1, cleanupCalls.get());
    }

    @Test public void failedFallbackDoesNotAcknowledgeUnsafeCleanup() {
        AtomicInteger cleanupCalls = new AtomicInteger();
        boolean scheduled = ModeBWorkerQuiescenceBarrier.enqueue(task -> false,
                callback -> false, cleanupCalls::incrementAndGet);
        assertFalse(scheduled);
        assertEquals(0, cleanupCalls.get());
    }
}
