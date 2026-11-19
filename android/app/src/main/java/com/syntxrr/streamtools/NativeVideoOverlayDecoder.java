package com.syntxrr.streamtools;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.media.MediaMetadataRetriever;
import android.os.Build;
import android.os.SystemClock;

import java.io.File;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Bounded local MP4 video-frame source for the Mode B Studio and Screensaver compositor.
 * Video frames are decoded off the render thread on the compositor's shared worker at a modest
 * cadence and capped at 1280x720. Screensaver audio, when enabled, uses a separate timestamped
 * MediaCodec decoder and is synchronized to this playback clock.
 */
final class NativeVideoOverlayDecoder {
    interface Listener {
        void onFrameAvailable();
        void onFailure(String message);
    }

    static final int MAX_WIDTH = ModeBBitmapBudget.VIDEO_MAX_FRAME_WIDTH;
    static final int MAX_HEIGHT = ModeBBitmapBudget.VIDEO_MAX_FRAME_HEIGHT;
    static final long FRAME_INTERVAL_MS = 125L; // up to 8 video frames per second per scheduled source

    private final Object frameLock = new Object();
    private final File file;
    private final boolean loop;
    private final ModeBVideoPlaybackIntent playbackIntent = new ModeBVideoPlaybackIntent();
    private final ModeBVideoFrameSchedule frameSchedule = new ModeBVideoFrameSchedule();
    private final ModeBVisualWorker worker;
    private final ModeBBitmapBudget.Reservation memoryReservation;
    private final String frameSourceId;
    private MediaMetadataRetriever retriever;
    private Bitmap latestFrame;
    private volatile ModeBVideoPlaybackClock playbackClock;
    private volatile boolean released;
    private final AtomicBoolean retrieverResourcesReleased = new AtomicBoolean(false);
    private volatile boolean ready;
    private volatile long durationUs;
    private volatile String failure = "";
    private volatile Listener listener;
    private final java.util.concurrent.atomic.AtomicBoolean failureNotificationDelivered =
            new java.util.concurrent.atomic.AtomicBoolean(false);
    private boolean finished;

    static final class PlaybackSnapshot {
        final long mediaPositionUs;
        final long nextLoopBoundaryElapsedMs;

        PlaybackSnapshot(long mediaPositionUs, long nextLoopBoundaryElapsedMs) {
            this.mediaPositionUs = mediaPositionUs;
            this.nextLoopBoundaryElapsedMs = nextLoopBoundaryElapsedMs;
        }
    }

    private final Runnable initializeDecoder = new Runnable() {
        @Override public void run() {
            if (released) return;
            try {
                retriever = new MediaMetadataRetriever();
                retriever.setDataSource(file.getAbsolutePath());
                String duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                long durationMs = duration == null ? 0L : Long.parseLong(duration);
                if (!ModeBStreamPolicy.isValidOverlayVideoDuration(durationMs)) {
                    throw new IllegalArgumentException("Durasi MP4 overlay harus antara 0,5 dan 30 detik.");
                }
                durationUs = durationMs * 1000L;
                playbackClock = new ModeBVideoPlaybackClock(durationMs, loop);
                ready = true;
                // RTMP may publish before this worker finishes reading MP4 metadata.
                // Preserve the requested state so an early startPlayback() is not lost.
                if (playbackIntent.startIfRequested(playbackClock, SystemClock.elapsedRealtime())) {
                    frameSchedule.reset(SystemClock.elapsedRealtime());
                    requestNextFrame();
                }
            } catch (Exception exception) {
                failDecoder(exception);
            } catch (OutOfMemoryError memoryError) {
                failDecoder(memoryError);
            }
        }
    };

    private final Runnable decodeNextFrame = new Runnable() {
        @Override public void run() {
            if (released || !ready || !playbackIntent.isPlaybackRequested() || retriever == null
                    || playbackClock == null
                    || (!playbackClock.isPlaying() && !playbackClock.isFinished())) return;
            long position = playbackClock.positionMs(SystemClock.elapsedRealtime());
            finished = playbackClock.isFinished();
            try {
                Bitmap frame = ModeBVideoFrameRequest.decode(
                        retriever::getScaledFrameAtTime,
                        position * 1000L,
                        MediaMetadataRetriever.OPTION_CLOSEST,
                        MAX_WIDTH,
                        MAX_HEIGHT
                );
                if (frame == null) {
                    throw new IllegalStateException("Android tidak dapat mendekode frame MP4.");
                }
                if (frame.getWidth() > MAX_WIDTH || frame.getHeight() > MAX_HEIGHT
                        || frame.getAllocationByteCount() > ModeBBitmapBudget.VIDEO_MAX_FRAME_BYTES) {
                    if (!frame.isRecycled()) frame.recycle();
                    throw new IllegalStateException("Ukuran frame MP4 melampaui anggaran memori compositor.");
                }
                replaceFrame(frame);
            } catch (Exception exception) {
                failDecoder(exception);
            } catch (OutOfMemoryError memoryError) {
                failDecoder(memoryError);
            }
            if (!released && !finished && playbackIntent.isPlaybackRequested()
                    && playbackClock != null && playbackClock.isPlaying()) {
                long now = SystemClock.elapsedRealtime();
                long delay = frameSchedule.delayUntilNextFrame(now, FRAME_INTERVAL_MS);
                worker.postDelayed(requestScheduledFrame, delay);
            }
        }
    };

    private final Runnable requestScheduledFrame = this::requestNextFrame;

    private void requestNextFrame() {
        if (released || !ready || !playbackIntent.isPlaybackRequested()) return;
        // The worker rejects a duplicate waiting frame for this asset. The decoder
        // schedules again only after its current extraction finishes.
        worker.postFrame(frameSourceId, decodeNextFrame);
    }

    NativeVideoOverlayDecoder(File file, boolean loop, ModeBVisualWorker worker,
            ModeBBitmapBudget.Reservation memoryReservation) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
            throw new IllegalArgumentException("Overlay video memerlukan Android 8.1 atau lebih baru.");
        }
        if (file == null || !file.isFile() || file.length() <= 0L || file.length() > 12L * 1024L * 1024L) {
            throw new IllegalArgumentException("File MP4 overlay kosong atau melebihi batas 12 MB.");
        }
        if (worker == null) throw new IllegalArgumentException("Worker decoder video tidak tersedia.");
        if (memoryReservation == null) throw new IllegalArgumentException("Anggaran memori video tidak tersedia.");
        this.file = file;
        this.loop = loop;
        this.worker = worker;
        this.memoryReservation = memoryReservation;
        this.frameSourceId = "video:" + file.getAbsolutePath();
        // All local MP4 overlays share one session worker. Initialization and frame reads
        // stay off the GL/View render thread and are serialized across distinct assets.
        if (!worker.post(initializeDecoder)) {
            failure = "Worker decoder video tidak dapat dimulai.";
            memoryReservation.close();
        }
    }

    String getFailure() { return failure; }
    void setListener(Listener nextListener) {
        if (released) {
            listener = null;
            return;
        }
        listener = nextListener;
        if (nextListener == null) return;
        // Initialization runs asynchronously and may fail before the owner attaches its listener.
        // Replay terminal state so a fast decoder failure cannot leave the Screensaver stuck loading.
        if (!failure.isEmpty()) {
            Runnable notify = () -> notifyFailure(nextListener);
            if (!worker.post(notify)) notify.run();
        } else if (hasFrame()) {
            Runnable notify = () -> {
                if (!released && listener == nextListener && hasFrame()) nextListener.onFrameAvailable();
            };
            if (!worker.post(notify)) notify.run();
        }
    }

    private void notifyFailure(Listener expectedListener) {
        if (released || expectedListener == null || listener != expectedListener || failure.isEmpty()
                || !failureNotificationDelivered.compareAndSet(false, true)) return;
        expectedListener.onFailure(failure);
    }
    boolean isReady() { return ready && !released; }
    boolean hasFrame() { synchronized (frameLock) { return latestFrame != null && !latestFrame.isRecycled(); } }
    boolean isPlaybackRunning() {
        ModeBVideoPlaybackClock clock = playbackClock;
        return clock != null && clock.isPlaying();
    }
    boolean isPlaybackFinished() {
        ModeBVideoPlaybackClock clock = playbackClock;
        return clock != null && clock.isFinished();
    }

    /** Current media-relative position shared by the frame and audio decoders. */
    long currentMediaPositionUs() {
        ModeBVideoPlaybackClock clock = playbackClock;
        if (released || clock == null) return -1L;
        return clock.positionMs(SystemClock.elapsedRealtime()) * 1000L;
    }

    /**
     * Captures media position and its absolute next loop boundary from one monotonic-time
     * snapshot. Audio seek and loop scheduling must share this exact epoch; reading them
     * separately could straddle a wrap and associate a new-loop position with the old deadline.
     */
    PlaybackSnapshot playbackSnapshot() {
        ModeBVideoPlaybackClock clock = playbackClock;
        long duration = durationUs;
        if (released || !ready || clock == null || duration <= 0L) return null;
        long nowMs = SystemClock.elapsedRealtime();
        long elapsedMs = clock.elapsedPlaybackMs(nowMs);
        long mediaPositionMs = clock.positionMs(nowMs);
        if (!clock.isPlaying()) return null;
        long boundary = ModeBScreensaverLoopBoundary.nextBoundaryElapsedMs(
                elapsedMs, mediaPositionMs, duration / 1000L);
        if (boundary < 0L) return null;
        return new PlaybackSnapshot(mediaPositionMs * 1000L, boundary);
    }

    long elapsedPlaybackMs() {
        ModeBVideoPlaybackClock clock = playbackClock;
        if (released || clock == null) return -1L;
        return clock.elapsedPlaybackMs(SystemClock.elapsedRealtime());
    }

    /** Maps a decoded MP4 audio PTS to the same monotonic clock used by this video's frame timeline. */
    long mapAudioPresentationTimeUs(long mediaPresentationTimeUs) {
        ModeBVideoPlaybackClock clock = playbackClock;
        long duration = durationUs;
        if (released || !ready || clock == null || duration <= 0L || !clock.isPlaying()) {
            return ModeBScreensaverAudioTimeline.DROP_TIMESTAMP;
        }
        long nowMs = SystemClock.elapsedRealtime();
        long videoPositionUs = clock.positionMs(nowMs) * 1000L;
        long streamNowUs = SystemClock.elapsedRealtimeNanos() / 1000L;
        return ModeBScreensaverAudioTimeline.toStreamTimestampUs(
                mediaPresentationTimeUs, videoPositionUs, duration, streamNowUs, loop, clock.isPlaying());
    }

    void startPlayback() {
        if (released) return;
        // Set intent synchronously, not only inside the worker callback. If RTMP
        // becomes live before MP4 metadata is ready, initializeDecoder will honor it.
        playbackIntent.requestPlayback();
        worker.post(() -> {
            if (released || playbackClock == null || !playbackIntent.isPlaybackRequested()) return;
            if (playbackClock.start(SystemClock.elapsedRealtime()) && ready) {
                frameSchedule.reset(SystemClock.elapsedRealtime());
                worker.removeCallbacks(requestScheduledFrame);
                requestNextFrame();
            }
        });
    }

    void pausePlayback() {
        if (released) return;
        // Pause wins over any queued start request, including one posted before
        // the decoder worker has finished initializing.
        playbackIntent.requestPause();
        worker.post(() -> {
            worker.removeCallbacks(requestScheduledFrame);
            worker.removeFrameSource(frameSourceId);
            if (playbackClock != null) playbackClock.pause(SystemClock.elapsedRealtime());
        });
    }

    void draw(Canvas canvas, RectF bounds, Paint paint, int alpha, boolean cover, float cornerRadius) {
        synchronized (frameLock) {
            Bitmap bitmap = latestFrame;
            if (bitmap == null || bitmap.isRecycled()) return;
            int save = canvas.save();
            if (cornerRadius > 0f) {
                android.graphics.Path clip = new android.graphics.Path();
                clip.addRoundRect(bounds, cornerRadius, cornerRadius, android.graphics.Path.Direction.CW);
                canvas.clipPath(clip);
            }
            paint.setColor(android.graphics.Color.WHITE);
            paint.setAlpha(alpha);
            paint.setFilterBitmap(true);
            float sourceWidth = bitmap.getWidth();
            float sourceHeight = bitmap.getHeight();
            float targetWidth = bounds.width();
            float targetHeight = bounds.height();
            Rect source = new Rect(0, 0, bitmap.getWidth(), bitmap.getHeight());
            RectF destination;
            if (cover) {
                float sourceRatio = sourceWidth / sourceHeight;
                float targetRatio = targetWidth / targetHeight;
                if (sourceRatio > targetRatio) {
                    int cropWidth = Math.max(1, Math.min(bitmap.getWidth(), Math.round(sourceHeight * targetRatio)));
                    int left = (bitmap.getWidth() - cropWidth) / 2;
                    source = new Rect(left, 0, left + cropWidth, bitmap.getHeight());
                } else if (sourceRatio < targetRatio) {
                    int cropHeight = Math.max(1, Math.min(bitmap.getHeight(), Math.round(sourceWidth / targetRatio)));
                    int top = (bitmap.getHeight() - cropHeight) / 2;
                    source = new Rect(0, top, bitmap.getWidth(), top + cropHeight);
                }
                destination = new RectF(bounds);
            } else {
                float scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
                float drawWidth = sourceWidth * scale;
                float drawHeight = sourceHeight * scale;
                float left = bounds.centerX() - drawWidth / 2f;
                float top = bounds.centerY() - drawHeight / 2f;
                destination = new RectF(left, top, left + drawWidth, top + drawHeight);
            }
            canvas.drawBitmap(bitmap, source, destination, paint);
            paint.setAlpha(255);
            canvas.restoreToCount(save);
        }
    }

    void release() {
        release(null);
    }

    void release(Runnable onReleased) {
        if (released) {
            Runnable acknowledge = () -> {
                releaseRetrieverOnWorker();
                if (onReleased != null) onReleased.run();
            };
            // Even after shutdown starts, never release MediaMetadataRetriever concurrently
            // with an in-flight frame extraction. The fallback waits for worker termination.
            worker.postAfterQuiescence(acknowledge);
            return;
        }
        released = true;
        listener = null;
        worker.removeCallbacks(initializeDecoder);
        worker.removeCallbacks(requestScheduledFrame);
        worker.removeFrameSource(frameSourceId);
        Runnable cleanup = () -> {
            releaseRetrieverOnWorker();
            if (onReleased != null) onReleased.run();
        };
        // If the Handler has begun quitting, postAfterQuiescence waits for the thread to die
        // before releasing the retriever and acknowledging that its MP4 namespace is safe to delete.
        worker.postAfterQuiescence(cleanup);
    }

    private void failDecoder(Throwable error) {
        failure = safeMessage(error);
        finished = true;
        worker.removeCallbacks(requestScheduledFrame);
        worker.removeFrameSource(frameSourceId);
        // Keep the listener until the terminal error is delivered. Resource release must not
        // clear it first, otherwise the waiting card never receives its text-fallback callback.
        Listener currentListener = listener;
        releaseRetrieverOnWorker();
        notifyFailure(currentListener);
        // Keep the shared session worker alive for other valid video layers.
    }

    private void releaseRetrieverOnWorker() {
        if (!retrieverResourcesReleased.compareAndSet(false, true)) return;
        if (retriever != null) {
            try { retriever.release(); } catch (Exception ignored) { }
            retriever = null;
        }
        ready = false;
        synchronized (frameLock) {
            if (latestFrame != null && !latestFrame.isRecycled()) latestFrame.recycle();
            latestFrame = null;
        }
        memoryReservation.close();
    }

    private void replaceFrame(Bitmap frame) {
        synchronized (frameLock) {
            if (released) {
                if (frame != null && !frame.isRecycled()) frame.recycle();
                return;
            }
            Bitmap previous = latestFrame;
            latestFrame = frame;
            if (previous != null && previous != frame && !previous.isRecycled()) previous.recycle();
        }
        Listener currentListener = listener;
        if (currentListener != null) currentListener.onFrameAvailable();
    }

    private static String safeMessage(Throwable exception) {
        String message = exception == null ? null : exception.getMessage();
        if (exception instanceof OutOfMemoryError) {
            return "Memori perangkat tidak cukup untuk mendekode video overlay.";
        }
        return message == null || message.trim().isEmpty()
                ? "Video MP4 tidak dapat didekode pada perangkat ini." : message;
    }
}
