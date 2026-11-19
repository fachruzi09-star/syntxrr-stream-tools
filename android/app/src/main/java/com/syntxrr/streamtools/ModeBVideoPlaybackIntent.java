package com.syntxrr.streamtools;

/**
 * Retains the desired playback state while the MP4 decoder is initializing.
 * RTMP publish callbacks can arrive before MediaMetadataRetriever is ready.
 */
final class ModeBVideoPlaybackIntent {
    private volatile boolean playbackRequested;

    void requestPlayback() { playbackRequested = true; }

    void requestPause() { playbackRequested = false; }

    boolean isPlaybackRequested() { return playbackRequested; }

    /** Starts a newly-created clock when LIVE was requested before decoder readiness. */
    boolean startIfRequested(ModeBVideoPlaybackClock clock, long nowMs) {
        return playbackRequested && clock != null && clock.start(nowMs);
    }
}
