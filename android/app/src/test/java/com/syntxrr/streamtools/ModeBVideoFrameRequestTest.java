package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ModeBVideoFrameRequestTest {
    @Test
    public void forwardsAndroidScaledFrameArgumentsInApiOrder() {
        final long expectedTimeUs = 1_375_000L;
        final int expectedOption = 3; // MediaMetadataRetriever.OPTION_CLOSEST
        final int expectedWidth = 1280;
        final int expectedHeight = 720;
        final Object expectedFrame = new Object();
        final CapturedRequest captured = new CapturedRequest(expectedFrame);

        Object result = ModeBVideoFrameRequest.decode(
                captured, expectedTimeUs, expectedOption, expectedWidth, expectedHeight);

        assertSame(expectedFrame, result);
        assertTrue(expectedTimeUs == captured.timeUs);
        assertEquals(expectedOption, captured.option);
        assertEquals(expectedWidth, captured.width);
        assertEquals(expectedHeight, captured.height);
    }

    @Test
    public void rejectsZeroWidthBeforeCallingPlatformDecoder() {
        assertThrows(IllegalArgumentException.class,
                () -> ModeBVideoFrameRequest.decode(new CapturedRequest(new Object()), 0L, 3, 0, 720));
    }

    private static final class CapturedRequest implements ModeBVideoFrameRequest.ScaledFrameRetriever<Object> {
        private final Object frame;
        long timeUs;
        int option;
        int width;
        int height;

        CapturedRequest(Object frame) { this.frame = frame; }

        @Override public Object getScaledFrameAtTime(long timeUs, int option, int dstWidth, int dstHeight) {
            this.timeUs = timeUs;
            this.option = option;
            this.width = dstWidth;
            this.height = dstHeight;
            return frame;
        }
    }
}
