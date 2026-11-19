package com.syntxrr.streamtools;

/**
 * Session-wide admission budget for app-owned Mode B visual pixel buffers.
 *
 * The budget counts ARGB-equivalent bytes, including bounded transient buffers. It does not
 * account for codec internals, GL textures, encoder surfaces, or Android framework allocations.
 * Dynamic reservations are protected so static images cannot consume the capacity needed by
 * an enabled camera and the two supported MP4 overlay decoders.
 */
final class ModeBBitmapBudget {
    static final long SESSION_LIMIT_BYTES = 48L * 1024L * 1024L;
    static final int ARGB_BYTES_PER_PIXEL = 4;
    static final int VIDEO_MAX_FRAME_WIDTH = 1280;
    static final int VIDEO_MAX_FRAME_HEIGHT = 720;
    static final int CAMERA_MAX_OUTPUT_WIDTH = 640;
    static final int CAMERA_MAX_OUTPUT_HEIGHT = 480;
    static final int CAMERA_MAX_CAPTURE_WIDTH = 1280;
    static final int CAMERA_MAX_CAPTURE_HEIGHT = 720;
    static final int CAMERA_IMAGE_READER_MAX_IMAGES = 3;
    static final long CAMERA_MAX_YUV_FRAME_BYTES = 2L * 1024L * 1024L;
    static final long CAMERA_IMAGE_READER_FRAME_BYTES =
            ((long) CAMERA_MAX_CAPTURE_WIDTH * CAMERA_MAX_CAPTURE_HEIGHT * 3L + 1L) / 2L;

    static final long VIDEO_MAX_FRAME_BYTES = argbBytes(
            (long) VIDEO_MAX_FRAME_WIDTH, (long) VIDEO_MAX_FRAME_HEIGHT);
    // A decoded frame temporarily coexists with the previous displayed frame during replacement.
    static final long VIDEO_RESERVATION_BYTES = VIDEO_MAX_FRAME_BYTES * 2L;
    // Scratch int[], previous displayed bitmap, new bitmap, and rotation intermediate.
    static final long CAMERA_RESERVATION_BYTES = argbBytes(
            (long) CAMERA_MAX_OUTPUT_WIDTH, (long) CAMERA_MAX_OUTPUT_HEIGHT) * 4L
            + CAMERA_MAX_YUV_FRAME_BYTES
            + CAMERA_IMAGE_READER_FRAME_BYTES * CAMERA_IMAGE_READER_MAX_IMAGES;
    static final long DYNAMIC_RESERVATION_LIMIT_BYTES =
            VIDEO_RESERVATION_BYTES * ModeBStreamPolicy.MAX_OVERLAY_VIDEO_ASSETS
                    + CAMERA_RESERVATION_BYTES;
    static final long STATIC_RESERVATION_LIMIT_BYTES =
            SESSION_LIMIT_BYTES - DYNAMIC_RESERVATION_LIMIT_BYTES;

    private long staticBytes;
    private long dynamicBytes;

    synchronized Reservation tryReserveStatic(long bytes) {
        return reserve(bytes, false);
    }

    synchronized Reservation tryReserveDynamic(long bytes) {
        return reserve(bytes, true);
    }

    private Reservation reserve(long bytes, boolean dynamic) {
        if (bytes <= 0L) return null;
        long current = dynamic ? dynamicBytes : staticBytes;
        long limit = dynamic ? DYNAMIC_RESERVATION_LIMIT_BYTES : STATIC_RESERVATION_LIMIT_BYTES;
        if (bytes > limit - current) return null;
        if (dynamic) dynamicBytes += bytes;
        else staticBytes += bytes;
        return new Reservation(this, dynamic, bytes);
    }

    private synchronized boolean resize(Reservation reservation, long newBytes) {
        if (reservation == null || reservation.closed || newBytes <= 0L) return false;
        long current = reservation.bytes;
        long used = reservation.dynamic ? dynamicBytes : staticBytes;
        long limit = reservation.dynamic ? DYNAMIC_RESERVATION_LIMIT_BYTES : STATIC_RESERVATION_LIMIT_BYTES;
        long nextUsed = used - current;
        if (newBytes > limit - nextUsed) return false;
        if (reservation.dynamic) dynamicBytes = nextUsed + newBytes;
        else staticBytes = nextUsed + newBytes;
        reservation.bytes = newBytes;
        return true;
    }

    private synchronized void release(Reservation reservation) {
        if (reservation == null || reservation.closed) return;
        reservation.closed = true;
        if (reservation.dynamic) dynamicBytes = Math.max(0L, dynamicBytes - reservation.bytes);
        else staticBytes = Math.max(0L, staticBytes - reservation.bytes);
        reservation.bytes = 0L;
    }

    synchronized long getStaticBytesInUse() { return staticBytes; }
    synchronized long getDynamicBytesInUse() { return dynamicBytes; }
    synchronized long getTotalBytesInUse() { return staticBytes + dynamicBytes; }

    static long argbBytes(long width, long height) {
        if (width <= 0L || height <= 0L || width > Long.MAX_VALUE / height) return -1L;
        long pixels = width * height;
        if (pixels > Long.MAX_VALUE / ARGB_BYTES_PER_PIXEL) return -1L;
        return pixels * ARGB_BYTES_PER_PIXEL;
    }

    static final class Reservation implements AutoCloseable {
        private final ModeBBitmapBudget owner;
        private final boolean dynamic;
        private long bytes;
        private boolean closed;

        private Reservation(ModeBBitmapBudget owner, boolean dynamic, long bytes) {
            this.owner = owner;
            this.dynamic = dynamic;
            this.bytes = bytes;
        }

        boolean resize(long newBytes) { return owner.resize(this, newBytes); }
        long getBytes() { synchronized (owner) { return bytes; } }
        @Override public void close() { owner.release(this); }
    }
}
