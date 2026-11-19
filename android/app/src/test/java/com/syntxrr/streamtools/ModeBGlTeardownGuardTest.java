package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

public class ModeBGlTeardownGuardTest {
    private static final class GlHarness {
        private volatile ExecutorService executor;
        GlHarness(ExecutorService executor) { this.executor = executor; }
    }

    @Test public void captureRetainsExactExecutorInstance() throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        GlHarness gl = new GlHarness(executor);
        ModeBGlTeardownGuard.Guard guard = ModeBGlTeardownGuard.capture(gl);
        executor.shutdown();
        gl.executor = null;
        guard.requireTerminated(1000L);
        assertTrue(executor.isTerminated());
    }

    @Test public void finalCheckRejectsExecutorThatWasNeverShutdown() throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        GlHarness gl = new GlHarness(executor);
        ModeBGlTeardownGuard.Guard guard = ModeBGlTeardownGuard.capture(gl);
        try {
            guard.requireTerminated(20L);
            fail("active GL executor must fail closed");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("masih aktif"));
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(1000L, TimeUnit.MILLISECONDS);
        }
    }

    @Test public void finalCheckRejectsExecutorReferenceNotClearedByRootEncoder() throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        GlHarness gl = new GlHarness(executor);
        ModeBGlTeardownGuard.Guard guard = ModeBGlTeardownGuard.capture(gl);
        executor.shutdown();
        try {
            guard.requireTerminated(1000L);
            fail("stale executor reference must fail closed");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("masih menyimpan"));
        }
        gl.executor = null;
        guard.requireTerminated(1000L);
    }

    @Test public void captureRejectsUnknownGlImplementation() {
        try {
            ModeBGlTeardownGuard.capture(new Object());
            fail("unknown GL implementation must not be treated as verified");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("tidak dapat dipantau"));
        }
    }

    @Test public void stopRetryWaitsForOriginalWorkerBeforeSynchronousRetry() throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        CountDownLatch workerStarted = new CountDownLatch(1);
        CountDownLatch allowWorkerExit = new CountDownLatch(1);
        CountDownLatch retryCalled = new CountDownLatch(1);
        AtomicInteger stopCalls = new AtomicInteger();
        GlHarness gl = new GlHarness(executor);
        executor.submit(() -> {
            workerStarted.countDown();
            boolean done = false;
            while (!done) {
                try { done = allowWorkerExit.await(10L, TimeUnit.MILLISECONDS); }
                catch (InterruptedException ignored) { /* emulate an EGL call that is slow to unwind */ }
            }
        });
        assertTrue(workerStarted.await(1000L, TimeUnit.MILLISECONDS));
        ModeBGlTeardownGuard.Guard guard = ModeBGlTeardownGuard.capture(gl);
        AtomicReference<Throwable> threadFailure = new AtomicReference<>();
        Thread cleanup = new Thread(() -> {
            try {
                guard.stopAndRetry(() -> {
                    int call = stopCalls.incrementAndGet();
                    if (call == 1) {
                        gl.executor = null;
                        executor.shutdownNow();
                    } else {
                        retryCalled.countDown();
                    }
                }, 1500L);
            } catch (Throwable failure) { threadFailure.set(failure); }
        });
        cleanup.start();
        assertFalse(retryCalled.await(100L, TimeUnit.MILLISECONDS));
        allowWorkerExit.countDown();
        assertTrue(retryCalled.await(1500L, TimeUnit.MILLISECONDS));
        cleanup.join(1500L);
        assertFalse(cleanup.isAlive());
        assertEquals(null, threadFailure.get());
        assertEquals(2, stopCalls.get());
        guard.requireTerminated(100L);
    }

    @Test public void stopRetryTimesOutAndDoesNotRunSynchronousRetryEarly() throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        CountDownLatch workerStarted = new CountDownLatch(1);
        CountDownLatch allowWorkerExit = new CountDownLatch(1);
        AtomicInteger stopCalls = new AtomicInteger();
        GlHarness gl = new GlHarness(executor);
        executor.submit(() -> {
            workerStarted.countDown();
            boolean done = false;
            while (!done) {
                try { done = allowWorkerExit.await(10L, TimeUnit.MILLISECONDS); }
                catch (InterruptedException ignored) { }
            }
        });
        assertTrue(workerStarted.await(1000L, TimeUnit.MILLISECONDS));
        ModeBGlTeardownGuard.Guard guard = ModeBGlTeardownGuard.capture(gl);
        try {
            guard.stopAndRetry(() -> {
                stopCalls.incrementAndGet();
                gl.executor = null;
                executor.shutdownNow();
            }, 30L);
            fail("bounded worker timeout must fail closed");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("melewati batas waktu"));
        } finally {
            allowWorkerExit.countDown();
            executor.shutdownNow();
            executor.awaitTermination(1000L, TimeUnit.MILLISECONDS);
        }
        assertEquals(1, stopCalls.get());
    }

    @Test public void alreadyStoppedExecutorIsJoinedBeforeDirectRetry() throws Exception {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        CountDownLatch workerStarted = new CountDownLatch(1);
        CountDownLatch allowWorkerExit = new CountDownLatch(1);
        AtomicBoolean directRetry = new AtomicBoolean(false);
        GlHarness gl = new GlHarness(executor);
        executor.submit(() -> {
            workerStarted.countDown();
            boolean done = false;
            while (!done) {
                try { done = allowWorkerExit.await(10L, TimeUnit.MILLISECONDS); }
                catch (InterruptedException ignored) { }
            }
        });
        assertTrue(workerStarted.await(1000L, TimeUnit.MILLISECONDS));
        ModeBGlTeardownGuard.Guard guard = ModeBGlTeardownGuard.capture(gl);
        gl.executor = null;
        executor.shutdownNow();
        AtomicReference<Throwable> threadFailure = new AtomicReference<>();
        Thread cleanup = new Thread(() -> {
            try { guard.stopAndRetry(() -> directRetry.set(true), 1500L); }
            catch (Throwable failure) { threadFailure.set(failure); }
        });
        cleanup.start();
        assertFalse(directRetry.get());
        allowWorkerExit.countDown();
        cleanup.join(1500L);
        assertFalse(cleanup.isAlive());
        assertEquals(null, threadFailure.get());
        assertTrue(directRetry.get());
    }

    @Test public void nullExecutorSnapshotStillRunsDirectGlStop() {
        AtomicInteger calls = new AtomicInteger();
        ModeBGlTeardownGuard.Guard guard = ModeBGlTeardownGuard.capture(new GlHarness(null));
        guard.stopAndRetry(calls::incrementAndGet, 100L);
        guard.requireTerminated(100L);
        assertEquals(1, calls.get());
    }

    @Test public void shutdownExecutorStillStoredInFieldIsClearedBeforeSynchronousRetry() {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        GlHarness gl = new GlHarness(executor);
        executor.shutdown();
        ModeBGlTeardownGuard.Guard guard = ModeBGlTeardownGuard.capture(gl);
        AtomicInteger calls = new AtomicInteger();
        guard.stopAndRetry(() -> {
            int call = calls.incrementAndGet();
            if (call == 1) gl.executor = null; // emulate RootEncoder clearing stale field
        }, 1000L);
        assertEquals(2, calls.get());
        guard.requireTerminated(100L);
    }

}
