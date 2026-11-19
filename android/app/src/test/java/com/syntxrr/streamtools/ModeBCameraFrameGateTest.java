package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public final class ModeBCameraFrameGateTest {
    @Test public void allowsOnlyOneQueuedOrConvertingCameraFrame() {
        ModeBCameraFrameGate gate = new ModeBCameraFrameGate();
        assertFalse(gate.isPending());
        assertTrue(gate.tryAcquire());
        assertTrue(gate.isPending());
        assertFalse(gate.tryAcquire());
        assertFalse(gate.tryAcquire());
        gate.release();
        assertFalse(gate.isPending());
        assertTrue(gate.tryAcquire());
    }

    @Test public void repeatedReleaseIsSafeDuringTeardown() {
        ModeBCameraFrameGate gate = new ModeBCameraFrameGate();
        assertTrue(gate.tryAcquire());
        gate.release();
        gate.release();
        assertFalse(gate.isPending());
        assertTrue(gate.tryAcquire());
    }

    @Test public void concurrentCameraCallbacksCannotQueueTwoFrames() throws Exception {
        final int contenders = 8;
        ModeBCameraFrameGate gate = new ModeBCameraFrameGate();
        CountDownLatch ready = new CountDownLatch(contenders);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch attempted = new CountDownLatch(contenders);
        CountDownLatch released = new CountDownLatch(1);
        AtomicInteger winners = new AtomicInteger();
        for (int i = 0; i < contenders; i++) {
            Thread thread = new Thread(() -> {
                ready.countDown();
                try {
                    start.await();
                    if (gate.tryAcquire()) {
                        winners.incrementAndGet();
                        attempted.countDown();
                        attempted.await();
                        gate.release();
                        released.countDown();
                    } else {
                        attempted.countDown();
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
            }, "camera-frame-gate-test-" + i);
            thread.start();
        }
        assertTrue(ready.await(2, TimeUnit.SECONDS));
        start.countDown();
        assertTrue(attempted.await(2, TimeUnit.SECONDS));
        assertTrue(released.await(2, TimeUnit.SECONDS));
        assertEquals(1, winners.get());
        assertFalse(gate.isPending());
    }
}
