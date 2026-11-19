package com.syntxrr.streamtools;

import com.pedro.encoder.Frame;
import com.pedro.encoder.input.audio.GetMicrophoneData;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.*;

public final class ModeBAudioPcmFrameForwarderTest {
    @Test public void splitsLargeLivePcmReadsWithoutDroppingTailAndMixesMatchingScreensaverAudio() {
        int pcmFrames = 3_000;
        byte[] live = stereoPcm(pcmFrames, 100);
        byte[] overlay = stereoPcm(pcmFrames, 200);
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        assertTrue(queue.offer(overlay, 0, overlay.length, 1_000_000L));
        List<Frame> output = new ArrayList<>();
        GetMicrophoneData sink = output::add;

        ModeBAudioPcmFrameForwarder.forward(new Frame(live, 0, live.length, 1_000_000L),
                sink, queue, 44_100, true);

        assertEquals(2, output.size());
        assertEquals(ModeBScreensaverAudioPcmQueue.MAX_ENCODER_FRAME_BYTES, output.get(0).getSize());
        assertEquals(pcmFrames * 4 - ModeBScreensaverAudioPcmQueue.MAX_ENCODER_FRAME_BYTES,
                output.get(1).getSize());
        assertEquals(1_000_000L, output.get(0).getTimeStamp());
        assertEquals(1_000_000L + (long) (ModeBScreensaverAudioPcmQueue.MAX_ENCODER_FRAME_BYTES / 4)
                * 1_000_000L / 44_100L, output.get(1).getTimeStamp());
        assertEquals(300, readShort(output.get(0).getBuffer(), output.get(0).getOffset()));
        assertEquals(300, readShort(output.get(1).getBuffer(), output.get(1).getOffset()));
        assertEquals(0, queue.queuedChunksForTest());
    }

    @Test public void preservesMonoAlignmentAndDoesNotMixIncompatibleFormat() {
        byte[] mono = new byte[10_000];
        for (int i = 0; i < mono.length; i += 2) {
            mono[i] = 25;
            mono[i + 1] = 0;
        }
        ModeBScreensaverAudioPcmQueue queue = new ModeBScreensaverAudioPcmQueue();
        byte[] overlay = stereoPcm(1_000, 500);
        assertTrue(queue.offer(overlay, 0, overlay.length, 2_000_000L));
        List<Frame> output = new ArrayList<>();

        ModeBAudioPcmFrameForwarder.forward(new Frame(mono, 0, mono.length, 2_000_000L),
                output::add, queue, 48_000, false);

        assertEquals(2, output.size());
        for (Frame frame : output) {
            assertTrue(frame.getSize() <= ModeBScreensaverAudioPcmQueue.MAX_ENCODER_FRAME_BYTES);
            assertEquals(0, frame.getSize() % 2);
            assertEquals(25, readShort(frame.getBuffer(), frame.getOffset()));
        }
        assertEquals(1, queue.queuedChunksForTest());
    }


    @Test public void dropsIncompleteTrailingPcmSampleBytes() {
        byte[] mono = new byte[] { 10, 0, 20, 0, 99 };
        List<Frame> output = new ArrayList<>();
        ModeBAudioPcmFrameForwarder.forward(new Frame(mono, 0, mono.length, 3_000_000L),
                output::add, null, 44_100, false);
        assertEquals(1, output.size());
        assertEquals(4, output.get(0).getSize());
    }

    private static byte[] stereoPcm(int frames, int value) {
        byte[] data = new byte[frames * 4];
        for (int i = 0; i < data.length; i += 2) {
            data[i] = (byte) value;
            data[i + 1] = (byte) (value >>> 8);
        }
        return data;
    }

    private static int readShort(byte[] data, int offset) {
        int value = (data[offset] & 0xff) | ((data[offset + 1] & 0xff) << 8);
        return value >= 0x8000 ? value - 0x10000 : value;
    }
}
