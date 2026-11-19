package com.syntxrr.streamtools;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Color;
import android.graphics.ImageDecoder;
import android.graphics.drawable.Animatable;
import android.graphics.drawable.AnimatedImageDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

/** Full-canvas host-wait card with bounded PNG/JPEG/GIF/MP4 media and text fallback. */
final class ModeBReshareWaitingView extends FrameLayout {
    private static final long MAX_DECODE_PIXELS = 2_000_000L;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private final ImageView mediaImage;
    private final View videoFrameView;
    private final Paint videoPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final TextView title;
    private final TextView detail;
    private final View imageScrim;
    private final AtomicBoolean released = new AtomicBoolean(false);
    // Every caller joins one shared retirement; no duplicate release may acknowledge early.
    private final ModeBMediaReleaseCoordinator mediaReleaseCoordinator = new ModeBMediaReleaseCoordinator();
    private int mediaGeneration;
    private String baseDetail = "";
    private String mediaNotice = "";
    private Bitmap mediaBitmap;
    private Drawable mediaDrawable;
    private Animatable mediaAnimation;
    private boolean mediaAnimationRunning;
    private ModeBBitmapBudget.Reservation mediaReservation;
    private NativeVideoOverlayDecoder mediaVideoDecoder;
    private ModeBScreensaverAudioDecoder mediaAudioDecoder;
    private final ModeBScreensaverAudioPcmQueue screensaverAudioQueue;
    private boolean videoPlaybackRequested;
    private boolean audioPlaybackRequested;
    private volatile boolean audioPlaybackFailed;
    private ModeBVisualWorker ownerWorker;
    private Runnable pendingMediaDecode;

    ModeBReshareWaitingView(Context context) {
        this(context, "LIVE tetap berjalan", "Bagikan layar lagi untuk melanjutkan tampilan.",
                "", "image", "", null, null, null);
    }

    ModeBReshareWaitingView(Context context, String titleText, String detailText,
            String mediaAssetId, String mediaType, String assetNamespace, ModeBVisualWorker visualWorker,
            ModeBBitmapBudget bitmapBudget) {
        this(context, titleText, detailText, mediaAssetId, mediaType, assetNamespace,
                visualWorker, bitmapBudget, null);
    }

    ModeBReshareWaitingView(Context context, String titleText, String detailText,
            String mediaAssetId, String mediaType, String assetNamespace, ModeBVisualWorker visualWorker,
            ModeBBitmapBudget bitmapBudget, ModeBScreensaverAudioPcmQueue screensaverAudioQueue) {
        super(context);
        this.screensaverAudioQueue = screensaverAudioQueue;
        setBackgroundColor(0xFF08111F);
        setClickable(false);
        setFocusable(false);
        // Start hidden; the service explicitly reveals the card after its GL filter is attached.
        // This prevents a Screensaver video decoder from consuming frames before the host-wait card is visible.
        setAlpha(0f);
        setWillNotDraw(false);

        mediaImage = new ImageView(context);
        mediaImage.setScaleType(ImageView.ScaleType.CENTER_CROP);
        mediaImage.setVisibility(GONE);
        addView(mediaImage, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

        videoFrameView = new View(context) {
            @Override protected void onDraw(Canvas canvas) {
                super.onDraw(canvas);
                NativeVideoOverlayDecoder decoder = mediaVideoDecoder;
                if (decoder != null) {
                    decoder.draw(canvas, new RectF(0f, 0f, getWidth(), getHeight()), videoPaint,
                            255, true, 0f);
                }
            }
        };
        videoFrameView.setWillNotDraw(false);
        videoFrameView.setVisibility(GONE);
        addView(videoFrameView, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));

        View imageScrimOverlay = new View(context);
        imageScrimOverlay.setBackgroundColor(0x9908111F);
        imageScrimOverlay.setVisibility(GONE);
        addView(imageScrimOverlay, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
        this.imageScrim = imageScrimOverlay;

        title = new TextView(context);
        title.setText(titleText == null || titleText.trim().isEmpty()
                ? ModeBScreensaverPolicy.DEFAULT_TEXT : titleText.trim());
        title.setTextColor(Color.WHITE);
        title.setTextSize(24f);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(36, 24, 36, 24);
        LayoutParams titleParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        if (detailText != null && !detailText.trim().isEmpty()) titleParams.bottomMargin = dp(28);
        addView(title, titleParams);

        detail = new TextView(context);
        detail.setTextColor(0xFFCBD5E1);
        detail.setTextSize(13f);
        detail.setGravity(Gravity.CENTER);
        detail.setPadding(32, 8, 32, 8);
        LayoutParams detailParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        detailParams.topMargin = dp(58);
        addView(detail, detailParams);
        setCardMessage(titleText, detailText);
        setMediaAsset(mediaAssetId, mediaType, assetNamespace, visualWorker, bitmapBudget);
    }

    void setCardMessage(String titleText, String detailText) {
        title.setText(titleText == null || titleText.trim().isEmpty()
                ? ModeBScreensaverPolicy.DEFAULT_TEXT : titleText.trim());
        baseDetail = detailText == null ? "" : detailText.trim();
        updateDetailText();
    }

    void setMediaAsset(String assetId, String mediaType, String assetNamespace,
            ModeBVisualWorker visualWorker, ModeBBitmapBudget bitmapBudget) {
        setMediaAsset(assetId, mediaType, assetNamespace, visualWorker, bitmapBudget, null);
    }

    /** Replaces Screensaver media and acknowledges when the previous worker no longer reads its namespace. */
    void setMediaAsset(String assetId, String mediaType, String assetNamespace,
            ModeBVisualWorker visualWorker, ModeBBitmapBudget bitmapBudget, Runnable onPreviousMediaReleased) {
        if (released.get()) {
            // releaseMedia() may still have a decoder-release task or an in-flight image/GIF
            // read on the session worker. Do not acknowledge the old namespace before a
            // worker-queue barrier confirms those reads are behind us.
            acknowledgeAfterPreviousMediaReads(ownerWorker, onPreviousMediaReleased);
            return;
        }
        final int generation = ++mediaGeneration;
        audioPlaybackFailed = false;
        ModeBVisualWorker previousWorker = ownerWorker;
        if (previousWorker != null && pendingMediaDecode != null) {
            // This cancels a decode only when it has not started. If already running, the
            // barrier below remains ordered after that read on the same Handler queue.
            previousWorker.removeCallbacks(pendingMediaDecode);
        }
        pendingMediaDecode = null;
        ownerWorker = visualWorker;
        final String safeId = assetId == null ? "" : assetId.trim();
        final String safeType = "video".equals(mediaType) ? "video" : "image";
        final String safeNamespace = assetNamespace == null ? "" : assetNamespace.trim();
        if (safeId.isEmpty()) {
            releaseVideoDecoder(() -> {
                if (generation == mediaGeneration && !released.get()) clearMediaOnMain();
                acknowledgeAfterPreviousMediaReads(previousWorker, onPreviousMediaReleased);
            });
            return;
        }
        if (!ModeBStreamPolicy.isValidOverlayAssetId(safeId)
                || !ModeBAssetNamespace.isValid(safeNamespace)
                || visualWorker == null || bitmapBudget == null) {
            mediaNotice = "Media layar tunggu tidak tersedia; kartu teks digunakan.";
            updateDetailText();
            releaseVideoDecoder(() -> {
                if (generation == mediaGeneration && !released.get()) clearBitmapOnMain();
                acknowledgeAfterPreviousMediaReads(previousWorker, onPreviousMediaReleased);
            });
            return;
        }

        mediaNotice = "Memuat media layar tunggu…";
        updateDetailText();
        releaseVideoDecoder(() -> {
            if (released.get() || generation != mediaGeneration) {
                acknowledgeAfterPreviousMediaReads(previousWorker, onPreviousMediaReleased);
                return;
            }
            if ("video".equals(safeType)) {
                clearBitmapOnMain();
                prepareVideoMedia(safeId, safeNamespace, generation, visualWorker, bitmapBudget);
                acknowledgeAfterPreviousMediaReads(previousWorker, onPreviousMediaReleased);
                return;
            }
            Runnable decodeTask = () -> decodeMediaAsset(safeId, safeNamespace, generation, bitmapBudget);
            pendingMediaDecode = decodeTask;
            boolean queued = visualWorker.post(decodeTask);
            if (!queued && generation == mediaGeneration) {
                pendingMediaDecode = null;
                mediaNotice = "Worker media tidak tersedia; kartu teks digunakan.";
                updateDetailText();
                clearBitmapOnMain();
            }
            acknowledgeAfterPreviousMediaReads(previousWorker, onPreviousMediaReleased);
        });
    }


    /**
     * Acknowledges a Screensaver namespace only after all work already queued on its previous
     * session worker has drained. If the worker is already shutting down, deliberately withhold
     * the acknowledgement: the service-wide cache cleanup will remove the namespace after
     * session teardown. Deleting it early could race an ImageDecoder/BitmapFactory file read.
     */
    private static void acknowledgeAfterPreviousMediaReads(ModeBVisualWorker worker, Runnable callback) {
        if (callback == null) return;
        if (worker == null) {
            MAIN.post(callback);
            return;
        }
        boolean queued = ModeBWorkerReleaseBarrier.enqueue(worker::postAfterQuiescence,
                () -> MAIN.post(callback));
        // If neither a FIFO marker nor a worker-termination wait can be scheduled, deliberately
        // withhold acknowledgement. Deleting the namespace while an old decode may still read it
        // is less safe than retaining it for a later service-wide cleanup.
    }

    private void releaseVideoDecoder(Runnable onReleased) {
        NativeVideoOverlayDecoder previousVideo = mediaVideoDecoder;
        ModeBScreensaverAudioDecoder previousAudio = mediaAudioDecoder;
        // Keep both references discoverable until their workers acknowledge retirement. A
        // concurrent releaseMedia() must be able to snapshot and await these exact decoders
        // instead of assuming the file is no longer being read just because the fields were
        // cleared during a media replacement.
        videoPlaybackRequested = false;
        audioPlaybackRequested = false;
        if (screensaverAudioQueue != null) screensaverAudioQueue.flush();
        videoFrameView.setVisibility(GONE);
        int pending = (previousVideo == null ? 0 : 1) + (previousAudio == null ? 0 : 1);
        if (pending == 0) {
            if (onReleased != null) onReleased.run();
            return;
        }
        final java.util.concurrent.atomic.AtomicInteger remaining =
                new java.util.concurrent.atomic.AtomicInteger(pending);
        final Runnable completed = () -> {
            if (remaining.decrementAndGet() == 0) MAIN.post(() -> {
                if (mediaVideoDecoder == previousVideo) mediaVideoDecoder = null;
                if (mediaAudioDecoder == previousAudio) mediaAudioDecoder = null;
                if (onReleased != null) onReleased.run();
            });
        };
        if (previousVideo != null) {
            previousVideo.setListener(null);
            previousVideo.release(completed);
        }
        if (previousAudio != null) previousAudio.release(completed);
    }

    private void prepareVideoMedia(String assetId, String namespace, int generation,
            ModeBVisualWorker worker, ModeBBitmapBudget budget) {
        try {
            File file = ModeBAssetNamespace.getAssetFile(getContext(), namespace, assetId, ".mp4");
            if (!file.isFile() || !ModeBScreensaverMediaPolicy.isValidVideoFileSize(file.length())) {
                throw new IOException("Video layar tunggu kosong atau melebihi 12 MB; kartu teks digunakan.");
            }
            ModeBBitmapBudget.Reservation reservation = budget.tryReserveStatic(ModeBBitmapBudget.VIDEO_RESERVATION_BYTES);
            if (reservation == null) throw new IOException("Anggaran memori compositor tidak cukup untuk video layar tunggu.");
            final NativeVideoOverlayDecoder decoder;
            try {
                decoder = new NativeVideoOverlayDecoder(file, true, worker, reservation);
                if (!decoder.getFailure().isEmpty()) {
                    decoder.release();
                    throw new IllegalStateException(decoder.getFailure());
                }
            } catch (RuntimeException failure) {
                reservation.close();
                throw failure;
            }
            mediaVideoDecoder = decoder;
            if (screensaverAudioQueue != null) {
                try {
                    mediaAudioDecoder = new ModeBScreensaverAudioDecoder(file, decoder,
                            screensaverAudioQueue, true);
                    final ModeBScreensaverAudioDecoder audioDecoder = mediaAudioDecoder;
                    audioDecoder.setListener(message -> {
                        // Failure can arrive while the card's opacity animator is still running.
                        // Latch it before posting to MAIN so later animation ticks cannot restart
                        // a decoder that has already reported a terminal format/codec error.
                        audioPlaybackFailed = true;
                        MAIN.post(() -> {
                            if (released.get() || generation != mediaGeneration
                                    || mediaAudioDecoder != audioDecoder) return;
                            audioPlaybackRequested = false;
                            mediaNotice = "Video layar tunggu tetap diputar, tetapi audio MP4 tidak tersedia.";
                            updateDetailText();
                        });
                    });
                } catch (RuntimeException audioDecoderFailure) {
                    mediaAudioDecoder = null;
                    mediaNotice = "Video siap, tetapi track audio Screensaver tidak dapat disiapkan.";
                }
            }
            decoder.setListener(new NativeVideoOverlayDecoder.Listener() {
                @Override public void onFrameAvailable() {
                    videoFrameView.postInvalidateOnAnimation();
                    MAIN.post(() -> {
                        if (released.get() || generation != mediaGeneration || mediaVideoDecoder != decoder) return;
                        mediaNotice = "";
                        imageScrim.setVisibility(VISIBLE);
                        updateDetailText();
                    });
                }
                @Override public void onFailure(String message) {
                    MAIN.post(() -> {
                        if (released.get() || generation != mediaGeneration || mediaVideoDecoder != decoder) return;
                        videoPlaybackRequested = false;
                        decoder.setListener(null);
                        // Keep both decoder references until their workers acknowledge cleanup.
                        // releaseMedia() may race these callbacks and must be able to await them.
                        decoder.release(() -> MAIN.post(() -> {
                            if (mediaVideoDecoder == decoder) mediaVideoDecoder = null;
                        }));
                        ModeBScreensaverAudioDecoder audioDecoder = mediaAudioDecoder;
                        audioPlaybackRequested = false;
                        if (audioDecoder != null) {
                            audioDecoder.release(() -> MAIN.post(() -> {
                                if (mediaAudioDecoder == audioDecoder) mediaAudioDecoder = null;
                            }));
                        }
                        if (screensaverAudioQueue != null) screensaverAudioQueue.flush();
                        videoFrameView.setVisibility(GONE);
                        mediaNotice = (message == null || message.trim().isEmpty()
                                ? "Video layar tunggu gagal diputar." : message) + " Kartu teks digunakan.";
                        updateDetailText();
                    });
                }
            });
            videoFrameView.setVisibility(VISIBLE);
            mediaImage.setVisibility(GONE);
            imageScrim.setVisibility(VISIBLE);
            mediaNotice = "Menyiapkan video layar tunggu…";
            updateDetailText();
            updateAnimationPlayback();
        } catch (OutOfMemoryError | RuntimeException | IOException failure) {
            videoPlaybackRequested = false;
            audioPlaybackRequested = false;
            NativeVideoOverlayDecoder failedVideo = mediaVideoDecoder;
            if (failedVideo != null) {
                failedVideo.setListener(null);
                failedVideo.release(() -> MAIN.post(() -> {
                    if (mediaVideoDecoder == failedVideo) mediaVideoDecoder = null;
                }));
            }
            ModeBScreensaverAudioDecoder failedAudio = mediaAudioDecoder;
            if (failedAudio != null) {
                failedAudio.release(() -> MAIN.post(() -> {
                    if (mediaAudioDecoder == failedAudio) mediaAudioDecoder = null;
                }));
            }
            if (screensaverAudioQueue != null) screensaverAudioQueue.flush();
            videoFrameView.setVisibility(GONE);
            mediaNotice = failure.getMessage() == null
                    ? "Video layar tunggu gagal disiapkan; kartu teks digunakan."
                    : failure.getMessage();
            updateDetailText();
        }
    }

    private void decodeMediaAsset(String assetId, String namespace, int generation,
            ModeBBitmapBudget budget) {
        Bitmap decodedBitmap = null;
        Drawable decodedDrawable = null;
        ModeBBitmapBudget.Reservation reservation = null;
        String failure = "Media layar tunggu gagal dimuat; kartu teks digunakan.";
        try {
            File file = ModeBAssetNamespace.getAssetFile(getContext(), namespace, assetId, ".img");
            if (!file.isFile() || !ModeBScreensaverMediaPolicy.isValidFileSize(file.length())) {
                throw new IOException("File media layar tunggu tidak tersedia atau melebihi 5 MiB.");
            }
            if (isGif(file)) {
                int frameCount = ModeBScreensaverMediaPolicy.countGifFrames(file);
                if (frameCount <= 0 || frameCount > ModeBScreensaverMediaPolicy.MAX_GIF_FRAMES) {
                    throw new IOException("GIF rusak atau memiliki lebih dari 120 frame; kartu teks digunakan.");
                }
                if (frameCount > 1 && Build.VERSION.SDK_INT >= 28) {
                    DecodedMedia animated = decodeAnimatedGif(file, budget);
                    decodedDrawable = animated.drawable;
                    reservation = animated.reservation;
                } else {
                    DecodedMedia firstFrame = decodeStillImage(file, budget,
                            ModeBScreensaverMediaPolicy.MAX_GIF_FRAME_PIXELS);
                    decodedBitmap = firstFrame.bitmap;
                    reservation = firstFrame.reservation;
                }
            } else if (isPngOrJpeg(file)) {
                DecodedMedia still = decodeStillImage(file, budget, MAX_DECODE_PIXELS);
                decodedBitmap = still.bitmap;
                reservation = still.reservation;
            } else {
                throw new IOException("Screensaver hanya mendukung PNG, JPEG, atau GIF lokal.");
            }
            failure = "";
        } catch (OutOfMemoryError memoryError) {
            failure = "Memori perangkat tidak cukup untuk media layar tunggu; kartu teks digunakan.";
        } catch (Exception exception) {
            failure = exception.getMessage() == null
                    ? "Media layar tunggu gagal dimuat; kartu teks digunakan."
                    : exception.getMessage();
        }

        final Bitmap resultBitmap = decodedBitmap;
        final Drawable resultDrawable = decodedDrawable;
        final ModeBBitmapBudget.Reservation resultReservation = reservation;
        final String resultFailure = failure;
        MAIN.post(() -> {
            if (generation == mediaGeneration) pendingMediaDecode = null;
            if (released.get() || generation != mediaGeneration) {
                releaseDecodedDrawable(resultDrawable);
                recycle(resultBitmap);
                close(resultReservation);
                return;
            }
            if ((resultBitmap == null && resultDrawable == null) || resultReservation == null
                    || !resultFailure.isEmpty()) {
                releaseDecodedDrawable(resultDrawable);
                recycle(resultBitmap);
                close(resultReservation);
                mediaNotice = resultFailure.isEmpty()
                        ? "Media layar tunggu gagal dimuat; kartu teks digunakan." : resultFailure;
                clearBitmapOnMain();
                updateDetailText();
                return;
            }
            Bitmap previousBitmap = mediaBitmap;
            Animatable previousAnimation = mediaAnimation;
            ModeBBitmapBudget.Reservation previousReservation = mediaReservation;
            stopAnimation(previousAnimation);
            mediaAnimationRunning = false;
            mediaBitmap = resultBitmap;
            mediaDrawable = resultDrawable;
            mediaAnimation = resultDrawable instanceof Animatable ? (Animatable) resultDrawable : null;
            mediaReservation = resultReservation;
            if (resultDrawable != null) mediaImage.setImageDrawable(resultDrawable);
            else mediaImage.setImageBitmap(resultBitmap);
            mediaImage.setVisibility(VISIBLE);
            imageScrim.setVisibility(VISIBLE);
            mediaNotice = "";
            updateDetailText();
            recycle(previousBitmap);
            close(previousReservation);
            updateAnimationPlayback();
        });
    }

    private static final class DecodedMedia {
        final Bitmap bitmap;
        final Drawable drawable;
        final ModeBBitmapBudget.Reservation reservation;
        DecodedMedia(Bitmap bitmap, Drawable drawable, ModeBBitmapBudget.Reservation reservation) {
            this.bitmap = bitmap;
            this.drawable = drawable;
            this.reservation = reservation;
        }
    }

    private DecodedMedia decodeStillImage(File file, ModeBBitmapBudget budget, long maxPixels) throws IOException {
        Bitmap decoded = null;
        ModeBBitmapBudget.Reservation reservation = null;
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
            int sampleSize = ModeBStreamPolicy.calculateBitmapSampleSize(
                    bounds.outWidth, bounds.outHeight, maxPixels);
            if (sampleSize <= 0) throw new IOException("Dimensi media layar tunggu tidak valid.");
            long sampledWidth = (bounds.outWidth + (long) sampleSize - 1L) / sampleSize;
            long sampledHeight = (bounds.outHeight + (long) sampleSize - 1L) / sampleSize;
            long estimatedBytes = ModeBBitmapBudget.argbBytes(sampledWidth, sampledHeight);
            if (estimatedBytes <= 0L) throw new IOException("Ukuran bitmap layar tunggu tidak valid.");
            reservation = budget.tryReserveStatic(estimatedBytes);
            if (reservation == null) throw new IOException("Anggaran memori compositor tidak cukup untuk media layar tunggu.");
            BitmapFactory.Options decode = new BitmapFactory.Options();
            decode.inSampleSize = sampleSize;
            decode.inPreferredConfig = Bitmap.Config.ARGB_8888;
            decoded = BitmapFactory.decodeFile(file.getAbsolutePath(), decode);
            if (decoded == null || decoded.isRecycled()
                    || !reservation.resize(decoded.getAllocationByteCount())) {
                throw new IOException("Media layar tunggu tidak dapat dimuat dalam anggaran memori.");
            }
            return new DecodedMedia(decoded, null, reservation);
        } catch (OutOfMemoryError error) {
            recycle(decoded);
            close(reservation);
            throw error;
        } catch (IOException | RuntimeException error) {
            recycle(decoded);
            close(reservation);
            throw error;
        }
    }

    @androidx.annotation.RequiresApi(28)
    private DecodedMedia decodeAnimatedGif(File file, ModeBBitmapBudget budget) throws IOException {
        final ModeBBitmapBudget.Reservation[] holder = new ModeBBitmapBudget.Reservation[1];
        boolean adopted = false;
        try {
            ImageDecoder.Source source = ImageDecoder.createSource(file);
            Drawable drawable = ImageDecoder.decodeDrawable(source, (decoder, info, src) -> {
                int width = info.getSize().getWidth();
                int height = info.getSize().getHeight();
                int sampleSize = ModeBScreensaverMediaPolicy.sampleSize(width, height);
                if (sampleSize <= 0) throw new IllegalArgumentException("Dimensi GIF layar tunggu tidak valid atau terlalu besar.");
                long sampledWidth = (width + (long) sampleSize - 1L) / sampleSize;
                long sampledHeight = (height + (long) sampleSize - 1L) / sampleSize;
                long reserveBytes = ModeBScreensaverMediaPolicy.estimateGifWorkingBytes(sampledWidth, sampledHeight);
                if (reserveBytes <= 0L) throw new IllegalArgumentException("GIF melebihi batas 750.000 piksel setelah sampling.");
                holder[0] = budget.tryReserveStatic(reserveBytes);
                if (holder[0] == null) throw new IllegalStateException("Anggaran memori compositor tidak cukup untuk animasi GIF; kartu teks digunakan.");
                decoder.setTargetSampleSize(sampleSize);
                decoder.setMemorySizePolicy(ImageDecoder.MEMORY_POLICY_LOW_RAM);
            });
            if (!(drawable instanceof AnimatedImageDrawable)) {
                throw new IOException("GIF tidak dapat dibuat sebagai animasi di perangkat ini; kartu teks digunakan.");
            }
            int outputWidth = drawable.getIntrinsicWidth();
            int outputHeight = drawable.getIntrinsicHeight();
            long actualReserve = ModeBScreensaverMediaPolicy.estimateGifWorkingBytes(outputWidth, outputHeight);
            if (actualReserve <= 0L || holder[0] == null || !holder[0].resize(actualReserve)) {
                releaseDecodedDrawable(drawable);
                throw new IOException("Ukuran animasi GIF tidak sesuai dengan anggaran memori.");
            }
            adopted = true;
            return new DecodedMedia(null, drawable, holder[0]);
        } finally {
            if (!adopted) close(holder[0]);
        }
    }

    private static void releaseDecodedDrawable(Drawable drawable) {
        if (drawable instanceof Animatable) stopAnimation((Animatable) drawable);
    }

    private static void stopAnimation(Animatable animation) {
        if (animation == null) return;
        try { animation.stop(); } catch (RuntimeException ignored) { }
    }

    private void updateAnimationPlayback() {
        boolean shouldRun = !released.get() && getAlpha() > 0.02f;
        NativeVideoOverlayDecoder video = mediaVideoDecoder;
        if (video == null) {
            videoPlaybackRequested = false;
        } else if (shouldRun != videoPlaybackRequested) {
            // ValueAnimator updates opacity on every UI frame. Send decoder commands only when
            // visibility crosses the running threshold, not once per animation tick.
            videoPlaybackRequested = shouldRun;
            if (shouldRun) video.startPlayback();
            else video.pausePlayback();
        }
        ModeBScreensaverAudioDecoder audio = mediaAudioDecoder;
        if (audio == null) {
            audioPlaybackRequested = false;
        } else if (!audioPlaybackFailed && shouldRun != audioPlaybackRequested) {
            audioPlaybackRequested = shouldRun;
            if (shouldRun) audio.startPlayback();
            else audio.pausePlayback();
        }
        Animatable animation = mediaAnimation;
        if (animation == null) return;
        if (shouldRun == mediaAnimationRunning) return;
        if (shouldRun) {
            try {
                if (animation instanceof AnimatedImageDrawable) {
                    ((AnimatedImageDrawable) animation).setRepeatCount(AnimatedImageDrawable.REPEAT_INFINITE);
                }
                animation.start();
                mediaAnimationRunning = true;
            } catch (RuntimeException ignored) {
                mediaAnimationRunning = false;
            }
        } else {
            stopAnimation(animation);
            mediaAnimationRunning = false;
        }
    }

    private static boolean isGif(File file) {
        byte[] header = new byte[6];
        try (FileInputStream input = new FileInputStream(file)) {
            return input.read(header) == 6 && ModeBScreensaverMediaPolicy.matchesGifSignature(header);
        } catch (IOException ignored) {
            return false;
        }
    }

    private static boolean isPngOrJpeg(File file) {
        byte[] header = new byte[8];
        try (FileInputStream input = new FileInputStream(file)) {
            int read = input.read(header);
            if (read >= 8) {
                return (header[0] == (byte) 0x89 && header[1] == 0x50 && header[2] == 0x4E
                        && header[3] == 0x47 && header[4] == 0x0D && header[5] == 0x0A
                        && header[6] == 0x1A && header[7] == 0x0A)
                        || (header[0] == (byte) 0xFF && header[1] == (byte) 0xD8);
            }
            return read >= 2 && header[0] == (byte) 0xFF && header[1] == (byte) 0xD8;
        } catch (IOException ignored) {
            return false;
        }
    }

    private void updateDetailText() {
        String message = baseDetail;
        if (!mediaNotice.isEmpty()) message = message.isEmpty() ? mediaNotice : message + " " + mediaNotice;
        detail.setText(message);
        detail.setVisibility(message.isEmpty() ? GONE : VISIBLE);
    }

    private void clearMediaOnMain() {
        mediaNotice = "";
        clearBitmapOnMain();
        updateDetailText();
    }

    private void clearBitmapOnMain() {
        Bitmap previousBitmap = mediaBitmap;
        Animatable previousAnimation = mediaAnimation;
        ModeBBitmapBudget.Reservation previousReservation = mediaReservation;
        stopAnimation(previousAnimation);
        mediaAnimationRunning = false;
        mediaBitmap = null;
        mediaDrawable = null;
        mediaAnimation = null;
        mediaReservation = null;
        mediaImage.setImageDrawable(null);
        mediaImage.setVisibility(GONE);
        imageScrim.setVisibility(GONE);
        recycle(previousBitmap);
        close(previousReservation);
    }

    void releaseMedia() {
        releaseMedia(null);
    }

    /** Retires the bitmap and waits for any queued decode to leave the shared worker. */
    void releaseMedia(Runnable onReleased) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            MAIN.post(() -> releaseMedia(onReleased));
            return;
        }

        // Repeated callers (projection stop followed by service teardown, for example) attach
        // to the same in-flight retirement. They must not acknowledge merely because the view's
        // released flag was already set by the first caller.
        boolean beginRetirement = mediaReleaseCoordinator.request(onReleased == null
                ? null : () -> MAIN.post(onReleased));
        if (!beginRetirement) return;

        released.set(true);
        mediaGeneration++;
        ModeBVisualWorker worker = ownerWorker;
        if (worker != null && pendingMediaDecode != null) worker.removeCallbacks(pendingMediaDecode);
        pendingMediaDecode = null;
        clearBitmapOnMain();

        NativeVideoOverlayDecoder video = mediaVideoDecoder;
        ModeBScreensaverAudioDecoder audio = mediaAudioDecoder;
        videoPlaybackRequested = false;
        audioPlaybackRequested = false;
        if (screensaverAudioQueue != null) screensaverAudioQueue.flush();
        videoFrameView.setVisibility(GONE);

        int pendingDecoderRetirements = (video == null ? 0 : 1) + (audio == null ? 0 : 1);
        // One extra arrival represents the FIFO barrier on the visual worker, which protects
        // retriever/frame tasks that may still be reading the media namespace.
        ModeBAsyncReleaseBarrier barrier = new ModeBAsyncReleaseBarrier(
                pendingDecoderRetirements + 1, () -> acknowledgeAfterPreviousMediaReads(worker, () -> {
                    // Keep references discoverable until both native decoder workers and the
                    // visual-worker barrier have retired. Concurrent releaseMedia callers have
                    // already joined mediaReleaseCoordinator and will be notified together.
                    if (mediaVideoDecoder == video) mediaVideoDecoder = null;
                    if (mediaAudioDecoder == audio) mediaAudioDecoder = null;
                    mediaReleaseCoordinator.complete();
                }));

        if (video != null) {
            video.setListener(null);
            video.release(barrier::arrive);
        }
        if (audio != null) audio.release(barrier::arrive);
        // The visual worker's FIFO retirement marker is independent of the two decoder workers.
        barrier.arrive();
    }

    void setCardOpacity(float opacity) {
        final float boundedOpacity = Math.max(0f, Math.min(1f, opacity));
        if (Looper.myLooper() != Looper.getMainLooper()) {
            MAIN.post(() -> applyCardOpacity(boundedOpacity));
            return;
        }
        applyCardOpacity(boundedOpacity);
    }

    private void applyCardOpacity(float opacity) {
        if (released.get()) return;
        setAlpha(opacity);
        updateAnimationPlayback();
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static void recycle(Bitmap bitmap) {
        if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
    }

    private static void close(ModeBBitmapBudget.Reservation reservation) {
        if (reservation != null) reservation.close();
    }
}
