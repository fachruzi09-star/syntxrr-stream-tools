package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public final class ModeBScreensaverPcmMixerTest {
    @Test public void sumsBaseAndScreensaverSamplesInPcm16LittleEndian() {
        byte[] base = pcm(1_000, -2_000);
        byte[] overlay = pcm(500, 750);
        byte[] output = new byte[4];
        ModeBScreensaverPcmMixer.mixInto(base, 0, overlay, 0, output, 0, 4, 1f, 1f);
        assertArrayEquals(pcm(1_500, -1_250), output);
    }

    @Test public void saturatesPositiveAndNegativeOverflow() {
        byte[] base = pcm(30_000, -30_000);
        byte[] overlay = pcm(10_000, -10_000);
        byte[] output = new byte[4];
        ModeBScreensaverPcmMixer.mixInto(base, 0, overlay, 0, output, 0, 4, 1f, 1f);
        assertArrayEquals(pcm(Short.MAX_VALUE, Short.MIN_VALUE), output);
    }

    @Test public void supportsOneSilentInputAndIndependentGain() {
        byte[] overlay = pcm(2_000, -4_000);
        byte[] output = new byte[4];
        ModeBScreensaverPcmMixer.mixInto(null, 0, overlay, 0, output, 0, 4, 1f, 0.5f);
        assertArrayEquals(pcm(1_000, -2_000), output);
    }

    @Test public void supportsExactInPlaceBaseMixWithoutAllocation() {
        byte[] output = pcm(1_000, -1_000);
        byte[] overlay = pcm(250, 500);
        ModeBScreensaverPcmMixer.mixInto(output, 0, overlay, 0, output, 0, 4, 1f, 1f);
        assertArrayEquals(pcm(1_250, -500), output);
    }

    @Test public void rejectsMalformedRangesOddByteCountsAndInvalidGains() {
        byte[] input = pcm(10);
        byte[] output = new byte[2];
        assertThrows(IllegalArgumentException.class, () -> ModeBScreensaverPcmMixer.mixInto(
                input, 0, null, 0, output, 0, 1, 1f, 1f));
        assertThrows(IllegalArgumentException.class, () -> ModeBScreensaverPcmMixer.mixInto(
                input, 1, null, 0, output, 0, 2, 1f, 1f));
        assertThrows(IllegalArgumentException.class, () -> ModeBScreensaverPcmMixer.mixInto(
                input, 0, null, 0, output, 1, 2, 1f, 1f));
        assertThrows(IllegalArgumentException.class, () -> ModeBScreensaverPcmMixer.mixInto(
                input, 0, null, 0, output, 0, 2, Float.NaN, 1f));
        assertThrows(IllegalArgumentException.class, () -> ModeBScreensaverPcmMixer.mixInto(
                input, 0, null, 0, output, 0, 2, 1f, 4.1f));
    }

    @Test public void rejectsShiftedInPlaceOverlap() {
        byte[] shared = pcm(1_000, 2_000, 3_000);
        assertThrows(IllegalArgumentException.class, () -> ModeBScreensaverPcmMixer.mixInto(
                shared, 0, null, 0, shared, 2, 4, 1f, 0f));
    }

    private static byte[] pcm(int... samples) {
        byte[] data = new byte[samples.length * 2];
        for (int i = 0; i < samples.length; i++) {
            int value = Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, samples[i]));
            data[i * 2] = (byte) (value & 0xFF);
            data[i * 2 + 1] = (byte) ((value >>> 8) & 0xFF);
        }
        return data;
    }
}
