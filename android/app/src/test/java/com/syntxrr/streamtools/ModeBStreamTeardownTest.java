package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class ModeBStreamTeardownTest {
    @Test public void releaseIsAttemptedWhenStopThrows() {
        AtomicInteger releases = new AtomicInteger();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                () -> { throw new IllegalStateException("stop failed"); },
                releases::incrementAndGet);
        assertFalse(result.isSuccessful());
        assertEquals(1, releases.get());
        assertTrue(result.failureMessage().contains("stop failed"));
    }

    @Test public void stopIsAttemptedWhenReleaseThrows() {
        AtomicInteger stops = new AtomicInteger();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                stops::incrementAndGet,
                () -> { throw new IllegalArgumentException("release failed"); });
        assertFalse(result.isSuccessful());
        assertEquals(1, stops.get());
        assertTrue(result.failureMessage().contains("release failed"));
    }

    @Test public void bothFailuresArePreserved() {
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                () -> { throw new IllegalStateException("stop failed"); },
                () -> { throw new IllegalArgumentException("release failed"); });
        assertFalse(result.isSuccessful());
        assertTrue(result.failureMessage().contains("stop failed"));
        assertTrue(result.failureMessage().contains("release failed"));
    }

    @Test public void noStreamOperationsMeansSuccessfulTeardown() {
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(null, null);
        assertTrue(result.isSuccessful());
        assertEquals("", result.failureMessage());
    }

    @Test public void successfulOperationsRunOnceInOrder() {
        StringBuilder order = new StringBuilder();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                () -> order.append("stop"), () -> order.append("release"));
        assertTrue(result.isSuccessful());
        assertEquals("stoprelease", order.toString());
    }
    @Test public void directSourceFallbackRunsAfterReleaseFailure() {
        AtomicInteger fallback = new AtomicInteger();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                null,
                () -> { throw new IllegalStateException("release failed"); },
                fallback::incrementAndGet);
        assertFalse(result.isSuccessful());
        assertEquals(1, fallback.get());
        assertTrue(result.failureMessage().contains("release failed"));
    }

    @Test public void directSourceFallbackFailureIsPreserved() {
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                null, null,
                () -> { throw new IllegalStateException("direct source join timeout"); });
        assertFalse(result.isSuccessful());
        assertTrue(result.failureMessage().contains("direct source join timeout"));
    }
    @Test public void finalDirectWorkerCheckRunsAfterSuccessfulRootEncoderRelease() {
        StringBuilder order = new StringBuilder();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                null,
                () -> order.append("root-release"),
                () -> { order.append("strict-worker-check"); throw new IllegalStateException("worker still alive"); });
        assertFalse(result.isSuccessful());
        assertEquals("root-releasestrict-worker-check", order.toString());
        assertTrue(result.failureMessage().contains("worker still alive"));
    }


    @Test public void allThreeTeardownStagesAreAttemptedAndFailuresPreserved() {
        StringBuilder order = new StringBuilder();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                () -> { order.append("stop"); throw new IllegalStateException("stop failed"); },
                () -> { order.append("release"); throw new IllegalArgumentException("release failed"); },
                () -> { order.append("fallback"); throw new IllegalStateException("fallback failed"); });
        assertFalse(result.isSuccessful());
        assertEquals("stopreleasefallback", order.toString());
        assertTrue(result.failureMessage().contains("stop failed"));
        assertTrue(result.failureMessage().contains("release failed"));
        assertTrue(result.failureMessage().contains("fallback failed"));
    }

    @Test public void audioSourceFallbackRunsAfterBothStreamAndVideoFallbackFailures() {
        StringBuilder order = new StringBuilder();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                () -> { order.append("stop"); throw new IllegalStateException("stream stop failed"); },
                () -> { order.append("release"); throw new IllegalArgumentException("stream release failed"); },
                () -> { order.append("video"); throw new IllegalStateException("video stop failed"); },
                () -> order.append("audio"));
        assertFalse(result.isSuccessful());
        assertEquals("stopreleasevideoaudio", order.toString());
        assertTrue(result.failureMessage().contains("stream stop failed"));
        assertTrue(result.failureMessage().contains("stream release failed"));
        assertTrue(result.failureMessage().contains("video stop failed"));
    }

    @Test public void audioFallbackFailureIsPreservedAlongsideEarlierFailures() {
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                null,
                () -> { throw new IllegalStateException("video source stop failed"); },
                null,
                () -> { throw new IllegalArgumentException("audio source release failed"); });
        assertFalse(result.isSuccessful());
        assertTrue(result.failureMessage().contains("video source stop failed"));
        assertTrue(result.failureMessage().contains("audio source release failed"));
    }

    @Test public void audioFallbackIsSkippedWhenRootEncoderReleaseSucceeds() {
        AtomicInteger audioFallbacks = new AtomicInteger();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                null, () -> { }, null, audioFallbacks::incrementAndGet);
        assertTrue(result.isSuccessful());
        assertEquals(0, audioFallbacks.get());
    }

    @Test public void audioFallbackRunsWhenNoStreamOwnsTheSource() {
        AtomicInteger audioFallbacks = new AtomicInteger();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                null, null, null, audioFallbacks::incrementAndGet);
        assertTrue(result.isSuccessful());
        assertEquals(1, audioFallbacks.get());
    }


    @Test public void glFallbackRunsAfterReleaseFailureAndWorkerCheckRunsLast() {
        StringBuilder order = new StringBuilder();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                () -> order.append("stop"),
                () -> { order.append("release"); throw new IllegalStateException("release failed"); },
                () -> order.append("video"),
                () -> order.append("audio"),
                () -> order.append("gl-retry"),
                () -> order.append("gl-worker-check"));
        assertFalse(result.isSuccessful());
        assertEquals("stopreleasevideoaudiogl-retrygl-worker-check", order.toString());
        assertTrue(result.failureMessage().contains("release failed"));
    }

    @Test public void glFallbackIsSkippedWhenRootEncoderReleaseSucceedsButWorkerCheckIsMandatory() {
        AtomicInteger glFallbacks = new AtomicInteger();
        AtomicInteger glChecks = new AtomicInteger();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                null, () -> { }, null, null,
                glFallbacks::incrementAndGet,
                glChecks::incrementAndGet);
        assertTrue(result.isSuccessful());
        assertEquals(0, glFallbacks.get());
        assertEquals(1, glChecks.get());
    }

    @Test public void glFallbackRunsWhenReleaseOperationIsUnavailable() {
        AtomicInteger glFallbacks = new AtomicInteger();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                null, null, null, null, glFallbacks::incrementAndGet, null);
        assertTrue(result.isSuccessful());
        assertEquals(1, glFallbacks.get());
    }

    @Test public void glWorkerCheckFailureMakesTeardownFailClosedEvenAfterReleaseSuccess() {
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                null, () -> { }, null, null, null,
                () -> { throw new IllegalStateException("GL executor still alive"); });
        assertFalse(result.isSuccessful());
        assertTrue(result.failureMessage().contains("GL executor still alive"));
    }

    @Test public void allTeardownFailuresIncludingGlArePreserved() {
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                () -> { throw new IllegalStateException("stop failed"); },
                () -> { throw new IllegalArgumentException("release failed"); },
                () -> { throw new IllegalStateException("video failed"); },
                () -> { throw new IllegalArgumentException("audio failed"); },
                () -> { throw new IllegalStateException("gl retry failed"); },
                () -> { throw new IllegalStateException("gl check failed"); });
        assertFalse(result.isSuccessful());
        assertTrue(result.failureMessage().contains("stop failed"));
        assertTrue(result.failureMessage().contains("release failed"));
        assertTrue(result.failureMessage().contains("video failed"));
        assertTrue(result.failureMessage().contains("audio failed"));
        assertTrue(result.failureMessage().contains("gl retry failed"));
        assertTrue(result.failureMessage().contains("gl check failed"));
    }


    @Test public void glFallbackRetriesWhenPostReleaseCheckFailsAndRechecks() {
        StringBuilder order = new StringBuilder();
        AtomicInteger checks = new AtomicInteger();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                null,
                () -> order.append("release"),
                null,
                null,
                () -> order.append("gl-retry"),
                () -> {
                    int check = checks.incrementAndGet();
                    order.append("check").append(check);
                    if (check == 1) throw new IllegalStateException("first GL postcondition failed");
                });
        assertTrue(result.isSuccessful());
        assertEquals("releasecheck1gl-retrycheck2", order.toString());
        assertEquals(2, checks.get());
        assertEquals("", result.failureMessage());
    }

    @Test public void glRecoveryFailureAndFinalCheckFailureArePreserved() {
        AtomicInteger checks = new AtomicInteger();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                null, () -> { }, null, null,
                () -> { throw new IllegalArgumentException("GL recovery failed"); },
                () -> {
                    int check = checks.incrementAndGet();
                    throw new IllegalStateException(check == 1
                            ? "initial EGL state failed" : "final EGL state failed");
                });
        assertFalse(result.isSuccessful());
        assertEquals(2, checks.get());
        assertTrue(result.failureMessage().contains("initial EGL state failed"));
        assertTrue(result.failureMessage().contains("GL recovery failed"));
        assertTrue(result.failureMessage().contains("final EGL state failed"));
    }

    @Test public void glFallbackIsNotRepeatedWhenReleaseFailureAlreadyTriggeredIt() {
        AtomicInteger fallbacks = new AtomicInteger();
        AtomicInteger checks = new AtomicInteger();
        ModeBStreamTeardown.Result result = ModeBStreamTeardown.run(
                null,
                () -> { throw new IllegalStateException("RootEncoder release failed"); },
                null, null,
                fallbacks::incrementAndGet,
                () -> {
                    checks.incrementAndGet();
                    throw new IllegalStateException("post-release GL check failed");
                });
        assertFalse(result.isSuccessful());
        assertEquals(1, fallbacks.get());
        assertEquals(1, checks.get());
        assertTrue(result.failureMessage().contains("RootEncoder release failed"));
        assertTrue(result.failureMessage().contains("post-release GL check failed"));
    }

}

