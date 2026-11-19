package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

public class ModeBAudioSourceSwapTest {
    @Test public void successfulReplacementDoesNotRetireCandidate() {
        int[] calls = {0};
        ModeBAudioSourceSwap.replace(() -> calls[0]++, () -> calls[0] += 100);
        assertEquals(1, calls[0]);
    }

    @Test public void failedReplacementCleansCandidateAfterRootEncoderRestoresOldSource() {
        RuntimeException failure = new IllegalStateException("capture start failed");
        int[] calls = {0};
        RuntimeException thrown = assertThrows(RuntimeException.class, () ->
                ModeBAudioSourceSwap.replace(() -> { calls[0]++; throw failure; }, () -> calls[0] += 10));
        assertSame(failure, thrown);
        assertEquals(11, calls[0]);
    }

    @Test public void fallbackIsAllowedOnlyWhenCandidateCleanupIsCertain() {
        RuntimeException cleanFailure = new IllegalStateException("capture start failed");
        RuntimeException cleanupFailure = new IllegalArgumentException("cleanup failed");
        assertEquals(true, ModeBAudioSourceSwap.isRecoverySafe(cleanFailure));
        cleanFailure.addSuppressed(cleanupFailure);
        assertEquals(false, ModeBAudioSourceSwap.isRecoverySafe(cleanFailure));
        assertEquals(false, ModeBAudioSourceSwap.isRecoverySafe(null));
    }

    @Test public void failedRollbackMarksRecoveryUnsafe() {
        RuntimeException failure = new IllegalStateException("replacement and rollback failed");
        int[] cleanupCalls = {0};
        RuntimeException thrown = assertThrows(RuntimeException.class, () ->
                ModeBAudioSourceSwap.replace(() -> { throw failure; }, () -> cleanupCalls[0]++, () -> false));
        assertSame(failure, thrown);
        assertEquals(1, cleanupCalls[0]);
        assertEquals(false, ModeBAudioSourceSwap.isRecoverySafe(thrown));
    }

    @Test public void successfulRollbackKeepsRecoveryEligible() {
        RuntimeException failure = new IllegalStateException("replacement failed");
        RuntimeException thrown = assertThrows(RuntimeException.class, () ->
                ModeBAudioSourceSwap.replace(() -> { throw failure; }, () -> { }, () -> true));
        assertSame(failure, thrown);
        assertEquals(true, ModeBAudioSourceSwap.isRecoverySafe(thrown));
    }

    @Test public void cleanupFailureIsSuppressedAndDoesNotHideCaptureFailure() {
        RuntimeException failure = new IllegalStateException("capture start failed");
        RuntimeException cleanup = new IllegalArgumentException("cleanup failed");
        RuntimeException thrown = assertThrows(RuntimeException.class, () ->
                ModeBAudioSourceSwap.replace(() -> { throw failure; }, () -> { throw cleanup; }));
        assertSame(failure, thrown);
        assertEquals(1, thrown.getSuppressed().length);
        assertSame(cleanup, thrown.getSuppressed()[0]);
    }
    @Test public void liveReplacementRequiresTheSameActiveRtmpSession() {
        boolean[] live = {true};
        int[] calls = {0};
        ModeBAudioSourceSwap.replace(
                () -> calls[0]++,
                () -> calls[0] += 100,
                () -> true,
                () -> live[0]);
        assertEquals(1, calls[0]);
        assertEquals(true, live[0]);
    }

    @Test public void replacementIsRejectedBeforeTouchingAudioWhenSessionIsNotLive() {
        int[] calls = {0};
        RuntimeException thrown = assertThrows(RuntimeException.class, () ->
                ModeBAudioSourceSwap.replace(
                        () -> calls[0]++,
                        () -> calls[0] += 100,
                        () -> true,
                        () -> false));
        assertEquals(0, calls[0]);
        assertEquals(true, thrown.getMessage().contains("LIVE"));
    }

    @Test public void sessionEndingDuringSuccessfulAudioChangeFailsClosed() {
        boolean[] live = {true};
        int[] calls = {0};
        RuntimeException thrown = assertThrows(RuntimeException.class, () ->
                ModeBAudioSourceSwap.replace(
                        () -> { calls[0]++; live[0] = false; },
                        () -> calls[0] += 10,
                        () -> true,
                        () -> live[0]));
        assertEquals(11, calls[0]);
        assertEquals(false, ModeBAudioSourceSwap.isRecoverySafe(thrown));
        assertEquals(1, thrown.getSuppressed().length);
    }

    @Test public void failedSwapKeepsRecoverySafeOnlyWhenOldSourceAndSameLiveSessionRecover() {
        RuntimeException failure = new IllegalStateException("candidate start failed");
        boolean[] live = {true};
        RuntimeException thrown = assertThrows(RuntimeException.class, () ->
                ModeBAudioSourceSwap.replace(
                        () -> { throw failure; },
                        () -> { },
                        () -> true,
                        () -> live[0]));
        assertSame(failure, thrown);
        assertEquals(true, ModeBAudioSourceSwap.isRecoverySafe(thrown));
    }

}

