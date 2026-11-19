package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;

import java.nio.ByteBuffer;
import org.junit.Test;

public final class ModeBCameraYuvConverterTest {
    private static final long MAX_PIXELS = 640L * 480L;

    @Test public void convertsNeutralYuvToGrayscale() {
        int[] pixels = ModeBCameraYuvConverter.toArgb(
                ByteBuffer.wrap(new byte[] { 100, 100, 100, 100 }), 2, 1,
                ByteBuffer.wrap(new byte[] { (byte) 128 }), 1, 1,
                ByteBuffer.wrap(new byte[] { (byte) 128 }), 1, 1,
                2, 2, 0, 0, 2, 2, 2, 2, MAX_PIXELS);
        assertEquals(4, pixels.length);
        assertEquals(0xFF646464, pixels[0]);
        assertEquals(0xFF646464, pixels[3]);
    }

    @Test public void convertsJfifRedSample() {
        int[] pixels = ModeBCameraYuvConverter.toArgb(
                ByteBuffer.wrap(new byte[] { 76, 76, 76, 76 }), 2, 1,
                ByteBuffer.wrap(new byte[] { 85 }), 1, 1,
                ByteBuffer.wrap(new byte[] { (byte) 255 }), 1, 1,
                2, 2, 0, 0, 2, 2, 2, 2, MAX_PIXELS);
        assertEquals(0xFFFE0000, pixels[0]);
    }

    @Test public void honorsRowAndPixelStridesAndCrop() {
        ByteBuffer y = ByteBuffer.wrap(new byte[] {
                100, 100, 100, 100,
                100, 100, 100, 100,
                100, 100, 100, 100,
                100, 100, 100, 100
        });
        ByteBuffer u = ByteBuffer.wrap(new byte[] { (byte) 128, 0, (byte) 128, 0, (byte) 128, 0, (byte) 128, 0 });
        ByteBuffer v = ByteBuffer.wrap(new byte[] { (byte) 128, 0, (byte) 128, 0, (byte) 128, 0, (byte) 128, 0 });
        int[] pixels = ModeBCameraYuvConverter.toArgb(
                y, 4, 1, u, 4, 2, v, 4, 2,
                4, 4, 2, 2, 2, 2, 2, 2, MAX_PIXELS);
        assertEquals(4, pixels.length);
        assertEquals(0xFF646464, pixels[0]);
        assertEquals(0xFF646464, pixels[3]);
    }


    @Test public void reusesCallerOwnedArgbBufferWhenCapacityIsSufficient() {
        int[] scratch = new int[] { 0, 0, 0, 0, 0x12345678 };
        int[] pixels = ModeBCameraYuvConverter.toArgb(
                ByteBuffer.wrap(new byte[] { 100, 100, 100, 100 }), 2, 1,
                ByteBuffer.wrap(new byte[] { (byte) 128 }), 1, 1,
                ByteBuffer.wrap(new byte[] { (byte) 128 }), 1, 1,
                2, 2, 0, 0, 2, 2, 2, 2, MAX_PIXELS, scratch);
        assertSame(scratch, pixels);
        assertEquals(0xFF646464, pixels[0]);
        assertEquals(0xFF646464, pixels[3]);
        assertEquals(0x12345678, pixels[4]);
    }

    @Test public void allocatesLargerBufferWhenReusableCapacityIsTooSmall() {
        int[] scratch = new int[2];
        int[] pixels = ModeBCameraYuvConverter.toArgb(
                ByteBuffer.wrap(new byte[] { 100, 100, 100, 100 }), 2, 1,
                ByteBuffer.wrap(new byte[] { (byte) 128 }), 1, 1,
                ByteBuffer.wrap(new byte[] { (byte) 128 }), 1, 1,
                2, 2, 0, 0, 2, 2, 2, 2, MAX_PIXELS, scratch);
        org.junit.Assert.assertNotSame(scratch, pixels);
        assertEquals(4, pixels.length);
    }

    @Test public void rejectsOutputPixelCountsThatOverflowArrayIndexing() {
        assertNull(ModeBCameraYuvConverter.toArgb(
                ByteBuffer.wrap(new byte[] { 1 }), 1, 1,
                ByteBuffer.wrap(new byte[] { 1 }), 1, 1,
                ByteBuffer.wrap(new byte[] { 1 }), 1, 1,
                1, 1, 0, 0, 1, 1, 50_000, 50_000, Long.MAX_VALUE));
    }

    @Test public void rejectsInvalidStridesDimensionsAndPixelBudgets() {
        assertNull(ModeBCameraYuvConverter.toArgb(
                ByteBuffer.wrap(new byte[] { 1 }), 0, 1,
                ByteBuffer.wrap(new byte[] { 1 }), 1, 1,
                ByteBuffer.wrap(new byte[] { 1 }), 1, 1,
                2, 2, 0, 0, 2, 2, 2, 2, MAX_PIXELS));
        assertNull(ModeBCameraYuvConverter.toArgb(
                ByteBuffer.wrap(new byte[] { 1 }), 1, 1,
                ByteBuffer.wrap(new byte[] { 1 }), 1, 1,
                ByteBuffer.wrap(new byte[] { 1 }), 1, 1,
                2, 2, 0, 0, 2, 2, 800, 800, MAX_PIXELS));
    }
}
