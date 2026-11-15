package com.syntxrr.streamtools;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioRecordingConfiguration;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;

import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * NativeMicMonitor
 *
 * Standalone native Android AudioRecord level meter for SYNTXRR STREAM.
 * Reads 16kHz mono 16-bit PCM into memory only to compute RMS level (0-100),
 * never records/stores audio, never requests AudioFocus, and never alters
 * system audio routing or mode.
 */
public class NativeMicMonitor {

    private static final String TAG = "NativeMicMonitor";

    public static final int SAMPLE_RATE_HZ = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int READ_FRAME_SAMPLES = 1024; // ~64ms per read at 16kHz
    private static final long METER_THROTTLE_MS = 120L;
    private static final long NO_SIGNAL_THRESHOLD_MS = 2000L;
    private static final long STOP_JOIN_TIMEOUT_MS = 450L;

    public enum Status {
        ACTIVE,
        NO_SIGNAL,
        SILENCED,
        UNAVAILABLE,
        STOPPED
    }

    public interface OnMicLevelListener {
        void onMicStateChanged(@NonNull Status status, int level, @Nullable String reason);
    }

    private final Context mContext;
    @Nullable
    private final AudioManager mAudioManager;
    private final Handler mMainHandler = new Handler(Looper.getMainLooper());

    /** Serializes start(), stop(), and release() without blocking AudioRecord.read() or callbacks. */
    private final Object mLifecycleLock = new Object();
    /** Short non-blocking lock for state snapshot and silence flag updates. */
    private final Object mStateLock = new Object();
    private final AtomicLong mSessionGeneration = new AtomicLong(0L);

    private volatile boolean mRunning = false;
    private volatile boolean mIsSilenced = false;

    @Nullable
    private AudioRecord mAudioRecord;
    @Nullable
    private Thread mWorkerThread;
    @Nullable
    private Object mRecordingCallback; // AudioManager.AudioRecordingCallback (API 29+ guarded usage)

    @Nullable
    private OnMicLevelListener mListener;
    @NonNull
    private Status mStatus = Status.STOPPED;
    private int mCurrentLevel = 0;
    @Nullable
    private String mStatusReason = null;

    public NativeMicMonitor(@NonNull Context context) {
        this.mContext = context.getApplicationContext();
        this.mAudioManager = (AudioManager) this.mContext.getSystemService(Context.AUDIO_SERVICE);
    }

    public void setListener(@Nullable OnMicLevelListener listener) {
        synchronized (mStateLock) {
            this.mListener = listener;
        }
    }

    public boolean hasRecordAudioPermission() {
        return ContextCompat.checkSelfPermission(mContext, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    public boolean isRunning() {
        return mRunning;
    }

    @NonNull
    public Status getStatus() {
        synchronized (mStateLock) {
            return mStatus;
        }
    }

    public int getCurrentLevel() {
        synchronized (mStateLock) {
            return mCurrentLevel;
        }
    }

    @Nullable
    public String getStatusReason() {
        synchronized (mStateLock) {
            return mStatusReason;
        }
    }

    /**
     * Start background AudioRecord level monitoring.
     * Idempotent: does not create duplicate threads or AudioRecord instances.
     */
    public boolean start() {
        synchronized (mLifecycleLock) {
            if (mRunning && mWorkerThread != null && mWorkerThread.isAlive()) {
                return true;
            }

            // Clean up any leftover dead worker or callback before starting fresh.
            cleanupPreviousWorkerLocked();

            if (!hasRecordAudioPermission()) {
                updateAndDispatchState(mSessionGeneration.get(), Status.UNAVAILABLE, 0,
                        "Izin mikrofon (RECORD_AUDIO) belum diberikan.");
                return false;
            }

            if (isExternalAudioCaptureActive(-1)) {
                updateAndDispatchState(mSessionGeneration.get(), Status.UNAVAILABLE, 0,
                        "Mikrofon sedang digunakan oleh aplikasi lain (TikTok LIVE). Monitor dijeda agar audio LIVE tetap aman.");
                return false;
            }

            int minBufBytes = AudioRecord.getMinBufferSize(SAMPLE_RATE_HZ, CHANNEL_CONFIG, AUDIO_FORMAT);
            if (minBufBytes <= 0) {
                Log.w(TAG, "AudioRecord.getMinBufferSize gagal: " + minBufBytes);
                updateAndDispatchState(mSessionGeneration.get(), Status.UNAVAILABLE, 0,
                        "Perangkat tidak mendukung konfigurasi mikrofon.");
                return false;
            }

            int bufferSizeBytes = Math.max(minBufBytes * 2, READ_FRAME_SAMPLES * 2 * 2);
            AudioRecord record = null;
            try {
                record = new AudioRecord(
                        MediaRecorder.AudioSource.MIC,
                        SAMPLE_RATE_HZ,
                        CHANNEL_CONFIG,
                        AUDIO_FORMAT,
                        bufferSizeBytes
                );

                if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                    Log.w(TAG, "AudioRecord gagal inisialisasi (state=" + record.getState() + ").");
                    safeReleaseRecord(record);
                    updateAndDispatchState(mSessionGeneration.get(), Status.UNAVAILABLE, 0,
                            "Inisialisasi AudioRecord gagal.");
                    return false;
                }

                record.startRecording();
                if (record.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                    Log.w(TAG, "AudioRecord gagal masuk RECORDSTATE_RECORDING (state="
                            + record.getRecordingState() + ").");
                    safeReleaseRecord(record);
                    updateAndDispatchState(mSessionGeneration.get(), Status.UNAVAILABLE, 0,
                            "Gagal memulai capture mikrofon.");
                    return false;
                }
            } catch (SecurityException se) {
                Log.w(TAG, "SecurityException saat memulai AudioRecord: " + se.getMessage());
                safeReleaseRecord(record);
                updateAndDispatchState(mSessionGeneration.get(), Status.UNAVAILABLE, 0,
                        "Akses mikrofon ditolak oleh sistem.");
                return false;
            } catch (Exception e) {
                Log.w(TAG, "Kesalahan saat memulai AudioRecord: " + e.getMessage());
                safeReleaseRecord(record);
                updateAndDispatchState(mSessionGeneration.get(), Status.UNAVAILABLE, 0,
                        "Mikrofon tidak tersedia.");
                return false;
            }

            final long generation = mSessionGeneration.incrementAndGet();
            final int audioSessionId = record.getAudioSessionId();

            mAudioRecord = record;
            mIsSilenced = evaluateInitialSilencedState(audioSessionId);
            mRunning = true;

            registerRecordingCallbackLocked(generation, audioSessionId);

            final AudioRecord workerRecord = record;
            Thread worker = new Thread(() -> runReaderLoop(generation, workerRecord), "syntxrr-mic-monitor");
            worker.setDaemon(true);
            mWorkerThread = worker;

            if (mIsSilenced) {
                updateAndDispatchState(generation, Status.SILENCED, 0,
                        "Capture mikrofon dibisukan oleh sistem Android.");
            } else {
                updateAndDispatchState(generation, Status.ACTIVE, 0, null);
            }

            try {
                worker.start();
            } catch (Exception e) {
                Log.e(TAG, "Gagal menjalankan thread monitor mikrofon: " + e.getMessage());
                mRunning = false;
                mSessionGeneration.incrementAndGet();
                unregisterRecordingCallbackLocked();
                mAudioRecord = null;
                mWorkerThread = null;
                safeReleaseRecord(record);
                updateAndDispatchState(mSessionGeneration.get(), Status.UNAVAILABLE, 0,
                        "Gagal menjalankan thread monitor mikrofon.");
                return false;
            }

            return true;
        }
    }

    /**
     * Stop monitoring safely and release AudioRecord resources.
     * Idempotent: safe to call repeatedly from any thread.
     */
    public void stop() {
        synchronized (mLifecycleLock) {
            final boolean hadActiveSession = mRunning || mAudioRecord != null || mWorkerThread != null;
            mRunning = false;
            final long stopGeneration = mSessionGeneration.incrementAndGet();
            mIsSilenced = false;

            unregisterRecordingCallbackLocked();
            mMainHandler.removeCallbacksAndMessages(null);

            AudioRecord record = mAudioRecord;
            Thread worker = mWorkerThread;
            mAudioRecord = null;
            mWorkerThread = null;

            if (record != null) {
                try {
                    if (record.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                        record.stop();
                    }
                } catch (Exception ignored) {
                    // Track may already be stopped or released
                }
            }

            if (worker != null && worker != Thread.currentThread()) {
                try {
                    worker.join(STOP_JOIN_TIMEOUT_MS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                if (worker.isAlive()) {
                    Log.w(TAG, "Worker thread belum selesai dalam batas waktu; pelepasan dilanjutkan pada thread worker.");
                }
            } else if (worker == null && record != null) {
                safeReleaseRecord(record);
            }

            if (hadActiveSession || getStatus() != Status.STOPPED) {
                updateAndDispatchState(stopGeneration, Status.STOPPED, 0, null);
            }
        }
    }

    public void release() {
        stop();
        synchronized (mStateLock) {
            mListener = null;
        }
    }

    private void cleanupPreviousWorkerLocked() {
        unregisterRecordingCallbackLocked();
        if (mWorkerThread != null && mWorkerThread.isAlive()) {
            mRunning = false;
            AudioRecord oldRecord = mAudioRecord;
            if (oldRecord != null) {
                try {
                    if (oldRecord.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                        oldRecord.stop();
                    }
                } catch (Exception ignored) {
                }
            }
            if (mWorkerThread != Thread.currentThread()) {
                try {
                    mWorkerThread.join(STOP_JOIN_TIMEOUT_MS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        } else if (mWorkerThread == null && mAudioRecord != null) {
            safeReleaseRecord(mAudioRecord);
        }
        mWorkerThread = null;
        mAudioRecord = null;
        mIsSilenced = false;
    }

    private void runReaderLoop(final long generation, @NonNull final AudioRecord record) {
        final short[] pcm = new short[READ_FRAME_SAMPLES];
        Status lastEmittedStatus = mIsSilenced ? Status.SILENCED : Status.ACTIVE;
        int lastEmittedLevel = 0;
        long lastEmitAtMs = SystemClock.uptimeMillis();
        long lastSignalAtMs = lastEmitAtMs;
        boolean exitedByError = false;
        String errorReason = null;

        try {
            while (mRunning && mSessionGeneration.get() == generation) {
                int readSamples = record.read(pcm, 0, pcm.length);
                if (!mRunning || mSessionGeneration.get() != generation) {
                    break;
                }

                if (readSamples < 0) {
                    exitedByError = true;
                    errorReason = "Pembacaan mikrofon terhenti (kode " + readSamples + ").";
                    Log.w(TAG, errorReason);
                    break;
                }

                if (readSamples == 0) {
                    SystemClock.sleep(20L);
                    continue;
                }

                int level = computeRmsLevel(pcm, readSamples);
                long now = SystemClock.uptimeMillis();

                Status nextStatus;
                int emitLevel;
                String nextReason = null;

                if (mIsSilenced) {
                    nextStatus = Status.SILENCED;
                    emitLevel = 0;
                    nextReason = "Capture mikrofon dibisukan oleh sistem Android.";
                } else if (level > 0) {
                    lastSignalAtMs = now;
                    nextStatus = Status.ACTIVE;
                    emitLevel = level;
                } else {
                    emitLevel = 0;
                    if ((now - lastSignalAtMs) >= NO_SIGNAL_THRESHOLD_MS) {
                        nextStatus = Status.NO_SIGNAL;
                        nextReason = "Belum ada sinyal suara masuk.";
                    } else {
                        nextStatus = Status.ACTIVE;
                    }
                }

                boolean statusChanged = nextStatus != lastEmittedStatus;
                boolean throttleElapsed = (now - lastEmitAtMs) >= METER_THROTTLE_MS;
                boolean levelChanged = emitLevel != lastEmittedLevel;

                if (statusChanged || (throttleElapsed && levelChanged)) {
                    lastEmittedStatus = nextStatus;
                    lastEmittedLevel = emitLevel;
                    lastEmitAtMs = now;
                    updateAndDispatchState(generation, nextStatus, emitLevel, nextReason);
                }
            }
        } catch (IllegalStateException e) {
            if (mRunning && mSessionGeneration.get() == generation) {
                exitedByError = true;
                errorReason = "Capture mikrofon tidak aktif (" + e.getMessage() + ").";
                Log.w(TAG, errorReason);
            }
        } catch (Exception e) {
            if (mRunning && mSessionGeneration.get() == generation) {
                exitedByError = true;
                errorReason = "Kesalahan monitor mikrofon: " + e.getMessage();
                Log.e(TAG, errorReason, e);
            }
        } finally {
            // Only the worker thread calls release() on its AudioRecord after read() exits.
            safeReleaseRecord(record);

            // Clear temporary in-memory PCM samples.
            for (int i = 0; i < pcm.length; i++) {
                pcm[i] = 0;
            }

            if (exitedByError && mSessionGeneration.get() == generation) {
                mRunning = false;
                updateAndDispatchState(generation, Status.UNAVAILABLE, 0,
                        errorReason != null ? errorReason : "Mikrofon tidak tersedia.");
            }
        }
    }

    private static int computeRmsLevel(@NonNull short[] pcm, int sampleCount) {
        if (sampleCount <= 0) {
            return 0;
        }
        double sumSquares = 0.0;
        for (int i = 0; i < sampleCount; i++) {
            double norm = pcm[i] / 32768.0;
            sumSquares += norm * norm;
        }
        double rms = Math.sqrt(sumSquares / sampleCount);
        int scaled = (int) Math.round(rms * 260.0);
        return Math.max(0, Math.min(100, scaled));
    }

    public boolean isExternalAudioCaptureActive(int ownSessionId) {
        if (mAudioManager == null) {
            return false;
        }
        try {
            int mode = mAudioManager.getMode();
            if (mode == AudioManager.MODE_IN_COMMUNICATION || mode == AudioManager.MODE_IN_CALL) {
                return true;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                List<AudioRecordingConfiguration> configs = mAudioManager.getActiveRecordingConfigurations();
                if (configs != null) {
                    for (AudioRecordingConfiguration config : configs) {
                        if (config == null) continue;
                        if (ownSessionId < 0 || config.getClientAudioSessionId() != ownSessionId) {
                            return true;
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Gagal memeriksa capture audio eksternal: " + e.getMessage());
        }
        return false;
    }

    private boolean evaluateInitialSilencedState(int audioSessionId) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || mAudioManager == null) {
            return false;
        }
        try {
            List<AudioRecordingConfiguration> configs = mAudioManager.getActiveRecordingConfigurations();
            if (configs == null) {
                return false;
            }
            for (AudioRecordingConfiguration config : configs) {
                if (config != null && config.getClientAudioSessionId() == audioSessionId) {
                    return config.isClientSilenced();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Gagal membaca status awal AudioRecordingConfiguration: " + e.getMessage());
        }
        return false;
    }

    private void registerRecordingCallbackLocked(final long generation, final int audioSessionId) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || mAudioManager == null) {
            return;
        }
        unregisterRecordingCallbackLocked();

        AudioManager.AudioRecordingCallback callback = new AudioManager.AudioRecordingCallback() {
            @Override
            public void onRecordingConfigChanged(List<AudioRecordingConfiguration> configs) {
                if (!mRunning || mSessionGeneration.get() != generation) {
                    return;
                }
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || configs == null) {
                    return;
                }

                boolean externalCaptureDetected = false;
                boolean foundSession = false;
                boolean silenced = false;
                for (AudioRecordingConfiguration config : configs) {
                    if (config == null) continue;
                    if (config.getClientAudioSessionId() == audioSessionId) {
                        foundSession = true;
                        silenced = config.isClientSilenced();
                    } else {
                        externalCaptureDetected = true;
                    }
                }

                if (externalCaptureDetected) {
                    mMainHandler.post(() -> {
                        if (mRunning && mSessionGeneration.get() == generation) {
                            stop();
                            updateAndDispatchState(mSessionGeneration.get(), Status.UNAVAILABLE, 0,
                                    "Mikrofon dipakai aplikasi lain (TikTok LIVE) — monitor dihentikan agar audio LIVE tetap aktif.");
                        }
                    });
                    return;
                }

                if (!foundSession) {
                    return;
                }

                boolean previousSilenced = mIsSilenced;
                mIsSilenced = silenced;
                if (silenced && !previousSilenced) {
                    updateAndDispatchState(generation, Status.SILENCED, 0,
                            "Capture mikrofon dibisukan oleh sistem Android.");
                } else if (!silenced && previousSilenced) {
                    updateAndDispatchState(generation, Status.ACTIVE, 0, null);
                }
            }
        };

        try {
            mAudioManager.registerAudioRecordingCallback(callback, mMainHandler);
            mRecordingCallback = callback;
        } catch (Exception e) {
            Log.w(TAG, "Gagal mendaftarkan AudioRecordingCallback: " + e.getMessage());
            mRecordingCallback = null;
        }
    }

    private void unregisterRecordingCallbackLocked() {
        if (mRecordingCallback == null || mAudioManager == null) {
            mRecordingCallback = null;
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                if (mRecordingCallback instanceof AudioManager.AudioRecordingCallback) {
                    mAudioManager.unregisterAudioRecordingCallback(
                            (AudioManager.AudioRecordingCallback) mRecordingCallback);
                }
            } catch (Exception e) {
                Log.w(TAG, "Gagal melepas AudioRecordingCallback: " + e.getMessage());
            }
        }
        mRecordingCallback = null;
    }

    private void updateAndDispatchState(
            final long generation,
            @NonNull final Status status,
            final int level,
            @Nullable final String reason) {
        final OnMicLevelListener listenerSnapshot;
        synchronized (mStateLock) {
            mStatus = status;
            mCurrentLevel = level;
            mStatusReason = reason;
            listenerSnapshot = mListener;
        }

        if (listenerSnapshot == null) {
            return;
        }

        Runnable notifyTask = () -> {
            if (generation != mSessionGeneration.get()) {
                return;
            }
            OnMicLevelListener currentListener;
            synchronized (mStateLock) {
                currentListener = mListener;
            }
            if (currentListener != null) {
                currentListener.onMicStateChanged(status, level, reason);
            }
        };

        if (Looper.myLooper() == Looper.getMainLooper()) {
            notifyTask.run();
        } else {
            mMainHandler.post(notifyTask);
        }
    }

    private static void safeReleaseRecord(@Nullable AudioRecord record) {
        if (record == null) {
            return;
        }
        try {
            if (record.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                record.stop();
            }
        } catch (Exception ignored) {
        }
        try {
            record.release();
        } catch (Exception ignored) {
        }
    }
}
