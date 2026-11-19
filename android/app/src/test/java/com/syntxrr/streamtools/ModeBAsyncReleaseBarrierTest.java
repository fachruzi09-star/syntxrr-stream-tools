package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public final class ModeBAsyncReleaseBarrierTest {
    @Test public void waitsForEveryDecoderAndVisualWorkerParticipant() {
        AtomicInteger callbacks = new AtomicInteger();
        ModeBAsyncReleaseBarrier barrier = new ModeBAsyncReleaseBarrier(3, callbacks::incrementAndGet);
        assertTrue(barrier.arrive()); // video decoder
        assertEquals(0, callbacks.get());
        assertTrue(barrier.arrive()); // audio decoder
        assertEquals(0, callbacks.get());
        assertTrue(barrier.arrive()); // visual-worker FIFO barrier
        assertEquals(1, callbacks.get());
        assertTrue(barrier.isCompletedForTest());
    }

    @Test public void duplicateArrivalsCannotCompleteTwice() {
        AtomicInteger callbacks = new AtomicInteger();
        ModeBAsyncReleaseBarrier barrier = new ModeBAsyncReleaseBarrier(1, callbacks::incrementAndGet);
        assertTrue(barrier.arrive());
        assertFalse(barrier.arrive());
        assertFalse(barrier.arrive());
        assertEquals(1, callbacks.get());
    }

    @Test public void concurrentArrivalsCompleteExactlyOnce() throws Exception {
        AtomicInteger callbacks = new AtomicInteger();
        ModeBAsyncReleaseBarrier barrier = new ModeBAsyncReleaseBarrier(32, callbacks::incrementAndGet);
        CountDownLatch ready = new CountDownLatch(32);
        CountDownLatch start = new CountDownLatch(1);
        Thread[] threads = new Thread[32];
        for (int i = 0; i < threads.length; i++) {
            threads[i] = new Thread(() -> {
                ready.countDown();
                try { start.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
                barrier.arrive();
            });
            threads[i].start();
        }
        assertTrue(ready.await(1, TimeUnit.SECONDS));
        start.countDown();
        for (Thread thread : threads) thread.join(1_000L);
        assertEquals(1, callbacks.get());
        assertEquals(0, barrier.remainingForTest());
    }
}
