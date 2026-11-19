package com.syntxrr.streamtools;

import android.media.AudioFormat;
import org.junit.Test;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

import static org.junit.Assert.*;

public final class ModeBScreensaverPcmConverterTest {
    @Test public void duplicatesMonoPcm16IntoStereoWithoutChangingRate() {
        ByteBuffer input = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN);
        input.putShort((short) 1_000).putShort((short) -2_000).flip();

        byte[] output = ModeBScreensaverPcmConverter.toOutputFormat(input, 0, 4,
                44_100, 1, AudioFormat.ENCODING_PCM_16BIT);

        assertEquals(8, output.length);
        assertEquals(1_000, readShort(output, 0));
        assertEquals(1_000, readShort(output, 2));
        assertEquals(-2_000, readShort(output, 4));
        assertEquals(-2_000, readShort(output, 6));
    }

    @Test public void resamplesFortyEightKhzStereoToFortyFourPointOneKhz() {
        ByteBuffer input = ByteBuffer.allocate(480 * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (int i = 0; i < 480; i++) {
            input.putShort((short) (i * 10));
            input.putShort((short) (-i * 10));
        }
        input.flip();

        byte[] output = ModeBScreensaverPcmConverter.toOutputFormat(input, 0, input.remaining(),
                48_000, 2, AudioFormat.ENCODING_PCM_16BIT);

        assertEquals(441 * 4, output.length);
        assertEquals(0, readShort(output, 0));
        assertTrue(readShort(output, output.length - 4) > 0);
        assertTrue(readShort(output, output.length - 2) < 0);
    }

    @Test public void convertsFloatPcmAndClipsToSignedSixteenBit() {
        ByteBuffer input = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
        input.putFloat(1.5f).putFloat(-1.5f).flip();

        byte[] output = ModeBScreensaverPcmConverter.toOutputFormat(input, 0, 8,
                44_100, 2, AudioFormat.ENCODING_PCM_FLOAT);

        assertEquals(Short.MAX_VALUE, readShort(output, 0));
        assertEquals(Short.MIN_VALUE, readShort(output, 2));
    }

    @Test public void rejectsUnsupportedChannelCountAndMisalignedPcm() {
        ByteBuffer input = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
        assertThrows(IllegalArgumentException.class, () -> ModeBScreensaverPcmConverter.toOutputFormat(
                input, 0, 8, 44_100, 3, AudioFormat.ENCODING_PCM_16BIT));
        assertThrows(IllegalArgumentException.class, () -> ModeBScreensaverPcmConverter.toOutputFormat(
                input, 0, 3, 44_100, 2, AudioFormat.ENCODING_PCM_16BIT));
    }


    @Test public void statefulResamplingDoesNotRoundEveryDecoderBufferIndependently() {
        byte[] inputBytes = new byte[1_024 * 4];
        ByteBuffer input = ByteBuffer.wrap(inputBytes).order(ByteOrder.LITTLE_ENDIAN);
        ModeBScreensaverPcmConverter.ResampleState state =
                new ModeBScreensaverPcmConverter.ResampleState();
        long outputFrames = 0L;

        for (int index = 0; index < 1_000; index++) {
            byte[] output = ModeBScreensaverPcmConverter.toOutputFormat(input, 0, inputBytes.length,
                    48_000, 2, AudioFormat.ENCODING_PCM_16BIT, state);
            assertEquals(0, output.length % ModeBScreensaverPcmConverter.OUTPUT_BYTES_PER_FRAME);
            outputFrames += output.length / ModeBScreensaverPcmConverter.OUTPUT_BYTES_PER_FRAME;
        }

        long expectedFrames = (1_024L * 1_000L * 44_100L) / 48_000L;
        assertEquals(expectedFrames, outputFrames);
        assertEquals(expectedFrames, state.totalOutputFramesForTest());
        assertEquals(1_024_000L, state.totalInputFramesForTest());
        assertEquals(0d, state.fractionalFramesForTest(), 0.000001d);

        // A stateless per-buffer round would produce 941 * 1,000 = 941,000 frames.
        assertEquals(941_000L, 941L * 1_000L);
        assertEquals(200L, 941_000L - outputFrames);
    }

    @Test public void statefulResamplerCarriesTinyBlockFractionsAndResetsOnFormatChange() {
        byte[] oneStereoFrame = new byte[] { 0, 0, 0, 0 };
        ByteBuffer input = ByteBuffer.wrap(oneStereoFrame).order(ByteOrder.LITTLE_ENDIAN);
        ModeBScreensaverPcmConverter.ResampleState state =
                new ModeBScreensaverPcmConverter.ResampleState();

        byte[] first = ModeBScreensaverPcmConverter.toOutputFormat(input, 0, 4,
                48_000, 2, AudioFormat.ENCODING_PCM_16BIT, state);
        byte[] second = ModeBScreensaverPcmConverter.toOutputFormat(input, 0, 4,
                48_000, 2, AudioFormat.ENCODING_PCM_16BIT, state);
        assertEquals(0, first.length);
        assertEquals(4, second.length);
        assertEquals(2L, state.totalInputFramesForTest());
        assertEquals(1L, state.totalOutputFramesForTest());

        byte[] changedFormat = ModeBScreensaverPcmConverter.toOutputFormat(input, 0, 4,
                44_100, 2, AudioFormat.ENCODING_PCM_16BIT, state);
        assertEquals(4, changedFormat.length);
        assertEquals(1L, state.totalInputFramesForTest());
        assertEquals(1L, state.totalOutputFramesForTest());
        assertEquals(0d, state.fractionalFramesForTest(), 0.000001d);
    }

    private static int readShort(byte[] data, int offset) {
        int value = (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8);
        return value >= 0x8000 ? value - 0x10000 : value;
    }
}
