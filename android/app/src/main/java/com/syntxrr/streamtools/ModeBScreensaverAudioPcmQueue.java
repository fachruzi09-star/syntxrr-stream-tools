package com.syntxrr.streamtools;

import com.pedro.encoder.Frame;
import com.pedro.encoder.audio.AudioEncoder;

import java.util.ArrayDeque;

/**
 * Bounded timestamped PCM handoff between the MP4 decoder and the live AAC input.
 * Chunks are copied on the decoder thread; the microphone callback only performs aligned mixing.
 */
final class ModeBScreensaverAudioPcmQueue {
    static final int SAMPLE_RATE = ModeBScreensaverPcmConverter.OUTPUT_SAMPLE_RATE;
    static final int CHANNELS = ModeBScreensaverPcmConverter.OUTPUT_CHANNELS;
    static final int BYTES_PER_FRAME = ModeBScreensaverPcmConverter.OUTPUT_BYTES_PER_FRAME;
    static final int MAX_CHUNKS = 96;
    static final long MAX_QUEUED_DURATION_US = 2_000_000L;
    static final int MAX_CHUNK_BYTES = 64 * 1024;
    // RootEncoder 2.8.1 AudioEncoder configures KEY_MAX_INPUT_SIZE with this value.
    static final int MAX_ENCODER_FRAME_BYTES = AudioEncoder.inputSize - (AudioEncoder.inputSize % BYTES_PER_FRAME);

    interface ContinueReading {
        boolean shouldContinue();
    }

    private static final class Chunk {
        final byte[] data;
        int offset;
        final int end;
        final long timestampUs;

        Chunk(byte[] data, int offset, int size, long timestampUs) {
            this.data = data;
            this.offset = offset;
            this.end = offset + size;
            this.timestampUs = timestampUs;
        }

        int size() { return end - offset; }

        /**
         * Derive the current cursor from the immutable chunk origin and cumulative consumed
         * sample count. Repeatedly adding a per-slice microsecond duration loses the fractional
         * sample remainder at every AAC frame boundary and can accumulate long-run drift.
         */
        long currentTimestampUs() {
            long consumedSamples = offset / BYTES_PER_FRAME;
            long elapsedUs = consumedSamples * 1_000_000L / SAMPLE_RATE;
            return saturatingAdd(timestampUs, elapsedUs);
        }

        long endTimeUs() {
            long totalSamples = end / BYTES_PER_FRAME;
            long durationUs = totalSamples * 1_000_000L / SAMPLE_RATE;
            return saturatingAdd(timestampUs, durationUs);
        }
    }

    private final Object lock = new Object();
    private final ArrayDeque<Chunk> chunks = new ArrayDeque<>();
    private boolean closed;
    private long generation;
    // End-exclusive timestamp of the last accepted PCM sample range. This fence survives
    // consumer handoffs and backlog drops so overlapping decoder output cannot be mixed twice.
    private long lastAcceptedEndTimeUs = -1L;
    private long droppedChunks;

    boolean offer(byte[] pcm, int offset, int size, long timestampUs) {
        return offer(pcm, offset, size, timestampUs, -1L);
    }

    boolean offer(byte[] pcm, int offset, int size, long timestampUs, long expectedGeneration) {
        if (pcm == null || offset < 0 || size <= 0 || size > MAX_CHUNK_BYTES
                || offset > pcm.length || size > pcm.length - offset
                || size % BYTES_PER_FRAME != 0 || timestampUs < 0L) return false;
        synchronized (lock) {
            if (closed || (expectedGeneration >= 0L && expectedGeneration != generation)) return false;

            int acceptedOffset = offset;
            int acceptedSize = size;
            long acceptedTimestampUs = timestampUs;
            if (lastAcceptedEndTimeUs >= 0L && acceptedTimestampUs < lastAcceptedEndTimeUs) {
                // MediaCodec may repeat a PTS or return a partially overlapping PCM output
                // buffer. Keep only samples strictly beyond the already accepted end-exclusive
                // timestamp; exact duplicates and fully covered buffers are dropped entirely.
                int overlapSamples = samplesForDeltaCeil(lastAcceptedEndTimeUs - acceptedTimestampUs);
                int inputSamples = acceptedSize / BYTES_PER_FRAME;
                if (overlapSamples >= inputSamples) {
                    droppedChunks++;
                    return false;
                }
                int trimBytes = overlapSamples * BYTES_PER_FRAME;
                acceptedOffset += trimBytes;
                acceptedSize -= trimBytes;
                acceptedTimestampUs = saturatingAdd(acceptedTimestampUs,
                        (long) overlapSamples * 1_000_000L / SAMPLE_RATE);
                if (acceptedTimestampUs < lastAcceptedEndTimeUs) {
                    acceptedTimestampUs = lastAcceptedEndTimeUs;
                }
            }

            byte[] owned = new byte[acceptedSize];
            System.arraycopy(pcm, acceptedOffset, owned, 0, acceptedSize);
            Chunk chunk = new Chunk(owned, 0, acceptedSize, acceptedTimestampUs);
            chunks.addLast(chunk);
            lastAcceptedEndTimeUs = chunk.endTimeUs();
            trimLocked(chunk.endTimeUs());
            lock.notifyAll();
            return true;
        }
    }

    /** Mixes only the timestamp overlap, retaining an unconsumed tail for the next encoder frame. */
    void mixInto(Frame frame) {
        if (frame == null) return;
        byte[] base = frame.getBuffer();
        int frameOffset = frame.getOffset();
        int frameSize = frame.getSize();
        if (base == null || frameOffset < 0 || frameSize <= 0 || frameOffset > base.length
                || frameSize > base.length - frameOffset) return;
        frameSize -= frameSize % BYTES_PER_FRAME;
        int frameSamples = frameSize / BYTES_PER_FRAME;
        if (frameSamples <= 0 || frame.getTimeStamp() < 0L) return;
        long frameStartUs = frame.getTimeStamp();
        long frameDurationUs = (long) frameSamples * 1_000_000L / SAMPLE_RATE;
        long frameEndUs = saturatingAdd(frameStartUs, frameDurationUs);
        synchronized (lock) {
            if (closed || chunks.isEmpty()) return;
            while (!chunks.isEmpty()) {
                Chunk chunk = chunks.peekFirst();
                long chunkStartUs = chunk.currentTimestampUs();
                long chunkEndUs = chunk.endTimeUs();
                if (chunkEndUs <= frameStartUs) {
                    chunks.removeFirst();
                    droppedChunks++;
                    continue;
                }
                if (chunkStartUs >= frameEndUs) break;

                int frameSampleOffset = chunkStartUs <= frameStartUs ? 0
                        : samplesForDelta(chunkStartUs - frameStartUs);
                int chunkSampleOffset = frameStartUs <= chunkStartUs ? 0
                        : samplesForDelta(frameStartUs - chunkStartUs);
                int availableFrameSamples = frameSamples - frameSampleOffset;
                int availableChunkSamples = chunk.size() / BYTES_PER_FRAME - chunkSampleOffset;
                int overlapSamples = Math.min(availableFrameSamples, availableChunkSamples);
                if (overlapSamples <= 0) {
                    if (chunkEndUs <= frameEndUs) chunks.removeFirst();
                    else break;
                    continue;
                }

                int mixBytes = overlapSamples * BYTES_PER_FRAME;
                int baseMixOffset = frameOffset + frameSampleOffset * BYTES_PER_FRAME;
                int overlayMixOffset = chunk.offset + chunkSampleOffset * BYTES_PER_FRAME;
                ModeBScreensaverPcmMixer.mixInto(base, baseMixOffset, chunk.data, overlayMixOffset,
                        base, baseMixOffset, mixBytes, 1f, 1f);

                int consumedSamples = chunkSampleOffset + overlapSamples;
                if (consumedSamples >= (chunk.size() / BYTES_PER_FRAME)) {
                    chunks.removeFirst();
                } else {
                    // Keep the immutable chunk timestamp; currentTimestampUs() derives the
                    // exact cumulative cursor from offset on the next encoder frame.
                    chunk.offset += consumedSamples * BYTES_PER_FRAME;
                    break;
                }
            }
        }
    }

    /** Blocks only the dedicated Screensaver-only source; stop/flush/close always wakes it. */
    Frame takeNextFrame(ContinueReading guard) throws InterruptedException {
        synchronized (lock) {
            while (chunks.isEmpty() && !closed && guard != null && guard.shouldContinue()) {
                lock.wait();
            }
            if (closed || guard == null || !guard.shouldContinue() || chunks.isEmpty()) return null;
            Chunk chunk = chunks.peekFirst();
            int frameBytes = Math.min(chunk.size(), MAX_ENCODER_FRAME_BYTES);
            frameBytes -= frameBytes % BYTES_PER_FRAME;
            if (frameBytes <= 0) {
                chunks.removeFirst();
                droppedChunks++;
                return null;
            }
            int frameOffset = chunk.offset;
            long frameTimestampUs = chunk.currentTimestampUs();
            chunk.offset += frameBytes;
            if (chunk.size() == 0) chunks.removeFirst();
            // Return bounded frames: AudioEncoder truncates input above KEY_MAX_INPUT_SIZE,
            // which would silently discard the tail and corrupt subsequent audio timestamps.
            return new Frame(chunk.data, frameOffset, frameBytes, frameTimestampUs);
        }
    }

    /**
     * Discards PCM buffered while no Screensaver-only encoder source was consuming the queue.
     * The decoder may still be playing during a projection re-share transition, so this must not
     * advance the decoder generation or reset its monotonic timestamp acceptance fence.
     */
    void discardPendingFramesPreservingEpoch() {
        synchronized (lock) {
            droppedChunks += chunks.size();
            chunks.clear();
            lock.notifyAll();
        }
    }

    /** Starts a fresh playback epoch and invalidates any late decoder callback from the old one. */
    long resetForPlayback() {
        synchronized (lock) {
            generation++;
            clearLocked();
            return generation;
        }
    }

    void flush() {
        synchronized (lock) {
            generation++;
            clearLocked();
        }
    }

    private void clearLocked() {
        droppedChunks += chunks.size();
        chunks.clear();
        lastAcceptedEndTimeUs = -1L;
        lock.notifyAll();
    }

    void wakeConsumers() {
        synchronized (lock) { lock.notifyAll(); }
    }

    void close() {
        synchronized (lock) {
            closed = true;
            generation++;
            clearLocked();
        }
    }

    boolean isClosed() {
        synchronized (lock) { return closed; }
    }

    int queuedChunksForTest() {
        synchronized (lock) { return chunks.size(); }
    }

    long queuedBytesForTest() {
        synchronized (lock) {
            long bytes = 0L;
            for (Chunk chunk : chunks) bytes += chunk.size();
            return bytes;
        }
    }

    long queuedDurationUsForTest() {
        synchronized (lock) {
            if (chunks.isEmpty()) return 0L;
            long startUs = chunks.peekFirst().currentTimestampUs();
            long endUs = chunks.peekLast().endTimeUs();
            return Math.max(0L, endUs - startUs);
        }
    }

    long droppedChunksForTest() {
        synchronized (lock) { return droppedChunks; }
    }

    private void trimLocked(long newestEndUs) {
        while (chunks.size() > MAX_CHUNKS) {
            chunks.removeFirst();
            droppedChunks++;
        }
        while (!chunks.isEmpty()) {
            Chunk oldest = chunks.peekFirst();
            // A chunk may already be partially consumed by the live AAC callback. Bound the
            // remaining backlog from its current sample cursor, not its immutable origin PTS;
            // otherwise a valid unconsumed tail can be evicted up to one whole chunk early.
            if (newestEndUs - oldest.currentTimestampUs() <= MAX_QUEUED_DURATION_US) break;
            chunks.removeFirst();
            droppedChunks++;
        }
    }

    private static int samplesForDelta(long deltaUs) {
        if (deltaUs <= 0L) return 0;
        long samples = Math.round(deltaUs * (double) SAMPLE_RATE / 1_000_000d);
        return samples > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) samples;
    }

    private static int samplesForDeltaCeil(long deltaUs) {
        if (deltaUs <= 0L) return 0;
        long wholeSeconds = deltaUs / 1_000_000L;
        long remainingMicros = deltaUs % 1_000_000L;
        if (wholeSeconds > Integer.MAX_VALUE / (long) SAMPLE_RATE) return Integer.MAX_VALUE;
        long samples = wholeSeconds * SAMPLE_RATE;
        long fractionalSamples = (remainingMicros * SAMPLE_RATE + 999_999L) / 1_000_000L;
        long total = samples + fractionalSamples;
        return total > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) total;
    }

    private static long saturatingAdd(long left, long right) {
        if (right > 0L && left > Long.MAX_VALUE - right) return Long.MAX_VALUE;
        if (right < 0L && left < Long.MIN_VALUE - right) return Long.MIN_VALUE;
        return left + right;
    }
}
