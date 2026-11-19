package com.syntxrr.streamtools;

import android.media.AudioAttributes;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.projection.MediaProjection;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;

import com.pedro.encoder.Frame;
import com.pedro.encoder.input.audio.GetMicrophoneData;
import com.pedro.encoder.input.sources.audio.AudioSource;

/**
 * Mode B playback-capture-only source with bounded reader retirement and retryable cleanup.
 *
 * RootEncoder 2.8.1 InternalAudioSource.create() allocates a microphone AudioRecord as a
 * preflight, then start() allocates the actual playback-capture AudioRecord into a second field.
 * That first recorder is not used for Internal mode. This source keeps prepareAudio allocation
 * free and uses the app-owned safe manager for the playback-capture recorder, reader thread, and
 * MediaProjection callback lifecycle. It never falls back to microphone capture.
 */
final class ModeBSafeInternalAudioSource extends AudioSource implements GetMicrophoneData {
    private static final String TAG = "SYNTXRR-SafeInternalAudio";

    private final MediaProjection projection;
    private final MediaProjection.Callback projectionCallback = new MediaProjection.Callback() { };
    private final ModeBMixAudioCaptureLifecycle lifecycle = new ModeBMixAudioCaptureLifecycle();
    private final ModeBSafeMicrophoneManager microphone;
    private final ModeBScreensaverAudioPcmQueue screensaverAudioQueue;

    private volatile GetMicrophoneData output;
    private HandlerThread projectionCallbackThread;
    private boolean projectionCallbackRegistrationAttempted;
    private boolean microphoneCreationAttempted;

    ModeBSafeInternalAudioSource(MediaProjection projection) {
        this(projection, null, null);
    }

    ModeBSafeInternalAudioSource(MediaProjection projection,
            ModeBScreensaverAudioPcmQueue screensaverAudioQueue) {
        this(projection, null, screensaverAudioQueue);
    }

    /** Package-private manager injection supports deterministic lifecycle verification. */
    ModeBSafeInternalAudioSource(MediaProjection projection, ModeBSafeMicrophoneManager microphone) {
        this(projection, microphone, null);
    }

    ModeBSafeInternalAudioSource(MediaProjection projection, ModeBSafeMicrophoneManager microphone,
            ModeBScreensaverAudioPcmQueue screensaverAudioQueue) {
        if (projection == null) {
            throw new IllegalArgumentException("MediaProjection untuk audio internal tidak tersedia.");
        }
        this.projection = projection;
        this.microphone = microphone == null ? new ModeBSafeMicrophoneManager(this) : microphone;
        this.screensaverAudioQueue = screensaverAudioQueue;
    }

    @Override
    protected boolean create(int sampleRate, boolean isStereo, boolean echoCanceler, boolean noiseSuppressor) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            throw new IllegalArgumentException("Audio internal memerlukan Android 10 atau lebih baru.");
        }
        if (sampleRate <= 0) throw new IllegalArgumentException("Sample rate audio internal tidak valid.");
        // Do not allocate a microphone or playback-capture AudioRecord during prepareAudio().
        return true;
    }

    @Override
    public synchronized void start(GetMicrophoneData sink) {
        if (sink == null) throw new IllegalArgumentException("PCM sink audio internal tidak tersedia.");
        lifecycle.start(this::startCapture);
        // Publish only after the actual playback-capture recorder is running.
        output = sink;
    }

    private void startCapture() {
        HandlerThread callbackThread = new HandlerThread(TAG + "-ProjectionCallbacks");
        callbackThread.start();
        projectionCallbackThread = callbackThread;

        // Mark before registration so a partially completed platform call remains cleanup-eligible.
        projectionCallbackRegistrationAttempted = true;
        projection.registerCallback(projectionCallback, new Handler(callbackThread.getLooper()));

        AudioPlaybackCaptureConfiguration config = new AudioPlaybackCaptureConfiguration.Builder(projection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build();

        // Mark before calling RootEncoder: it may leave a partial AudioRecord on failure.
        microphoneCreationAttempted = true;
        boolean created = microphone.createInternalMicrophone(config, getSampleRate(), isStereo(),
                getEchoCanceler(), getNoiseSuppressor());
        if (!created || !microphone.isPlaybackCaptureRecorderInitialized()) {
            throw new IllegalStateException("Gagal membuat recorder audio internal.");
        }

        microphone.start();
        if (!microphone.isPlaybackCaptureRecording()) {
            throw new IllegalStateException("Gagal memulai recorder audio internal.");
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

        if (projectionCallbackRegistrationAttempted) {
            try {
                projection.unregisterCallback(projectionCallback);
                projectionCallbackRegistrationAttempted = false;
            } catch (RuntimeException | Error failure) {
                cleanupFailure = appendFailure(cleanupFailure, failure);
            }
        }

        HandlerThread callbackThread = projectionCallbackThread;
        if (callbackThread != null) {
            try {
                callbackThread.quitSafely();
                if (ModeBThreadJoinPolicy.join(callbackThread, 200L)) {
                    projectionCallbackThread = null;
                } else {
                    cleanupFailure = appendFailure(cleanupFailure,
                            new IllegalStateException("Thread callback MediaProjection audio internal belum berhenti."));
                }
            } catch (RuntimeException | Error failure) {
                cleanupFailure = appendFailure(cleanupFailure, failure);
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
