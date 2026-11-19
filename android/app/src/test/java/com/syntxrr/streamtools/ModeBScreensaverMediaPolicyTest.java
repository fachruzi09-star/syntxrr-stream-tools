package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBScreensaverMediaPolicyTest {
    @Test public void acceptsOnlyBoundedGifFileSizes() {
        assertTrue(ModeBScreensaverMediaPolicy.isValidFileSize(1));
        assertTrue(ModeBScreensaverMediaPolicy.isValidFileSize(5L * 1024L * 1024L));
        assertFalse(ModeBScreensaverMediaPolicy.isValidFileSize(0));
        assertFalse(ModeBScreensaverMediaPolicy.isValidFileSize(5L * 1024L * 1024L + 1));
    }

    @Test public void acceptsOnlyBoundedLocalMp4Sizes() {
        assertTrue(ModeBScreensaverMediaPolicy.isValidVideoFileSize(1L));
        assertTrue(ModeBScreensaverMediaPolicy.isValidVideoFileSize(12L * 1024L * 1024L));
        assertFalse(ModeBScreensaverMediaPolicy.isValidVideoFileSize(0L));
        assertFalse(ModeBScreensaverMediaPolicy.isValidVideoFileSize(12L * 1024L * 1024L + 1L));
    }

    @Test public void validatesGif87aAndGif89aSignatures() {
        assertTrue(ModeBScreensaverMediaPolicy.matchesGifSignature(new byte[] {'G','I','F','8','7','a'}));
        assertTrue(ModeBScreensaverMediaPolicy.matchesGifSignature(new byte[] {'G','I','F','8','9','a'}));
        assertFalse(ModeBScreensaverMediaPolicy.matchesGifSignature(new byte[] {'G','I','F','8','9','b'}));
        assertFalse(ModeBScreensaverMediaPolicy.matchesGifSignature(new byte[] {'P','N','G'}));
    }

    @Test public void samplesLargeGifFramesBeforeReservation() {
        int sample = ModeBScreensaverMediaPolicy.sampleSize(4000, 3000);
        assertTrue(sample >= 4);
        long width = (4000L + sample - 1L) / sample;
        long height = (3000L + sample - 1L) / sample;
        assertTrue(width * height <= ModeBScreensaverMediaPolicy.MAX_GIF_FRAME_PIXELS);
        assertTrue(ModeBScreensaverMediaPolicy.estimateGifWorkingBytes(width, height) > 0L);
    }

    @Test public void rejectsUnboundedAndOverflowingGifFrameEstimates() {
        assertEquals(-1L, ModeBScreensaverMediaPolicy.estimateGifWorkingBytes(1000, 1000));
        assertEquals(-1L, ModeBScreensaverMediaPolicy.estimateGifWorkingBytes(Long.MAX_VALUE, 2));
        assertEquals(-1L, ModeBScreensaverMediaPolicy.estimateGifWorkingBytes(0, 100));
    }


    @Test public void rejectsGifWithMoreThanMaximumFrames() {
        byte[] oneFrame = new byte[] {
                'G','I','F','8','9','a', 1,0, 1,0, 0,0,0,
                0x2C, 0,0, 0,0, 1,0, 1,0, 0, 2, 1, 0, 0, 0x3B
        };
        int frameBlockBytes = oneFrame.length - 14;
        int frameCount = ModeBScreensaverMediaPolicy.MAX_GIF_FRAMES + 1;
        byte[] manyFrames = new byte[13 + frameBlockBytes * frameCount + 1];
        System.arraycopy(oneFrame, 0, manyFrames, 0, 13);
        for (int i = 0; i < frameCount; i++) {
            System.arraycopy(oneFrame, 13, manyFrames, 13 + frameBlockBytes * i, frameBlockBytes);
        }
        manyFrames[manyFrames.length - 1] = 0x3B;
        assertEquals(-1, ModeBScreensaverMediaPolicy.countGifFrames(manyFrames));
    }

    @Test public void countsGifImageDescriptorsAndRejectsMalformedFiles() {
        byte[] oneFrame = new byte[] {
                'G','I','F','8','9','a', 1,0, 1,0, 0,0,0,
                0x2C, 0,0, 0,0, 1,0, 1,0, 0, 2, 1, 0, 0, 0x3B
        };
        assertEquals(1, ModeBScreensaverMediaPolicy.countGifFrames(oneFrame));
        int frameBlockBytes = oneFrame.length - 14;
        byte[] twoFrames = new byte[oneFrame.length - 1 + frameBlockBytes + 1];
        System.arraycopy(oneFrame, 0, twoFrames, 0, oneFrame.length - 1);
        System.arraycopy(oneFrame, 13, twoFrames, oneFrame.length - 1, frameBlockBytes);
        twoFrames[twoFrames.length - 1] = 0x3B;
        assertEquals(2, ModeBScreensaverMediaPolicy.countGifFrames(twoFrames));
        assertEquals(-1, ModeBScreensaverMediaPolicy.countGifFrames(new byte[] {'G','I','F','8','9','a'}));
    }
}
