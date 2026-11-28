package com.syntxrr.streamtools;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** Offline deterministic concurrency unit tests for NativeTikTokEventBatchEpochGate. */
public class NativeTikTokEventBatchEpochGateTest {

    @Test
    public void currentEpochPermitsDeliveryActionOnce() {
        NativeTikTokEventBatchEpochGate gate = new NativeTikTokEventBatchEpochGate();
        long epoch = gate.getCurrentEpoch();
        AtomicInteger runs = new AtomicInteger(0);

        boolean executed = gate.runIfCurrent(epoch, runs::incrementAndGet);

        assertTrue(executed);
        assertEquals(1, runs.get());
    }

    @Test
    public void staleEpochCapturedBeforeAdvanceIsRejectedAfterward() {
        NativeTikTokEventBatchEpochGate gate = new NativeTikTokEventBatchEpochGate();
        long staleEpoch = gate.getCurrentEpoch();
        long nextEpoch = gate.advanceEpoch();

        assertTrue(nextEpoch > staleEpoch);

        AtomicInteger staleRuns = new AtomicInteger(0);
        boolean executed = gate.runIfCurrent(staleEpoch, staleRuns::incrementAndGet);

        assertFalse(executed);
        assertEquals(0, staleRuns.get());
    }

    @Test
    public void newCurrentEpochPermitsDeliveryNormally() {
        NativeTikTokEventBatchEpochGate gate = new NativeTikTokEventBatchEpochGate();
        long epoch1 = gate.getCurrentEpoch();
        long epoch2 = gate.advanceEpoch();
        assertTrue(epoch2 > epoch1);

        AtomicInteger runs = new AtomicInteger(0);
        assertTrue(gate.runIfCurrent(epoch2, runs::incrementAndGet));
        assertEquals(1, runs.get());
    }

    @Test
    public void inFlightDeliverySerializesAgainstConcurrentAdvanceAndRejectsSubsequentStaleWork() throws Exception {
        NativeTikTokEventBatchEpochGate gate = new NativeTikTokEventBatchEpochGate();
        long epoch1 = gate.getCurrentEpoch();

        CountDownLatch deliveryEntered = new CountDownLatch(1);
        CountDownLatch allowDeliveryFinish = new CountDownLatch(1);
        CountDownLatch advanceThreadStarted = new CountDownLatch(1);
        CountDownLatch advanceFinished = new CountDownLatch(1);

        AtomicBoolean deliveryFinished = new AtomicBoolean(false);
        AtomicBoolean advanceObservedDeliveryFinished = new AtomicBoolean(false);
        AtomicBoolean deliveryResult = new AtomicBoolean(false);
        AtomicLong advancedEpochRef = new AtomicLong(0L);
        List<String> timeline = Collections.synchronizedList(new ArrayList<>());

        Thread deliveryThread = new Thread(() -> {
            boolean ran = gate.runIfCurrent(epoch1, () -> {
                deliveryEntered.countDown();
                try {
                    assertTrue(allowDeliveryFinish.await(5, TimeUnit.SECONDS));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError("Delivery thread interrupted unexpectedly", e);
                }
                deliveryFinished.set(true);
                timeline.add("delivery_completed");
            });
            deliveryResult.set(ran);
        }, "epoch-gate-delivery-test");

        Thread advanceThread = new Thread(() -> {
            advanceThreadStarted.countDown();
            long epoch2 = gate.advanceEpoch();
            advanceObservedDeliveryFinished.set(deliveryFinished.get());
            timeline.add("advance_completed");
            advancedEpochRef.set(epoch2);
            advanceFinished.countDown();
        }, "epoch-gate-advance-test");

        deliveryThread.start();
        assertTrue("Delivery action must claim current epoch", deliveryEntered.await(5, TimeUnit.SECONDS));

        advanceThread.start();
        assertTrue("Advance thread must start", advanceThreadStarted.await(5, TimeUnit.SECONDS));

        // While the in-flight delivery still holds the gate, it has not finished and advanceEpoch() cannot complete.
        assertFalse(deliveryFinished.get());
        assertEquals(1L, advanceFinished.getCount());

        // Release the in-flight delivery and verify serialized completion order.
        allowDeliveryFinish.countDown();
        deliveryThread.join(5000);
        assertTrue("advanceEpoch must complete after delivery exits", advanceFinished.await(5, TimeUnit.SECONDS));
        advanceThread.join(5000);

        assertTrue(deliveryResult.get());
        assertTrue(advanceObservedDeliveryFinished.get());
        assertEquals(2, timeline.size());
        assertEquals("delivery_completed", timeline.get(0));
        assertEquals("advance_completed", timeline.get(1));

        long epoch2 = advancedEpochRef.get();
        assertTrue(epoch2 > epoch1);
        assertEquals(epoch2, gate.getCurrentEpoch());

        // Once advanceEpoch() completes, any remaining work with epoch1 is rejected, while epoch2 runs.
        AtomicInteger staleRuns = new AtomicInteger(0);
        AtomicInteger freshRuns = new AtomicInteger(0);
        assertFalse(gate.runIfCurrent(epoch1, staleRuns::incrementAndGet));
        assertEquals(0, staleRuns.get());
        assertTrue(gate.runIfCurrent(epoch2, freshRuns::incrementAndGet));
        assertEquals(1, freshRuns.get());
    }
}
