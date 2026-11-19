package com.syntxrr.streamtools;

/** Allocation-free saturating mixer for aligned interleaved signed 16-bit little-endian PCM. */
final class ModeBScreensaverPcmMixer {
    static final float MAX_INPUT_GAIN = 4.0f;

    private ModeBScreensaverPcmMixer() { }

    /**
     * Mixes two already time-aligned PCM buffers into {@code output}. Null inputs represent silence.
     * All non-null buffers must use the same sample rate, channel layout and PCM16 little-endian format.
     */
    static void mixInto(byte[] base, int baseOffset, byte[] overlay, int overlayOffset,
            byte[] output, int outputOffset, int sizeBytes, float baseGain, float overlayGain) {
        validateGain(baseGain);
        validateGain(overlayGain);
        if (output == null) throw new IllegalArgumentException("Output PCM buffer is required.");
        if (sizeBytes < 0 || (sizeBytes & 1) != 0) {
            throw new IllegalArgumentException("PCM16 byte count must be non-negative and even.");
        }
        checkRange(output, outputOffset, sizeBytes, "output");
        if (base != null) checkRange(base, baseOffset, sizeBytes, "base");
        if (overlay != null) checkRange(overlay, overlayOffset, sizeBytes, "overlay");
        rejectShiftedOverlap(base, baseOffset, output, outputOffset, sizeBytes);
        rejectShiftedOverlap(overlay, overlayOffset, output, outputOffset, sizeBytes);

        for (int index = 0; index < sizeBytes; index += 2) {
            int baseSample = base == null ? 0 : readSigned16Le(base, baseOffset + index);
            int overlaySample = overlay == null ? 0 : readSigned16Le(overlay, overlayOffset + index);
            long mixed = Math.round(baseSample * (double) baseGain + overlaySample * (double) overlayGain);
            int clipped = (int) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, mixed));
            output[outputOffset + index] = (byte) (clipped & 0xFF);
            output[outputOffset + index + 1] = (byte) ((clipped >>> 8) & 0xFF);
        }
    }

    private static int readSigned16Le(byte[] data, int offset) {
        int value = (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
        return value >= 0x8000 ? value - 0x10000 : value;
    }

    private static void validateGain(float gain) {
        if (!Float.isFinite(gain) || gain < 0f || gain > MAX_INPUT_GAIN) {
            throw new IllegalArgumentException("PCM gain must be finite and between 0 and 4.");
        }
    }

    private static void checkRange(byte[] data, int offset, int size, String label) {
        if (offset < 0 || size < 0 || offset > data.length || size > data.length - offset) {
            throw new IllegalArgumentException("Invalid " + label + " PCM buffer range.");
        }
    }

    private static void rejectShiftedOverlap(byte[] input, int inputOffset, byte[] output,
            int outputOffset, int size) {
        if (input == null || input != output || size == 0 || inputOffset == outputOffset) return;
        long inputEnd = (long) inputOffset + size;
        long outputEnd = (long) outputOffset + size;
        if (inputOffset < outputEnd && outputOffset < inputEnd) {
            throw new IllegalArgumentException("Overlapping in-place PCM ranges must use the same offset.");
        }
    }
}
