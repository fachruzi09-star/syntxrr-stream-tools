package com.syntxrr.streamtools;

import androidx.annotation.NonNull;

import java.util.Objects;

/**
 * NativeTikTokEventBatchEpochGate
 *
 * Package-private delivery epoch gate for Mode A batch emission.
 * Serializes active JS batch delivery against explicit session boundaries so a drained
 * batch from an earlier session cannot emit after advanceEpoch() completes.
 */
final class NativeTikTokEventBatchEpochGate {

    private final Object mLock = new Object();
    private long mCurrentEpoch = 1L;

    long getCurrentEpoch() {
        synchronized (mLock) {
            return mCurrentEpoch;
        }
    }

    long advanceEpoch() {
        synchronized (mLock) {
            mCurrentEpoch++;
            return mCurrentEpoch;
        }
    }

    boolean runIfCurrent(long expectedEpoch, @NonNull Runnable action) {
        Objects.requireNonNull(action, "action must not be null");
        synchronized (mLock) {
            if (expectedEpoch != mCurrentEpoch) {
                return false;
            }
            action.run();
            return true;
        }
    }
}
