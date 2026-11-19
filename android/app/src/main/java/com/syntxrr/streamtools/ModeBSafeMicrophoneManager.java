package com.syntxrr.streamtools;

import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.os.HandlerThread;

import com.pedro.encoder.input.audio.GetMicrophoneData;
import com.pedro.encoder.input.audio.MicrophoneManager;

/**
 * Safely owns Mode B microphone-only and Mix AudioRecord instances.
 *
 * RootEncoder 2.8.1 reuses one `created` flag for the microphone and playback-capture creation
 * calls. A successful microphone creation can therefore leave that flag true when playback
 * capture creation fails. Validate the actual AudioRecord instances instead of trusting the
 * aggregate return value alone. The same subclass also supplies bounded reader retirement and
 * retryable release for the microphone-only source.
 */
class ModeBSafeMicrophoneManager extends MicrophoneManager {
    ModeBSafeMicrophoneManager(GetMicrophoneData callback) {
        super(callback);
    }

    /**
     * RootEncoder's stop() calls AudioRecord.stop() before release() for every non-null record.
     * A partially initialized or never-started playback recorder can throw at stop(), preventing
     * release() and making every later cleanup retry fail at the same point. Stop active recorders
     * to unblock blocking reads, join the reader, and then independently attempt each release.
     * Keep a field reference only when release itself fails so a later stop() can retry it.
     */
    @Override
    public synchronized void stop() {
        running = false;
        HandlerThread readerThread = handlerThread;
        AudioRecord microphoneRecord = audioRecord;
        AudioRecord playbackRecord = audioRecordDevice;

        // RootEncoder's reader loop performs blocking AudioRecord.read() calls. Wake both legs
        // before joining the HandlerThread; otherwise a silent/stalled capture leg can keep the
        // reader inside read() until the 200 ms join expires, causing cleanup to fail repeatedly.
        ModeBAudioReaderRetirement.stopAndJoin(
                readerThread == null ? null : new ModeBAudioReaderRetirement.ReaderThread() {
                    @Override public void quitSafely() { readerThread.quitSafely(); }
                    @Override public boolean join(long timeoutMs) {
                        return ModeBThreadJoinPolicy.join(readerThread, timeoutMs);
                    }
                },
                cleanupRecorder(microphoneRecord),
                cleanupRecorder(playbackRecord),
                200L
        );

        Throwable cleanupFailure = null;
        if (microphoneRecord != null) {
            Throwable failure = releaseRecorder(microphoneRecord);
            if (failure == null) audioRecord = null;
            else cleanupFailure = append(cleanupFailure, failure);
        }

        if (playbackRecord != null) {
            Throwable failure = releaseRecorder(playbackRecord);
            if (failure == null) audioRecordDevice = null;
            else cleanupFailure = append(cleanupFailure, failure);
        }

        if (audioRecord != null || audioRecordDevice != null) {
            IllegalStateException failure = new IllegalStateException(
                    "Satu atau lebih AudioRecord belum berhasil dilepas; cleanup harus dicoba ulang.");
            if (cleanupFailure != null) failure.addSuppressed(cleanupFailure);
            throw failure;
        }

        // Both recorder references are now null, so the RootEncoder base cleanup can safely
        // release its private post-process effects and reset its created flag.
        super.stop();
    }

    private static ModeBAudioRecordCleanup.Recorder cleanupRecorder(AudioRecord record) {
        if (record == null) return null;
        return new ModeBAudioRecordCleanup.Recorder() {
            @Override public int state() { return record.getState(); }
            @Override public int recordingState() { return record.getRecordingState(); }
            @Override public void clearPositionUpdateListener() { record.setRecordPositionUpdateListener(null); }
            @Override public void stop() { record.stop(); }
            @Override public void release() { record.release(); }
        };
    }

    private static Throwable releaseRecorder(AudioRecord record) {
        return ModeBAudioRecordCleanup.release(cleanupRecorder(record));
    }

    private static Throwable append(Throwable first, Throwable next) {
        if (first == null) return next;
        first.addSuppressed(next);
        return first;
    }

    @Override
    public boolean createMixMicrophone(int audioSource, AudioPlaybackCaptureConfiguration config,
            int sampleRate, boolean isStereo, boolean echoCanceler, boolean noiseSuppressor) {
        boolean reportedCreated = super.createMixMicrophone(audioSource, config, sampleRate,
                isStereo, echoCanceler, noiseSuppressor);

        boolean microphoneReady = isInitialized(audioRecord);
        boolean playbackCaptureReady = isInitialized(audioRecordDevice);

        // AudioRecord.stop() throws for an uninitialized recorder. Retire such partial objects
        // here so MicrophoneManager.stop() can safely release any initialized peer recorder.
        if (!microphoneReady) audioRecord = releaseUninitialized(audioRecord);
        if (!playbackCaptureReady) audioRecordDevice = releaseUninitialized(audioRecordDevice);

        return reportedCreated && microphoneReady && playbackCaptureReady;
    }

    boolean isMicrophoneRecorderInitialized() {
        return isInitialized(audioRecord);
    }

    boolean isPlaybackCaptureRecorderInitialized() {
        return isInitialized(audioRecordDevice);
    }

    boolean isMicrophoneRecording() {
        return isRecording(audioRecord);
    }

    boolean isPlaybackCaptureRecording() {
        return isRecording(audioRecordDevice);
    }

    private static boolean isInitialized(AudioRecord record) {
        if (record == null) return false;
        try {
            return record.getState() == AudioRecord.STATE_INITIALIZED;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static boolean isRecording(AudioRecord record) {
        if (!isInitialized(record)) return false;
        try {
            return record.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static AudioRecord releaseUninitialized(AudioRecord record) {
        if (record == null) return null;
        try {
            record.release();
            return null;
        } catch (RuntimeException | Error releaseFailure) {
            // Keep the reference so the normal source cleanup can retry and fail closed.
            return record;
        }
    }
}
