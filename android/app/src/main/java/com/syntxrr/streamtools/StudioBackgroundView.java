package com.syntxrr.streamtools;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

import java.io.File;

/** Draws one local preset background as the bottom-most native Mode B GL view layer. */
final class StudioBackgroundView extends View {
    private static final long MAX_DECODE_PIXELS = 4_000_000L;

    private final int outputWidth;
    private final int outputHeight;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG | Paint.DITHER_FLAG);
    // SYNTXRR's retirable view renderer draws this View on its dedicated draw worker. Serialize bitmap disposal
    // with the complete draw pass, just as StudioOverlayView does for its media assets.
    private final ModeBOverlayRenderGuard renderGuard = new ModeBOverlayRenderGuard();
    private Bitmap bitmap;
    private final ModeBBitmapBudget bitmapBudget;
    private ModeBBitmapBudget.Reservation memoryReservation;
    private String failure = "";
    private volatile ModeBSceneLayerOpacityState sceneOpacityState = new ModeBSceneLayerOpacityState();

    void bindSceneOpacityState(ModeBSceneLayerOpacityState state) {
        if (state == null) throw new IllegalArgumentException("State opacity background tidak tersedia.");
        sceneOpacityState = state;
        postInvalidate();
    }

    void setSceneOpacity(float opacity) {
        sceneOpacityState.set(opacity);
        postInvalidate();
    }

    StudioBackgroundView(Context context, int outputWidth, int outputHeight, String assetId,
            String assetNamespace, ModeBBitmapBudget bitmapBudget) {
        super(context);
        if (bitmapBudget == null) throw new IllegalArgumentException("Anggaran memori sesi compositor tidak tersedia.");
        this.bitmapBudget = bitmapBudget;
        this.outputWidth = Math.max(1, outputWidth);
        this.outputHeight = Math.max(1, outputHeight);
        setWillNotDraw(false);
        setBackgroundColor(Color.TRANSPARENT);
        loadAsset(assetId, assetNamespace);
    }

    private void loadAsset(String assetId, String assetNamespace) {
        if (!ModeBStreamPolicy.isValidOverlayAssetId(assetId)) {
            failure = "ID gambar background tidak valid.";
            return;
        }
        File file;
        try {
            file = ModeBAssetNamespace.getAssetFile(getContext(), assetNamespace, assetId, ".img");
        } catch (IllegalArgumentException exception) {
            failure = "Namespace gambar background tidak valid.";
            return;
        }
        if (!file.isFile() || file.length() <= 0L || file.length() > 5L * 1024L * 1024L) {
            failure = "File background lokal tidak ditemukan atau melewati batas ukuran.";
            return;
        }
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
        int sampleSize = ModeBStreamPolicy.calculateBitmapSampleSize(
                bounds.outWidth, bounds.outHeight, MAX_DECODE_PIXELS);
        if (sampleSize <= 0) {
            failure = "Dimensi gambar background tidak valid.";
            return;
        }
        long sampledWidth = (bounds.outWidth + (long) sampleSize - 1L) / sampleSize;
        long sampledHeight = (bounds.outHeight + (long) sampleSize - 1L) / sampleSize;
        long estimatedBytes = ModeBBitmapBudget.argbBytes(sampledWidth, sampledHeight);
        if (estimatedBytes <= 0L) {
            failure = "Dimensi gambar background melewati batas memori.";
            return;
        }
        memoryReservation = bitmapBudget.tryReserveStatic(estimatedBytes);
        if (memoryReservation == null) {
            failure = "Anggaran memori gambar compositor tidak cukup untuk background preset.";
            return;
        }
        try {
            BitmapFactory.Options decode = new BitmapFactory.Options();
            decode.inSampleSize = sampleSize;
            decode.inPreferredConfig = Bitmap.Config.ARGB_8888;
            bitmap = BitmapFactory.decodeFile(file.getAbsolutePath(), decode);
        } catch (OutOfMemoryError memoryError) {
            memoryReservation.close();
            memoryReservation = null;
            failure = "Memori perangkat tidak cukup untuk memuat background preset.";
            return;
        }
        if (bitmap == null || bitmap.isRecycled()
                || !memoryReservation.resize(bitmap.getAllocationByteCount())) {
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            bitmap = null;
            memoryReservation.close();
            memoryReservation = null;
            failure = "Gambar background gagal dimuat dalam anggaran memori compositor.";
        }
    }

    boolean isReady() {
        return bitmap != null && !bitmap.isRecycled();
    }

    String getFailure() {
        return failure;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        renderGuard.runWhileActive(() -> drawBackgroundFrame(canvas));
    }

    private void drawBackgroundFrame(Canvas canvas) {
        super.onDraw(canvas);
        Bitmap current = bitmap;
        if (current == null || current.isRecycled()) {
            paint.setColor(Color.BLACK);
            paint.setAlpha(255);
            paint.setStyle(Paint.Style.FILL);
            canvas.drawRect(0f, 0f, outputWidth, outputHeight, paint);
            paint.setAlpha(255);
            return;
        }
        paint.setAlpha(255);
        float scale = Math.max(outputWidth / (float) current.getWidth(), outputHeight / (float) current.getHeight());
        float drawWidth = current.getWidth() * scale;
        float drawHeight = current.getHeight() * scale;
        float left = (outputWidth - drawWidth) / 2f;
        float top = (outputHeight - drawHeight) / 2f;
        canvas.drawBitmap(current, null, new RectF(left, top, left + drawWidth, top + drawHeight), paint);
        paint.setAlpha(255);
    }

    /** Idempotently prevents future GL draws and waits for any in-flight draw before recycling. */
    void releaseBitmap() {
        renderGuard.release(() -> {
            Bitmap current = bitmap;
            bitmap = null;
            if (current != null && !current.isRecycled()) current.recycle();
            if (memoryReservation != null) {
                memoryReservation.close();
                memoryReservation = null;
            }
        });
    }

}
