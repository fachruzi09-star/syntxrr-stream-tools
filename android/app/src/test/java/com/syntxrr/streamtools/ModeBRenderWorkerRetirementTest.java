package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;

public class ModeBRenderWorkerRetirementTest {
    @Test public void interruptAndJoinAcknowledgesFullWorkerTermination() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        Thread worker = new Thread(() -> {
            started.countDown();
            try {
                new CountDownLatch(1).await();
            } catch (InterruptedException expected) {
                Thread.currentThread().interrupt();
            }
        }, "render-retirement-test");
        worker.start();
        assertTrue(started.await(1, TimeUnit.SECONDS));

        ModeBRenderWorkerRetirement.requireRetired(worker, 500L);

        assertFalse(worker.isAlive());
    }

    @Test public void timeoutDoesNotPretendWorkerWasRetiredAndLaterRetryCanConfirmIt() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch allowExit = new CountDownLatch(1);
        Thread worker = new Thread(() -> {
            started.countDown();
            boolean released = false;
            while (!released) {
                try {
                    released = allowExit.await(1, TimeUnit.SECONDS);
                } catch (InterruptedException ignored) {
                    // Simulate a worker inside a non-interruptible native draw/Surface call.
                }
            }
        }, "render-retirement-timeout-test");
        worker.start();
        assertTrue(started.await(1, TimeUnit.SECONDS));

        try {
            ModeBRenderWorkerRetirement.requireRetired(worker, 20L);
            fail("A live worker must not be acknowledged as retired.");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("Surface tidak boleh dilepas"));
        }
        assertTrue(worker.isAlive());

        allowExit.countDown();
        ModeBRenderWorkerRetirement.requireRetired(worker, 500L);
        assertFalse(worker.isAlive());
    }

    @Test public void interruptedWaitPreservesCallerInterruptAndDoesNotAcknowledge() throws Exception {
        CountDownLatch workerStarted = new CountDownLatch(1);
        CountDownLatch allowWorkerExit = new CountDownLatch(1);
        Thread worker = new Thread(() -> {
            workerStarted.countDown();
            while (allowWorkerExit.getCount() > 0L) {
                try {
                    allowWorkerExit.await();
                } catch (InterruptedException ignored) {
                    // Keep the worker alive until the test releases it, so the waiter is
                    // guaranteed to be inside Thread.join when its own interrupt is sent.
                }
            }
        }, "render-retirement-interrupt-worker");
        worker.start();
        assertTrue(workerStarted.await(1, TimeUnit.SECONDS));

        CountDownLatch waitStarted = new CountDownLatch(1);
        AtomicBoolean interruptPreserved = new AtomicBoolean(false);
        AtomicBoolean waitFailed = new AtomicBoolean(false);
        Thread waiter = new Thread(() -> {
            waitStarted.countDown();
            try {
                ModeBRenderWorkerRetirement.requireRetired(worker, 5_000L);
            } catch (IllegalStateException expected) {
                waitFailed.set(true);
                interruptPreserved.set(Thread.currentThread().isInterrupted());
                Thread.interrupted();
            }
        }, "render-retirement-waiter");
        waiter.start();
        assertTrue(waitStarted.await(1, TimeUnit.SECONDS));
        long joinDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
        while (waiter.getState() != Thread.State.TIMED_WAITING && System.nanoTime() < joinDeadline) {
            Thread.yield();
        }
        assertEquals(Thread.State.TIMED_WAITING, waiter.getState());
        waiter.interrupt();
        waiter.join(1_000L);
        allowWorkerExit.countDown();
        worker.join(1_000L);

        assertFalse(waiter.isAlive());
        assertTrue(waitFailed.get());
        assertTrue(interruptPreserved.get());
        assertFalse(worker.isAlive());
    }

    @Test public void nullAndAlreadyTerminatedWorkersAreNoOps() {
        ModeBRenderWorkerRetirement.requireRetired(null, 1L);
        Thread worker = new Thread(() -> { }, "already-retired-render-worker");
        try { worker.start(); worker.join(500L); } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            fail("Unexpected test interruption.");
        }
        assertFalse(worker.isAlive());
        ModeBRenderWorkerRetirement.requireRetired(worker, 1L);
    }

    @Test public void selfJoinIsRejectedInsteadOfDeadlocking() {
        AtomicBoolean rejected = new AtomicBoolean(false);
        Thread worker = new Thread(() -> {
            try {
                ModeBRenderWorkerRetirement.requireRetired(Thread.currentThread(), 100L);
            } catch (IllegalStateException expected) {
                rejected.set(true);
            }
        }, "render-retirement-self-test");
        worker.start();
        try { worker.join(500L); } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            fail("Unexpected test interruption.");
        }
        assertTrue(rejected.get());
        assertFalse(worker.isAlive());
    }

    @Test public void nonPositiveTimeoutIsRejected() {
        try {
            ModeBRenderWorkerRetirement.requireRetired(null, 0L);
            fail("A zero timeout must not silently mean an unbounded wait.");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("positif"));
        }
    }
}
