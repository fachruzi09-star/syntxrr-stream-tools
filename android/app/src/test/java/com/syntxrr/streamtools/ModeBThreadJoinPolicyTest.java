package com.syntxrr.streamtools;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class ModeBThreadJoinPolicyTest {
    @Test public void returnsTrueForNullOrAlreadyRetiredThread() {
        assertTrue(ModeBThreadJoinPolicy.join(null, 200L));
        Thread retired = new Thread(() -> { });
        assertTrue(ModeBThreadJoinPolicy.join(retired, 200L));
    }

    @Test public void returnsTrueAfterWorkerFinishesWithinBound() throws Exception {
        CountDownLatch finished = new CountDownLatch(1);
        Thread worker = new Thread(finished::countDown);
        worker.start();
        assertTrue(finished.await(500L, TimeUnit.MILLISECONDS));
        assertTrue(ModeBThreadJoinPolicy.join(worker, 200L));
    }

    @Test public void returnsFalseWhenWorkerExceedsJoinBound() throws Exception {
        CountDownLatch releaseWorker = new CountDownLatch(1);
        Thread worker = new Thread(() -> {
            try { releaseWorker.await(); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        });
        worker.start();
        assertFalse(ModeBThreadJoinPolicy.join(worker, 20L));
        releaseWorker.countDown();
        worker.join(500L);
        assertFalse(worker.isAlive());
    }

    @Test public void doesNotAttemptToJoinCurrentThread() {
        assertFalse(ModeBThreadJoinPolicy.join(Thread.currentThread(), 200L));
    }

    @Test public void restoresInterruptFlagWhenInterrupted() throws Exception {
        CountDownLatch releaseWorker = new CountDownLatch(1);
        Thread worker = new Thread(() -> {
            try { releaseWorker.await(); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        });
        worker.start();
        CountDownLatch enteringJoin = new CountDownLatch(1);
        AtomicBoolean joined = new AtomicBoolean(true);
        AtomicBoolean interruptRestored = new AtomicBoolean(false);
        Thread joiner = new Thread(() -> {
            enteringJoin.countDown();
            joined.set(ModeBThreadJoinPolicy.join(worker, 5000L));
            interruptRestored.set(Thread.currentThread().isInterrupted());
        });
        joiner.start();
        assertTrue(enteringJoin.await(500L, TimeUnit.MILLISECONDS));
        joiner.interrupt();
        joiner.join(500L);
        releaseWorker.countDown();
        worker.join(500L);
        assertFalse(joiner.isAlive());
        assertFalse(joined.get());
        assertTrue(interruptRestored.get());
    }
}
