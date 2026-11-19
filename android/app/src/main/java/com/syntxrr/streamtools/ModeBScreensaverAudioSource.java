package com.syntxrr.streamtools;

import android.os.Process;

import com.pedro.encoder.Frame;
import com.pedro.encoder.input.audio.GetMicrophoneData;
import com.pedro.encoder.input.sources.audio.AudioSource;

/** Emits timestamped Screensaver PCM to AAC when the projection-dependent source is silenced. */
final class ModeBScreensaverAudioSource extends AudioSource {
    private final ModeBScreensaverAudioPcmQueue queue;
    private volatile boolean running;
    private volatile GetMicrophoneData output;
    private Thread readerThread;
    private long generation;

    ModeBScreensaverAudioSource(ModeBScreensaverAudioPcmQueue queue) {
        if (queue == null) throw new IllegalArgumentException("Antrean audio Screensaver tidak tersedia.");
        this.queue = queue;
    }

    @Override
    protected boolean create(int sampleRate, boolean isStereo, boolean echoCanceler, boolean noiseSuppressor) {
        if (sampleRate != ModeBScreensaverAudioPcmQueue.SAMPLE_RATE || !isStereo) {
            throw new IllegalArgumentException("Audio Screensaver memerlukan PCM 44,1 kHz stereo.");
        }
        return true;
    }

    @Override
    public synchronized void start(GetMicrophoneData sink) {
        if (sink == null) throw new IllegalArgumentException("PCM encoder tidak tersedia untuk audio Screensaver.");
        if (running) throw new IllegalStateException("Sumber audio Screensaver sudah berjalan.");
        // A timed-out stop must retain ownership of the old reader. Never create a second PCM
        // consumer while an earlier callback is still in flight on that worker.
        if (readerThread != null) {
            if (readerThread.isAlive()) {
                throw new IllegalStateException("Reader audio Screensaver sebelumnya belum selesai.");
            }
            readerThread = null;
        }
        // During a projection re-share the MP4 decoder can remain active while RootEncoder uses
        // Internal/Mix. Discard those unconsumed chunks before becoming the live AAC source again,
        // but preserve the decoder epoch and monotonic timestamp fence so fresh PCM keeps flowing.
        queue.discardPendingFramesPreservingEpoch();
        final long expectedGeneration = ++generation;
        output = sink;
        running = true;
        Thread thread = new Thread(() -> readLoop(expectedGeneration), "SYNTXRR-ScreensaverAudio");
        thread.setPriority(Thread.MAX_PRIORITY);
        readerThread = thread;
        thread.start();
    }

    private void readLoop(long expectedGeneration) {
        try { Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO); } catch (RuntimeException ignored) { }
        while (running && generation == expectedGeneration) {
            try {
                Frame frame = queue.takeNextFrame(() -> running && generation == expectedGeneration);
                if (frame == null) {
                    if (queue.isClosed()) return;
                    continue;
                }
                GetMicrophoneData sink = output;
                if (sink != null && running && generation == expectedGeneration) sink.inputPCMData(frame);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return;
            } catch (RuntimeException failure) {
                // The frame that triggered the callback has already been removed from the queue.
                // Drop only pending chunks: flush() would advance the producer epoch and make
                // every later frame from the still-running MP4 decoder look stale forever.
                queue.discardPendingFramesPreservingEpoch();
            }
        }
    }

    @Override
    public synchronized void stop() {
        running = false;
        output = null;
        generation++;
        queue.wakeConsumers();
        Thread previous = readerThread;
        if (previous != null) {
            previous.interrupt();
            if (!ModeBThreadJoinPolicy.join(previous, 500L)) {
                // Keep the reference so a later stop() can retry the join and start() cannot
                // accidentally launch a second reader while the old AAC callback is still live.
                throw new IllegalStateException("Thread audio Screensaver belum berhenti.");
            }
            if (readerThread == previous) readerThread = null;
        }
    }

    boolean hasLiveReaderForTest() {
        Thread reader = readerThread;
        return reader != null && reader.isAlive();
    }

    @Override public boolean isRunning() { return running; }
    @Override public void release() { stop(); }
}
