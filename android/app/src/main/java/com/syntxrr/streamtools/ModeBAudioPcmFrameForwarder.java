package com.syntxrr.streamtools;

import com.pedro.encoder.Frame;
import com.pedro.encoder.input.audio.GetMicrophoneData;

/**
 * Preserves complete PCM input when RootEncoder's AAC input buffer is smaller than an AudioRecord
 * read. Every forwarded frame fits KEY_MAX_INPUT_SIZE and retains a monotonic per-sample timestamp.
 */
final class ModeBAudioPcmFrameForwarder {
    private ModeBAudioPcmFrameForwarder() { }

    static void forward(Frame source, GetMicrophoneData sink, ModeBScreensaverAudioPcmQueue screensaverQueue,
            int sampleRate, boolean stereo) {
        if (source == null || sink == null || sampleRate <= 0) return;
        byte[] buffer = source.getBuffer();
        int sourceOffset = source.getOffset();
        int sourceSize = source.getSize();
        int bytesPerPcmFrame = stereo ? 4 : 2;
        if (buffer == null || sourceOffset < 0 || sourceSize <= 0 || sourceOffset > buffer.length
                || sourceSize > buffer.length - sourceOffset) return;

        int alignedSize = sourceSize - sourceSize % bytesPerPcmFrame;
        int maxFrameBytes = AudioFrameCapacity.MAX_BYTES - (AudioFrameCapacity.MAX_BYTES % bytesPerPcmFrame);
        if (alignedSize <= 0 || maxFrameBytes <= 0) return;

        for (int consumed = 0; consumed < alignedSize; ) {
            int chunkBytes = Math.min(maxFrameBytes, alignedSize - consumed);
            chunkBytes -= chunkBytes % bytesPerPcmFrame;
            if (chunkBytes <= 0) return;

            long timestampUs = source.getTimeStamp() + (long) (consumed / bytesPerPcmFrame)
                    * 1_000_000L / sampleRate;
            Frame frame = consumed == 0 && chunkBytes == alignedSize && sourceSize == alignedSize
                    ? source : new Frame(buffer, sourceOffset + consumed, chunkBytes, timestampUs);

            if (screensaverQueue != null && stereo
                    && sampleRate == ModeBScreensaverAudioPcmQueue.SAMPLE_RATE) {
                screensaverQueue.mixInto(frame);
            }
            sink.inputPCMData(frame);
            consumed += chunkBytes;
        }
    }

    private static final class AudioFrameCapacity {
        // Keep aligned with RootEncoder 2.8.1 AudioEncoder.inputSize / KEY_MAX_INPUT_SIZE.
        static final int MAX_BYTES = com.pedro.encoder.audio.AudioEncoder.inputSize;
    }
}
