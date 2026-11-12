package com.syntxrr.streamtools;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.SoundPool;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import java.io.File;
import java.io.IOException;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * NativeSoundPoolManager
 * 
 * Standalone native audio engine for short, low-latency Soundboard SFX playback.
 * Uses Android SoundPool and native 16-bit PCM AudioTrack procedural synthesis,
 * ensuring responsive playback when SYNTXRR STREAM is in the background over TikTok LIVE.
 */
public class NativeSoundPoolManager {

    private static final String TAG = "NativeSoundPool";
    private static final int MAX_SIMULTANEOUS_STREAMS = 6;
    private static final int SAMPLE_RATE = 44100;

    private final Context mContext;
    @Nullable
    private SoundPool mSoundPool;
    private float mMasterVolume = 0.9f;

    // Maps soundId (string key) to soundPool sampleId (integer)
    private final Map<String, Integer> mSoundIdToSampleId = new HashMap<>();
    
    // Set of sample IDs that have completed loading and are ready to play
    private final Set<Integer> mLoadedSampleIds = Collections.synchronizedSet(new HashSet<Integer>());
    
    // Set of active playback stream IDs
    private final Set<Integer> mActiveStreamIds = Collections.synchronizedSet(new HashSet<Integer>());

    private final ExecutorService mSynthExecutor = Executors.newCachedThreadPool();
    private final AtomicInteger mActiveSynthCount = new AtomicInteger(0);

    public interface OnSoundPlaybackListener {
        void onSoundStarted(String soundId);
        void onSoundCompleted(String soundId);
    }

    @Nullable
    private OnSoundPlaybackListener mPlaybackListener;

    public void setPlaybackListener(@Nullable OnSoundPlaybackListener listener) {
        this.mPlaybackListener = listener;
    }

    public interface OnSoundLoadCallback {
        void onLoadComplete(String soundId, boolean success);
    }

    public NativeSoundPoolManager(@NonNull Context context) {
        this.mContext = context.getApplicationContext();
        initializeSoundPool();
    }

    private void initializeSoundPool() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                        .build();

                mSoundPool = new SoundPool.Builder()
                        .setMaxStreams(MAX_SIMULTANEOUS_STREAMS)
                        .setAudioAttributes(audioAttributes)
                        .build();
            } else {
                // Legacy fallback for API < 21
                mSoundPool = new SoundPool(MAX_SIMULTANEOUS_STREAMS, AudioManager.STREAM_MUSIC, 0);
            }

            mSoundPool.setOnLoadCompleteListener(new SoundPool.OnLoadCompleteListener() {
                @Override
                public void onLoadComplete(SoundPool soundPool, int sampleId, int status) {
                    if (status == 0) {
                        mLoadedSampleIds.add(sampleId);
                        Log.d(TAG, "Sound sample " + sampleId + " successfully loaded.");
                    } else {
                        Log.w(TAG, "Sound sample " + sampleId + " failed to load with status: " + status);
                    }
                }
            });

            Log.i(TAG, "Native SoundPool initialized successfully.");
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize SoundPool: " + e.getMessage(), e);
            mSoundPool = null;
        }
    }

    public synchronized boolean isReady() {
        return mSoundPool != null;
    }

    public synchronized float getMasterVolume() {
        return mMasterVolume;
    }

    public synchronized void setMasterVolume(float volume) {
        this.mMasterVolume = Math.max(0.0f, Math.min(1.0f, volume));
        // Dynamically adjust active streams
        if (mSoundPool != null) {
            synchronized (mActiveStreamIds) {
                for (int streamId : mActiveStreamIds) {
                    try {
                        mSoundPool.setVolume(streamId, mMasterVolume, mMasterVolume);
                    } catch (Exception ignored) {
                    }
                }
            }
        }
    }

    /**
     * Load an audio file from local absolute storage path into SoundPool.
     */
    public synchronized boolean loadSoundFile(@NonNull String soundId, @NonNull String filePath) {
        if (mSoundPool == null) return false;

        // If already cached, check if ready
        if (mSoundIdToSampleId.containsKey(soundId)) {
            int existingSampleId = mSoundIdToSampleId.get(soundId);
            return mLoadedSampleIds.contains(existingSampleId);
        }

        File file = new File(filePath);
        if (!file.exists() || !file.canRead()) {
            Log.w(TAG, "Audio file does not exist or cannot be read: " + filePath);
            return false;
        }

        try {
            int sampleId = mSoundPool.load(filePath, 1);
            if (sampleId > 0) {
                mSoundIdToSampleId.put(soundId, sampleId);
                return true;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error loading audio file: " + filePath, e);
        }
        return false;
    }

    /**
     * Load an audio asset from the Android app assets directory.
     */
    public synchronized boolean loadSoundAsset(@NonNull String soundId, @NonNull String assetRelativePath) {
        if (mSoundPool == null) return false;

        if (mSoundIdToSampleId.containsKey(soundId)) {
            int existingSampleId = mSoundIdToSampleId.get(soundId);
            return mLoadedSampleIds.contains(existingSampleId);
        }

        try {
            AssetFileDescriptor afd = mContext.getAssets().openFd(assetRelativePath);
            int sampleId = mSoundPool.load(afd, 1);
            if (sampleId > 0) {
                mSoundIdToSampleId.put(soundId, sampleId);
                return true;
            }
        } catch (IOException e) {
            Log.w(TAG, "Asset file not found in APK: " + assetRelativePath);
        } catch (Exception e) {
            Log.e(TAG, "Error loading asset file: " + assetRelativePath, e);
        }
        return false;
    }

    /**
     * Check if a specific sound has finished loading and is ready for playback.
     */
    public synchronized boolean isSoundLoaded(@NonNull String soundId) {
        Integer sampleId = mSoundIdToSampleId.get(soundId);
        return sampleId != null && mLoadedSampleIds.contains(sampleId);
    }

    /**
     * Play a sound by ID. Returns streamId (> 0) on success, or 0 / -1 on failure.
     */
    public synchronized int playSound(@NonNull String soundId, float volumeMultiplier, float rate, boolean loop) {
        if (mSoundPool == null) {
            Log.w(TAG, "Cannot play sound: SoundPool is not initialized.");
            return -1;
        }

        Integer sampleId = mSoundIdToSampleId.get(soundId);
        if (sampleId == null) {
            Log.w(TAG, "Sound ID not found in SoundPool cache: " + soundId);
            return 0; // Not registered
        }

        if (!mLoadedSampleIds.contains(sampleId)) {
            Log.w(TAG, "Sound ID registered but still loading: " + soundId);
            return -2; // Still loading
        }

        float effectiveVol = Math.max(0.0f, Math.min(1.0f, mMasterVolume * volumeMultiplier));
        float effectiveRate = Math.max(0.5f, Math.min(2.0f, rate));
        int loopCount = loop ? -1 : 0;

        try {
            int streamId = mSoundPool.play(sampleId, effectiveVol, effectiveVol, 1, loopCount, effectiveRate);
            if (streamId > 0) {
                mActiveStreamIds.add(streamId);
                return streamId;
            } else {
                Log.w(TAG, "SoundPool.play() returned 0 stream ID for: " + soundId);
                return 0;
            }
        } catch (Exception e) {
            Log.e(TAG, "Exception during SoundPool.play(): " + e.getMessage(), e);
            return -1;
        }
    }

    /**
     * Stop a specific audio playback stream.
     */
    public synchronized boolean stopStream(int streamId) {
        if (mSoundPool != null && streamId > 0) {
            try {
                mSoundPool.stop(streamId);
                mActiveStreamIds.remove(streamId);
                return true;
            } catch (Exception e) {
                Log.e(TAG, "Error stopping stream " + streamId + ": " + e.getMessage());
            }
        }
        return false;
    }

    /**
     * Stop all currently active audio streams.
     */
    public synchronized void stopAllStreams() {
        if (mSoundPool != null) {
            synchronized (mActiveStreamIds) {
                for (int streamId : mActiveStreamIds) {
                    try {
                        mSoundPool.stop(streamId);
                    } catch (Exception ignored) {
                    }
                }
                mActiveStreamIds.clear();
            }
        }
    }

    /**
     * Map default preset IDs (sb_1..sb_6) to synthetic type names.
     */
    @NonNull
    public static String resolveSynthType(@NonNull String soundId) {
        String lower = soundId.toLowerCase().trim();
        switch (lower) {
            case "sb_1":
            case "airhorn":
                return "horn";
            case "sb_2":
            case "levelup":
                return "level_up";
            case "sb_3":
            case "applause":
                return "cheer";
            case "sb_4":
            case "fanfare":
                return "tada";
            case "sb_5":
            case "chime":
                return "bell";
            case "sb_6":
            case "gameover":
                return "game_over";
            default:
                return lower;
        }
    }

    public synchronized boolean isSoundPlaying() {
        return !mActiveStreamIds.isEmpty() || mActiveSynthCount.get() > 0;
    }

    /**
     * Synthesize and play procedural SFX directly using native AudioTrack.
     * Guaranteed to work even when WebView is paused/suspended by Android cached app freezer.
     */
    public boolean playSynthSound(@NonNull final String soundId, final float volumeMultiplier) {
        final String resolvedType = resolveSynthType(soundId);
        final float effectiveVol = Math.max(0.0f, Math.min(1.0f, mMasterVolume * volumeMultiplier));

        mSynthExecutor.execute(new Runnable() {
            @Override
            public void run() {
                AudioTrack track = null;
                mActiveSynthCount.incrementAndGet();
                if (mPlaybackListener != null) {
                    try {
                        mPlaybackListener.onSoundStarted(soundId);
                    } catch (Exception ignored) {}
                }

                try {
                    short[] pcm = generateSynthPcm(resolvedType, SAMPLE_RATE);
                    int bufferSizeBytes = pcm.length * 2;

                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                            .build();

                    AudioFormat audioFormat = new AudioFormat.Builder()
                            .setSampleRate(SAMPLE_RATE)
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build();

                    track = new AudioTrack(
                            audioAttributes,
                            audioFormat,
                            bufferSizeBytes,
                            AudioTrack.MODE_STATIC,
                            AudioManager.AUDIO_SESSION_ID_GENERATE
                    );

                    track.write(pcm, 0, pcm.length);
                    track.setVolume(effectiveVol);
                    track.play();

                    long durationMs = (long) ((pcm.length / (float) SAMPLE_RATE) * 1000L);
                    SystemClock.sleep(Math.max(100L, durationMs + 50L));

                    track.stop();
                } catch (Exception e) {
                    Log.e(TAG, "Error playing synth sound " + resolvedType + ": " + e.getMessage(), e);
                } finally {
                    if (track != null) {
                        try {
                            track.release();
                        } catch (Exception ignored) {}
                    }
                    mActiveSynthCount.decrementAndGet();
                    if (mPlaybackListener != null) {
                        try {
                            mPlaybackListener.onSoundCompleted(soundId);
                        } catch (Exception ignored) {}
                    }
                }
            }
        });

        return true;
    }

    @NonNull
    private static short[] generateSynthPcm(String type, int sampleRate) {
        float durationSec;
        switch (type) {
            case "bell":
                durationSec = 1.0f;
                break;
            case "game_over":
                durationSec = 0.7f;
                break;
            case "tada":
                durationSec = 0.8f;
                break;
            case "horn":
                durationSec = 0.55f;
                break;
            case "level_up":
                durationSec = 0.5f;
                break;
            case "cheer":
            default:
                durationSec = 0.5f;
                break;
        }

        int totalSamples = (int) (sampleRate * durationSec);
        short[] pcm = new short[totalSamples];
        double phase1 = 0.0;

        for (int i = 0; i < totalSamples; i++) {
            double t = (double) i / sampleRate;
            double sample = 0.0;

            if ("horn".equals(type)) {
                // Airhorn: dual sawtooth (320Hz & 480Hz) with punchy envelope
                double f1 = 320.0;
                double f2 = 480.0;
                double saw1 = 2.0 * (t * f1 - Math.floor(t * f1 + 0.5));
                double saw2 = 2.0 * (t * f2 - Math.floor(t * f2 + 0.5));
                double env = Math.exp(-3.5 * t / durationSec);
                sample = (saw1 * 0.5 + saw2 * 0.5) * env * 0.75;
            } else if ("level_up".equals(type)) {
                // Arpeggio: 4 notes (440Hz, 554.37Hz, 659.25Hz, 880Hz), 0.11s each
                double noteDuration = 0.11;
                int noteIndex = Math.min(3, (int) (t / noteDuration));
                double noteT = t - (noteIndex * noteDuration);
                double[] freqs = {440.0, 554.37, 659.25, 880.0};
                double f = freqs[noteIndex];
                // Triangle wave
                double tri = 2.0 * Math.abs(2.0 * (noteT * f - Math.floor(noteT * f + 0.5))) - 1.0;
                double env = Math.exp(-4.0 * noteT / noteDuration);
                sample = tri * env * 0.7;
            } else if ("bell".equals(type)) {
                // Crystal bell: 1200Hz sine + 2400Hz subtle harmonic
                double sine1 = Math.sin(2.0 * Math.PI * 1200.0 * t);
                double sine2 = Math.sin(2.0 * Math.PI * 2400.0 * t);
                double env = Math.exp(-3.8 * t / durationSec);
                sample = (sine1 * 0.8 + sine2 * 0.2) * env * 0.8;
            } else if ("game_over".equals(type)) {
                // Dramatic pitch glide down from 300Hz to 75Hz
                double currentFreq = 300.0 * Math.pow(75.0 / 300.0, t / durationSec);
                phase1 += 2.0 * Math.PI * currentFreq / sampleRate;
                double saw = 2.0 * (phase1 / (2.0 * Math.PI) - Math.floor(phase1 / (2.0 * Math.PI) + 0.5));
                double env = Math.exp(-2.5 * t / durationSec);
                sample = saw * env * 0.65;
            } else if ("tada".equals(type)) {
                // Fanfare: note 1 (0..0.2s: C5 523.25Hz), note 2 (0.2..0.8s: E5 659.25Hz + G5 783.99Hz)
                if (t < 0.2) {
                    double sine = Math.sin(2.0 * Math.PI * 523.25 * t);
                    double env = 1.0 - (t / 0.2) * 0.3;
                    sample = sine * env * 0.7;
                } else {
                    double t2 = t - 0.2;
                    double sine1 = Math.sin(2.0 * Math.PI * 659.25 * t2);
                    double sine2 = Math.sin(2.0 * Math.PI * 783.99 * t2);
                    double env = Math.exp(-3.0 * t2 / 0.6);
                    sample = (sine1 * 0.5 + sine2 * 0.5) * env * 0.75;
                }
            } else {
                // Cheer / applause: modulated white noise burst with rising pitch envelope
                double freq = 220.0 + (t / durationSec) * 220.0;
                double sqr = Math.sin(2.0 * Math.PI * freq * t) > 0 ? 0.4 : -0.4;
                double noise = (Math.random() * 2.0 - 1.0) * 0.6;
                double env = Math.exp(-3.2 * t / durationSec);
                sample = (sqr * 0.4 + noise * 0.6) * env * 0.7;
            }

            // Clamp sample to [-1.0, 1.0] and convert to 16-bit signed PCM
            sample = Math.max(-1.0, Math.min(1.0, sample));
            pcm[i] = (short) (sample * 32767.0);
        }

        return pcm;
    }

    /**
     * Release all native SoundPool resources.
     */
    public synchronized void release() {
        try {
            mSynthExecutor.shutdownNow();
        } catch (Exception ignored) {}

        if (mSoundPool != null) {
            try {
                stopAllStreams();
                mSoundPool.release();
            } catch (Exception e) {
                Log.e(TAG, "Error releasing SoundPool: " + e.getMessage(), e);
            } finally {
                mSoundPool = null;
                mSoundIdToSampleId.clear();
                mLoadedSampleIds.clear();
                mActiveStreamIds.clear();
                Log.i(TAG, "Native SoundPool released cleanly.");
            }
        }
    }
}
