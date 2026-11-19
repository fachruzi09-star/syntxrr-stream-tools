package com.syntxrr.streamtools;

/**
 * Serializes the MP4 audio decoder's logical playback generation with the PCM queue generation.
 * Queue reset/flush must happen while holding this same lifecycle lock: otherwise a delayed pause
 * flush can run after a concurrent resume and invalidate the newly started decoder epoch.
 */
final class ModeBScreensaverAudioPlaybackEpoch {
    static final class Session {
        final long decoderGeneration;
        final long queueGeneration;

        Session(long decoderGeneration, long queueGeneration) {
            this.decoderGeneration = decoderGeneration;
            this.queueGeneration = queueGeneration;
        }
    }

    interface TaskPoster {
        boolean post(Runnable task);
    }

    private final ModeBScreensaverAudioPcmQueue queue;
    private long generation;
    private boolean playing;
    private boolean released;
    private Session activeSession;

    ModeBScreensaverAudioPlaybackEpoch(ModeBScreensaverAudioPcmQueue queue) {
        if (queue == null) throw new IllegalArgumentException("Antrean PCM Screensaver tidak tersedia.");
        this.queue = queue;
    }

    synchronized Session start() {
        if (released || playing) return null;
        playing = true;
        long nextGeneration = ++generation;
        long nextQueueGeneration = queue.resetForPlayback();
        activeSession = new Session(nextGeneration, nextQueueGeneration);
        return activeSession;
    }

    /** A pause invalidates the active decoder and its queue epoch as one atomic transition. */
    synchronized void pause() {
        if (released) return;
        playing = false;
        generation++;
        activeSession = null;
        queue.flush();
    }

    /** A terminal decode failure invalidates only the matching active session. */
    synchronized boolean fail(long expectedGeneration) {
        if (!isCurrentLocked(expectedGeneration)) return false;
        playing = false;
        generation++;
        activeSession = null;
        queue.flush();
        return true;
    }

    /** Returns true only for the first release request. */
    synchronized boolean release() {
        if (released) return false;
        released = true;
        playing = false;
        generation++;
        activeSession = null;
        queue.flush();
        return true;
    }

    synchronized boolean isCurrent(long expectedGeneration) {
        return isCurrentLocked(expectedGeneration);
    }

    /**
     * Posts work for the active generation while holding the same lock used by pause/release.
     * This guarantees a successful decode post is ordered before a later retirement marker;
     * a stale generation can never enqueue work after release has won the lifecycle transition.
     */
    synchronized boolean postIfCurrent(long expectedGeneration, TaskPoster poster, Runnable task) {
        if (!isCurrentLocked(expectedGeneration) || poster == null || task == null) return false;
        return poster.post(task);
    }

    private boolean isCurrentLocked(long expectedGeneration) {
        return !released && playing && generation == expectedGeneration;
    }

    synchronized boolean isPlaying() {
        return playing && !released;
    }

    synchronized boolean isReleased() {
        return released;
    }

    synchronized Session currentSessionForTest() {
        return activeSession;
    }
}
