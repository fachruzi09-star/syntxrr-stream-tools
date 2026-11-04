package com.syntxrr.streamtools;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.SoundPool;
import android.os.Build;
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

/**
 * NativeSoundPoolManager
 * 
 * Standalone native audio engine for short, low-latency Soundboard SFX playback.
 * Uses Android SoundPool to keep decoded audio streams in native memory,
 * ensuring responsive polyphonic playback without Web Audio API thread suspension.
 */
public class NativeSoundPoolManager {

    private static final String TAG = "NativeSoundPool";
    private static final int MAX_SIMULTANEOUS_STREAMS = 6;

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
     * Release all native SoundPool resources.
     */
    public synchronized void release() {
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
