package com.syntxrr.streamtools;

/**
 * Immutable, thread-safe Mode B runtime state snapshot including established encoder
 * output configuration (width, height, and target FPS).
 */
final class ModeBStreamStatusSnapshot {
    static final int MIN_DIMENSION = 320;
    static final int MAX_DIMENSION = 2560;
    static final int MIN_FPS = 15;
    static final int MAX_FPS = 60;

    final String status;
    final String message;
    final boolean streaming;
    final long bitrateKbps;
    final int outputWidth;
    final int outputHeight;
    final int outputFps;

    private ModeBStreamStatusSnapshot(
            String status,
            String message,
            boolean streaming,
            long bitrateKbps,
            int outputWidth,
            int outputHeight,
            int outputFps) {
        this.status = status == null || status.trim().isEmpty() ? "idle" : status;
        this.message = message == null ? "" : message;
        this.streaming = streaming;
        this.bitrateKbps = Math.max(0L, bitrateKbps);
        boolean activeWithConfig = isSessionStatusEligibleForOutputConfig(this.status)
                && outputWidth > 0 && outputHeight > 0 && outputFps > 0;
        this.outputWidth = activeWithConfig ? outputWidth : 0;
        this.outputHeight = activeWithConfig ? outputHeight : 0;
        this.outputFps = activeWithConfig ? outputFps : 0;
    }

    static int normalizeDimension(int rawWidthOrHeight) {
        int clamped = Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, rawWidthOrHeight));
        return clamped % 2 == 0 ? clamped : clamped - 1;
    }

    static int normalizeFps(int rawFps) {
        return Math.max(MIN_FPS, Math.min(MAX_FPS, rawFps));
    }

    static boolean isSessionStatusEligibleForOutputConfig(String status) {
        return "connecting".equals(status)
                || "live".equals(status)
                || "host_wait".equals(status)
                || "reshare_waiting".equals(status)
                || "resharing".equals(status);
    }

    boolean hasOutputDimensions() {
        return outputWidth > 0 && outputHeight > 0;
    }

    boolean hasOutputFps() {
        return outputFps > 0;
    }

    static final class Holder {
        private final Object lock = new Object();
        private ModeBStreamStatusSnapshot current = new ModeBStreamStatusSnapshot(
                "idle", "Mode B belum dimulai.", false, 0L, 0, 0, 0);
        private int configuredWidth;
        private int configuredHeight;
        private int configuredFps;

        ModeBStreamStatusSnapshot get() {
            synchronized (lock) {
                return current;
            }
        }

        void clearEncoderOutputConfig() {
            synchronized (lock) {
                configuredWidth = 0;
                configuredHeight = 0;
                configuredFps = 0;
                if (current.outputWidth != 0 || current.outputHeight != 0 || current.outputFps != 0) {
                    current = new ModeBStreamStatusSnapshot(
                            current.status, current.message, current.streaming, current.bitrateKbps,
                            0, 0, 0);
                }
            }
        }

        void setEncoderOutputConfig(int width, int height, int fps) {
            int normalizedWidth = width > 0 ? normalizeDimension(width) : 0;
            int normalizedHeight = height > 0 ? normalizeDimension(height) : 0;
            int normalizedFps = fps > 0 ? normalizeFps(fps) : 0;
            synchronized (lock) {
                if (normalizedWidth > 0 && normalizedHeight > 0 && normalizedFps > 0) {
                    configuredWidth = normalizedWidth;
                    configuredHeight = normalizedHeight;
                    configuredFps = normalizedFps;
                } else {
                    configuredWidth = 0;
                    configuredHeight = 0;
                    configuredFps = 0;
                }
            }
        }

        ModeBStreamStatusSnapshot publish(String status, String message, boolean streaming, long bitrateKbps) {
            synchronized (lock) {
                if (!isSessionStatusEligibleForOutputConfig(status)) {
                    configuredWidth = 0;
                    configuredHeight = 0;
                    configuredFps = 0;
                }
                current = new ModeBStreamStatusSnapshot(
                        status, message, streaming, bitrateKbps,
                        configuredWidth, configuredHeight, configuredFps);
                return current;
            }
        }
    }
}
