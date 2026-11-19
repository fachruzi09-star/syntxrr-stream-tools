package com.syntxrr.streamtools;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;

/** Bounded format and memory policy for local Screensaver media. */
final class ModeBScreensaverMediaPolicy {
    static final long MAX_FILE_BYTES = 5L * 1024L * 1024L;
    static final long MAX_VIDEO_FILE_BYTES = 12L * 1024L * 1024L;
    static final long MAX_GIF_FRAME_PIXELS = 750_000L;
    // Reserve for the current frame plus decoder transition/working frames. This is an
    // app-owned ARGB-equivalent estimate; Android ImageDecoder internals remain framework-owned.
    static final int GIF_WORKING_FRAME_COUNT = 3;
    static final int MAX_GIF_FRAMES = 120;

    private ModeBScreensaverMediaPolicy() { }

    static boolean isValidFileSize(long bytes) {
        return bytes > 0L && bytes <= MAX_FILE_BYTES;
    }

    static boolean isValidVideoFileSize(long bytes) {
        return bytes > 0L && bytes <= MAX_VIDEO_FILE_BYTES;
    }

    static boolean matchesGifSignature(byte[] header) {
        if (header == null || header.length < 6) return false;
        return header[0] == 'G' && header[1] == 'I' && header[2] == 'F'
                && header[3] == '8' && (header[4] == '7' || header[4] == '9')
                && header[5] == 'a';
    }

    static long estimateGifWorkingBytes(long width, long height) {
        if (width <= 0L || height <= 0L || width > Long.MAX_VALUE / height) return -1L;
        long pixels = width * height;
        if (pixels > MAX_GIF_FRAME_PIXELS) return -1L;
        long frameBytes = ModeBBitmapBudget.argbBytes(width, height);
        if (frameBytes <= 0L || frameBytes > Long.MAX_VALUE / GIF_WORKING_FRAME_COUNT) return -1L;
        return frameBytes * GIF_WORKING_FRAME_COUNT;
    }


    static int countGifFrames(File file) throws IOException {
        try (InputStream input = new FileInputStream(file)) {
            return countGifFrames(input);
        }
    }

    static int countGifFrames(byte[] data) {
        if (data == null) return -1;
        try {
            return countGifFrames(new ByteArrayInputStream(data));
        } catch (IOException ignored) {
            return -1;
        }
    }

    private static int countGifFrames(InputStream input) throws IOException {
        byte[] header = new byte[6];
        if (!readFully(input, header) || !matchesGifSignature(header)) return -1;
        byte[] screen = new byte[7];
        if (!readFully(input, screen)) return -1;
        int screenPacked = screen[4] & 0xFF;
        if ((screenPacked & 0x80) != 0) {
            int tableBytes = 3 * (1 << ((screenPacked & 0x07) + 1));
            if (!skipFully(input, tableBytes)) return -1;
        }

        int frames = 0;
        while (true) {
            int marker = input.read();
            if (marker < 0) return -1;
            if (marker == 0x3B) return frames; // GIF trailer
            if (marker == 0x21) { // Extension: fixed header block plus data sub-blocks.
                if (input.read() < 0) return -1; // extension label
                int firstSize = input.read();
                if (firstSize < 0 || !skipFully(input, firstSize)) return -1;
                if (firstSize != 0 && !skipSubBlocks(input)) return -1;
                continue;
            }
            if (marker == 0x2C) { // Image descriptor.
                byte[] descriptor = new byte[9];
                if (!readFully(input, descriptor)) return -1;
                int imagePacked = descriptor[8] & 0xFF;
                if ((imagePacked & 0x80) != 0) {
                    int tableBytes = 3 * (1 << ((imagePacked & 0x07) + 1));
                    if (!skipFully(input, tableBytes)) return -1;
                }
                if (input.read() < 0 || !skipSubBlocks(input)) return -1; // LZW min code size + image data
                frames++;
                if (frames > MAX_GIF_FRAMES) return -1;
                continue;
            }
            return -1; // Unknown block or malformed file.
        }
    }

    private static boolean skipSubBlocks(InputStream input) throws IOException {
        while (true) {
            int size = input.read();
            if (size < 0) return false;
            if (size == 0) return true;
            if (!skipFully(input, size)) return false;
        }
    }

    private static boolean skipFully(InputStream input, int count) throws IOException {
        int remaining = count;
        while (remaining > 0) {
            long skipped = input.skip(remaining);
            if (skipped > 0L) {
                remaining -= (int) skipped;
                continue;
            }
            if (input.read() < 0) return false;
            remaining--;
        }
        return true;
    }

    private static boolean readFully(InputStream input, byte[] target) throws IOException {
        int offset = 0;
        while (offset < target.length) {
            int read = input.read(target, offset, target.length - offset);
            if (read < 0) return false;
            offset += read;
        }
        return true;
    }

    static int sampleSize(int width, int height) {
        if (width <= 0 || height <= 0) return 0;
        int sample = 1;
        while (sample > 0) {
            long sampledWidth = (width + (long) sample - 1L) / sample;
            long sampledHeight = (height + (long) sample - 1L) / sample;
            if (sampledWidth * sampledHeight <= MAX_GIF_FRAME_PIXELS) return sample;
            if (sample >= (1 << 29)) return 0;
            sample <<= 1;
        }
        return 0;
    }
}
