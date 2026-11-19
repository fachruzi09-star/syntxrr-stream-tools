package com.syntxrr.streamtools;

import android.media.AudioRecord;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

public final class ModeBAudioRecordCleanupTest {
    @Test public void stopsOnlyAnInitializedRecorderThatIsActuallyRecording() {
        FakeRecorder active = new FakeRecorder(AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_RECORDING);
        assertNull(ModeBAudioRecordCleanup.release(active));
        assertEquals(1, active.stopCalls);
        assertEquals(1, active.releaseCalls);

        FakeRecorder initializedButStopped = new FakeRecorder(AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_STOPPED);
        assertNull(ModeBAudioRecordCleanup.release(initializedButStopped));
        assertEquals(0, initializedButStopped.stopCalls);
        assertEquals(1, initializedButStopped.releaseCalls);

        FakeRecorder uninitialized = new FakeRecorder(AudioRecord.STATE_UNINITIALIZED,
                AudioRecord.RECORDSTATE_STOPPED);
        assertNull(ModeBAudioRecordCleanup.release(uninitialized));
        assertEquals(0, uninitialized.stopCalls);
        assertEquals(1, uninitialized.releaseCalls);
    }

    @Test public void readerRetirementStopsActiveRecorderWithoutReleasingIt() {
        FakeRecorder recorder = new FakeRecorder(AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_RECORDING);

        assertNull(ModeBAudioRecordCleanup.stopForReaderRetirement(recorder));

        assertEquals(1, recorder.stopCalls);
        assertEquals(0, recorder.releaseCalls);
    }

    @Test public void readerRetirementDoesNotStopAlreadyStoppedOrUninitializedRecorder() {
        FakeRecorder initializedButStopped = new FakeRecorder(AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_STOPPED);
        FakeRecorder uninitialized = new FakeRecorder(AudioRecord.STATE_UNINITIALIZED,
                AudioRecord.RECORDSTATE_STOPPED);

        assertNull(ModeBAudioRecordCleanup.stopForReaderRetirement(initializedButStopped));
        assertNull(ModeBAudioRecordCleanup.stopForReaderRetirement(uninitialized));

        assertEquals(0, initializedButStopped.stopCalls);
        assertEquals(0, uninitialized.stopCalls);
        assertEquals(0, initializedButStopped.releaseCalls);
        assertEquals(0, uninitialized.releaseCalls);
    }

    @Test public void readerRetirementReportsStopFailureButLeavesReleaseForAfterJoin() {
        FakeRecorder recorder = new FakeRecorder(AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_RECORDING);
        recorder.stopFailure = new IllegalStateException("stop rejected");

        Throwable failure = ModeBAudioRecordCleanup.stopForReaderRetirement(recorder);

        assertSame(recorder.stopFailure, failure);
        assertEquals(1, recorder.stopCalls);
        assertEquals(0, recorder.releaseCalls);
    }

    @Test public void releaseIsStillAttemptedWhenStopThrows() {
        FakeRecorder recorder = new FakeRecorder(AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_RECORDING);
        recorder.stopFailure = new IllegalStateException("stop rejected");
        assertNull(ModeBAudioRecordCleanup.release(recorder));
        assertEquals(1, recorder.stopCalls);
        assertEquals(1, recorder.releaseCalls);
    }

    @Test public void failedReleaseCanBeRetriedWithoutCallingStopOnStoppedRecord() {
        FakeRecorder recorder = new FakeRecorder(AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_STOPPED);
        recorder.releaseFailure = new IllegalStateException("release rejected once");
        Throwable first = ModeBAudioRecordCleanup.release(recorder);
        assertSame(recorder.releaseFailure, first);
        assertEquals(0, recorder.stopCalls);
        assertEquals(1, recorder.releaseCalls);

        recorder.releaseFailure = null;
        assertNull(ModeBAudioRecordCleanup.release(recorder));
        assertEquals(0, recorder.stopCalls);
        assertEquals(2, recorder.releaseCalls);
    }

    @Test public void uninitializedReleaseFailureIsRetryableWithoutCallingStop() {
        FakeRecorder recorder = new FakeRecorder(AudioRecord.STATE_UNINITIALIZED,
                AudioRecord.RECORDSTATE_STOPPED);
        recorder.releaseFailure = new IllegalStateException("first release failed");
        assertTrue(ModeBAudioRecordCleanup.release(recorder) instanceof IllegalStateException);
        recorder.releaseFailure = null;
        assertNull(ModeBAudioRecordCleanup.release(recorder));
        assertEquals(0, recorder.stopCalls);
        assertEquals(2, recorder.releaseCalls);
    }

    @Test public void stopFailureIsAttachedWhenReleaseAlsoFails() {
        FakeRecorder recorder = new FakeRecorder(AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_RECORDING);
        recorder.stopFailure = new IllegalStateException("stop failure");
        recorder.releaseFailure = new IllegalStateException("release failure");
        Throwable failure = ModeBAudioRecordCleanup.release(recorder);
        assertSame(recorder.releaseFailure, failure);
        assertEquals(1, failure.getSuppressed().length);
        assertSame(recorder.stopFailure, failure.getSuppressed()[0]);
    }

    private static final class FakeRecorder implements ModeBAudioRecordCleanup.Recorder {
        private final int state;
        private final int recordingState;
        private int stopCalls;
        private int releaseCalls;
        private RuntimeException stopFailure;
        private RuntimeException releaseFailure;

        FakeRecorder(int state, int recordingState) {
            this.state = state;
            this.recordingState = recordingState;
        }

        @Override public int state() { return state; }
        @Override public int recordingState() { return recordingState; }
        @Override public void clearPositionUpdateListener() { }
        @Override public void stop() {
            stopCalls++;
            if (stopFailure != null) throw stopFailure;
        }
        @Override public void release() {
            releaseCalls++;
            if (releaseFailure != null) throw releaseFailure;
        }
    }
}
