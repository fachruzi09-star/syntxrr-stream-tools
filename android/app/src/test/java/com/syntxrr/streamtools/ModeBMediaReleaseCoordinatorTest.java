package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public final class ModeBMediaReleaseCoordinatorTest {
    @Test public void onlyFirstRequestStartsRetirementAndAllCallersWait() {
        ModeBMediaReleaseCoordinator coordinator = new ModeBMediaReleaseCoordinator();
        AtomicInteger callbacks = new AtomicInteger();

        assertTrue(coordinator.request(callbacks::incrementAndGet));
        assertFalse(coordinator.request(callbacks::incrementAndGet));
        assertFalse(coordinator.request(callbacks::incrementAndGet));
        assertEquals(0, callbacks.get());
        assertEquals(3, coordinator.pendingCallbacksForTest());

        coordinator.complete();
        assertEquals(3, callbacks.get());
        assertTrue(coordinator.isCompletedForTest());
    }

    @Test public void requestsAfterCompletionAreAcknowledgedImmediately() {
        ModeBMediaReleaseCoordinator coordinator = new ModeBMediaReleaseCoordinator();
        AtomicInteger callbacks = new AtomicInteger();
        assertTrue(coordinator.request(null));
        coordinator.complete();

        assertFalse(coordinator.request(callbacks::incrementAndGet));
        assertEquals(1, callbacks.get());
    }

    @Test public void duplicateCompletionDoesNotNotifyJoinedCallersTwice() {
        ModeBMediaReleaseCoordinator coordinator = new ModeBMediaReleaseCoordinator();
        AtomicInteger callbacks = new AtomicInteger();
        coordinator.request(callbacks::incrementAndGet);
        coordinator.request(callbacks::incrementAndGet);
        coordinator.complete();
        coordinator.complete();
        assertEquals(2, callbacks.get());
    }

    @Test public void concurrentRequestsJoinTheSameRetirement() throws Exception {
        ModeBMediaReleaseCoordinator coordinator = new ModeBMediaReleaseCoordinator();
        AtomicInteger callbacks = new AtomicInteger();
        CountDownLatch ready = new CountDownLatch(16);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger starters = new AtomicInteger();
        Thread[] threads = new Thread[16];
        for (int i = 0; i < threads.length; i++) {
            threads[i] = new Thread(() -> {
                ready.countDown();
                try { start.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
                if (coordinator.request(callbacks::incrementAndGet)) starters.incrementAndGet();
            });
            threads[i].start();
        }
        assertTrue(ready.await(1, TimeUnit.SECONDS));
        start.countDown();
        for (Thread thread : threads) thread.join(1_000L);
        assertEquals(1, starters.get());
        assertEquals(16, coordinator.pendingCallbacksForTest());
        coordinator.complete();
        assertEquals(16, callbacks.get());
    }
}
