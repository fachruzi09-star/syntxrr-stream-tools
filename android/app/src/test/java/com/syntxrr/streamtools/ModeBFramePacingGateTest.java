package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.Assert.*;

public class ModeBFramePacingGateTest {
    @Test public void producerWaitsUntilGlAcknowledgesTheOutstandingFrame() throws Exception {
        ModeBFramePacingGate gate = new ModeBFramePacingGate();
        assertTrue(gate.awaitProducerTurn());
        long first = gate.beginFramePost();
        CountDownLatch secondPosted = new CountDownLatch(1);
        AtomicLong secondSequence = new AtomicLong(ModeBFramePacingGate.NO_PENDING_FRAME);
        Thread producer = new Thread(() -> {
            try {
                if (gate.awaitProducerTurn()) {
                    secondSequence.set(gate.beginFramePost());
                    secondPosted.countDown();
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        }, "frame-pacing-producer-test");
        producer.start();

        assertFalse("Second frame must remain blocked before GL consumption",
                secondPosted.await(75L, TimeUnit.MILLISECONDS));
        assertFalse(gate.acknowledgeConsumed(first + 1L));
        assertEquals(first, gate.pendingFrameSequence());
        assertTrue(gate.confirmFramePosted(first));
        assertEquals(first, gate.confirmedPendingFrameSequence());
        assertTrue(gate.acknowledgeConsumed(first));
        assertTrue(secondPosted.await(1L, TimeUnit.SECONDS));
        assertTrue(secondSequence.get() > first);
        assertEquals(secondSequence.get(), gate.pendingFrameSequence());
        producer.join(1_000L);
        assertFalse(producer.isAlive());
    }

    @Test public void gateRejectsASecondOutstandingFrame() {
        ModeBFramePacingGate gate = new ModeBFramePacingGate();
        long first = gate.beginFramePost();
        try {
            gate.beginFramePost();
            fail("Only one unconsumed Surface frame may be outstanding.");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("belum dikonsumsi GL"));
        }
        assertEquals(first, gate.pendingFrameSequence());
    }

    @Test public void successfulConsumptionReleasesExactlyTheMatchingSequence() {
        ModeBFramePacingGate gate = new ModeBFramePacingGate();
        long first = gate.beginFramePost();
        assertFalse(gate.acknowledgeConsumed(0L));
        assertFalse(gate.acknowledgeConsumed(first - 1L));
        assertEquals(first, gate.pendingFrameSequence());
        assertFalse(gate.acknowledgeConsumed(first));
        assertTrue(gate.confirmFramePosted(first));
        assertTrue(gate.acknowledgeConsumed(first));
        assertEquals(ModeBFramePacingGate.NO_PENDING_FRAME, gate.pendingFrameSequence());
        assertFalse(gate.acknowledgeConsumed(first));
    }

    @Test public void consumerThatAcknowledgesBeforeProducerWaitDoesNotLoseWakeup() throws Exception {
        ModeBFramePacingGate gate = new ModeBFramePacingGate();
        long sequence = gate.beginFramePost();
        assertTrue(gate.confirmFramePosted(sequence));
        assertTrue(gate.acknowledgeConsumed(sequence));
        assertTrue(gate.awaitProducerTurn());
    }

    @Test public void closingGateWakesBlockedProducerAndPreventsNewProduction() throws Exception {
        ModeBFramePacingGate gate = new ModeBFramePacingGate();
        gate.beginFramePost();
        CountDownLatch started = new CountDownLatch(1);
        AtomicBoolean canProduce = new AtomicBoolean(true);
        Thread producer = new Thread(() -> {
            started.countDown();
            try {
                canProduce.set(gate.awaitProducerTurn());
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                canProduce.set(true);
            }
        }, "frame-pacing-close-test");
        producer.start();
        assertTrue(started.await(1L, TimeUnit.SECONDS));
        gate.close();
        producer.join(1_000L);
        assertFalse(producer.isAlive());
        assertFalse(canProduce.get());
        assertTrue(gate.isClosed());
        assertFalse(gate.awaitProducerTurn());
    }

    @Test public void closeAllowsAnAlreadyGrantedCanvasPostToFinishButNoNextTurn() throws Exception {
        ModeBFramePacingGate gate = new ModeBFramePacingGate();
        assertTrue(gate.awaitProducerTurn());
        gate.close();
        long finalPost = gate.beginFramePost();
        assertTrue(finalPost > 0L);
        assertFalse(gate.awaitProducerTurn());
        assertEquals(finalPost, gate.pendingFrameSequence());
    }

    @Test public void interruptedProducerWaitCanExitWithoutOpeningTheGate() throws Exception {
        ModeBFramePacingGate gate = new ModeBFramePacingGate();
        gate.beginFramePost();
        CountDownLatch started = new CountDownLatch(1);
        AtomicBoolean interrupted = new AtomicBoolean(false);
        Thread producer = new Thread(() -> {
            started.countDown();
            try {
                gate.awaitProducerTurn();
            } catch (InterruptedException expected) {
                interrupted.set(true);
            }
        }, "frame-pacing-interrupt-test");
        producer.start();
        assertTrue(started.await(1L, TimeUnit.SECONDS));
        producer.interrupt();
        producer.join(1_000L);
        assertFalse(producer.isAlive());
        assertTrue(interrupted.get());
        assertEquals(1L, gate.pendingFrameSequence());
    }
    @Test public void unconfirmedPostCannotBeLatchedOrAcknowledgedByGl() {
        ModeBFramePacingGate gate = new ModeBFramePacingGate();
        long sequence = gate.beginFramePost();
        assertEquals(ModeBFramePacingGate.NO_PENDING_FRAME, gate.confirmedPendingFrameSequence());
        assertFalse(gate.acknowledgeConsumed(sequence));
        assertEquals(sequence, gate.pendingFrameSequence());
        assertTrue(gate.confirmFramePosted(sequence));
        assertEquals(sequence, gate.confirmedPendingFrameSequence());
        assertTrue(gate.acknowledgeConsumed(sequence));
    }

    @Test public void failedSurfacePostLeavesSequenceUnconfirmedUntilTeardown() throws Exception {
        ModeBFramePacingGate gate = new ModeBFramePacingGate();
        long sequence = gate.beginFramePost();
        // No confirmFramePosted call models unlockCanvasAndPost throwing.
        assertFalse(gate.acknowledgeConsumed(sequence));
        assertEquals(ModeBFramePacingGate.NO_PENDING_FRAME, gate.confirmedPendingFrameSequence());
        assertEquals(sequence, gate.pendingFrameSequence());
        gate.close();
        assertFalse(gate.awaitProducerTurn());
    }

}
