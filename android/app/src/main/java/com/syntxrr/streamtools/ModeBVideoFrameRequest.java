package com.syntxrr.streamtools;

/** Keeps the Android MediaMetadataRetriever scaled-frame argument order explicit and testable. */
final class ModeBVideoFrameRequest {
    interface ScaledFrameRetriever<T> {
        T getScaledFrameAtTime(long timeUs, int option, int dstWidth, int dstHeight);
    }

    private ModeBVideoFrameRequest() { }

    static <T> T decode(ScaledFrameRetriever<T> retriever, long timeUs, int option,
                        int dstWidth, int dstHeight) {
        if (retriever == null) throw new IllegalArgumentException("Frame retriever is required.");
        if (dstWidth < 1 || dstHeight < 1) {
            throw new IllegalArgumentException("Scaled frame dimensions must be positive.");
        }
        return retriever.getScaledFrameAtTime(timeUs, option, dstWidth, dstHeight);
    }
}
