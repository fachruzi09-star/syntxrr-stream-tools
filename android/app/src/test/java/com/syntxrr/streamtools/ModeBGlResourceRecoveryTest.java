package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class ModeBGlResourceRecoveryTest {
    @Test public void attemptsWorkerCheckAndManagerCleanupAfterStopThrows() {
        List<String> order = new ArrayList<>();
        try {
            ModeBGlResourceRecovery.run(
                    () -> { order.add("stop"); throw new IllegalStateException("stop failed"); },
                    () -> order.add("worker"),
                    () -> order.add("managers"));
            fail("stop failure must remain visible");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("tidak menyelesaikan"));
            assertEquals("stop failed", expected.getCause().getMessage());
        }
        assertEquals(Arrays.asList("stop", "worker", "managers"), order);
    }

    @Test public void neverTouchesManagersWhenWorkerRetirementIsNotConfirmed() {
        List<String> order = new ArrayList<>();
        try {
            ModeBGlResourceRecovery.run(
                    () -> order.add("stop"),
                    () -> { order.add("worker"); throw new IllegalStateException("worker alive"); },
                    () -> order.add("managers"));
            fail("live worker must block EGL calls");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("worker GL belum terbukti berhenti"));
            assertEquals("worker alive", expected.getCause().getMessage());
        }
        assertEquals(Arrays.asList("stop", "worker"), order);
    }

    @Test public void aggregatesStopAndManagerFailuresAfterWorkerHasRetired() {
        try {
            ModeBGlResourceRecovery.run(
                    () -> { throw new IllegalStateException("stop"); },
                    () -> { },
                    () -> { throw new IllegalArgumentException("manager"); });
            fail("both independent failures must remain visible");
        } catch (IllegalStateException expected) {
            assertEquals("stop", expected.getCause().getMessage());
            assertEquals(1, expected.getCause().getSuppressed().length);
            assertEquals("manager", expected.getCause().getSuppressed()[0].getMessage());
        }
    }

    @Test public void successfulRecoveryRunsAllStagesOnceInOrder() {
        List<String> order = new ArrayList<>();
        ModeBGlResourceRecovery.run(() -> order.add("stop"),
                () -> order.add("worker"), () -> order.add("managers"));
        assertEquals(Arrays.asList("stop", "worker", "managers"), order);
    }

    @Test public void validatesRequiredCallbacksBeforeRunningAnyStage() {
        AtomicInteger calls = new AtomicInteger();
        try {
            ModeBGlResourceRecovery.run(calls::incrementAndGet, null, calls::incrementAndGet);
            fail("missing worker check must be rejected");
        } catch (IllegalArgumentException expected) { }
        assertEquals(0, calls.get());
    }
}
