package com.syntxrr.streamtools;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

public final class ModeBProjectionAttachFailureBarrierTest {
    @Test public void failedAttachDetachesAndDrainsBeforeProducerRetirement() throws Exception {
        ModeBScreenCaptureCallbackGate gate = new ModeBScreenCaptureCallbackGate();
        assertTrue(gate.tryEnter());
        AtomicBoolean detached = new AtomicBoolean(false);
        AtomicBoolean retired = new AtomicBoolean(false);
        AtomicBoolean retiredAfterDetach = new AtomicBoolean(false);
        CountDownLatch rollbackDone = new CountDownLatch(1);
        AtomicReference<RuntimeException> returned = new AtomicReference<>();
        RuntimeException original = new IllegalStateException("createVirtualDisplay failed");

        Thread rollback = new Thread(() -> {
            returned.set(ModeBProjectionAttachFailureBarrier.rollback(
                    gate, () -> detached.set(true), () -> {
                        retiredAfterDetach.set(detached.get());
                        retired.set(true);
                    }, original));
            rollbackDone.countDown();
        }, "projection-attach-rollback-test");
        rollback.start();

        assertTrue(awaitRejected(gate));
        assertTrue(detached.get());
        assertFalse(retired.get());
        assertFalse(rollbackDone.await(30, TimeUnit.MILLISECONDS));
        gate.exit();
        assertTrue(rollbackDone.await(1, TimeUnit.SECONDS));
        rollback.join(1_000L);
        assertFalse(rollback.isAlive());
        assertTrue(retired.get());
        assertTrue(retiredAfterDetach.get());
        assertSame(original, returned.get());
        assertFalse(gate.tryEnter());
    }

    @Test public void detachFailureDoesNotSkipCallbackDrainOrProducerRetirement() {
        ModeBScreenCaptureCallbackGate gate = new ModeBScreenCaptureCallbackGate();
        AtomicBoolean retired = new AtomicBoolean(false);
        RuntimeException original = new IllegalStateException("virtual display rejected");
        RuntimeException result = ModeBProjectionAttachFailureBarrier.rollback(
                gate,
                () -> { throw new IllegalArgumentException("listener detach failed"); },
                () -> retired.set(true),
                original);

        assertSame(original, result);
        assertTrue(retired.get());
        assertEquals(1, original.getSuppressed().length);
        assertFalse(gate.tryEnter());
    }

    @Test public void producerRetirementFailureIsSuppressedOnOriginalAttachFailure() {
        ModeBScreenCaptureCallbackGate gate = new ModeBScreenCaptureCallbackGate();
        RuntimeException original = new IllegalStateException("virtual display rejected");
        RuntimeException result = ModeBProjectionAttachFailureBarrier.rollback(
                gate, () -> { },
                () -> { throw new IllegalStateException("display release failed"); }, original);

        assertSame(original, result);
        assertEquals(1, original.getSuppressed().length);
        assertFalse(gate.tryEnter());
    }

    @Test public void invalidArgumentsAreRejected() {
        try {
            ModeBProjectionAttachFailureBarrier.rollback(null, () -> { }, () -> { },
                    new IllegalStateException("attach failed"));
            throw new AssertionError("Expected invalid gate rejection");
        } catch (IllegalArgumentException expected) { }
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
