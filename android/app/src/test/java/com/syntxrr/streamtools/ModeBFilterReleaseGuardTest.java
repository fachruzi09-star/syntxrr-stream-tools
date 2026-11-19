package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class ModeBFilterReleaseGuardTest {
    @Test public void onlyOneCallerMayRunSuperclassRelease() {
        ModeBFilterReleaseGuard guard = new ModeBFilterReleaseGuard();
        assertTrue(guard.beginRelease());
        assertFalse(guard.beginRelease());
        assertFalse(guard.isReleaseCompleted());
        guard.markReleaseCompleted();
        assertTrue(guard.isReleaseCompleted());
        assertFalse(guard.beginRelease());
    }

    @Test public void failedSuperclassReleaseRemainsUnacknowledged() {
        ModeBFilterReleaseGuard guard = new ModeBFilterReleaseGuard();
        assertTrue(guard.beginRelease());
        // Simulate super.release() throwing: it is not acknowledged, but a bounded retry is allowed.
        assertFalse(guard.isReleaseCompleted());
        guard.markReleaseFailed();
        assertTrue(guard.beginRelease());
        assertFalse(guard.isReleaseCompleted());
    }

    @Test public void concurrentReleaseRequestsAdmitExactlyOneSuperclassCall() throws Exception {
        ModeBFilterReleaseGuard guard = new ModeBFilterReleaseGuard();
        AtomicInteger admitted = new AtomicInteger();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        Runnable request = () -> {
            ready.countDown();
            try { start.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
            if (guard.beginRelease()) admitted.incrementAndGet();
        };
        Thread one = new Thread(request);
        Thread two = new Thread(request);
        one.start(); two.start();
        ready.await(); start.countDown();
        one.join(); two.join();
        assertEquals(1, admitted.get());
    }

    @Test public void completionIsVisibleToRepeatedReleaseCallbacks() {
        ModeBFilterReleaseGuard guard = new ModeBFilterReleaseGuard();
        assertTrue(guard.beginRelease());
        guard.markReleaseCompleted();
        assertTrue(guard.isReleaseCompleted());
        assertFalse(guard.beginRelease());
        assertTrue(guard.isReleaseCompleted());
    }
    @Test public void failedRetryCanBeAttemptedAgainDuringTeardown() {
        ModeBFilterReleaseGuard guard = new ModeBFilterReleaseGuard();
        assertTrue(guard.beginRelease());
        guard.markReleaseFailed();
        assertTrue(guard.beginRelease());
        guard.markReleaseFailed();
        assertTrue(guard.beginRelease());
        guard.markReleaseCompleted();
        assertFalse(guard.beginRelease());
    }

}
