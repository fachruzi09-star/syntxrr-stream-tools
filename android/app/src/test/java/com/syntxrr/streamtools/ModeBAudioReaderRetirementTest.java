package com.syntxrr.streamtools;

import android.media.AudioRecord;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertThrows;

public final class ModeBAudioReaderRetirementTest {
    @Test public void bothCaptureLegsAreStoppedBeforeReaderJoinAndNotReleasedYet() {
        List<String> events = new ArrayList<>();
        FakeRecorder microphone = new FakeRecorder("mic", AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_RECORDING, events);
        FakeRecorder playback = new FakeRecorder("playback", AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_RECORDING, events);
        FakeReader reader = new FakeReader(events, true);

        ModeBAudioReaderRetirement.stopAndJoin(reader, microphone, playback, 200L);

        assertEquals(Arrays.asList("quit", "mic.stop", "playback.stop", "join"), events);
        assertEquals(0, microphone.releaseCalls);
        assertEquals(0, playback.releaseCalls);
    }

    @Test public void stoppedAndUninitializedLegsAreNotStoppedBeforeJoin() {
        List<String> events = new ArrayList<>();
        FakeRecorder microphone = new FakeRecorder("mic", AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_STOPPED, events);
        FakeRecorder playback = new FakeRecorder("playback", AudioRecord.STATE_UNINITIALIZED,
                AudioRecord.RECORDSTATE_STOPPED, events);
        FakeReader reader = new FakeReader(events, true);

        ModeBAudioReaderRetirement.stopAndJoin(reader, microphone, playback, 200L);

        assertEquals(Arrays.asList("quit", "join"), events);
        assertEquals(0, microphone.releaseCalls);
        assertEquals(0, playback.releaseCalls);
    }

    @Test public void joinTimeoutFailsClosedAndPreservesStopFailureContext() {
        List<String> events = new ArrayList<>();
        FakeRecorder microphone = new FakeRecorder("mic", AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_RECORDING, events);
        microphone.stopFailure = new IllegalStateException("mic stop failed");
        FakeReader reader = new FakeReader(events, false);

        IllegalStateException failure = assertThrows(IllegalStateException.class,
                () -> ModeBAudioReaderRetirement.stopAndJoin(reader, microphone, null, 200L));

        assertEquals(Arrays.asList("quit", "mic.stop", "join"), events);
        assertEquals(1, failure.getSuppressed().length);
        assertSame(microphone.stopFailure, failure.getSuppressed()[0]);
        assertEquals(0, microphone.releaseCalls);
    }

    @Test public void missingReaderStillStopsActiveRecorderBeforeCallerReleasesIt() {
        List<String> events = new ArrayList<>();
        FakeRecorder microphone = new FakeRecorder("mic", AudioRecord.STATE_INITIALIZED,
                AudioRecord.RECORDSTATE_RECORDING, events);

        ModeBAudioReaderRetirement.stopAndJoin(null, microphone, null, 200L);

        assertEquals(Arrays.asList("mic.stop"), events);
        assertEquals(0, microphone.releaseCalls);
    }

    private static final class FakeReader implements ModeBAudioReaderRetirement.ReaderThread {
        private final List<String> events;
        private final boolean joinResult;
        FakeReader(List<String> events, boolean joinResult) {
            this.events = events;
            this.joinResult = joinResult;
        }
        @Override public void quitSafely() { events.add("quit"); }
        @Override public boolean join(long timeoutMs) { events.add("join"); return joinResult; }
    }

    private static final class FakeRecorder implements ModeBAudioRecordCleanup.Recorder {
        private final String name;
        private final int state;
        private final int recordingState;
        private final List<String> events;
        private int releaseCalls;
        private RuntimeException stopFailure;
        FakeRecorder(String name, int state, int recordingState, List<String> events) {
            this.name = name;
            this.state = state;
            this.recordingState = recordingState;
            this.events = events;
        }
        @Override public int state() { return state; }
        @Override public int recordingState() { return recordingState; }
        @Override public void clearPositionUpdateListener() { events.add(name + ".clear"); }
        @Override public void stop() {
            events.add(name + ".stop");
            if (stopFailure != null) throw stopFailure;
        }
        @Override public void release() { releaseCalls++; events.add(name + ".release"); }
    }
}
