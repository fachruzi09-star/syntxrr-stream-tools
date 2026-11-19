package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public final class ModeBOverlayRenderGuardTest {
    @Test
    public void releasePreventsEverySubsequentRenderPassAndRunsOnce() {
        ModeBOverlayRenderGuard guard = new ModeBOverlayRenderGuard();
        AtomicInteger draws = new AtomicInteger();
        AtomicInteger disposals = new AtomicInteger();

        assertTrue(guard.runWhileActive(draws::incrementAndGet));
        guard.release(disposals::incrementAndGet);
        guard.release(disposals::incrementAndGet);

        assertFalse(guard.runWhileActive(draws::incrementAndGet));
        assertEquals(1, draws.get());
        assertEquals(1, disposals.get());
        assertTrue(guard.isReleased());
    }

    @Test
    public void releaseWaitsForInFlightDrawBeforeDisposingAssets() throws Exception {
        ModeBOverlayRenderGuard guard = new ModeBOverlayRenderGuard();
        CountDownLatch drawEntered = new CountDownLatch(1);
        CountDownLatch finishDraw = new CountDownLatch(1);
        CountDownLatch disposed = new CountDownLatch(1);
        AtomicInteger disposals = new AtomicInteger();

        Thread renderThread = new Thread(() -> guard.runWhileActive(() -> {
            drawEntered.countDown();
            try {
                if (!finishDraw.await(2, TimeUnit.SECONDS)) {
                    throw new AssertionError("render pass was not released by test");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError(exception);
            }
        }));
        renderThread.start();
        assertTrue("render thread did not enter the guarded draw", drawEntered.await(1, TimeUnit.SECONDS));

        Thread releaseThread = new Thread(() -> guard.release(() -> {
            disposals.incrementAndGet();
            disposed.countDown();
        }));
        releaseThread.start();
        assertFalse("assets must not be disposed during an in-flight draw", disposed.await(100, TimeUnit.MILLISECONDS));

        finishDraw.countDown();
        assertTrue("release did not finish after drawing stopped", disposed.await(1, TimeUnit.SECONDS));
        renderThread.join(1000);
        releaseThread.join(1000);
        assertEquals(1, disposals.get());
        assertFalse(guard.runWhileActive(() -> { throw new AssertionError("released guard rendered again"); }));
    }

    @Test
    public void nullCallbacksAreSafe() {
        ModeBOverlayRenderGuard guard = new ModeBOverlayRenderGuard();
        assertFalse(guard.runWhileActive(null));
        guard.release(null);
        assertTrue(guard.isReleased());
        assertFalse(guard.runWhileActive(() -> { }));
    }
}
