package com.syntxrr.streamtools;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class ModeBScreenCaptureCallbackGateTest {
    @Test public void pauseRejectsNewCallbacksAndWaitsForExistingCallback() throws Exception {
        ModeBScreenCaptureCallbackGate gate = new ModeBScreenCaptureCallbackGate();
        assertTrue(gate.tryEnter());
        CountDownLatch pauseDone = new CountDownLatch(1);
        Thread pauser = new Thread(() -> {
            gate.pauseAndAwait();
            pauseDone.countDown();
        }, "screen-capture-pause-test");
        pauser.start();

        assertTrue(awaitRejected(gate));
        assertFalse(pauseDone.await(30, TimeUnit.MILLISECONDS));
        gate.exit();
        assertTrue(pauseDone.await(1, TimeUnit.SECONDS));
        pauser.join(1_000L);
        assertFalse(pauser.isAlive());
        assertFalse(gate.tryEnter());
    }

    @Test public void resumeAllowsCallbacksAfterSuspensionDrain() {
        ModeBScreenCaptureCallbackGate gate = new ModeBScreenCaptureCallbackGate();
        gate.pauseAndAwait();
        assertFalse(gate.tryEnter());
        gate.resume();
        assertTrue(gate.tryEnter());
        gate.exit();
    }

    @Test public void closeWaitsForAllCallbacksAndCannotBeReopened() throws Exception {
        ModeBScreenCaptureCallbackGate gate = new ModeBScreenCaptureCallbackGate();
        assertTrue(gate.tryEnter());
        assertTrue(gate.tryEnter());
        CountDownLatch closeDone = new CountDownLatch(1);
        Thread closer = new Thread(() -> {
            gate.closeAndAwait();
            closeDone.countDown();
        }, "screen-capture-close-test");
        closer.start();

        assertTrue(awaitRejected(gate));
        gate.exit();
        assertFalse(closeDone.await(30, TimeUnit.MILLISECONDS));
        gate.exit();
        assertTrue(closeDone.await(1, TimeUnit.SECONDS));
        closer.join(1_000L);
        assertFalse(closer.isAlive());
        gate.resume();
        assertFalse(gate.tryEnter());
    }

    @Test public void interruptedCloseStillDrainsAndRestoresInterruptFlag() throws Exception {
        ModeBScreenCaptureCallbackGate gate = new ModeBScreenCaptureCallbackGate();
        assertTrue(gate.tryEnter());
        CountDownLatch closeDone = new CountDownLatch(1);
        AtomicBoolean interruptRestored = new AtomicBoolean(false);
        Thread closer = new Thread(() -> {
            gate.closeAndAwait();
            interruptRestored.set(Thread.currentThread().isInterrupted());
            closeDone.countDown();
        }, "screen-capture-interrupted-close-test");
        closer.start();

        assertTrue(awaitRejected(gate));
        closer.interrupt();
        assertFalse(closeDone.await(30, TimeUnit.MILLISECONDS));
        gate.exit();
        assertTrue(closeDone.await(1, TimeUnit.SECONDS));
        closer.join(1_000L);
        assertFalse(closer.isAlive());
        assertTrue(interruptRestored.get());
    }

    private static boolean awaitRejected(ModeBScreenCaptureCallbackGate gate) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
        while (System.nanoTime() < deadline) {
            if (!gate.tryEnter()) return true;
            gate.exit();
            Thread.yield();
        }
        return false;
    }
}
