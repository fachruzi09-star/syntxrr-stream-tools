package com.syntxrr.streamtools;

import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * One session-scoped worker shared by camera YUV conversion and every local MP4 overlay decoder.
 * Heavy camera pixel conversion and MediaMetadataRetriever frame extraction are serialized here.
 * The camera-control HandlerThread remains separate because Camera2 callbacks and device/session
 * operations must stay on their owning handler; only the CPU-heavy visual conversion moves here.
 */
final class ModeBVisualWorker {
    private final HandlerThread thread;
    private final Handler handler;
    private final AtomicBoolean shutdownRequested = new AtomicBoolean(false);
    private final Object frameQueueLock = new Object();
    private final ModeBVisualFrameArbiter frameArbiter = new ModeBVisualFrameArbiter();
    private boolean frameDrainScheduled;
    private long lastFrameStartAtMs = -1L;
    private final Runnable frameDrain = this::drainVisualFrame;

    ModeBVisualWorker() {
        thread = new HandlerThread("SYNTXRR-Visual-Compositor");
        thread.start();
        handler = new Handler(thread.getLooper());
    }

    boolean post(Runnable task) {
        return task != null && !shutdownRequested.get() && handler.post(task);
    }

    boolean postDelayed(Runnable task, long delayMs) {
        return task != null && delayMs >= 0L && !shutdownRequested.get()
                && handler.postDelayed(task, delayMs);
    }

    void removeCallbacks(Runnable task) {
        if (task != null) handler.removeCallbacks(task);
    }

    /**
     * Queue cleanup after all earlier visual work. If shutdown already made the Handler reject
     * posts, wait asynchronously for the HandlerThread to terminate before touching retriever
     * resources; an in-flight getFrameAtTime() must never race release().
     */
    boolean postAfterQuiescence(Runnable cleanup) {
        return ModeBWorkerQuiescenceBarrier.enqueue(handler::post,
                callback -> ModeBWorkerQuiescenceBarrier.awaitThreadTermination(thread, callback),
                cleanup);
    }

    /**
     * Queue one frame for a named source. Sources are served round-robin and may retain
     * at most one waiting frame, so a fast producer cannot flood the worker ahead of
     * other active layers. A duplicate pending frame for the same source is rejected.
     */
    boolean postFrame(String sourceId, Runnable frameWork) {
        if (shutdownRequested.get()) return false;
        synchronized (frameQueueLock) {
            if (shutdownRequested.get() || !frameArbiter.offer(sourceId, frameWork)) return false;
            scheduleFrameDrainLocked();
            return frameDrainScheduled;
        }
    }

    /** Remove a source's not-yet-started frame. An in-flight frame observes its owner's release flag. */
    void removeFrameSource(String sourceId) {
        synchronized (frameQueueLock) {
            frameArbiter.remove(sourceId);
        }
    }

    private void scheduleFrameDrainLocked() {
        if (frameDrainScheduled || shutdownRequested.get()) return;
        frameDrainScheduled = true;
        if (!handler.post(frameDrain)) {
            frameDrainScheduled = false;
            frameArbiter.clear();
        }
    }

    private void drainVisualFrame() {
        final Runnable frameWork;
        synchronized (frameQueueLock) {
            if (shutdownRequested.get()) {
                frameArbiter.clear();
                frameDrainScheduled = false;
                return;
            }
            if (frameArbiter.isEmpty()) {
                frameDrainScheduled = false;
                return;
            }
            long now = SystemClock.elapsedRealtime();
            long delay = ModeBVisualFrameBudget.delayUntilNextStart(now, lastFrameStartAtMs);
            if (delay > 0L) {
                // Keep the drain marked as scheduled while waiting for the global budget.
                if (!handler.postDelayed(frameDrain, delay)) {
                    frameDrainScheduled = false;
                    frameArbiter.clear();
                }
                return;
            }
            frameWork = frameArbiter.pollNext();
            if (frameWork == null) {
                frameDrainScheduled = false;
                return;
            }
            lastFrameStartAtMs = now;
        }

        try {
            frameWork.run();
        } finally {
            synchronized (frameQueueLock) {
                if (shutdownRequested.get()) {
                    frameArbiter.clear();
                    frameDrainScheduled = false;
                } else if (frameArbiter.isEmpty()) {
                    frameDrainScheduled = false;
                } else if (!handler.post(frameDrain)) {
                    frameDrainScheduled = false;
                    frameArbiter.clear();
                }
            }
        }
    }

    /**
     * Call only after every decoder has queued its retriever/frame cleanup.
     * The final quit marker runs after those immediate cleanup tasks on the same queue.
     */
    void shutdownAfterQueuedTasks() {
        if (!shutdownRequested.compareAndSet(false, true)) return;
        synchronized (frameQueueLock) {
            frameArbiter.clear();
            handler.removeCallbacks(frameDrain);
            frameDrainScheduled = false;
        }
        if (!handler.post(thread::quitSafely)) {
            thread.quitSafely();
        }
    }
}
