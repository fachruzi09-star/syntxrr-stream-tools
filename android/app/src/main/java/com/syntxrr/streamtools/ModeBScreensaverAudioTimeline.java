package com.syntxrr.streamtools;

/**
 * Maps an MP4 audio sample's presentation timestamp onto the live stream's monotonic timebase.
 * The video clock is the authority: audio must not advance while the Screensaver video is paused.
 */
final class ModeBScreensaverAudioTimeline {
    static final long DROP_TIMESTAMP = Long.MIN_VALUE;
    // RootEncoder's timestamped buffer source allows bounded pre-roll; keep the mapper
    // asymmetric because early decoder output is useful, while late audio must not trail video.
    static final long MAX_FUTURE_LEAD_US = 1_000_000L;
    static final long MAX_LATE_SKEW_US = 250_000L;

    private ModeBScreensaverAudioTimeline() { }

    /**
     * Converts a media-relative PTS into the shared elapsed-realtime timebase used by RootEncoder.
     * For looped clips, the closest loop occurrence is selected so samples around the loop edge
     * remain adjacent instead of jumping by almost one full clip duration.
     *
     * A caller must still enqueue only frames belonging to the current decoder generation.
     */
    static long toStreamTimestampUs(long mediaPresentationTimeUs, long videoPositionUs,
            long videoDurationUs, long streamNowUs, boolean loop, boolean playbackRunning) {
        if (!playbackRunning || mediaPresentationTimeUs < 0L || videoPositionUs < 0L
                || videoDurationUs <= 0L || streamNowUs < 0L
                || mediaPresentationTimeUs >= videoDurationUs || videoPositionUs >= videoDurationUs) {
            return DROP_TIMESTAMP;
        }

        long deltaUs = mediaPresentationTimeUs - videoPositionUs;
        if (loop) {
            long halfDurationUs = videoDurationUs / 2L;
            if (deltaUs > halfDurationUs) deltaUs -= videoDurationUs;
            else if (deltaUs < -halfDurationUs) deltaUs += videoDurationUs;
        }
        if (deltaUs > MAX_FUTURE_LEAD_US || deltaUs < -MAX_LATE_SKEW_US) {
            return DROP_TIMESTAMP;
        }
        long mapped = saturatingAdd(streamNowUs, deltaUs);
        return mapped < 0L ? DROP_TIMESTAMP : mapped;
    }

    private static long saturatingAdd(long left, long right) {
        if (right > 0L && left > Long.MAX_VALUE - right) return Long.MAX_VALUE;
        if (right < 0L && left < Long.MIN_VALUE - right) return Long.MIN_VALUE;
        return left + right;
    }
}
