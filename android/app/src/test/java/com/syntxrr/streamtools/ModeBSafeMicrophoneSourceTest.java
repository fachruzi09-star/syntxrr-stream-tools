package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import com.pedro.encoder.Frame;
import com.pedro.encoder.input.audio.GetMicrophoneData;
import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class ModeBSafeMicrophoneSourceTest {
    @Test public void prepareIsAllocationFreeAndStartCreatesExactlyOneRecorderPerGeneration() {
        FakeManager manager = new FakeManager();
        ModeBSafeMicrophoneSource source = new ModeBSafeMicrophoneSource(7, manager);
        assertTrue(source.init(44_100, true, true, true));
        assertEquals(0, manager.createCalls);

        int[] frames = {0};
        GetMicrophoneData sink = frame -> frames[0]++;
        source.start(sink);
        source.start(sink);
        assertEquals(1, manager.createCalls);
        assertEquals(1, manager.startCalls);
        assertTrue(source.isRunning());

        source.inputPCMData(new Frame(new byte[] {1, 2, 3, 4}, 0, 4, 1L));
        assertEquals(1, frames[0]);

        source.stop();
        assertFalse(source.isRunning());
        source.inputPCMData(new Frame(new byte[] {5, 6, 7, 8}, 0, 4, 2L));
        assertEquals(1, frames[0]);

        source.start(sink);
        assertEquals(2, manager.createCalls);
        assertEquals(2, manager.startCalls);
        source.stop();
        assertEquals(2, manager.stopCalls);
    }

    @Test public void failedStartPublishesNoPcmSinkAndCanRetryAfterCleanup() {
        FakeManager manager = new FakeManager();
        manager.createResult = false;
        ModeBSafeMicrophoneSource source = new ModeBSafeMicrophoneSource(7, manager);
        source.init(44_100, true, false, false);
        int[] frames = {0};
        GetMicrophoneData sink = frame -> frames[0]++;

        assertThrows(IllegalStateException.class, () -> source.start(sink));
        assertFalse(source.isRunning());
        source.inputPCMData(new Frame(new byte[] {1, 2, 3, 4}, 0, 4, 1L));
        assertEquals(0, frames[0]);
        assertThrows(IllegalStateException.class, () -> source.start(sink));

        source.stop();
        manager.createResult = true;
        source.start(sink);
        assertTrue(source.isRunning());
        source.inputPCMData(new Frame(new byte[] {5, 6, 7, 8}, 0, 4, 2L));
        assertEquals(1, frames[0]);
        source.stop();
    }

    @Test public void cleanupFailureKeepsRestartClosedUntilRetrySucceeds() {
        FakeManager manager = new FakeManager();
        ModeBSafeMicrophoneSource source = new ModeBSafeMicrophoneSource(7, manager);
        source.init(44_100, true, false, false);
        GetMicrophoneData sink = frame -> { };
        source.start(sink);
        manager.stopFailure = new IllegalStateException("release pending");

        assertThrows(IllegalStateException.class, source::stop);
        assertFalse(source.isRunning());
        assertThrows(IllegalStateException.class, () -> source.start(sink));

        manager.stopFailure = null;
        source.stop();
        source.start(sink);
        assertEquals(2, manager.createCalls);
        source.stop();
    }

    @Test public void wrongMicrophoneStateIsRejectedBeforeSinkPublication() {
        FakeManager manager = new FakeManager();
        manager.initialized = false;
        ModeBSafeMicrophoneSource source = new ModeBSafeMicrophoneSource(7, manager);
        source.init(44_100, true, false, false);
        int[] frames = {0};

        assertThrows(IllegalStateException.class, () -> source.start(frame -> frames[0]++));
        source.inputPCMData(new Frame(new byte[] {1, 2, 3, 4}, 0, 4, 1L));
        assertEquals(0, frames[0]);
        source.stop();
    }


    @Test public void stopCannotRaceAheadOfSinkPublicationDuringStart() throws Exception {
        FakeManager manager = new FakeManager();
        manager.startEntered = new CountDownLatch(1);
        manager.finishStart = new CountDownLatch(1);
        ModeBSafeMicrophoneSource source = new ModeBSafeMicrophoneSource(7, manager);
        source.init(44_100, true, false, false);
        int[] frames = {0};
        GetMicrophoneData sink = frame -> frames[0]++;
        Throwable[] failure = {null};

        Thread starter = new Thread(() -> {
            try { source.start(sink); } catch (Throwable error) { failure[0] = error; }
        }, "safe-mic-start-test");
        starter.start();
        assertTrue(manager.startEntered.await(1, TimeUnit.SECONDS));

        Thread stopper = new Thread(() -> {
            try { source.stop(); } catch (Throwable error) { failure[0] = error; }
        }, "safe-mic-stop-test");
        stopper.start();
        manager.finishStart.countDown();
        starter.join(1_000L);
        stopper.join(1_000L);

        assertFalse(starter.isAlive());
        assertFalse(stopper.isAlive());
        assertEquals(null, failure[0]);
        source.inputPCMData(new Frame(new byte[] {1, 2, 3, 4}, 0, 4, 1L));
        assertEquals(0, frames[0]);
    }

    private static final class FakeManager extends ModeBSafeMicrophoneManager {
        int createCalls;
        int startCalls;
        int stopCalls;
        boolean createResult = true;
        boolean initialized = true;
        boolean recording;
        RuntimeException stopFailure;
        CountDownLatch startEntered;
        CountDownLatch finishStart;

        FakeManager() {
            super(null);
        }

        @Override public boolean createMicrophone(int source, int sampleRate, boolean stereo,
                boolean echo, boolean noise) {
            createCalls++;
            return createResult;
        }

        @Override boolean isMicrophoneRecorderInitialized() {
            return initialized;
        }

        @Override boolean isMicrophoneRecording() {
            return recording;
        }

        @Override public synchronized void start() {
            startCalls++;
            recording = true;
            if (startEntered != null) {
                startEntered.countDown();
                try {
                    if (finishStart == null || !finishStart.await(1, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("timed out waiting for test start gate");
                    }
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("interrupted in test start gate", interrupted);
                }
            }
        }

        @Override public synchronized void stop() {
            stopCalls++;
            recording = false;
            if (stopFailure != null) throw stopFailure;
        }
    }
}
