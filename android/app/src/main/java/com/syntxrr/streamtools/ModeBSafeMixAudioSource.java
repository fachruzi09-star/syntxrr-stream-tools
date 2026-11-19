package com.syntxrr.streamtools;

import android.media.AudioAttributes;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;

import com.pedro.encoder.Frame;
import com.pedro.encoder.input.audio.GetMicrophoneData;
import com.pedro.encoder.input.sources.audio.AudioSource;

/**
 * Mode B mix source that defers all AudioRecord allocation until start().
 *
 * RootEncoder 2.8.1 calls AudioSource.create() from prepareAudio()/changeAudioSource(), and its
 * MixAudioSource.create() allocates a microphone AudioRecord there. MixAudioSource.start() then
 * calls createMixMicrophone(), which allocates and overwrites that AudioRecord before creating the
 * internal playback-capture recorder. The first AudioRecord becomes unreachable and cannot be
 * released by MicrophoneManager.stop(). This source leaves create() allocation-free and lets the
 * single createMixMicrophone() call in start() own both recorders for the full lifecycle.
 */
final class ModeBSafeMixAudioSource extends AudioSource implements GetMicrophoneData {
    private static final String TAG = "SYNTXRR-SafeMixAudio";

    private final MediaProjection projection;
    private final MediaProjection.Callback projectionCallback = new MediaProjection.Callback() { };
    private final ModeBMixAudioCaptureLifecycle lifecycle = new ModeBMixAudioCaptureLifecycle();
    private final ModeBSafeMicrophoneManager microphone = new ModeBSafeMicrophoneManager(this);
    private final ModeBScreensaverAudioPcmQueue screensaverAudioQueue;

    private volatile GetMicrophoneData output;
    private HandlerThread projectionCallbackThread;
    private boolean projectionCallbackRegistered;
    private boolean microphoneCreationAttempted;

    ModeBSafeMixAudioSource(MediaProjection projection) {
        this(projection, null);
    }

    ModeBSafeMixAudioSource(MediaProjection projection, ModeBScreensaverAudioPcmQueue screensaverAudioQueue) {
        if (projection == null) throw new IllegalArgumentException("MediaProjection untuk audio campuran tidak tersedia.");
        this.projection = projection;
        this.screensaverAudioQueue = screensaverAudioQueue;
    }

    @Override
    protected boolean create(int sampleRate, boolean isStereo, boolean echoCanceler, boolean noiseSuppressor) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            throw new IllegalArgumentException("Audio campuran memerlukan Android 10 atau lebih baru.");
        }
        if (sampleRate <= 0) throw new IllegalArgumentException("Sample rate audio tidak valid.");
        // Deliberately do not call MicrophoneManager.createMicrophone() here. RootEncoder invokes
        // this method during prepareAudio(), before start() and before a real capture is needed.
        return true;
    }

    @Override
    public synchronized void start(GetMicrophoneData getMicrophoneData) {
        // Publish the new sink only after lifecycle admission and capture startup succeed. If a
        // previous cleanup failed, start() must not redirect any still-retiring reader thread to
        // a new encoder sink while resourcesMayExist keeps this generation closed.
        lifecycle.start(this::startCapture);
        output = getMicrophoneData;
    }

    private void startCapture() {
        HandlerThread callbackThread = new HandlerThread(TAG + "-ProjectionCallbacks");
        callbackThread.start();
        projectionCallbackThread = callbackThread;
        // Mark before registration so a partially completed platform call is still retired.
        projectionCallbackRegistered = true;
        projection.registerCallback(projectionCallback, new Handler(callbackThread.getLooper()));

        AudioPlaybackCaptureConfiguration config = new AudioPlaybackCaptureConfiguration.Builder(projection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build();

        // Mark before calling into RootEncoder: createMixMicrophone() can allocate the mic
        // AudioRecord and then fail while creating the internal AudioRecord.
        microphoneCreationAttempted = true;
        boolean created = microphone.createMixMicrophone(
                MediaRecorder.AudioSource.DEFAULT,
                config,
                getSampleRate(),
                isStereo(),
                getEchoCanceler(),
                getNoiseSuppressor()
        );
        boolean microphoneReady = microphone.isMicrophoneRecorderInitialized();
        boolean playbackCaptureReady = microphone.isPlaybackCaptureRecorderInitialized();
        if (!created || !microphoneReady || !playbackCaptureReady) {
            if (ModeBMixAudioFailurePolicy.isPlaybackCaptureCreationFailure(
                    microphoneReady, playbackCaptureReady)) {
                throw new IllegalStateException("Failed to create playback capture audio source");
            }
            throw new IllegalStateException("Failed to create microphone audio source");
        }
        try {
            microphone.start();
        } catch (RuntimeException startFailure) {
            if (ModeBMixAudioFailurePolicy.isPlaybackCaptureStartFailure(
                    microphone.isMicrophoneRecording(), microphone.isPlaybackCaptureRecording())) {
                throw new IllegalStateException("Failed to start playback capture audio source", startFailure);
            }
            if (!microphone.isMicrophoneRecording()) {
                throw new IllegalStateException("Failed to start microphone audio source", startFailure);
            }
            throw startFailure;
        }
    }

    @Override
    public synchronized void stop() {
        output = null;
        lifecycle.stop(this::stopCapture);
    }

    private void stopCapture() {
        Throwable cleanupFailure = null;

        if (microphoneCreationAttempted) {
            try {
                microphone.stop();
                microphoneCreationAttempted = false;
            } catch (RuntimeException | Error failure) {
                cleanupFailure = failure;
            }
        }

        if (projectionCallbackRegistered) {
            try {
                projection.unregisterCallback(projectionCallback);
                projectionCallbackRegistered = false;
            } catch (RuntimeException | Error failure) {
                cleanupFailure = appendFailure(cleanupFailure, failure);
            }
        }

        HandlerThread callbackThread = projectionCallbackThread;
        if (callbackThread != null) {
            callbackThread.quitSafely();
            if (ModeBThreadJoinPolicy.join(callbackThread, 200L)) {
                projectionCallbackThread = null;
            } else {
                cleanupFailure = appendFailure(cleanupFailure,
                        new IllegalStateException("Thread callback MediaProjection audio belum berhenti."));
            }
        }

        if (cleanupFailure instanceof RuntimeException) throw (RuntimeException) cleanupFailure;
        if (cleanupFailure instanceof Error) throw (Error) cleanupFailure;
    }

    private static Throwable appendFailure(Throwable first, Throwable next) {
        if (first == null) return next;
        first.addSuppressed(next);
        return first;
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
