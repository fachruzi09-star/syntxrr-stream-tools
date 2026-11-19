package com.syntxrr.streamtools;

import android.media.MediaRecorder;

import com.pedro.encoder.Frame;
import com.pedro.encoder.input.audio.GetMicrophoneData;
import com.pedro.encoder.input.sources.audio.AudioSource;

/**
 * Mode B microphone-only source with deferred AudioRecord allocation and deterministic teardown.
 *
 * RootEncoder 2.8.1 MicrophoneSource.create() creates an AudioRecord during prepareAudio(), then
 * MicrophoneSource.start() creates another AudioRecord into the same MicrophoneManager field.
 * The earlier object becomes unreachable before stop() can release it. This source keeps create()
 * allocation-free and creates exactly one recorder per admitted start generation.
 */
final class ModeBSafeMicrophoneSource extends AudioSource implements GetMicrophoneData {
    private final int audioSource;
    private final ModeBMixAudioCaptureLifecycle lifecycle = new ModeBMixAudioCaptureLifecycle();
    private final ModeBSafeMicrophoneManager microphone;
    private final ModeBScreensaverAudioPcmQueue screensaverAudioQueue;

    private volatile GetMicrophoneData output;
    private boolean microphoneCreationAttempted;

    ModeBSafeMicrophoneSource() {
        this(MediaRecorder.AudioSource.DEFAULT, null, null);
    }

    ModeBSafeMicrophoneSource(ModeBScreensaverAudioPcmQueue screensaverAudioQueue) {
        this(MediaRecorder.AudioSource.DEFAULT, null, screensaverAudioQueue);
    }

    ModeBSafeMicrophoneSource(int audioSource) {
        this(audioSource, null, null);
    }

    /** Package-private manager injection keeps lifecycle policy tests independent of AudioRecord. */
    ModeBSafeMicrophoneSource(int audioSource, ModeBSafeMicrophoneManager microphone) {
        this(audioSource, microphone, null);
    }

    ModeBSafeMicrophoneSource(int audioSource, ModeBSafeMicrophoneManager microphone,
            ModeBScreensaverAudioPcmQueue screensaverAudioQueue) {
        this.audioSource = audioSource;
        this.microphone = microphone == null ? new ModeBSafeMicrophoneManager(this) : microphone;
        this.screensaverAudioQueue = screensaverAudioQueue;
    }

    @Override
    protected boolean create(int sampleRate, boolean isStereo, boolean echoCanceler, boolean noiseSuppressor) {
        if (sampleRate <= 0) throw new IllegalArgumentException("Sample rate mikrofon tidak valid.");
        // Like the safe Mix source, do not allocate AudioRecord during prepareAudio()/init().
        return true;
    }

    @Override
    public synchronized void start(GetMicrophoneData sink) {
        if (sink == null) throw new IllegalArgumentException("PCM sink mikrofon tidak tersedia.");
        lifecycle.start(this::startCapture);
        // Publish only after capture startup succeeds. A rejected restart while cleanup is pending
        // cannot redirect a late callback from the retiring source to a new encoder session.
        output = sink;
    }

    private void startCapture() {
        // Mark before entering RootEncoder: createMicrophone() can leave a partial AudioRecord
        // instance behind even when it returns false or its state is invalid.
        microphoneCreationAttempted = true;
        boolean created = microphone.createMicrophone(
                audioSource, getSampleRate(), isStereo(), getEchoCanceler(), getNoiseSuppressor());
        if (!created || !microphone.isMicrophoneRecorderInitialized()) {
            throw new IllegalStateException("Failed to create microphone audio source");
        }
        microphone.start();
        if (!microphone.isMicrophoneRecording()) {
            throw new IllegalStateException("Failed to start microphone audio source");
        }
    }

    @Override
    public synchronized void stop() {
        output = null;
        lifecycle.stop(this::stopCapture);
    }

    private void stopCapture() {
        if (!microphoneCreationAttempted) return;
        microphone.stop();
        microphoneCreationAttempted = false;
    }

    @Override
    public boolean isRunning() {
        return lifecycle.isRunning();
    }

    @Override
    public void release() {
        stop();
    }

    @Override
    public void inputPCMData(Frame frame) {
        ModeBAudioPcmFrameForwarder.forward(frame, output, screensaverAudioQueue, getSampleRate(), isStereo());
    }
}
