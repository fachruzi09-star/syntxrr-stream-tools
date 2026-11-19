package com.syntxrr.streamtools;

import android.media.AudioFormat;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Converts decoder PCM to the fixed 44.1 kHz, stereo, signed PCM16 stream format. */
final class ModeBScreensaverPcmConverter {
    static final int OUTPUT_SAMPLE_RATE = 44_100;
    static final int OUTPUT_CHANNELS = 2;
    static final int OUTPUT_BYTES_PER_FRAME = 4;

    private ModeBScreensaverPcmConverter() { }

    /**
     * Carries fractional output-frame debt between MediaCodec buffers. Rounding every decoded
     * buffer independently can add or lose almost half a sample per buffer and slowly drift.
     * The decoder owns one state per playback epoch, so format changes reset the accumulator.
     */
    static final class ResampleState {
        private int sampleRate = -1;
        private int channels = -1;
        private int pcmEncoding = -1;
        private double fractionalOutputFrames;
        private long totalInputFrames;
        private long totalOutputFrames;

        int outputFramesFor(int inputFrames, int nextSampleRate, int nextChannels, int nextEncoding) {
            if (inputFrames < 0) throw new IllegalArgumentException("Jumlah frame input PCM tidak valid.");
            if (nextSampleRate < 8_000 || nextSampleRate > 192_000
                    || (nextChannels != 1 && nextChannels != 2)
                    || (nextEncoding != AudioFormat.ENCODING_PCM_16BIT
                    && nextEncoding != AudioFormat.ENCODING_PCM_FLOAT)) {
                throw new IllegalArgumentException("Format PCM resampler tidak valid.");
            }
            if (sampleRate != nextSampleRate || channels != nextChannels || pcmEncoding != nextEncoding) {
                reset();
                sampleRate = nextSampleRate;
                channels = nextChannels;
                pcmEncoding = nextEncoding;
            }
            double exactFrames = inputFrames * (double) OUTPUT_SAMPLE_RATE / nextSampleRate
                    + fractionalOutputFrames;
            if (!Double.isFinite(exactFrames) || exactFrames > Integer.MAX_VALUE) {
                throw new IllegalArgumentException("Jumlah frame output PCM terlalu besar.");
            }
            int outputFrames = (int) Math.floor(exactFrames + 1e-9d);
            fractionalOutputFrames = exactFrames - outputFrames;
            totalInputFrames += inputFrames;
            totalOutputFrames += outputFrames;
            return outputFrames;
        }

        void reset() {
            sampleRate = -1;
            channels = -1;
            pcmEncoding = -1;
            fractionalOutputFrames = 0d;
            totalInputFrames = 0L;
            totalOutputFrames = 0L;
        }

        long totalInputFramesForTest() { return totalInputFrames; }
        long totalOutputFramesForTest() { return totalOutputFrames; }
        double fractionalFramesForTest() { return fractionalOutputFrames; }
    }

    static byte[] toOutputFormat(ByteBuffer source, int offset, int size,
            int sampleRate, int channels, int pcmEncoding) {
        return toOutputFormat(source, offset, size, sampleRate, channels, pcmEncoding, null);
    }

    static byte[] toOutputFormat(ByteBuffer source, int offset, int size,
            int sampleRate, int channels, int pcmEncoding, ResampleState state) {
        if (source == null || offset < 0 || size < 0 || offset > source.limit()
                || size > source.limit() - offset || sampleRate < 8_000 || sampleRate > 192_000
                || (channels != 1 && channels != 2)) {
            throw new IllegalArgumentException("Format PCM Screensaver tidak valid.");
        }
        final int bytesPerSample;
        if (pcmEncoding == AudioFormat.ENCODING_PCM_16BIT) {
            bytesPerSample = 2;
        } else if (pcmEncoding == AudioFormat.ENCODING_PCM_FLOAT) {
            bytesPerSample = 4;
        } else {
            throw new IllegalArgumentException("Decoder MP4 menghasilkan format PCM yang tidak didukung.");
        }
        int inputFrameBytes = bytesPerSample * channels;
        if (size == 0) return new byte[0];
        if (size % inputFrameBytes != 0) {
            throw new IllegalArgumentException("Ukuran buffer PCM decoder tidak sejajar dengan frame audio.");
        }
        int inputFrames = size / inputFrameBytes;
        long outputFramesLong = state == null
                ? Math.max(1L, Math.round(inputFrames * (double) OUTPUT_SAMPLE_RATE / sampleRate))
                : state.outputFramesFor(inputFrames, sampleRate, channels, pcmEncoding);
        if (outputFramesLong > Integer.MAX_VALUE / OUTPUT_BYTES_PER_FRAME) {
            throw new IllegalArgumentException("Buffer PCM Screensaver terlalu besar.");
        }
        int outputFrames = (int) outputFramesLong;
        byte[] output = new byte[outputFrames * OUTPUT_BYTES_PER_FRAME];
        ByteBuffer data = source.duplicate().order(ByteOrder.LITTLE_ENDIAN);

        for (int outFrame = 0; outFrame < outputFrames; outFrame++) {
            double sourcePosition = outFrame * (double) sampleRate / OUTPUT_SAMPLE_RATE;
            int leftIndex = Math.min(inputFrames - 1, (int) sourcePosition);
            int rightIndex = Math.min(inputFrames - 1, leftIndex + 1);
            double fraction = sourcePosition - leftIndex;
            double leftA = readSample(data, offset + leftIndex * inputFrameBytes, pcmEncoding);
            double leftB = readSample(data, offset + rightIndex * inputFrameBytes, pcmEncoding);
            double left = leftA + (leftB - leftA) * fraction;
            double right;
            if (channels == 1) {
                right = left;
            } else {
                double rightA = readSample(data, offset + leftIndex * inputFrameBytes + bytesPerSample, pcmEncoding);
                double rightB = readSample(data, offset + rightIndex * inputFrameBytes + bytesPerSample, pcmEncoding);
                right = rightA + (rightB - rightA) * fraction;
            }
            writePcm16(output, outFrame * OUTPUT_BYTES_PER_FRAME, left);
            writePcm16(output, outFrame * OUTPUT_BYTES_PER_FRAME + 2, right);
        }
        return output;
    }

    private static double readSample(ByteBuffer data, int offset, int encoding) {
        if (encoding == AudioFormat.ENCODING_PCM_FLOAT) {
            float value = data.getFloat(offset);
            if (!Float.isFinite(value)) return 0d;
            return Math.max(-1d, Math.min(1d, value)) * 32768d;
        }
        return data.getShort(offset);
    }

    private static void writePcm16(byte[] output, int offset, double sample) {
        long rounded = Math.round(sample);
        int clipped = (int) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, rounded));
        output[offset] = (byte) (clipped & 0xFF);
        output[offset + 1] = (byte) ((clipped >>> 8) & 0xFF);
    }
}
