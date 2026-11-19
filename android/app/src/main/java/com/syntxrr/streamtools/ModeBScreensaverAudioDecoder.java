package com.syntxrr.streamtools;

import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.util.Log;

import java.io.File;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Decodes the first local MP4 audio track to timestamped 44.1 kHz stereo PCM.
 * Its own worker is intentionally separate from the visual frame worker: audio decoding must
 * never block frame extraction, the GL renderer, or RootEncoder's microphone callback.
 */
final class ModeBScreensaverAudioDecoder {
    private static final String TAG = "SYNTXRR-ScreensaverAudio";
    private static final long CODEC_TIMEOUT_US = 10_000L;
    private static final long MAX_DECODE_LEAD_US = 180_000L;
    private static final long LOOP_POLL_MS = 60L;

    private final File file;
    private final NativeVideoOverlayDecoder videoClock;
    private final ModeBScreensaverAudioPcmQueue outputQueue;
    private final boolean loop;
    private final HandlerThread workerThread;
    private final Handler worker;
    private volatile String failure = "";
    private final AtomicBoolean audioTrackFound = new AtomicBoolean(false);
    // Serializes decoder lifecycle generations with the corresponding PCM-queue epoch changes.
    private final ModeBScreensaverAudioPlaybackEpoch playbackEpoch;
    private final List<Runnable> releaseCallbacks = new ArrayList<>();
    private volatile Listener listener;
    private boolean retirementComplete;

    interface Listener {
        void onFailure(String message);
    }

    ModeBScreensaverAudioDecoder(File file, NativeVideoOverlayDecoder videoClock,
            ModeBScreensaverAudioPcmQueue outputQueue, boolean loop) {
        if (file == null || !file.isFile() || file.length() <= 0L
                || file.length() > 12L * 1024L * 1024L) {
            throw new IllegalArgumentException("File audio Screensaver tidak valid.");
        }
        if (videoClock == null || outputQueue == null) {
            throw new IllegalArgumentException("Clock video dan antrean PCM Screensaver wajib tersedia.");
        }
        this.file = file;
        this.videoClock = videoClock;
        this.outputQueue = outputQueue;
        this.playbackEpoch = new ModeBScreensaverAudioPlaybackEpoch(outputQueue);
        this.loop = loop;
        workerThread = new HandlerThread(TAG + "-Decoder");
        workerThread.start();
        worker = new Handler(workerThread.getLooper());
    }

    String getFailure() { return failure; }
    boolean hasAudioTrack() { return audioTrackFound.get(); }
    boolean isPlaying() { return playbackEpoch.isPlaying(); }

    void setListener(Listener nextListener) {
        listener = nextListener;
        String currentFailure = failure;
        if (nextListener != null && !currentFailure.isEmpty()) nextListener.onFailure(currentFailure);
    }

    void startPlayback() {
        ModeBScreensaverAudioPlaybackEpoch.Session session = playbackEpoch.start();
        if (session == null) return;
        synchronized (this) {
            // A pause/release may win immediately after start() returns. Do not clear a newer
            // terminal failure or enqueue work for a session that is already stale.
            if (!playbackEpoch.isCurrent(session.decoderGeneration)) return;
            failure = "";
        }
        // Keep task insertion atomic with pause/release. Otherwise release could enqueue its
        // retirement marker after the generation check but before this decode post, allowing a
        // stale file-reading task to sit behind the marker that acknowledges MP4 retirement.
        boolean posted = playbackEpoch.postIfCurrent(session.decoderGeneration, worker::post,
                () -> decodeSession(session.decoderGeneration, session.queueGeneration));
        if (!posted && playbackEpoch.isCurrent(session.decoderGeneration)) {
            failSession(session.decoderGeneration, "Worker decoder audio Screensaver tidak tersedia.");
        }
    }

    void pausePlayback() {
        // The playback-generation change and queue flush are one atomic lifecycle transition.
        // A resume cannot install a fresh queue epoch between these two operations.
        playbackEpoch.pause();
    }

    void release(Runnable onReleased) {
        boolean scheduleRetirement = false;
        boolean acknowledgeImmediately = false;
        synchronized (this) {
            if (onReleased != null) {
                if (retirementComplete) acknowledgeImmediately = true;
                else releaseCallbacks.add(onReleased);
            }
            if (playbackEpoch.release()) {
                listener = null;
                scheduleRetirement = true;
            }
        }
        if (acknowledgeImmediately) {
            onReleased.run();
            return;
        }
        if (!scheduleRetirement) return;

        Runnable retire = () -> {
            workerThread.quitSafely();
            completeRetirement();
        };
        if (!worker.post(retire)) {
            // A rejected post does not prove the decoder thread has stopped. It may still be
            // inside MediaExtractor/MediaCodec work, so keep the release acknowledgement (and
            // the source MP4 namespace) pending until the actual worker thread has terminated.
            workerThread.quitSafely();
            ModeBWorkerQuiescenceBarrier.awaitThreadTermination(workerThread, this::completeRetirement);
        }
    }

    /** Release acknowledgements are delayed until the decoder worker has exited its active decode. */
    private void completeRetirement() {
        final List<Runnable> callbacks;
        synchronized (this) {
            if (retirementComplete) return;
            retirementComplete = true;
            callbacks = new ArrayList<>(releaseCallbacks);
            releaseCallbacks.clear();
        }
        for (Runnable callback : callbacks) {
            try { callback.run(); } catch (RuntimeException ignored) { }
        }
    }

    private boolean isCurrent(long expectedGeneration) {
        return playbackEpoch.isCurrent(expectedGeneration);
    }

    private void decodeSession(long expectedGeneration, long queueGeneration) {
        MediaExtractor extractor = null;
        MediaCodec codec = null;
        boolean reachedEndOfTrack = false;
        long nextVideoLoopBoundaryElapsedMs = -1L;
        try {
            // The video decoder initializes asynchronously on its own shared visual worker.
            // Capture the media seek position and its absolute next loop boundary together only
            // after that clock is ready and playing. Separate reads could straddle a loop edge.
            NativeVideoOverlayDecoder.PlaybackSnapshot playbackSnapshot =
                    awaitVideoPlaybackSnapshot(expectedGeneration);
            if (playbackSnapshot == null) return;
            nextVideoLoopBoundaryElapsedMs = playbackSnapshot.nextLoopBoundaryElapsedMs;
            extractor = new MediaExtractor();
            extractor.setDataSource(file.getAbsolutePath());
            int audioTrack = findAudioTrack(extractor);
            if (audioTrack < 0) {
                failSession(expectedGeneration, "MP4 Screensaver tidak memiliki track audio.");
                return;
            }
            audioTrackFound.set(true);
            MediaFormat inputFormat = extractor.getTrackFormat(audioTrack);
            String mime = inputFormat.getString(MediaFormat.KEY_MIME);
            if (mime == null || !mime.startsWith("audio/")) {
                throw new IllegalArgumentException("Track audio MP4 tidak valid.");
            }
            extractor.selectTrack(audioTrack);
            long seekPositionUs = playbackSnapshot.mediaPositionUs;
            if (seekPositionUs > 0L) {
                extractor.seekTo(seekPositionUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            }
            codec = MediaCodec.createDecoderByType(mime);
            codec.configure(inputFormat, null, null, 0);
            codec.start();

            int outputSampleRate = readPositive(inputFormat, MediaFormat.KEY_SAMPLE_RATE, 44_100);
            int outputChannels = readPositive(inputFormat, MediaFormat.KEY_CHANNEL_COUNT, 2);
            int outputPcmEncoding = AudioFormat.ENCODING_PCM_16BIT;
            ModeBScreensaverPcmConverter.ResampleState resampleState =
                    new ModeBScreensaverPcmConverter.ResampleState();
            boolean inputEnded = false;
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();

            while (isCurrent(expectedGeneration)) {
                if (!inputEnded) {
                    int inputIndex = codec.dequeueInputBuffer(CODEC_TIMEOUT_US);
                    if (inputIndex >= 0) {
                        ByteBuffer inputBuffer = codec.getInputBuffer(inputIndex);
                        if (inputBuffer == null) {
                            codec.queueInputBuffer(inputIndex, 0, 0, 0L,
                                    MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inputEnded = true;
                        } else {
                            inputBuffer.clear();
                            int sampleSize = extractor.readSampleData(inputBuffer, 0);
                            if (sampleSize < 0) {
                                codec.queueInputBuffer(inputIndex, 0, 0, 0L,
                                        MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                                inputEnded = true;
                            } else {
                                long sampleTimeUs = Math.max(0L, extractor.getSampleTime());
                                codec.queueInputBuffer(inputIndex, 0, sampleSize, sampleTimeUs, 0);
                                extractor.advance();
                            }
                        }
                    }
                }

                int outputIndex = codec.dequeueOutputBuffer(info, CODEC_TIMEOUT_US);
                if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat outputFormat = codec.getOutputFormat();
                    outputSampleRate = readPositive(outputFormat, MediaFormat.KEY_SAMPLE_RATE, outputSampleRate);
                    outputChannels = readPositive(outputFormat, MediaFormat.KEY_CHANNEL_COUNT, outputChannels);
                    if (outputFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
                        outputPcmEncoding = outputFormat.getInteger(MediaFormat.KEY_PCM_ENCODING);
                    }
                } else if (outputIndex >= 0) {
                    try {
                        if (info.size > 0 && (info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
                            ByteBuffer outputBuffer = codec.getOutputBuffer(outputIndex);
                            if (outputBuffer != null) {
                                long mappedTimestampUs = awaitMappedTimestamp(info.presentationTimeUs,
                                        expectedGeneration);
                                if (mappedTimestampUs != ModeBScreensaverAudioTimeline.DROP_TIMESTAMP) {
                                    byte[] pcm = ModeBScreensaverPcmConverter.toOutputFormat(
                                            outputBuffer, info.offset, info.size,
                                            outputSampleRate, outputChannels, outputPcmEncoding, resampleState);
                                    if (pcm.length > 0 && isCurrent(expectedGeneration)) {
                                        outputQueue.offer(pcm, 0, pcm.length, mappedTimestampUs, queueGeneration);
                                    }
                                }
                            }
                        }
                        if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                            reachedEndOfTrack = true;
                        }
                    } finally {
                        codec.releaseOutputBuffer(outputIndex, false);
                    }
                    if (reachedEndOfTrack) break;
                }
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (Exception decodeFailure) {
            if (isCurrent(expectedGeneration)) {
                String detail = decodeFailure.getMessage() == null
                        ? "Track audio MP4 tidak dapat didekode." : decodeFailure.getMessage();
                Log.w(TAG, detail, decodeFailure);
                failSession(expectedGeneration, detail);
            }
        } catch (OutOfMemoryError memoryError) {
            if (isCurrent(expectedGeneration)) {
                failSession(expectedGeneration, "Memori tidak cukup untuk mendekode audio Screensaver.");
            }
        } finally {
            if (codec != null) {
                try { codec.stop(); } catch (RuntimeException ignored) { }
                try { codec.release(); } catch (RuntimeException ignored) { }
            }
            if (extractor != null) {
                try { extractor.release(); } catch (RuntimeException ignored) { }
            }
        }

        if (reachedEndOfTrack && loop && isCurrent(expectedGeneration)) {
            waitForVideoLoop(expectedGeneration, queueGeneration, nextVideoLoopBoundaryElapsedMs);
        }
    }

    private void failSession(long expectedGeneration, String message) {
        final Listener currentListener;
        final String safeMessage = message == null || message.trim().isEmpty()
                ? "Track audio MP4 tidak dapat didekode." : message.trim();
        synchronized (this) {
            if (!playbackEpoch.fail(expectedGeneration)) return;
            failure = safeMessage;
            currentListener = listener;
        }
        if (currentListener != null) {
            try { currentListener.onFailure(safeMessage); } catch (RuntimeException ignored) { }
        }
    }

    private NativeVideoOverlayDecoder.PlaybackSnapshot awaitVideoPlaybackSnapshot(
            long expectedGeneration) throws InterruptedException {
        while (isCurrent(expectedGeneration)) {
            NativeVideoOverlayDecoder.PlaybackSnapshot snapshot = videoClock.playbackSnapshot();
            if (snapshot != null) return snapshot;
            Thread.sleep(10L);
        }
        return null;
    }

    private int findAudioTrack(MediaExtractor extractor) {
        for (int index = 0; index < extractor.getTrackCount(); index++) {
            MediaFormat format = extractor.getTrackFormat(index);
            String mime = format.getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith("audio/")) return index;
        }
        return -1;
    }

    private long awaitMappedTimestamp(long mediaPtsUs, long expectedGeneration)
            throws InterruptedException {
        while (isCurrent(expectedGeneration)) {
            long mapped = videoClock.mapAudioPresentationTimeUs(mediaPtsUs);
            if (mapped == ModeBScreensaverAudioTimeline.DROP_TIMESTAMP) return mapped;
            long nowUs = SystemClock.elapsedRealtimeNanos() / 1000L;
            if (mapped - nowUs <= MAX_DECODE_LEAD_US) return mapped;
            Thread.sleep(5L);
        }
        return ModeBScreensaverAudioTimeline.DROP_TIMESTAMP;
    }

    private void waitForVideoLoop(long expectedGeneration, long queueGeneration,
            long nextLoopBoundaryElapsedMs) {
        if (!isCurrent(expectedGeneration)) return;
        if (nextLoopBoundaryElapsedMs < 0L) {
            failSession(expectedGeneration, "Clock loop Screensaver tidak valid.");
            return;
        }
        worker.postDelayed(() -> {
            if (!isCurrent(expectedGeneration)) return;
            long elapsedPlaybackMs = videoClock.elapsedPlaybackMs();
            if (ModeBScreensaverLoopBoundary.hasReachedBoundary(
                    elapsedPlaybackMs, nextLoopBoundaryElapsedMs)) {
                decodeSession(expectedGeneration, queueGeneration);
            } else {
                waitForVideoLoop(expectedGeneration, queueGeneration, nextLoopBoundaryElapsedMs);
            }
        }, LOOP_POLL_MS);
    }

    private static int readPositive(MediaFormat format, String key, int fallback) {
        if (format != null && format.containsKey(key)) {
            int value = format.getInteger(key);
            if (value > 0) return value;
        }
        return fallback;
    }
}
