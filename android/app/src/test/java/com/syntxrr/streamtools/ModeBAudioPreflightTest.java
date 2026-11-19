package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertThrows;

import com.pedro.encoder.input.audio.GetMicrophoneData;
import org.junit.Test;

public class ModeBAudioPreflightTest {
    private static final class FakeCapture implements ModeBAudioPreflight.CaptureSource {
        int starts;
        int stops;
        GetMicrophoneData receivedSink;
        RuntimeException startFailure;
        RuntimeException stopFailure;
        boolean partialResourcesAllocated;
        boolean recorderRunning;

        @Override public void start(GetMicrophoneData sink) {
            starts++;
            receivedSink = sink;
            // The Mode B mix source allocates its HandlerThread and callback before AudioRecord can
            // report running; model that partially acquired state explicitly.
            partialResourcesAllocated = true;
            if (startFailure != null) throw startFailure;
            recorderRunning = true;
        }
        @Override public void stop() {
            stops++;
            partialResourcesAllocated = false;
            recorderRunning = false;
            if (stopFailure != null) throw stopFailure;
        }
    }

    @Test public void successfulPreflightReleasesDiscardCaptureBeforeEncoderStarts() {
        FakeCapture source = new FakeCapture();
        GetMicrophoneData discardSink = frame -> { };

        ModeBAudioPreflight.verifyAndRelease(source, discardSink);

        assertEquals(1, source.starts);
        assertSame(discardSink, source.receivedSink);
        assertEquals(1, source.stops);
    }

    @Test public void partiallyStartedCaptureIsReleasedWhenStartThrows() {
        FakeCapture source = new FakeCapture();
        source.startFailure = new IllegalStateException("playback capture denied");

        assertThrows(IllegalStateException.class,
                () -> ModeBAudioPreflight.verifyAndRelease(source, frame -> { }));

        assertEquals(1, source.stops);
        assertEquals(false, source.partialResourcesAllocated);
        assertEquals(false, source.recorderRunning);
    }

    @Test public void failedStartBeforeRecorderRunningStillStopsPartialThreadAndCallback() {
        FakeCapture source = new FakeCapture();
        source.startFailure = new IllegalArgumentException("unsupported source");

        assertThrows(IllegalArgumentException.class,
                () -> ModeBAudioPreflight.verifyAndRelease(source, frame -> { }));

        assertEquals(1, source.stops);
        assertEquals(false, source.partialResourcesAllocated);
        assertEquals(false, source.recorderRunning);
    }

    @Test public void cleanupFailureDoesNotMaskPreflightStartFailure() {
        FakeCapture source = new FakeCapture();
        RuntimeException startFailure = new IllegalArgumentException("playback capture denied");
        source.startFailure = startFailure;
        source.stopFailure = new IllegalStateException("cleanup failure");

        RuntimeException thrown = assertThrows(RuntimeException.class,
                () -> ModeBAudioPreflight.verifyAndRelease(source, frame -> { }));

        assertSame(startFailure, thrown);
        assertEquals(1, thrown.getSuppressed().length);
        assertSame(source.stopFailure, thrown.getSuppressed()[0]);
    }

}
