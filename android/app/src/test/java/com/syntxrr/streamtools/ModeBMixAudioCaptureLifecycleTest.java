package com.syntxrr.streamtools;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public final class ModeBMixAudioCaptureLifecycleTest {
    @Test public void repeatedStartWhileRunningDoesNotAllocateAnotherCapture() {
        ModeBMixAudioCaptureLifecycle lifecycle = new ModeBMixAudioCaptureLifecycle();
        int[] starts = {0};
        lifecycle.start(() -> starts[0]++);
        lifecycle.start(() -> starts[0]++);
        assertEquals(1, starts[0]);
        assertTrue(lifecycle.isRunning());
        assertTrue(lifecycle.mayOwnResources());
    }

    @Test public void successfulStopAllowsExactlyOneNewCaptureGeneration() {
        ModeBMixAudioCaptureLifecycle lifecycle = new ModeBMixAudioCaptureLifecycle();
        int[] starts = {0};
        int[] stops = {0};
        lifecycle.start(() -> starts[0]++);
        lifecycle.stop(() -> stops[0]++);
        lifecycle.stop(() -> stops[0]++);
        lifecycle.start(() -> starts[0]++);
        assertEquals(2, starts[0]);
        assertEquals(1, stops[0]);
        assertTrue(lifecycle.isRunning());
    }

    @Test public void failedPartialStartRemainsEligibleForCleanup() {
        ModeBMixAudioCaptureLifecycle lifecycle = new ModeBMixAudioCaptureLifecycle();
        IllegalStateException failure = new IllegalStateException("internal recorder rejected");
        assertThrows(IllegalStateException.class, () -> lifecycle.start(() -> { throw failure; }));
        assertFalse(lifecycle.isRunning());
        assertTrue(lifecycle.mayOwnResources());
        int[] stops = {0};
        lifecycle.stop(() -> stops[0]++);
        assertEquals(1, stops[0]);
        assertFalse(lifecycle.mayOwnResources());
    }

    @Test public void cleanupFailureKeepsResourcesEligibleForRetry() {
        ModeBMixAudioCaptureLifecycle lifecycle = new ModeBMixAudioCaptureLifecycle();
        lifecycle.start(() -> { });
        assertThrows(IllegalStateException.class,
                () -> lifecycle.stop(() -> { throw new IllegalStateException("AudioRecord stop failed"); }));
        assertFalse(lifecycle.isRunning());
        assertTrue(lifecycle.mayOwnResources());
        int[] retries = {0};
        lifecycle.stop(() -> retries[0]++);
        assertEquals(1, retries[0]);
        assertFalse(lifecycle.mayOwnResources());
    }

    @Test public void failedStartCanBeRestartedOnlyAfterCleanup() {
        ModeBMixAudioCaptureLifecycle lifecycle = new ModeBMixAudioCaptureLifecycle();
        assertThrows(IllegalArgumentException.class,
                () -> lifecycle.start(() -> { throw new IllegalArgumentException("capture create failed"); }));
        assertThrows(IllegalStateException.class, () -> lifecycle.start(() -> { }));
        lifecycle.stop(() -> { });
        lifecycle.start(() -> { });
        assertTrue(lifecycle.isRunning());
    }
}
