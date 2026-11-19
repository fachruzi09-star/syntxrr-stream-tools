package com.syntxrr.streamtools;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class ModeBHandlerDrainPolicyTest {
    @Test public void waitsUntilEarlierQueuedWorkHasFinished() throws Exception {
        ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
            Thread thread = new Thread(r, "drain-policy-test");
            thread.setDaemon(true);
            return thread;
        });
        AtomicReference<Thread> workerThread = new AtomicReference<>();
        CountDownLatch earlierWorkStarted = new CountDownLatch(1);
        CountDownLatch releaseEarlierWork = new CountDownLatch(1);
        CountDownLatch earlierWorkFinished = new CountDownLatch(1);
        worker.submit(() -> {
            workerThread.set(Thread.currentThread());
            earlierWorkStarted.countDown();
            try { releaseEarlierWork.await(); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            earlierWorkFinished.countDown();
        });
        assertTrue(earlierWorkStarted.await(500L, TimeUnit.MILLISECONDS));
        AtomicBoolean drained = new AtomicBoolean(false);
        Thread waiter = new Thread(() -> drained.set(ModeBHandlerDrainPolicy.awaitBarrier(
                task -> { worker.execute(task); return true; }, workerThread.get(), 1000L)));
        waiter.start();
        Thread.sleep(20L);
        assertFalse(drained.get());
        releaseEarlierWork.countDown();
        waiter.join(1000L);
        try {
            assertTrue(drained.get());
            assertTrue(earlierWorkFinished.getCount() == 0L);
        } finally {
            worker.shutdownNow();
        }
    }

    @Test public void returnsFalseWhenBarrierDoesNotReachWorkerInTime() throws Exception {
        ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
            Thread thread = new Thread(r, "drain-timeout-test");
            thread.setDaemon(true);
            return thread;
        });
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicReference<Thread> workerThread = new AtomicReference<>();
        worker.submit(() -> {
            workerThread.set(Thread.currentThread());
            started.countDown();
            try { release.await(); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        });
        assertTrue(started.await(500L, TimeUnit.MILLISECONDS));
        try {
            assertFalse(ModeBHandlerDrainPolicy.awaitBarrier(
                    task -> { worker.execute(task); return true; }, workerThread.get(), 20L));
        } finally {
            release.countDown();
            worker.shutdownNow();
        }
    }

    @Test public void rejectsUnavailableOrRejectedWorker() {
        assertFalse(ModeBHandlerDrainPolicy.awaitBarrier(task -> true, null, 200L));
        Thread dead = new Thread(() -> { });
        assertFalse(ModeBHandlerDrainPolicy.awaitBarrier(task -> true, dead, 200L));
        CountDownLatch release = new CountDownLatch(1);
        Thread live = new Thread(() -> {
            try { release.await(); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        });
        live.start();
        try {
            assertFalse(ModeBHandlerDrainPolicy.awaitBarrier(task -> false, live, 200L));
        } finally {
            release.countDown();
            try { live.join(500L); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        }
    }

    @Test public void refusesToWaitFromWorkerThread() {
        AtomicBoolean result = new AtomicBoolean(true);
        Thread worker = new Thread(() -> result.set(ModeBHandlerDrainPolicy.awaitBarrier(
                task -> true, Thread.currentThread(), 200L)));
        worker.start();
        try { worker.join(500L); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        assertFalse(result.get());
    }

    @Test public void restoresInterruptFlagWhenInterrupted() throws Exception {
        ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
            Thread thread = new Thread(r, "drain-interrupt-test");
            thread.setDaemon(true);
            return thread;
        });
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicReference<Thread> workerThread = new AtomicReference<>();
        worker.submit(() -> {
            workerThread.set(Thread.currentThread());
            started.countDown();
            try { release.await(); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        });
        assertTrue(started.await(500L, TimeUnit.MILLISECONDS));
        CountDownLatch waiting = new CountDownLatch(1);
        AtomicBoolean result = new AtomicBoolean(true);
        AtomicBoolean interruptRestored = new AtomicBoolean(false);
        Thread waiter = new Thread(() -> {
            waiting.countDown();
            result.set(ModeBHandlerDrainPolicy.awaitBarrier(
                    task -> { worker.execute(task); return true; }, workerThread.get(), 5000L));
            interruptRestored.set(Thread.currentThread().isInterrupted());
        });
        waiter.start();
        assertTrue(waiting.await(500L, TimeUnit.MILLISECONDS));
        waiter.interrupt();
        waiter.join(500L);
        release.countDown();
        worker.shutdownNow();
        assertFalse(waiter.isAlive());
        assertFalse(result.get());
        assertTrue(interruptRestored.get());
    }
}
