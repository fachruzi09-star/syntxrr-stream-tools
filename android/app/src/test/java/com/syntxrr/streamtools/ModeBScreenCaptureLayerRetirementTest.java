package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class ModeBScreenCaptureLayerRetirementTest {
    @Test public void detachesFrameListenerBeforeReleasingVirtualDisplay() {
        List<String> order = new ArrayList<>();
        RuntimeException failure = ModeBScreenCaptureLayerRetirement.releaseBeforeRenderer(
                () -> order.add("listener"), () -> order.add("display"));
        assertNull(failure);
        assertEquals(Arrays.asList("listener", "display"), order);
    }

    @Test public void displayReleaseStillRunsWhenListenerDetachThrows() {
        AtomicInteger display = new AtomicInteger();
        RuntimeException failure = ModeBScreenCaptureLayerRetirement.releaseBeforeRenderer(
                () -> { throw new IllegalStateException("listener"); }, display::incrementAndGet);
        assertNotNull(failure);
        assertEquals("listener", failure.getMessage());
        assertEquals(1, display.get());
    }

    @Test public void listenerDetachFailureIsReportedWhenDisplayIsAbsent() {
        RuntimeException failure = ModeBScreenCaptureLayerRetirement.releaseBeforeRenderer(
                () -> { throw new IllegalStateException("listener"); }, null);
        assertNotNull(failure);
        assertEquals("listener", failure.getMessage());
    }

    @Test public void displayReleaseFailureIsReportedAfterListenerDetach() {
        AtomicInteger listener = new AtomicInteger();
        RuntimeException failure = ModeBScreenCaptureLayerRetirement.releaseBeforeRenderer(
                listener::incrementAndGet, () -> { throw new IllegalStateException("display"); });
        assertNotNull(failure);
        assertEquals("display", failure.getMessage());
        assertEquals(1, listener.get());
    }

    @Test public void independentFailuresAreAggregated() {
        RuntimeException failure = ModeBScreenCaptureLayerRetirement.releaseBeforeRenderer(
                () -> { throw new IllegalStateException("listener"); },
                () -> { throw new IllegalArgumentException("display"); });
        assertNotNull(failure);
        assertEquals("listener", failure.getMessage());
        assertEquals(1, failure.getSuppressed().length);
        assertEquals("display", failure.getSuppressed()[0].getMessage());
    }

    @Test public void absentLayerActionsAreNoOp() {
        assertNull(ModeBScreenCaptureLayerRetirement.releaseBeforeRenderer(null, null));
    }
}
