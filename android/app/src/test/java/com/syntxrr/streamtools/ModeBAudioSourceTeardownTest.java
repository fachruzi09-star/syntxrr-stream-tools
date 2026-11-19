package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

public class ModeBAudioSourceTeardownTest {
    @Test public void stopFailureDoesNotSkipReleaseOrLaterSources() {
        List<String> order = new ArrayList<>();
        ModeBAudioSourceTeardown.Result result = ModeBAudioSourceTeardown.run(java.util.Arrays.asList(
                new ModeBAudioSourceTeardown.Source() {
                    @Override public void stop() { order.add("first-stop"); throw new IllegalStateException("first stop failed"); }
                    @Override public void release() { order.add("first-release"); }
                },
                new ModeBAudioSourceTeardown.Source() {
                    @Override public void stop() { order.add("second-stop"); }
                    @Override public void release() { order.add("second-release"); }
                }));
        assertFalse(result.isSuccessful());
        assertEquals(java.util.Arrays.asList("first-stop", "first-release", "second-stop", "second-release"), order);
        assertTrue(result.failureMessage().contains("first stop failed"));
    }

    @Test public void stopAndReleaseFailuresAreBothPreserved() {
        ModeBAudioSourceTeardown.Result result = ModeBAudioSourceTeardown.run(java.util.Collections.singletonList(
                new ModeBAudioSourceTeardown.Source() {
                    @Override public void stop() { throw new IllegalStateException("audio stop failed"); }
                    @Override public void release() { throw new IllegalArgumentException("audio release failed"); }
                }));
        assertFalse(result.isSuccessful());
        assertTrue(result.failureMessage().contains("audio stop failed"));
        assertTrue(result.failureMessage().contains("audio release failed"));
    }

    @Test public void fatalErrorIsPreservedAndReleaseStillRuns() {
        final boolean[] releaseCalled = {false};
        ModeBAudioSourceTeardown.Result result = ModeBAudioSourceTeardown.run(java.util.Collections.singletonList(
                new ModeBAudioSourceTeardown.Source() {
                    @Override public void stop() { throw new AssertionError("audio stop error"); }
                    @Override public void release() { releaseCalled[0] = true; }
                }));
        assertFalse(result.isSuccessful());
        assertTrue(releaseCalled[0]);
        assertTrue(result.failureMessage().contains("audio stop error"));
        try {
            result.throwIfFailed();
            throw new AssertionError("Expected original Error to be rethrown");
        } catch (AssertionError expected) {
            assertEquals("audio stop error", expected.getMessage());
        }
    }

    @Test public void emptySourceListIsSuccessful() {
        assertTrue(ModeBAudioSourceTeardown.run(java.util.Collections.emptyList()).isSuccessful());
    }
}
