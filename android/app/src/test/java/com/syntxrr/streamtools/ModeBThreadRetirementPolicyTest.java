package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

public final class ModeBThreadRetirementPolicyTest {
    @Test public void timeoutKeepsExactWorkerReferenceForAnotherStopPass() {
        Thread worker = new Thread(() -> { });
        AtomicReference<Thread> owner = new AtomicReference<>(worker);
        AtomicInteger retirements = new AtomicInteger();

        boolean retired = ModeBThreadRetirementPolicy.joinThenRetire(
                worker, 200L, (thread, timeout) -> false,
                () -> { owner.compareAndSet(worker, null); retirements.incrementAndGet(); });

        assertFalse(retired);
        assertTrue(owner.get() == worker);
        assertEquals(0, retirements.get());
    }

    @Test public void referenceClearsOnlyAfterJoinConfirmsTermination() {
        Thread worker = new Thread(() -> { });
        AtomicReference<Thread> owner = new AtomicReference<>(worker);
        AtomicInteger joinedCalls = new AtomicInteger();

        boolean retired = ModeBThreadRetirementPolicy.joinThenRetire(
                worker, 200L, (thread, timeout) -> {
                    assertTrue(thread == worker);
                    joinedCalls.incrementAndGet();
                    return true;
                }, () -> owner.compareAndSet(worker, null));

        assertTrue(retired);
        assertTrue(owner.get() == null);
        assertEquals(1, joinedCalls.get());
    }

    @Test public void laterRetryCanRetireTheSameWorkerAfterEarlierTimeout() {
        Thread worker = new Thread(() -> { });
        AtomicReference<Thread> owner = new AtomicReference<>(worker);
        AtomicInteger attempts = new AtomicInteger();

        boolean first = ModeBThreadRetirementPolicy.joinThenRetire(
                owner.get(), 200L, (thread, timeout) -> false,
                () -> owner.compareAndSet(worker, null));
        boolean second = ModeBThreadRetirementPolicy.joinThenRetire(
                owner.get(), 200L, (thread, timeout) -> {
                    assertTrue(thread == worker);
                    attempts.incrementAndGet();
                    return true;
                }, () -> owner.compareAndSet(worker, null));

        assertFalse(first);
        assertTrue(second);
        assertTrue(owner.get() == null);
        assertEquals(1, attempts.get());
    }

    @Test public void newerOwnerReferenceIsNotClearedByOldJoinCompletion() {
        Thread oldWorker = new Thread(() -> { });
        Thread newWorker = new Thread(() -> { });
        AtomicReference<Thread> owner = new AtomicReference<>(oldWorker);

        boolean retired = ModeBThreadRetirementPolicy.joinThenRetire(
                oldWorker, 200L, (thread, timeout) -> {
                    owner.set(newWorker);
                    return true;
                }, () -> owner.compareAndSet(oldWorker, null));

        assertTrue(retired);
        assertTrue(owner.get() == newWorker);
    }

    @Test public void nullWorkerIsAlreadyRetired() {
        AtomicInteger retirements = new AtomicInteger();
        assertTrue(ModeBThreadRetirementPolicy.joinThenRetire(
                null, 200L, null, retirements::incrementAndGet));
        assertEquals(0, retirements.get());
    }
    @Test public void strictRetirementCheckRejectsWorkerThatIsStillAlive() throws Exception {
        CountDownLatch releaseWorker = new CountDownLatch(1);
        Thread worker = new Thread(() -> {
            try { releaseWorker.await(); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        }, "direct-screen-strict-retirement-test");
        worker.start();
        try {
            boolean rejected = false;
            try {
                ModeBThreadRetirementPolicy.requireTerminated(worker);
            } catch (IllegalStateException expected) {
                rejected = true;
            }
            assertTrue(rejected);
            assertTrue(worker.isAlive());
        } finally {
            releaseWorker.countDown();
            worker.join(1000L);
        }
    }

    @Test public void strictRetirementCheckAcceptsTerminatedWorker() throws Exception {
        Thread worker = new Thread(() -> { }, "direct-screen-terminated-test");
        worker.start();
        worker.join(1000L);
        assertFalse(worker.isAlive());
        ModeBThreadRetirementPolicy.requireTerminated(worker);
    }

    @Test public void realJoinTimeoutRetainsWorkerAndLaterJoinRetiresIt() throws Exception {
        CountDownLatch releaseWorker = new CountDownLatch(1);
        Thread worker = new Thread(() -> {
            try { releaseWorker.await(); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        }, "direct-screen-retirement-test");
        AtomicReference<Thread> owner = new AtomicReference<>(worker);
        worker.start();
        try {
            boolean first = ModeBThreadRetirementPolicy.joinThenRetire(
                    worker, 20L, ModeBThreadJoinPolicy::join,
                    () -> owner.compareAndSet(worker, null));
            assertFalse(first);
            assertTrue(owner.get() == worker);

            releaseWorker.countDown();
            boolean second = ModeBThreadRetirementPolicy.joinThenRetire(
                    owner.get(), 1000L, ModeBThreadJoinPolicy::join,
                    () -> owner.compareAndSet(worker, null));
            assertTrue(second);
            assertTrue(owner.get() == null);
            assertFalse(worker.isAlive());
        } finally {
            releaseWorker.countDown();
            worker.join(1000L);
        }
    }

}

