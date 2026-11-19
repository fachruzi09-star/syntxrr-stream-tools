package com.syntxrr.streamtools;

/**
 * One-shot fence fired after two distinct source frames have been latched and rendered by GL
 * within the same armed generation. Repeated compositor draws of a stale texture do not count.
 */
final class ModeBSceneReplacementFence {
    private static final int REQUIRED_OUTPUT_FRAMES = 2;
    private static final long NO_ACTIVE_GENERATION = -1L;

    private final Object lock = new Object();
    private Runnable listener;
    private int outputFrames;
    private long generation;

    void arm(Runnable callback) {
        synchronized (lock) {
            generation++;
            outputFrames = 0;
            listener = callback;
        }
    }

    void disarm() {
        synchronized (lock) {
            generation++;
            listener = null;
            outputFrames = 0;
        }
    }

    /**
     * Capture the fence generation when a GL draw begins. A draw already in flight when a fence
     * is armed or re-armed must not count toward that newer fence when it eventually completes.
     */
    long beginOutputFrame() {
        synchronized (lock) {
            return listener == null ? NO_ACTIVE_GENERATION : generation;
        }
    }

    /**
     * A completed GL draw counts only when it latched a fresh source frame and observed the exact
     * fence generation that remains armed at completion time.
     */
    void onOutputFrameDrawn(long frameGeneration, boolean freshSourceFrameLatched) {
        if (!freshSourceFrameLatched) return;
        Runnable callback = null;
        synchronized (lock) {
            if (frameGeneration == NO_ACTIVE_GENERATION || frameGeneration != generation || listener == null) {
                return;
            }
            if (++outputFrames >= REQUIRED_OUTPUT_FRAMES) {
                callback = listener;
                listener = null;
                outputFrames = 0;
                generation++;
            }
        }
        if (callback != null) callback.run();
    }
}
