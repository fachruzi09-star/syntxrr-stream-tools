package com.syntxrr.streamtools;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.view.View;
import android.os.SystemClock;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;

/**
 * Native, transparent Studio overlay rendered into RootEncoder's GL output.
 * Renders supported static Studio layers and real event-driven widgets for Mode B.
 * Local image/MP4 assets, one physical Camera2 lens, and supported event widgets are rendered natively.
 * Unsupported browser/remote-media widgets are reported, never replaced with simulated content.
 */
public final class StudioOverlayView extends View {
    private static final int MAX_ELEMENTS = 60;
    private static final float MAX_PERCENT = 100f;
    private static final int MAX_LIVE_EVENTS = 50;
    private static final int MAX_IMAGE_ASSETS = 8;
    private static final int MAX_VIDEO_ASSETS = ModeBStreamPolicy.MAX_OVERLAY_VIDEO_ASSETS;
    private static final long MAX_IMAGE_CACHE_PIXELS = 8_000_000L;
    private static final long MAX_PIXELS_PER_IMAGE = 2_000_000L;

    private final int outputWidth;
    private final int outputHeight;
    private final List<OverlayElement> elements = new ArrayList<>();
    private final List<LiveEvent> liveEvents = new ArrayList<>();
    private final Map<String, Long> eventCounters = new HashMap<>();
    /** Bounded top-donor aggregation preserved across the 50-event live feed window and scene handoffs. */
    private final Map<String, ModeBDynamicOverlayResolver.DonorAggregate> donorAggregates = new LinkedHashMap<>();
    private final Map<String, Bitmap> imageBitmaps = new HashMap<>();
    private final Map<String, ModeBBitmapBudget.Reservation> imageMemoryReservations = new HashMap<>();
    private final ModeBBitmapBudget bitmapBudget;
    private final Map<String, NativeVideoOverlayDecoder> videoDecoders = new HashMap<>();
    private ModeBVisualWorker visualWorker;
    private final boolean workerOwnedByView;
    private final String assetNamespace;
    private final Object assetReleaseLock = new Object();
    private final List<Runnable> assetReleaseListeners = new ArrayList<>();
    private boolean assetReleaseStarted;
    private boolean assetReleaseCompleted;
    private final Object cameraFrameLock = new Object();
    private final ModeBOverlayRenderGuard renderGuard = new ModeBOverlayRenderGuard();
    private NativeCameraOverlay cameraOverlay;
    private Bitmap cameraBitmap;
    private volatile String cameraFailure = "";
    private boolean cameraFrontFacing;
    private boolean cameraLayerPresent;
    private boolean cameraTransferPending;
    private final boolean deferCameraOwnerForTransfer;
    private int cameraFacingConflictCount;
    private static final int MAX_FAILED_AVATAR_URLS = 64;
    private static final int MAX_AVATAR_FETCH_QUEUE = 16;
    private static final ModeBAvatarPolicy.Disposer<Bitmap> AVATAR_BITMAP_DISPOSER = bitmap -> {
        if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
    };
    private boolean hasAvatarElement;
    private final ModeBAvatarPolicy.BoundedAvatarCache<Bitmap> avatarCache = new ModeBAvatarPolicy.BoundedAvatarCache<>();
    private final Set<String> inFlightAvatarUrls = new HashSet<>();
    private final LinkedHashMap<String, Long> failedAvatarUrls = new LinkedHashMap<>();
    private final Object avatarFetchLock = new Object();
    private ExecutorService avatarExecutor;
    private volatile boolean assetsReleased;
    private final List<String> videoLoadFailures = new ArrayList<>();
    private long imageCachePixels;
    private int imageBudgetOmissions;
    private long donationTotal;
    private long lastViewerCount = -1L;
    private long latestTotalLikes = -1L;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final float previewScale;
    private int supportedCount;
    private int omittedCount;
    private volatile ModeBSceneLayerOpacityState sceneOpacityState = new ModeBSceneLayerOpacityState();

    void bindSceneOpacityState(ModeBSceneLayerOpacityState state) {
        if (state == null) throw new IllegalArgumentException("State opacity scene tidak tersedia.");
        sceneOpacityState = state;
        postInvalidate();
    }

    void setSceneOpacity(float opacity) {
        sceneOpacityState.set(opacity);
        postInvalidate();
    }

    float getSceneOpacity() { return sceneOpacityState.snapshot(); }

    public StudioOverlayView(Context context, int outputWidth, int outputHeight, String elementsJson,
            ModeBBitmapBudget bitmapBudget) {
        this(context, outputWidth, outputHeight, elementsJson, bitmapBudget, "", null);
    }

    StudioOverlayView(Context context, int outputWidth, int outputHeight, String elementsJson,
            ModeBBitmapBudget bitmapBudget, String assetNamespace, ModeBVisualWorker sharedVisualWorker) {
        this(context, outputWidth, outputHeight, elementsJson, bitmapBudget, assetNamespace, sharedVisualWorker, false);
    }

    StudioOverlayView(Context context, int outputWidth, int outputHeight, String elementsJson,
            ModeBBitmapBudget bitmapBudget, String assetNamespace, ModeBVisualWorker sharedVisualWorker,
            boolean deferCameraOwnerForTransfer) {
        super(context);
        if (bitmapBudget == null) throw new IllegalArgumentException("Anggaran memori sesi compositor tidak tersedia.");
        this.bitmapBudget = bitmapBudget;
        this.assetNamespace = assetNamespace == null ? "" : assetNamespace.trim();
        if (!this.assetNamespace.isEmpty() && !ModeBAssetNamespace.isValid(this.assetNamespace)) {
            throw new IllegalArgumentException("Namespace aset scene tidak valid.");
        }
        this.visualWorker = sharedVisualWorker;
        this.workerOwnedByView = sharedVisualWorker == null;
        this.cameraTransferPending = false;
        this.deferCameraOwnerForTransfer = deferCameraOwnerForTransfer;
        this.outputWidth = Math.max(1, outputWidth);
        this.outputHeight = Math.max(1, outputHeight);
        // Studio's portrait canvas is approximately 270 CSS px wide. This scale
        // maps common Studio font sizes to the selected encoder resolution.
        float studioPreviewWidth = (this.outputWidth / (float) this.outputHeight) > 1.2f ? 580f : 270f;
        this.previewScale = Math.max(1f, this.outputWidth / studioPreviewWidth);
        setBackgroundColor(Color.TRANSPARENT);
        setWillNotDraw(false);
        parseElements(elementsJson);
    }

    public int getSupportedElementCount() {
        return supportedCount;
    }

    public int getOmittedElementCount() {
        return omittedCount;
    }

    public String getRenderSummary() {
        if (supportedCount == 0 && omittedCount == 0) return "Preset Studio kosong; output hanya menangkap layar perangkat.";
        String summary = "Overlay Studio: " + supportedCount + " elemen statis, media lokal, dan event-driven dirender.";
        if (omittedCount > 0) summary += " " + omittedCount + " elemen media/khusus belum didukung compositor native.";
        if (imageBudgetOmissions > 0) summary += " " + imageBudgetOmissions
                + " gambar/stiker dilewati karena anggaran memori compositor.";
        if (!videoLoadFailures.isEmpty()) summary += " Video tidak dimuat: " + safeText(videoLoadFailures.get(0), 140);
        int readyVideos = 0;
        int playingVideos = 0;
        int finishedVideos = 0;
        int loadingVideos = 0;
        String firstVideoFailure = "";
        for (NativeVideoOverlayDecoder decoder : videoDecoders.values()) {
            if (decoder == null) continue;
            String failure = decoder.getFailure();
            if (failure != null && !failure.isEmpty()) {
                if (firstVideoFailure.isEmpty()) firstVideoFailure = failure;
                continue;
            }
            if (!decoder.isReady()) {
                loadingVideos++;
            } else {
                readyVideos++;
                if (decoder.isPlaybackRunning()) playingVideos++;
                else if (decoder.isPlaybackFinished()) finishedVideos++;
            }
        }
        if (!firstVideoFailure.isEmpty()) {
            summary += " Video overlay berhenti: " + safeText(firstVideoFailure, 140);
        }
        if (cameraFacingConflictCount > 0) {
            summary += " " + cameraFacingConflictCount + " layer kamera dengan arah lensa berbeda dilewati; satu arah lensa per sesi.";
        }
        String cameraStatusFailure = cameraOverlay == null ? cameraFailure : cameraOverlay.getFailure();
        if (cameraStatusFailure == null || cameraStatusFailure.isEmpty()) cameraStatusFailure = cameraFailure;
        if (cameraStatusFailure != null && !cameraStatusFailure.isEmpty()) {
            summary += " Kamera overlay tidak tersedia: " + safeText(cameraStatusFailure, 120);
        } else if (cameraTransferPending) {
            summary += " Kamera menggunakan pemilik Camera2 sesi yang sedang aktif setelah handoff scene.";
        } else if (cameraOverlay != null) {
            boolean hasFrame;
            synchronized (cameraFrameLock) { hasFrame = cameraBitmap != null && !cameraBitmap.isRecycled(); }
            summary += hasFrame ? " Kamera overlay aktif (maksimal 8 fps)." : " Kamera overlay sedang menyiapkan frame.";
        }
        if (videoDecoders.size() > 0) {
            summary += " MP4 lokal " + readyVideos + "/" + videoDecoders.size() + " siap";
            if (playingVideos > 0) summary += ", " + playingVideos + " berjalan hingga 8 fps per klip";
            if (finishedVideos > 0) summary += ", " + finishedVideos + " selesai dengan frame terakhir";
            if (loadingVideos > 0) summary += ", " + loadingVideos + " menyiapkan decoder";
            summary += "; 1 worker decode bersama, tanpa audio video.";
        }
        return summary;
    }

    /** Accepts only bounded, real StreamEvent payloads from the app event bus. */
    public void addLiveEvent(String eventJson) {
        if (assetsReleased || eventJson == null || eventJson.length() > 4096) return;
        try {
            JSONObject object = new JSONObject(eventJson);
            if (object.optBoolean("isSimulation", false)) return;
            String id = object.optString("id", "").trim();
            String type = object.optString("type", "").trim().toLowerCase();
            if (id.isEmpty() || type.isEmpty()) return;
            String rawAvatar = safeText(object.optString("userAvatar", ""), ModeBAvatarPolicy.MAX_AVATAR_URL_LENGTH);
            String validatedAvatar = ModeBAvatarPolicy.validateAvatarUrl(rawAvatar);
            LiveEvent event = new LiveEvent(
                    id,
                    type,
                    safeText(object.optString("username", ""), 80),
                    safeText(object.optString("detail", ""), 500),
                    validatedAvatar,
                    optionalNumber(object, "amount", -1d),
                    optionalNumber(object, "viewerCount", -1d),
                    optionalNumber(object, "totalLikeCount", -1d),
                    optionalNumber(object, "repeatCount", -1d),
                    object.optLong("timestamp", System.currentTimeMillis())
            );
            boolean accepted = false;
            synchronized (liveEvents) {
                if (assetsReleased) return;
                for (LiveEvent previous : liveEvents) if (previous.id.equals(event.id)) return;
                liveEvents.add(0, event);
                while (liveEvents.size() > MAX_LIVE_EVENTS) liveEvents.remove(liveEvents.size() - 1);
                if (event.viewerCount >= 0) lastViewerCount = (long) event.viewerCount;
                if (event.totalLikeCount >= 0) latestTotalLikes = (long) event.totalLikeCount;
                long increment = event.amount >= 0 ? Math.max(1L, (long) event.amount) : 1L;
                if ("gift".equals(type) && event.repeatCount >= 1) increment = Math.max(1L, (long) event.repeatCount);
                eventCounters.put(type, eventCounters.containsKey(type) ? eventCounters.get(type) + increment : increment);
                if ("donation".equals(type) && event.amount > 0) donationTotal += (long) event.amount;
                ModeBDynamicOverlayResolver.recordDonorEvent(
                        donorAggregates,
                        type,
                        event.username,
                        event.timestamp,
                        ModeBDynamicOverlayResolver.MAX_DONOR_ENTRIES);
                accepted = true;
            }
            if (accepted) {
                if (hasAvatarElement && validatedAvatar != null
                        && ModeBDynamicOverlayResolver.isAudienceUserEventType(type)
                        && !event.username.trim().isEmpty()) {
                    scheduleAvatarFetchIfNeeded(validatedAvatar);
                }
                postInvalidate();
            }
        } catch (JSONException ignored) {
            // Malformed event payloads are intentionally ignored; streaming must continue.
        }
    }

    /** Preserve live counters/feed/donor leaderboard state when replacing only the static overlay scene. */
    void copyLiveStateTo(StudioOverlayView target) {
        if (target == null || target == this) return;
        List<LiveEvent> eventSnapshot;
        Map<String, Long> counterSnapshot;
        Map<String, ModeBDynamicOverlayResolver.DonorAggregate> donorSnapshot = new LinkedHashMap<>();
        long donationSnapshot;
        long viewerSnapshot;
        long likesSnapshot;
        synchronized (liveEvents) {
            eventSnapshot = new ArrayList<>(liveEvents);
            counterSnapshot = new HashMap<>(eventCounters);
            for (Map.Entry<String, ModeBDynamicOverlayResolver.DonorAggregate> entry : donorAggregates.entrySet()) {
                if (entry.getValue() != null) {
                    donorSnapshot.put(entry.getKey(), entry.getValue().copy());
                }
            }
            donationSnapshot = donationTotal;
            viewerSnapshot = lastViewerCount;
            likesSnapshot = latestTotalLikes;
        }
        String prefetchAvatarUrl = null;
        synchronized (target.liveEvents) {
            if (target.assetsReleased) return;
            target.liveEvents.clear();
            target.liveEvents.addAll(eventSnapshot);
            target.eventCounters.clear();
            target.eventCounters.putAll(counterSnapshot);
            target.donorAggregates.clear();
            target.donorAggregates.putAll(donorSnapshot);
            target.donationTotal = donationSnapshot;
            target.lastViewerCount = viewerSnapshot;
            target.latestTotalLikes = likesSnapshot;
            if (target.hasAvatarElement) {
                ModeBDynamicOverlayResolver.AvatarResolution latestAvatar =
                        ModeBDynamicOverlayResolver.resolveDynamicAvatar(
                                target.buildAudienceEventRecordsLocked(), "circle", Boolean.TRUE);
                prefetchAvatarUrl = latestAvatar.avatarUrl;
            }
        }
        if (prefetchAvatarUrl != null) {
            target.scheduleAvatarFetchIfNeeded(prefetchAvatarUrl);
        }
        target.postInvalidate();
    }

    private static double optionalNumber(JSONObject object, String key, double fallback) {
        if (!object.has(key) || object.isNull(key)) return fallback;
        double value = object.optDouble(key, fallback);
        return Double.isNaN(value) || Double.isInfinite(value) ? fallback : value;
    }

    private static String safeText(String value, int maxLength) {
        if (value == null) return "";
        String normalized = value.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }

    private List<LiveEvent> getLiveEventsSnapshot() {
        synchronized (liveEvents) {
            return new ArrayList<>(liveEvents);
        }
    }

    private void parseElements(String json) {
        if (json == null || json.trim().isEmpty()) return;
        try {
            JSONArray array = new JSONArray(json);
            int count = Math.min(array.length(), MAX_ELEMENTS);
            for (int index = 0; index < count; index++) {
                JSONObject object = array.optJSONObject(index);
                if (object == null || !object.optBoolean("visible", true)) continue;
                OverlayElement element = OverlayElement.from(object);
                if (element == null) continue;
                if ("image".equals(element.type) || "sticker".equals(element.type)) {
                    String assetId = element.properties.optString("imageAssetId", "").trim();
                    if (assetId.isEmpty() || !loadImageAsset(assetId)) {
                        omittedCount++;
                        continue;
                    }
                    elements.add(element);
                    supportedCount++;
                } else if ("video".equals(element.type)) {
                    // Do not reserve a decoder/worker slot for a layer that cannot contribute
                    // pixels to the current canvas snapshot. Paused playback is already idle
                    // in NativeVideoOverlayDecoder; hidden layers are skipped above.
                    if (!ModeBVideoLayerPolicy.shouldDecode(
                            element.x, element.y, element.width, element.height, element.opacity)) {
                        omittedCount++;
                        continue;
                    }
                    String assetId = element.properties.optString("videoAssetId", "").trim();
                    if (assetId.isEmpty() || (!videoDecoders.containsKey(assetId)
                            && videoDecoders.size() >= MAX_VIDEO_ASSETS) || !loadVideoAsset(assetId,
                            element.properties.optBoolean("loop", true))) {
                        omittedCount++;
                        continue;
                    }
                    elements.add(element);
                    supportedCount++;
                } else if ("camera".equals(element.type)) {
                    if (element.width <= 0f || element.height <= 0f || element.opacity <= 0f) {
                        omittedCount++;
                        continue;
                    }
                    boolean requestedFront = !"environment".equalsIgnoreCase(
                            element.properties.optString("facingMode", "user"));
                    if (!cameraLayerPresent) {
                        cameraLayerPresent = true;
                        cameraFrontFacing = requestedFront;
                    }
                    if (requestedFront != cameraFrontFacing) {
                        cameraFacingConflictCount++;
                        omittedCount++;
                        continue;
                    }
                    if (deferCameraOwnerForTransfer) {
                        // The existing session Camera2 owner will be transferred only after
                        // the staged GL filter is ready. Never open a second physical camera.
                        cameraTransferPending = true;
                        elements.add(element);
                        supportedCount++;
                        continue;
                    }
                    if (cameraOverlay == null) {
                        ModeBBitmapBudget.Reservation cameraReservation = bitmapBudget.tryReserveDynamic(
                                ModeBBitmapBudget.CAMERA_RESERVATION_BYTES);
                        if (cameraReservation == null) {
                            cameraFailure = "Anggaran memori compositor tidak cukup untuk layer kamera.";
                            omittedCount++;
                            continue;
                        }
                        try {
                            if (visualWorker == null) visualWorker = new ModeBVisualWorker();
                            NativeCameraOverlay createdCamera = new NativeCameraOverlay(getContext(),
                                    cameraFrontFacing, visualWorker, cameraReservation, createCameraListener());
                            cameraOverlay = createdCamera;
                            createdCamera.start();
                        } catch (RuntimeException | OutOfMemoryError exception) {
                            if (cameraOverlay != null) {
                                cameraOverlay.release();
                                cameraOverlay = null;
                            } else {
                                cameraReservation.close();
                            }
                            cameraFailure = "Layer kamera tidak dapat memulai proses capture.";
                            omittedCount++;
                            continue;
                        }
                    }
                    elements.add(element);
                    supportedCount++;
                } else if (isSupported(element.type, element.properties)) {
                    if ("avatar".equals(element.type)) {
                        hasAvatarElement = true;
                    }
                    elements.add(element);
                    supportedCount++;
                } else {
                    omittedCount++;
                }
            }
            omittedCount += Math.max(0, array.length() - MAX_ELEMENTS);
            Collections.sort(elements, Comparator.comparingInt(item -> item.layer));
        } catch (JSONException ignored) {
            elements.clear();
            supportedCount = 0;
            omittedCount = 1;
        }
    }

    private NativeCameraOverlay.Listener createCameraListener() {
        return new NativeCameraOverlay.Listener() {
            @Override public void onFrame(Bitmap bitmap) {
                synchronized (cameraFrameLock) {
                    if (assetsReleased) {
                        if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
                        return;
                    }
                    if (cameraBitmap != null && !cameraBitmap.isRecycled()) cameraBitmap.recycle();
                    cameraBitmap = bitmap;
                }
                postInvalidate();
            }

            @Override public void onFailure(String message) {
                if (assetsReleased) return;
                cameraFailure = message == null ? "Kamera gagal dimulai." : message;
                synchronized (cameraFrameLock) {
                    if (cameraBitmap != null && !cameraBitmap.isRecycled()) cameraBitmap.recycle();
                    cameraBitmap = null;
                }
                postInvalidate();
            }
        };
    }

    boolean hasVisibleCameraLayer() {
        return cameraLayerPresent;
    }

    boolean isCameraFrontFacing() {
        return cameraFrontFacing;
    }

    boolean hasTransferableCameraOwner() {
        if (cameraOverlay == null || !cameraOverlay.isActive() || assetsReleased) return false;
        String failure = cameraOverlay.getFailure();
        return failure == null || failure.isEmpty();
    }

    boolean requiresCameraOwnerTransfer() {
        return cameraTransferPending;
    }

    /** Move the one existing physical camera owner and its last frame to the next scene. */
    boolean transferCameraOwnerTo(StudioOverlayView target) {
        if (target == null || target == this || assetsReleased || target.assetsReleased
                || !cameraLayerPresent || !target.cameraLayerPresent
                || cameraFrontFacing != target.cameraFrontFacing || cameraOverlay == null
                || target.cameraOverlay != null) return false;
        final NativeCameraOverlay owner = cameraOverlay;
        try {
            return owner.transferListener(target.createCameraListener(), () -> {
                synchronized (cameraFrameLock) {
                    synchronized (target.cameraFrameLock) {
                        if (assetsReleased || target.assetsReleased || cameraOverlay != owner
                                || target.cameraOverlay != null) {
                            throw new IllegalStateException("Kepemilikan kamera berubah selama handoff scene.");
                        }
                        target.cameraOverlay = owner;
                        target.cameraBitmap = cameraBitmap;
                        target.cameraFailure = cameraFailure;
                        target.cameraFrontFacing = cameraFrontFacing;
                        target.cameraLayerPresent = true;
                        target.cameraTransferPending = false;
                        cameraOverlay = null;
                        cameraBitmap = null;
                        cameraTransferPending = false;
                    }
                }
            });
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private boolean isSupported(String type, JSONObject properties) {
        if ("shape".equals(type) || "separator".equals(type)) return true;
        if ("dynamic_text".equals(type) || "username".equals(type) || "avatar".equals(type)) return true;
        if ("text".equals(type) || "running_text".equals(type) || "live_text".equals(type)) {
            return firstNonEmpty(properties.optString("text", ""), properties.optString("content", ""),
                    properties.optString("sampleText", ""), properties.optString("label", "")).length() > 0;
        }
        if ("counter".equals(type) || "live_viewer_counter".equals(type) || "combo_counter".equals(type)
                || "chat_message".equals(type) || "event_feed".equals(type) || "event_alert".equals(type)) return true;
        if ("progress_bar".equals(type)) return properties.has("value") || properties.has("progress")
                || properties.has("targetAmount") || properties.has("target");
        return false;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        // SYNTXRR's retirable view renderer draws this View from its dedicated draw worker. Serialize a complete
        // frame with releaseAssets() so no Bitmap/decoder can be recycled mid-draw.
        renderGuard.runWhileActive(() -> drawOverlayFrame(canvas));
    }

    private void drawOverlayFrame(Canvas canvas) {
        try {
            super.onDraw(canvas);
            if (assetsReleased || elements.isEmpty()) return;
            // Scene-wide opacity is deliberately not baked into this producer frame. The paired
            // GL filters apply one shared opacity snapshot to background and overlay in the same
            // RootEncoder compositor pass, even when their View workers have different frame rates.
            for (OverlayElement element : elements) drawElement(canvas, element, 1f);
        } finally {
            avatarCache.drainRetired(AVATAR_BITMAP_DISPOSER);
        }
    }

    private void drawElement(Canvas canvas, OverlayElement element, float frameSceneOpacity) {
        float left = outputWidth * element.x / 100f;
        float top = outputHeight * element.y / 100f;
        float width = Math.max(1f, outputWidth * element.width / 100f);
        float height = Math.max(1f, outputHeight * element.height / 100f);
        RectF bounds = new RectF(left, top, Math.min(outputWidth, left + width), Math.min(outputHeight, top + height));
        if (bounds.width() <= 0 || bounds.height() <= 0) return;

        int save = canvas.save();
        if (element.rotation != 0f) canvas.rotate(element.rotation, bounds.centerX(), bounds.centerY());
        canvas.clipRect(bounds);
        int alpha = Math.round(255f * element.opacity / 100f * frameSceneOpacity);
        JSONObject properties = element.properties;
        String type = element.type;

        if ("image".equals(type) || "sticker".equals(type)) {
            drawImage(canvas, bounds, properties, alpha);
        } else if ("video".equals(type)) {
            drawVideo(canvas, bounds, properties, alpha);
        } else if ("camera".equals(type)) {
            drawCamera(canvas, bounds, properties, alpha);
        } else if ("shape".equals(type)) {
            drawShape(canvas, bounds, properties, alpha);
        } else if ("separator".equals(type)) {
            paint.setColor(parseColor(properties.optString("borderColor", properties.optString("color", "#64748B")), Color.GRAY));
            paint.setAlpha(alpha);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(Math.max(2f, number(properties, "borderWidth", 2f) * previewScale));
            canvas.drawLine(bounds.left, bounds.centerY(), bounds.right, bounds.centerY(), paint);
            paint.setStyle(Paint.Style.FILL);
        } else if ("progress_bar".equals(type)) {
            drawLiveProgress(canvas, bounds, element, alpha);
        } else if ("chat_message".equals(type) || "event_feed".equals(type) || "event_alert".equals(type)
                || "combo_counter".equals(type) || "counter".equals(type) || "live_viewer_counter".equals(type)) {
            drawLiveWidget(canvas, bounds, element, alpha);
        } else if ("dynamic_text".equals(type)) {
            drawDynamicTextElement(canvas, bounds, element, alpha);
        } else if ("username".equals(type)) {
            drawUsernameElement(canvas, bounds, element, alpha);
        } else if ("avatar".equals(type)) {
            drawAvatarElement(canvas, bounds, element, alpha);
        } else if ("running_text".equals(type)) {
            drawRunningText(canvas, bounds, element, alpha);
        } else {
            drawTextElement(canvas, bounds, element, alpha);
        }
        canvas.restoreToCount(save);
    }

    private boolean loadImageAsset(String assetId) {
        if (imageBitmaps.containsKey(assetId)) return imageBitmaps.get(assetId) != null;
        if (imageBitmaps.size() >= MAX_IMAGE_ASSETS || imageCachePixels >= MAX_IMAGE_CACHE_PIXELS) return false;
        if (!assetId.matches("[A-Za-z0-9_-]{1,100}")) return false;

        File imageFile;
        try { imageFile = ModeBAssetNamespace.getAssetFile(getContext(), assetNamespace, assetId, ".img"); }
        catch (IllegalArgumentException exception) { return false; }
        if (!imageFile.isFile() || imageFile.length() <= 0L || imageFile.length() > 5L * 1024L * 1024L) return false;

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(imageFile.getAbsolutePath(), bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return false;

        long remainingPixels = Math.min(MAX_PIXELS_PER_IMAGE, MAX_IMAGE_CACHE_PIXELS - imageCachePixels);
        int sampleSize = ModeBStreamPolicy.calculateBitmapSampleSize(bounds.outWidth, bounds.outHeight, remainingPixels);
        if (sampleSize <= 0) return false;
        long sampledWidth = (bounds.outWidth + (long) sampleSize - 1L) / sampleSize;
        long sampledHeight = (bounds.outHeight + (long) sampleSize - 1L) / sampleSize;
        long estimatedBytes = ModeBBitmapBudget.argbBytes(sampledWidth, sampledHeight);
        if (estimatedBytes <= 0L) return false;
        ModeBBitmapBudget.Reservation reservation = bitmapBudget.tryReserveStatic(estimatedBytes);
        if (reservation == null) {
            imageBudgetOmissions++;
            return false;
        }

        Bitmap bitmap;
        try {
            BitmapFactory.Options decode = new BitmapFactory.Options();
            decode.inSampleSize = sampleSize;
            decode.inPreferredConfig = Bitmap.Config.ARGB_8888;
            bitmap = BitmapFactory.decodeFile(imageFile.getAbsolutePath(), decode);
        } catch (OutOfMemoryError memoryError) {
            reservation.close();
            imageBudgetOmissions++;
            return false;
        }
        if (bitmap == null) {
            reservation.close();
            return false;
        }
        long pixels = (long) bitmap.getWidth() * (long) bitmap.getHeight();
        long actualBytes = bitmap.getAllocationByteCount();
        if (pixels > remainingPixels || !reservation.resize(actualBytes)) {
            bitmap.recycle();
            reservation.close();
            imageBudgetOmissions++;
            return false;
        }
        imageBitmaps.put(assetId, bitmap);
        imageMemoryReservations.put(assetId, reservation);
        imageCachePixels += pixels;
        return true;
    }

    private boolean loadVideoAsset(String assetId, boolean loop) {
        if (videoDecoders.containsKey(assetId)) return true;
        if (videoDecoders.size() >= MAX_VIDEO_ASSETS || !assetId.matches("[A-Za-z0-9_-]{1,100}")) return false;
        File videoFile;
        try { videoFile = ModeBAssetNamespace.getAssetFile(getContext(), assetNamespace, assetId, ".mp4"); }
        catch (IllegalArgumentException exception) { return false; }
        if (!videoFile.isFile() || videoFile.length() <= 0L || videoFile.length() > 12L * 1024L * 1024L) return false;
        ModeBBitmapBudget.Reservation reservation = bitmapBudget.tryReserveDynamic(
                ModeBBitmapBudget.VIDEO_RESERVATION_BYTES);
        if (reservation == null) {
            videoLoadFailures.add("Anggaran memori compositor tidak cukup untuk video overlay.");
            return false;
        }
        try {
            if (visualWorker == null) visualWorker = new ModeBVisualWorker();
            NativeVideoOverlayDecoder decoder = new NativeVideoOverlayDecoder(videoFile, loop, visualWorker, reservation);
            videoDecoders.put(assetId, decoder);
            return true;
        } catch (RuntimeException | OutOfMemoryError exception) {
            reservation.close();
            if (videoDecoders.isEmpty() && cameraOverlay == null && visualWorker != null) {
                visualWorker.shutdownAfterQueuedTasks();
                visualWorker = null;
            }
            String message = exception.getMessage();
            videoLoadFailures.add(exception instanceof OutOfMemoryError
                    ? "Memori perangkat tidak cukup untuk menyiapkan decoder video."
                    : (message == null || message.trim().isEmpty()
                        ? "MP4 tidak dapat didekode pada perangkat ini." : message));
            return false;
        }
    }

    private void drawVideo(Canvas canvas, RectF bounds, JSONObject properties, int alpha) {
        String assetId = properties.optString("videoAssetId", "");
        NativeVideoOverlayDecoder decoder = videoDecoders.get(assetId);
        if (decoder == null) return;
        float radius = Math.max(0f, number(properties, "borderRadius", 0f) * previewScale);
        boolean cover = "cover".equalsIgnoreCase(properties.optString("videoFit", "contain"));
        decoder.draw(canvas, bounds, paint, alpha, cover, radius);
    }

    private void drawCamera(Canvas canvas, RectF bounds, JSONObject properties, int alpha) {
        int save = canvas.save();
        float rawRadius = number(properties, "borderRadius", 16f);
        float clampedRadius = rawRadius < 0f || rawRadius > 100f ? 16f : rawRadius;
        float radius = Math.max(0f, clampedRadius * previewScale);
        Path clip = new Path();
        clip.addRoundRect(bounds, radius, radius, Path.Direction.CW);
        canvas.clipPath(clip);

        Bitmap frame;
        synchronized (cameraFrameLock) {
            frame = cameraBitmap;
            if (frame != null && !frame.isRecycled()) {
                float sourceWidth = frame.getWidth();
                float sourceHeight = frame.getHeight();
                float sx = bounds.width() / sourceWidth;
                float sy = bounds.height() / sourceHeight;
                String aspectFitRaw = properties.optString("aspectFit", "").trim();
                String cameraFitRaw = properties.optString("cameraFit", "").trim();
                boolean cover;
                if ("contain".equalsIgnoreCase(aspectFitRaw)) {
                    cover = false;
                } else if ("cover".equalsIgnoreCase(aspectFitRaw)) {
                    cover = true;
                } else {
                    cover = !"contain".equalsIgnoreCase(cameraFitRaw);
                }
                float scale = cover ? Math.max(sx, sy) : Math.min(sx, sy);
                float drawWidth = sourceWidth * scale;
                float drawHeight = sourceHeight * scale;
                RectF destination = new RectF(
                        bounds.centerX() - drawWidth / 2f,
                        bounds.centerY() - drawHeight / 2f,
                        bounds.centerX() + drawWidth / 2f,
                        bounds.centerY() + drawHeight / 2f);
                paint.setAlpha(alpha);
                paint.setColor(Color.WHITE);
                paint.setFilterBitmap(true);
                paint.setStyle(Paint.Style.FILL);
                if (cameraFrontFacing && properties.optBoolean("mirror", true)) {
                    canvas.scale(-1f, 1f, bounds.centerX(), bounds.centerY());
                }
                canvas.drawBitmap(frame, null, destination, paint);
            } else {
                paint.setColor(0xFF111827);
                paint.setAlpha(alpha);
                paint.setStyle(Paint.Style.FILL);
                canvas.drawRoundRect(bounds, radius, radius, paint);
                paint.setColor(Color.WHITE);
                paint.setAlpha(alpha);
                paint.setTextSize(Math.max(12f, 14f * previewScale));
                paint.setTextAlign(Paint.Align.CENTER);
                String message = cameraFailure == null || cameraFailure.isEmpty() ? "Menyiapkan kamera…" : "Kamera tidak tersedia";
                canvas.drawText(message, bounds.centerX(), bounds.centerY(), paint);
                paint.setTextAlign(Paint.Align.LEFT);
            }
        }

        paint.setStyle(Paint.Style.STROKE);
        paint.setColor(parseColor(properties.optString("borderColor", "#F2C230"), 0xFFF2C230));
        paint.setAlpha(alpha);
        float rawBorderWidth = number(properties, "borderWidth", 3f);
        float clampedBorderWidth = rawBorderWidth < 1f || rawBorderWidth > 20f ? 3f : rawBorderWidth;
        paint.setStrokeWidth(Math.max(1f, clampedBorderWidth * previewScale));
        canvas.drawRoundRect(bounds, radius, radius, paint);
        paint.setStyle(Paint.Style.FILL);
        canvas.restoreToCount(save);
    }

    /** Start local MP4 timelines only after the RTMP publish handshake succeeds. */
    public void startVideoPlayback() {
        for (NativeVideoOverlayDecoder decoder : videoDecoders.values()) {
            if (decoder != null) decoder.startPlayback();
        }
    }

    /** Freeze local MP4 timelines while RTMP is reconnecting, so clips do not run ahead. */
    public void pauseVideoPlayback() {
        for (NativeVideoOverlayDecoder decoder : videoDecoders.values()) {
            if (decoder != null) decoder.pausePlayback();
        }
    }

    /**
     * Releases this view's media resources after its GL render pass has retired.
     * A service-injected worker is session-owned and is deliberately not shut down here;
     * another scene may already be using the same worker during a live handoff.
     */
    public void releaseAssets() {
        releaseAssets(null);
    }

    void releaseAssets(Runnable onReleased) {
        boolean begin = false;
        boolean notifyImmediately = false;
        synchronized (assetReleaseLock) {
            if (assetReleaseCompleted) {
                notifyImmediately = true;
            } else {
                if (onReleased != null) assetReleaseListeners.add(onReleased);
                if (!assetReleaseStarted) {
                    assetReleaseStarted = true;
                    begin = true;
                }
            }
        }
        if (notifyImmediately) {
            if (onReleased != null) onReleased.run();
            return;
        }
        if (!begin) return;

        renderGuard.release(() -> {
            assetsReleased = true;
            if (cameraOverlay != null) {
                cameraOverlay.release();
                cameraOverlay = null;
            }
            synchronized (cameraFrameLock) {
                if (cameraBitmap != null && !cameraBitmap.isRecycled()) cameraBitmap.recycle();
                cameraBitmap = null;
            }

            final List<NativeVideoOverlayDecoder> decoders = new ArrayList<>(videoDecoders.values());
            videoDecoders.clear();
            final AtomicInteger remaining = new AtomicInteger(decoders.size());
            Runnable decoderReleased = () -> {
                if (remaining.decrementAndGet() == 0) completeAssetRelease();
            };
            for (NativeVideoOverlayDecoder decoder : decoders) {
                if (decoder != null) decoder.release(decoderReleased);
                else decoderReleased.run();
            }

            for (Bitmap bitmap : imageBitmaps.values()) {
                if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            }
            imageBitmaps.clear();
            for (ModeBBitmapBudget.Reservation reservation : imageMemoryReservations.values()) {
                if (reservation != null) reservation.close();
            }
            imageMemoryReservations.clear();
            imageCachePixels = 0L;

            synchronized (avatarFetchLock) {
                if (avatarExecutor != null) {
                    avatarExecutor.shutdownNow();
                    avatarExecutor = null;
                }
                inFlightAvatarUrls.clear();
                failedAvatarUrls.clear();
            }
            avatarCache.clearAll(AVATAR_BITMAP_DISPOSER);

            if (workerOwnedByView && visualWorker != null) {
                visualWorker.shutdownAfterQueuedTasks();
                visualWorker = null;
            }
            if (decoders.isEmpty()) completeAssetRelease();
        });
    }

    private void completeAssetRelease() {
        List<Runnable> callbacks;
        synchronized (assetReleaseLock) {
            if (assetReleaseCompleted) return;
            assetReleaseCompleted = true;
            callbacks = new ArrayList<>(assetReleaseListeners);
            assetReleaseListeners.clear();
        }
        for (Runnable callback : callbacks) {
            try { callback.run(); } catch (RuntimeException ignored) { }
        }
    }

    boolean areVideoFramesReadyForLiveReplacement() {
        for (NativeVideoOverlayDecoder decoder : videoDecoders.values()) {
            if (decoder == null || !decoder.isReady() || !decoder.hasFrame()) return false;
        }
        return true;
    }

    String getVideoPreparationFailure() {
        for (NativeVideoOverlayDecoder decoder : videoDecoders.values()) {
            if (decoder != null) {
                String failure = decoder.getFailure();
                if (failure != null && !failure.isEmpty()) return failure;
            }
        }
        return "";
    }

    private void drawImage(Canvas canvas, RectF bounds, JSONObject properties, int alpha) {
        String assetId = properties.optString("imageAssetId", "");
        Bitmap bitmap = imageBitmaps.get(assetId);
        if (bitmap == null || bitmap.isRecycled()) return;

        int save = canvas.save();
        float radius = Math.max(0f, number(properties, "borderRadius", 0f) * previewScale);
        if (radius > 0f) {
            Path clip = new Path();
            clip.addRoundRect(bounds, radius, radius, Path.Direction.CW);
            canvas.clipPath(clip);
        }

        paint.setColor(Color.WHITE);
        paint.setAlpha(alpha);
        paint.setFilterBitmap(true);
        paint.setAntiAlias(true);

        float sourceWidth = bitmap.getWidth();
        float sourceHeight = bitmap.getHeight();
        float targetWidth = bounds.width();
        float targetHeight = bounds.height();
        boolean cover = "cover".equalsIgnoreCase(properties.optString(
                "imageFit", properties.optString("objectFit", "contain")));

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

    private void drawLiveWidget(Canvas canvas, RectF bounds, OverlayElement element, int alpha) {
        JSONObject properties = element.properties;
        String type = element.type;
        int background = parseColor(properties.optString("backgroundColor", properties.optString("bgColor", "#CC0F172A")), 0xCC0F172A);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(background);
        paint.setAlpha(Math.round(Color.alpha(background) * (alpha / 255f)));
        float radius = Math.max(4f, number(properties, "borderRadius", 10f) * previewScale);
        canvas.drawRoundRect(bounds, radius, radius, paint);

        List<LiveEvent> events = getLiveEventsSnapshot();
        float padding = Math.max(5f, 7f * previewScale);
        float textSize = Math.max(11f, Math.min(outputHeight * 0.08f, number(properties, "fontSize", 13f) * previewScale));
        int textColor = parseColor(properties.optString("textColor", "#F8FAFC"), Color.WHITE);
        paint.setColor(textColor);
        paint.setAlpha(alpha);
        paint.setTextSize(textSize);
        paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));
        float lineHeight = textSize * 1.32f;
        float y = bounds.top + padding + textSize;
        float maxWidth = Math.max(1f, bounds.width() - padding * 2f);

        if ("chat_message".equals(type) || "event_feed".equals(type)) {
            boolean chatOnly = "chat_message".equals(type);
            int maxRows = Math.max(1, Math.min(8, properties.optInt(chatOnly ? "maxMessages" : "maxItems", chatOnly ? 4 : 4)));
            int rows = 0;
            for (LiveEvent event : events) {
                if (chatOnly && !"chat".equals(event.type)) continue;
                String line;
                if (chatOnly) {
                    line = (event.username.isEmpty() ? "Penonton" : "@" + event.username) + ": " + event.detail;
                } else {
                    line = event.type.toUpperCase() + "  " + (event.username.isEmpty() ? "Penonton" : event.username)
                            + (event.detail.isEmpty() ? "" : " · " + event.detail);
                }
                drawFittedLine(canvas, line, bounds.left + padding, y, maxWidth, textSize, textColor, alpha);
                y += lineHeight;
                if (++rows >= maxRows || y > bounds.bottom - padding) break;
            }
            if (rows == 0) {
                String idle = chatOnly ? "Menunggu chat LIVE…" : "Menunggu event LIVE…";
                drawFittedLine(canvas, idle, bounds.left + padding, y, maxWidth, textSize, 0xFF94A3B8, alpha);
            }
            return;
        }

        if ("event_alert".equals(type)) {
            LiveEvent latest = firstMatchingEvent(events, element, true);
            String title = firstNonEmpty(properties.optString("alertTitle", ""), properties.optString("title", ""), "LIVE ALERT");
            int accent = parseColor(properties.optString("accentColor", properties.optString("badgeColor", "#38BDF8")), 0xFF38BDF8);
            paint.setColor(accent);
            paint.setAlpha(alpha);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            canvas.drawText(fitText(title, maxWidth, paint), bounds.left + padding, y, paint);
            y += lineHeight;
            paint.setColor(textColor);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));
            String message = latest == null ? "Menunggu interaksi penonton…"
                    : (latest.username.isEmpty() ? "Penonton" : latest.username) + " · " + eventDescription(latest);
            drawFittedLine(canvas, message, bounds.left + padding, Math.min(y, bounds.bottom - padding), maxWidth, textSize, textColor, alpha);
            return;
        }

        if ("combo_counter".equals(type)) {
            LiveEvent gift = firstEventOfType(events, "gift");
            String comboName = gift == null ? "" : firstNonEmpty(gift.detail, properties.optString("giftName", "Gift"));
            String message = gift == null ? "Menunggu combo gift…"
                    : "COMBO x" + (gift.repeatCount >= 1 ? (long) gift.repeatCount : 1L) + "  " + comboName;
            drawFittedLine(canvas, message, bounds.left + padding, y, maxWidth, textSize, textColor, alpha);
            return;
        }

        if ("live_viewer_counter".equals(type)) {
            long viewers;
            synchronized (liveEvents) { viewers = lastViewerCount; }
            String message = viewers < 0 ? "Menunggu data penonton…" : "LIVE  " + viewers + " penonton";
            drawFittedLine(canvas, message, bounds.left + padding, y, maxWidth, textSize, textColor, alpha);
            return;
        }

        String filterType = element.triggerEventType;
        if (filterType == null || filterType.isEmpty()) {
            filterType = properties.optString("countType", "like");
        }
        long count;
        synchronized (liveEvents) {
            if ("all".equals(filterType)) {
                count = 0L;
                for (Long value : eventCounters.values()) count += value == null ? 0L : value;
            } else if ("like".equals(filterType) && latestTotalLikes >= 0) {
                count = latestTotalLikes;
            } else {
                Long value = eventCounters.get(filterType);
                count = value == null ? 0L : value;
            }
        }
        String label = firstNonEmpty(properties.optString("label", ""), "Total " + filterType);
        long target = Math.max(0L, (long) number(properties, "targetGoal", number(properties, "target", 0f)));
        String message = label + ": " + count + (target > 0 ? " / " + target : "");
        drawFittedLine(canvas, message, bounds.left + padding, y, maxWidth, textSize, textColor, alpha);
    }

    private void drawLiveProgress(Canvas canvas, RectF bounds, OverlayElement element, int alpha) {
        JSONObject properties = element.properties;
        float radius = Math.min(bounds.height() / 2f, Math.max(2f, number(properties, "borderRadius", 8f) * previewScale));
        int background = parseColor(properties.optString("backgroundColor", "#66334155"), 0x66334155);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(background);
        paint.setAlpha(alpha);
        canvas.drawRoundRect(bounds, radius, radius, paint);
        long current;
        synchronized (liveEvents) { current = donationTotal; }
        double target = Math.max(0d, number(properties, "targetAmount", number(properties, "target", 0f)));
        float progress;
        if (target > 0d) {
            progress = (float) Math.max(0d, Math.min(1d, current / target));
        } else {
            double staticProgress = properties.has("value") ? number(properties, "value", 0f) : number(properties, "progress", 0f);
            progress = (float) Math.max(0d, Math.min(1d, staticProgress > 1d ? staticProgress / 100d : staticProgress));
        }
        if (progress > 0f) {
            int foreground = parseColor(properties.optString("barColor", properties.optString("fillColor", "#38BDF8")), 0xFF38BDF8);
            paint.setColor(foreground);
            paint.setAlpha(alpha);
            RectF fill = new RectF(bounds.left, bounds.top, bounds.left + bounds.width() * progress, bounds.bottom);
            canvas.drawRoundRect(fill, radius, radius, paint);
        }
    }

    private LiveEvent firstMatchingEvent(List<LiveEvent> events, OverlayElement element, boolean enforceDuration) {
        long now = System.currentTimeMillis();
        long duration = Math.max(1L, element.triggerDurationSec);
        for (LiveEvent event : events) {
            if (!matchesFilter(event, element, true)) continue;
            if (enforceDuration && Math.abs(now - event.timestamp) > duration * 1000L) continue;
            return event;
        }
        return null;
    }

    private LiveEvent firstEventOfType(List<LiveEvent> events, String type) {
        for (LiveEvent event : events) if (type.equals(event.type)) return event;
        return null;
    }

    private boolean matchesFilter(LiveEvent event, OverlayElement element, boolean alertDefaults) {
        String filter = element.triggerEventType;
        if (filter != null && !filter.isEmpty()) return "all".equals(filter) || filter.equals(event.type);
        if (alertDefaults) return "gift".equals(event.type) || "follow".equals(event.type)
                || "share".equals(event.type) || "donation".equals(event.type);
        return true;
    }

    private String eventDescription(LiveEvent event) {
        if (!event.detail.isEmpty()) return event.detail;
        return event.type.toUpperCase();
    }

    private void drawFittedLine(Canvas canvas, String text, float x, float baseline, float maxWidth,
                                float textSize, int color, int alpha) {
        paint.setTextSize(textSize);
        paint.setColor(color);
        paint.setAlpha(alpha);
        paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));
        canvas.drawText(fitText(text, maxWidth, paint), x, baseline, paint);
    }

    private String fitText(String text, float maxWidth, Paint textPaint) {
        String value = text == null ? "" : text.replace('\n', ' ').trim();
        if (textPaint.measureText(value) <= maxWidth) return value;
        while (value.length() > 1 && textPaint.measureText(value + "…") > maxWidth) value = value.substring(0, value.length() - 1);
        return value.isEmpty() ? "" : value + "…";
    }

    private void drawShape(Canvas canvas, RectF bounds, JSONObject properties, int alpha) {
        String shape = properties.optString("shapeType", properties.optString("shape", "rectangle"));
        int fill = parseColor(properties.optString("fillColor", properties.optString("backgroundColor", "#332563EB")), Color.TRANSPARENT);
        paint.setColor(fill);
        paint.setAlpha(Math.round(Color.alpha(fill) * (alpha / 255f)));
        paint.setStyle(Paint.Style.FILL);
        float radius = Math.max(0f, number(properties, "borderRadius", 12f) * previewScale);
        if ("circle".equalsIgnoreCase(shape) || "ellipse".equalsIgnoreCase(shape)) {
            canvas.drawOval(bounds, paint);
        } else {
            canvas.drawRoundRect(bounds, radius, radius, paint);
        }
        String border = properties.optString("borderColor", "");
        if (!border.isEmpty()) {
            paint.setColor(parseColor(border, Color.TRANSPARENT));
            paint.setAlpha(alpha);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(Math.max(1f, number(properties, "borderWidth", 1f) * previewScale));
            if ("circle".equalsIgnoreCase(shape) || "ellipse".equalsIgnoreCase(shape)) canvas.drawOval(bounds, paint);
            else canvas.drawRoundRect(bounds, radius, radius, paint);
            paint.setStyle(Paint.Style.FILL);
        }
    }

    private void drawProgress(Canvas canvas, RectF bounds, JSONObject properties, int alpha) {
        int background = parseColor(properties.optString("backgroundColor", "#66334155"), 0x66334155);
        int foreground = parseColor(properties.optString("fillColor", properties.optString("color", "#38BDF8")), 0xFF38BDF8);
        float radius = Math.min(bounds.height() / 2f, Math.max(2f, number(properties, "borderRadius", 8f) * previewScale));
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(background);
        paint.setAlpha(alpha);
        canvas.drawRoundRect(bounds, radius, radius, paint);
        double raw = properties.has("value") ? properties.optDouble("value", 0d) : properties.optDouble("progress", 0d);
        float progress = (float) Math.max(0d, Math.min(1d, raw > 1d ? raw / 100d : raw));
        if (progress > 0f) {
            RectF fill = new RectF(bounds.left, bounds.top, bounds.left + bounds.width() * progress, bounds.bottom);
            paint.setColor(foreground);
            paint.setAlpha(alpha);
            canvas.drawRoundRect(fill, radius, radius, paint);
        }
    }

    private void drawRunningText(Canvas canvas, RectF bounds, OverlayElement element, int alpha) {
        JSONObject properties = element.properties;
        String text = firstNonEmpty(properties.optString("text", ""), properties.optString("content", ""));
        if (text.isEmpty()) return;

        String background = properties.optString("backgroundColor", properties.optString("bgColor", ""));
        if (!background.isEmpty()) {
            int bg = parseColor(background, Color.TRANSPARENT);
            paint.setColor(bg);
            paint.setAlpha(Math.round(Color.alpha(bg) * (alpha / 255f)));
            paint.setStyle(Paint.Style.FILL);
            float radius = Math.max(0f, number(properties, "borderRadius", 8f) * previewScale);
            canvas.drawRoundRect(bounds, radius, radius, paint);
        }

        float textSize = Math.max(12f, Math.min(outputHeight * 0.12f,
                number(properties, "fontSize", 16f) * previewScale));
        paint.setColor(parseColor(properties.optString("textColor", "#FFFFFF"), Color.WHITE));
        paint.setAlpha(alpha);
        paint.setStyle(Paint.Style.FILL);
        paint.setTextSize(textSize);
        paint.setTypeface(Typeface.create(Typeface.DEFAULT,
                "bold".equalsIgnoreCase(properties.optString("fontWeight", "")) ? Typeface.BOLD : Typeface.NORMAL));

        float textWidth = paint.measureText(text);
        float speed = Math.max(0.25f, Math.min(10f, number(properties, "speed", 2f)));
        float pixelsPerSecond = Math.max(12f, speed * 24f * previewScale);
        float cycleWidth = bounds.width() + textWidth + Math.max(12f, 12f * previewScale);
        float offset = ((SystemClock.uptimeMillis() % 60_000L) / 1000f * pixelsPerSecond) % cycleWidth;
        float x = bounds.right - offset;
        float baseline = bounds.centerY() + textSize * 0.35f;
        canvas.drawText(text, x, baseline, paint);
        if (x + textWidth < bounds.right) {
            canvas.drawText(text, x + cycleWidth, baseline, paint);
        }
    }

    private void drawDynamicTextElement(Canvas canvas, RectF bounds, OverlayElement element, int alpha) {
        JSONObject properties = element.properties;
        String template = properties.has("template") && !properties.isNull("template")
                ? properties.optString("template", "")
                : properties.optString("text", "");
        String fallback = properties.optString("fallback", "");

        List<ModeBDynamicOverlayResolver.AudienceEventRecord> audienceRecords;
        String topDonorName;
        synchronized (liveEvents) {
            audienceRecords = buildAudienceEventRecordsLocked();
            topDonorName = ModeBDynamicOverlayResolver.resolveTopDonorName(donorAggregates);
        }
        String latestUsername = ModeBDynamicOverlayResolver.resolveLatestAudienceUsername(audienceRecords);
        Object ownTargetRaw = properties.has("target") && !properties.isNull("target") ? properties.opt("target") : null;
        String targetText = ModeBDynamicOverlayResolver.resolveActiveTargetText(ownTargetRaw, buildTargetSources());
        String nowTimeText = ModeBDynamicOverlayResolver.formatCurrentTimeHHmm(new Date());

        ModeBDynamicOverlayResolver.DynamicTextResolution resolved =
                ModeBDynamicOverlayResolver.resolveDynamicTextOutput(
                        template,
                        fallback,
                        latestUsername,
                        targetText,
                        nowTimeText,
                        null,
                        topDonorName);
        String text = resolved.text;
        if (text == null || text.isEmpty()) return;

        String backgroundRaw = firstNonEmpty(properties.optString("backgroundColor", ""), properties.optString("bgColor", ""));
        float radius = Math.max(0f, number(properties, "borderRadius", 8f) * previewScale);
        if (!"transparent".equalsIgnoreCase(backgroundRaw)) {
            int bg = backgroundRaw.isEmpty() ? 0xBF09090B : parseColor(backgroundRaw, 0xBF09090B);
            paint.setColor(bg);
            paint.setAlpha(Math.round(Color.alpha(bg) * (alpha / 255f)));
            paint.setStyle(Paint.Style.FILL);
            canvas.drawRoundRect(bounds, radius, radius, paint);

            if (backgroundRaw.isEmpty()) {
                paint.setStyle(Paint.Style.STROKE);
                paint.setColor(0xFF27272A);
                paint.setAlpha(alpha);
                paint.setStrokeWidth(Math.max(1f, previewScale));
                canvas.drawRoundRect(bounds, radius, radius, paint);
                paint.setStyle(Paint.Style.FILL);
            }
        }

        float requestedSize = number(properties, "fontSize", 14f);
        float textSize = Math.max(12f, Math.min(outputHeight * 0.12f, requestedSize * previewScale));
        String colorRaw = firstNonEmpty(properties.optString("textColor", ""), properties.optString("color", ""), "#FFFFFF");
        paint.setColor(parseColor(colorRaw, Color.WHITE));
        paint.setAlpha(alpha);
        paint.setStyle(Paint.Style.FILL);
        paint.setTextAlign(Paint.Align.LEFT);
        paint.setTextSize(textSize);
        paint.setTypeface("normal".equalsIgnoreCase(properties.optString("fontWeight", "bold"))
                ? Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                : Typeface.create(Typeface.DEFAULT, Typeface.BOLD));

        float padding = Math.max(4f, 8f * previewScale);
        float maxWidth = Math.max(1f, bounds.width() - padding * 2f);
        float lineHeight = textSize * 1.22f;
        float availableHeight = Math.max(lineHeight, bounds.height() - padding * 2f);
        int maxLines = Math.max(1, Math.min(12, (int) (availableHeight / lineHeight)));
        List<String> lines = wrapText(text, maxWidth, maxLines, paint);
        float totalHeight = lines.size() * lineHeight;
        Paint.FontMetrics dynamicMetrics = paint.getFontMetrics();
        float verticalOffset = bounds.height() >= totalHeight
                ? (bounds.height() - totalHeight) / 2f
                : Math.min(padding, Math.max(0f, (bounds.height() - textSize) / 2f));
        float baseline = bounds.top + verticalOffset - dynamicMetrics.ascent;
        String align = properties.optString("textAlign", "center");
        for (String line : lines) {
            float x = bounds.centerX() - paint.measureText(line) / 2f;
            if ("left".equalsIgnoreCase(align)) x = bounds.left + padding;
            else if ("right".equalsIgnoreCase(align)) x = bounds.right - padding - paint.measureText(line);
            canvas.drawText(line, x, baseline, paint);
            baseline += lineHeight;
        }
    }

    private void drawUsernameElement(Canvas canvas, RectF bounds, OverlayElement element, int alpha) {
        JSONObject properties = element.properties;
        String prefix = properties.has("prefix") && !properties.isNull("prefix") ? properties.optString("prefix", "") : "";
        String badgeProp = properties.has("badge") && !properties.isNull("badge") ? properties.optString("badge", "") : "";

        List<ModeBDynamicOverlayResolver.AudienceEventRecord> audienceRecords;
        synchronized (liveEvents) {
            audienceRecords = buildAudienceEventRecordsLocked();
        }
        ModeBDynamicOverlayResolver.UsernameResolution model =
                ModeBDynamicOverlayResolver.resolveActiveUsername(audienceRecords, prefix, badgeProp);

        String backgroundRaw = firstNonEmpty(properties.optString("backgroundColor", ""), properties.optString("bgColor", ""));
        float radius = Math.max(4f, number(properties, "borderRadius", 12f) * previewScale);
        if (!"transparent".equalsIgnoreCase(backgroundRaw)) {
            int bg = backgroundRaw.isEmpty() ? 0xE609090B : parseColor(backgroundRaw, 0xE609090B);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(bg);
            paint.setAlpha(Math.round(Color.alpha(bg) * (alpha / 255f)));
            canvas.drawRoundRect(bounds, radius, radius, paint);

            if (backgroundRaw.isEmpty()) {
                paint.setStyle(Paint.Style.STROKE);
                paint.setColor(0x6610B981);
                paint.setAlpha(Math.round(Color.alpha(0x6610B981) * (alpha / 255f)));
                paint.setStrokeWidth(Math.max(1f, previewScale));
                canvas.drawRoundRect(bounds, radius, radius, paint);
                paint.setStyle(Paint.Style.FILL);
            }
        }

        float padding = Math.max(5f, 8f * previewScale);
        float requestedSize = number(properties, "fontSize", 12f);
        float textSize = Math.max(11f, Math.min(outputHeight * 0.09f, requestedSize * previewScale));

        float badgeReservedWidth = 0f;
        if (model.hasEvent && model.badge != null && !model.badge.isEmpty() && bounds.width() > padding * 4f) {
            float badgeTextSize = Math.max(9f, textSize * 0.68f);
            float badgePadX = Math.max(4f, 6f * previewScale);
            float badgePadY = Math.max(2f, 3f * previewScale);
            paint.setTextSize(badgeTextSize);
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            paint.setTextAlign(Paint.Align.LEFT);
            float maxBadgeWidth = Math.max(badgePadX * 2f + badgeTextSize, bounds.width() * 0.36f);
            String fittedBadge = fitText(model.badge, Math.max(1f, maxBadgeWidth - badgePadX * 2f), paint);
            if (!fittedBadge.isEmpty()) {
                float badgeWidth = paint.measureText(fittedBadge) + badgePadX * 2f;
                float badgeHeight = Math.min(bounds.height() - padding, badgeTextSize + badgePadY * 2f);
                float badgeRight = bounds.right - padding;
                float badgeLeft = badgeRight - badgeWidth;
                float badgeTop = bounds.centerY() - badgeHeight / 2f;
                float badgeBottom = bounds.centerY() + badgeHeight / 2f;

                paint.setStyle(Paint.Style.FILL);
                paint.setColor(0x3310B981);
                paint.setAlpha(Math.round(Color.alpha(0x3310B981) * (alpha / 255f)));
                float pillRadius = Math.max(3f, 4f * previewScale);
                canvas.drawRoundRect(new RectF(badgeLeft, badgeTop, badgeRight, badgeBottom), pillRadius, pillRadius, paint);

                paint.setColor(0xFF6EE7B7);
                paint.setAlpha(alpha);
                Paint.FontMetrics badgeMetrics = paint.getFontMetrics();
                float badgeBaseline = bounds.centerY() - (badgeMetrics.ascent + badgeMetrics.descent) / 2f;
                canvas.drawText(fittedBadge, badgeLeft + badgePadX, badgeBaseline, paint);
                badgeReservedWidth = badgeWidth + Math.max(4f, 6f * previewScale);
            }
        }

        int activeTextColor = parseColor(
                firstNonEmpty(properties.optString("textColor", ""), properties.optString("color", ""), "#FFFFFF"),
                Color.WHITE);
        paint.setStyle(Paint.Style.FILL);
        paint.setTextAlign(Paint.Align.LEFT);
        paint.setTextSize(textSize);
        paint.setColor(model.hasEvent ? activeTextColor : 0xFF9CA3AF);
        paint.setAlpha(alpha);
        paint.setTypeface(model.hasEvent
                ? Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                : Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));

        float maxTextWidth = Math.max(1f, bounds.width() - padding * 2f - badgeReservedWidth);
        Paint.FontMetrics metrics = paint.getFontMetrics();
        float baseline = bounds.centerY() - (metrics.ascent + metrics.descent) / 2f;
        canvas.drawText(fitText(model.displayText, maxTextWidth, paint), bounds.left + padding, baseline, paint);
    }

    private void drawAvatarElement(Canvas canvas, RectF bounds, OverlayElement element, int alpha) {
        JSONObject properties = element.properties;
        String shapeRaw = properties.has("shape") && !properties.isNull("shape")
                ? properties.optString("shape", "circle")
                : "circle";
        Boolean borderGlowProp = properties.has("borderGlow") && !properties.isNull("borderGlow")
                ? Boolean.valueOf(properties.optBoolean("borderGlow", true))
                : Boolean.TRUE;

        List<ModeBDynamicOverlayResolver.AudienceEventRecord> audienceRecords;
        synchronized (liveEvents) {
            audienceRecords = buildAudienceEventRecordsLocked();
        }
        ModeBDynamicOverlayResolver.AvatarResolution model =
                ModeBDynamicOverlayResolver.resolveDynamicAvatar(audienceRecords, shapeRaw, borderGlowProp);

        float pad = Math.max(2f, Math.min(bounds.width(), bounds.height()) * 0.05f);
        RectF frame = new RectF(
                bounds.left + pad,
                bounds.top + pad,
                Math.max(bounds.left + pad + 2f, bounds.right - pad),
                Math.max(bounds.top + pad + 2f, bounds.bottom - pad));

        float roundedCorner = Math.max(6f, Math.min(frame.width(), frame.height()) * 0.18f);
        Path clipPath = new Path();
        if ("square".equals(model.shape)) {
            clipPath.addRect(frame, Path.Direction.CW);
        } else if ("rounded".equals(model.shape)) {
            clipPath.addRoundRect(frame, roundedCorner, roundedCorner, Path.Direction.CW);
        } else {
            clipPath.addOval(frame, Path.Direction.CW);
        }

        Bitmap avatarBitmap = null;
        if (model.avatarUrl != null) {
            avatarBitmap = avatarCache.get(model.avatarUrl);
            if (avatarBitmap == null || avatarBitmap.isRecycled()) {
                avatarBitmap = null;
                scheduleAvatarFetchIfNeeded(model.avatarUrl);
            }
        }

        int clipSave = canvas.save();
        canvas.clipPath(clipPath);

        if (avatarBitmap != null) {
            float sourceWidth = avatarBitmap.getWidth();
            float sourceHeight = avatarBitmap.getHeight();
            float targetWidth = frame.width();
            float targetHeight = frame.height();
            Rect source = new Rect(0, 0, avatarBitmap.getWidth(), avatarBitmap.getHeight());
            float sourceRatio = sourceWidth / Math.max(1f, sourceHeight);
            float targetRatio = targetWidth / Math.max(1f, targetHeight);
            if (sourceRatio > targetRatio) {
                int cropWidth = Math.max(1, Math.min(avatarBitmap.getWidth(), Math.round(sourceHeight * targetRatio)));
                int cropLeft = (avatarBitmap.getWidth() - cropWidth) / 2;
                source = new Rect(cropLeft, 0, cropLeft + cropWidth, avatarBitmap.getHeight());
            } else if (sourceRatio < targetRatio) {
                int cropHeight = Math.max(1, Math.min(avatarBitmap.getHeight(), Math.round(sourceWidth / targetRatio)));
                int cropTop = (avatarBitmap.getHeight() - cropHeight) / 2;
                source = new Rect(0, cropTop, avatarBitmap.getWidth(), cropTop + cropHeight);
            }
            paint.setColor(Color.WHITE);
            paint.setAlpha(alpha);
            paint.setFilterBitmap(true);
            paint.setStyle(Paint.Style.FILL);
            canvas.drawBitmap(avatarBitmap, source, frame, paint);
        } else {
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(0xFF18181B);
            paint.setAlpha(alpha);
            canvas.drawRect(frame, paint);

            if (model.hasEvent && model.initial != null && !model.initial.isEmpty()) {
                float initialSize = Math.max(12f, Math.min(frame.width(), frame.height()) * 0.44f);
                paint.setColor(0xFFF2C230);
                paint.setAlpha(alpha);
                paint.setTextAlign(Paint.Align.CENTER);
                paint.setTextSize(initialSize);
                paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
                Paint.FontMetrics metrics = paint.getFontMetrics();
                float baseline = frame.centerY() - (metrics.ascent + metrics.descent) / 2f;
                canvas.drawText(model.initial, frame.centerX(), baseline, paint);
                paint.setTextAlign(Paint.Align.LEFT);
            } else {
                // Neutral user silhouette placeholder when no valid audience event exists yet
                float unit = Math.min(frame.width(), frame.height());
                paint.setColor(0xFF71717A);
                paint.setAlpha(alpha);
                paint.setStyle(Paint.Style.FILL);
                canvas.drawCircle(frame.centerX(), frame.centerY() - unit * 0.12f, unit * 0.16f, paint);
                RectF shoulders = new RectF(
                        frame.centerX() - unit * 0.28f,
                        frame.centerY() + unit * 0.08f,
                        frame.centerX() + unit * 0.28f,
                        frame.centerY() + unit * 0.56f);
                canvas.drawOval(shoulders, paint);
            }
        }
        canvas.restoreToCount(clipSave);

        float strokeWidth = model.borderGlow
                ? Math.max(2f, 2.2f * previewScale)
                : Math.max(1.2f, 1.4f * previewScale);
        if (model.borderGlow) {
            paint.setStyle(Paint.Style.STROKE);
            paint.setColor(0x55F2C230);
            paint.setAlpha(Math.round(Color.alpha(0x55F2C230) * (alpha / 255f)));
            paint.setStrokeWidth(strokeWidth * 2.1f);
            drawAvatarBorderShape(canvas, frame, model.shape, roundedCorner, paint);
        }
        paint.setStyle(Paint.Style.STROKE);
        paint.setColor(model.borderGlow ? 0xFFF2C230 : 0xFF3F3F46);
        paint.setAlpha(alpha);
        paint.setStrokeWidth(strokeWidth);
        drawAvatarBorderShape(canvas, frame, model.shape, roundedCorner, paint);
        paint.setStyle(Paint.Style.FILL);
        paint.setAlpha(255);
    }

    private void drawAvatarBorderShape(Canvas canvas, RectF frame, String shape, float roundedCorner, Paint borderPaint) {
        if ("square".equals(shape)) {
            canvas.drawRect(frame, borderPaint);
        } else if ("rounded".equals(shape)) {
            canvas.drawRoundRect(frame, roundedCorner, roundedCorner, borderPaint);
        } else {
            canvas.drawOval(frame, borderPaint);
        }
    }

    private void scheduleAvatarFetchIfNeeded(String rawUrl) {
        if (!hasAvatarElement || assetsReleased) return;
        final String safeUrl = ModeBAvatarPolicy.validateAvatarUrl(rawUrl);
        if (safeUrl == null) return;
        Bitmap cached = avatarCache.get(safeUrl);
        if (cached != null && !cached.isRecycled()) return;

        ExecutorService executorToSubmit;
        long nowMs = System.currentTimeMillis();
        synchronized (avatarFetchLock) {
            if (assetsReleased || !hasAvatarElement) return;
            if (inFlightAvatarUrls.contains(safeUrl)) return;
            Long failedAt = failedAvatarUrls.get(safeUrl);
            if (failedAt != null) {
                if ((nowMs - failedAt.longValue()) < 30_000L) {
                    return;
                }
                failedAvatarUrls.remove(safeUrl);
            }
            if (avatarExecutor == null || avatarExecutor.isShutdown()) {
                ThreadFactory daemonFactory = runnable -> {
                    Thread thread = new Thread(runnable, "syntxrr-avatar-fetch");
                    thread.setDaemon(true);
                    return thread;
                };
                avatarExecutor = new ThreadPoolExecutor(
                        1, 2, 15L, TimeUnit.SECONDS,
                        new LinkedBlockingQueue<>(MAX_AVATAR_FETCH_QUEUE),
                        daemonFactory,
                        new ThreadPoolExecutor.AbortPolicy());
            }
            inFlightAvatarUrls.add(safeUrl);
            executorToSubmit = avatarExecutor;
        }

        try {
            executorToSubmit.execute(() -> fetchAndDecodeAvatar(safeUrl));
        } catch (RuntimeException rejected) {
            synchronized (avatarFetchLock) {
                inFlightAvatarUrls.remove(safeUrl);
            }
        }
    }

    private void fetchAndDecodeAvatar(String initialSafeUrl) {
        String currentUrl = initialSafeUrl;
        boolean succeeded = false;
        try {
            for (int redirectCount = 0; redirectCount <= ModeBAvatarPolicy.MAX_AVATAR_REDIRECTS; redirectCount++) {
                if (assetsReleased || Thread.currentThread().isInterrupted()) return;
                String validatedHop = ModeBAvatarPolicy.validateAvatarUrl(currentUrl);
                if (validatedHop == null) return;

                URL parsed = new URL(validatedHop);
                String host = parsed.getHost();
                if (!verifyPublicHostDns(host)) return;

                HttpsURLConnection connection = null;
                try {
                    connection = (HttpsURLConnection) parsed.openConnection();
                    connection.setInstanceFollowRedirects(false);
                    connection.setUseCaches(false);
                    connection.setConnectTimeout(ModeBAvatarPolicy.CONNECT_TIMEOUT_MS);
                    connection.setReadTimeout(ModeBAvatarPolicy.READ_TIMEOUT_MS);
                    connection.setRequestMethod("GET");
                    connection.setRequestProperty("Accept", "image/jpeg,image/png,image/webp,image/gif");

                    int status = connection.getResponseCode();
                    if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                        if (redirectCount >= ModeBAvatarPolicy.MAX_AVATAR_REDIRECTS) return;
                        String location = connection.getHeaderField("Location");
                        String nextUrl = ModeBAvatarPolicy.validateRedirectTarget(validatedHop, location);
                        if (nextUrl == null) return;
                        currentUrl = nextUrl;
                        continue;
                    }

                    if (status != 200) return;
                    if (!ModeBAvatarPolicy.isSupportedResponseMime(connection.getContentType())) return;
                    long contentLength = connection.getContentLengthLong();
                    if (contentLength > ModeBAvatarPolicy.MAX_AVATAR_BYTES) return;

                    byte[] payload;
                    try (InputStream stream = connection.getInputStream()) {
                        payload = ModeBAvatarPolicy.readBoundedStream(stream, ModeBAvatarPolicy.MAX_AVATAR_BYTES);
                    }
                    if (payload == null || assetsReleased) return;
                    if (ModeBAvatarPolicy.detectImageMimeFromBytes(payload, payload.length) == null) return;

                    Bitmap decoded = decodeBoundedAvatarBitmap(payload);
                    if (decoded == null) return;
                    if (assetsReleased) {
                        if (!decoded.isRecycled()) decoded.recycle();
                        return;
                    }

                    long pixels = (long) decoded.getWidth() * (long) decoded.getHeight();
                    if (!avatarCache.put(initialSafeUrl, decoded, pixels)) {
                        if (!decoded.isRecycled()) decoded.recycle();
                        return;
                    }
                    succeeded = true;
                    postInvalidate();
                    return;
                } finally {
                    if (connection != null) {
                        connection.disconnect();
                    }
                }
            }
        } catch (IOException | RuntimeException | OutOfMemoryError ignored) {
            // Do not log avatar URL or username/PII on fetch failures; fallback initial stays visible.
        } finally {
            synchronized (avatarFetchLock) {
                inFlightAvatarUrls.remove(initialSafeUrl);
                if (!succeeded && !assetsReleased) {
                    if (failedAvatarUrls.size() >= MAX_FAILED_AVATAR_URLS) {
                        String oldestKey = failedAvatarUrls.keySet().iterator().next();
                        failedAvatarUrls.remove(oldestKey);
                    }
                    failedAvatarUrls.put(initialSafeUrl, System.currentTimeMillis());
                }
            }
        }
    }

    private static boolean verifyPublicHostDns(String host) {
        if (host == null || host.trim().isEmpty()) return false;
        try {
            InetAddress[] addresses = InetAddress.getAllByName(host.trim());
            if (addresses == null || addresses.length == 0) return false;
            for (InetAddress address : addresses) {
                if (!ModeBAvatarPolicy.isSafePublicAddress(address)) return false;
            }
            return true;
        } catch (IOException | SecurityException ignored) {
            return false;
        }
    }

    private static Bitmap decodeBoundedAvatarBitmap(byte[] payload) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(payload, 0, payload.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;

        int maxDim = Math.max(bounds.outWidth, bounds.outHeight);
        int sampleSize = 1;
        while ((maxDim / sampleSize) > ModeBAvatarPolicy.MAX_AVATAR_DIMENSION_PX * 2) {
            sampleSize *= 2;
        }

        BitmapFactory.Options decodeOpts = new BitmapFactory.Options();
        decodeOpts.inSampleSize = sampleSize;
        decodeOpts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap decoded = BitmapFactory.decodeByteArray(payload, 0, payload.length, decodeOpts);
        if (decoded == null) return null;

        int width = decoded.getWidth();
        int height = decoded.getHeight();
        if (width <= 0 || height <= 0) {
            if (!decoded.isRecycled()) decoded.recycle();
            return null;
        }
        if (width <= ModeBAvatarPolicy.MAX_AVATAR_DIMENSION_PX
                && height <= ModeBAvatarPolicy.MAX_AVATAR_DIMENSION_PX) {
            return decoded;
        }

        float scale = Math.min(
                ModeBAvatarPolicy.MAX_AVATAR_DIMENSION_PX / (float) width,
                ModeBAvatarPolicy.MAX_AVATAR_DIMENSION_PX / (float) height);
        int targetW = Math.max(1, Math.round(width * scale));
        int targetH = Math.max(1, Math.round(height * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(decoded, targetW, targetH, true);
        if (scaled != decoded && !decoded.isRecycled()) {
            decoded.recycle();
        }
        return scaled;
    }

    private List<ModeBDynamicOverlayResolver.AudienceEventRecord> buildAudienceEventRecordsLocked() {
        List<ModeBDynamicOverlayResolver.AudienceEventRecord> records = new ArrayList<>(liveEvents.size());
        for (LiveEvent event : liveEvents) {
            if (event == null) continue;
            records.add(new ModeBDynamicOverlayResolver.AudienceEventRecord(
                    event.id, event.type, event.username, event.userAvatar, event.timestamp));
        }
        return records;
    }

    private List<ModeBDynamicOverlayResolver.TargetSource> buildTargetSources() {
        List<ModeBDynamicOverlayResolver.TargetSource> sources = new ArrayList<>(elements.size());
        for (OverlayElement item : elements) {
            if (item == null || item.properties == null) continue;
            if (!"counter".equals(item.type) && !"progress_bar".equals(item.type)) continue;
            JSONObject props = item.properties;
            Object targetGoalRaw = props.has("targetGoal") && !props.isNull("targetGoal") ? props.opt("targetGoal") : null;
            Object targetAmountRaw = props.has("targetAmount") && !props.isNull("targetAmount") ? props.opt("targetAmount") : null;
            Object targetRaw = props.has("target") && !props.isNull("target") ? props.opt("target") : null;
            String currencyRaw = props.has("currency") && !props.isNull("currency") ? props.optString("currency", "") : "";
            sources.add(new ModeBDynamicOverlayResolver.TargetSource(
                    item.type, targetGoalRaw, targetAmountRaw, targetRaw, currencyRaw));
        }
        return sources;
    }

    private void drawTextElement(Canvas canvas, RectF bounds, OverlayElement element, int alpha) {
        JSONObject properties = element.properties;
        String text = firstNonEmpty(properties.optString("text", ""), properties.optString("content", ""),
                properties.optString("sampleText", ""), properties.optString("label", ""));
        if (text.isEmpty() && ("counter".equals(element.type) || "live_viewer_counter".equals(element.type))) {
            text = String.valueOf(properties.opt("value"));
        }
        if (text.isEmpty()) return;

        String background = properties.optString("backgroundColor", properties.optString("bgColor", ""));
        if (!background.isEmpty()) {
            int bg = parseColor(background, Color.TRANSPARENT);
            paint.setColor(bg);
            paint.setAlpha(Math.round(Color.alpha(bg) * (alpha / 255f)));
            paint.setStyle(Paint.Style.FILL);
            float radius = Math.max(0f, number(properties, "borderRadius", 8f) * previewScale);
            canvas.drawRoundRect(bounds, radius, radius, paint);
        }

        float requestedSize = number(properties, "fontSize", 16f);
        float textSize = Math.max(12f, Math.min(outputHeight * 0.12f, requestedSize * previewScale));
        paint.setColor(parseColor(properties.optString("textColor", properties.optString("color", "#FFFFFF")), Color.WHITE));
        paint.setAlpha(alpha);
        paint.setStyle(Paint.Style.FILL);
        paint.setTextSize(textSize);
        paint.setTypeface("bold".equalsIgnoreCase(properties.optString("fontWeight", ""))
                ? Typeface.create(Typeface.DEFAULT, Typeface.BOLD) : Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));

        float padding = Math.max(4f, 7f * previewScale);
        float maxWidth = Math.max(1f, bounds.width() - padding * 2f);
        float lineHeight = textSize * 1.22f;
        float availableHeight = Math.max(lineHeight, bounds.height() - padding * 2f);
        int maxLines = Math.max(1, Math.min(12, (int) (availableHeight / lineHeight)));
        List<String> lines = wrapText(text, maxWidth, maxLines, paint);
        float totalHeight = lines.size() * lineHeight;
        float baseline = bounds.top + Math.max(padding, (bounds.height() - totalHeight) / 2f) + textSize;
        String align = properties.optString("textAlign", "left");
        for (String line : lines) {
            float x = bounds.left + padding;
            if ("center".equalsIgnoreCase(align)) x = bounds.centerX() - paint.measureText(line) / 2f;
            else if ("right".equalsIgnoreCase(align)) x = bounds.right - padding - paint.measureText(line);
            canvas.drawText(line, x, baseline, paint);
            baseline += lineHeight;
        }
    }

    private List<String> wrapText(String text, float maxWidth, int maxLines, Paint textPaint) {
        List<String> lines = new ArrayList<>();
        String normalized = text.replace('\n', ' ').trim();
        if (normalized.isEmpty()) return lines;
        StringBuilder line = new StringBuilder();
        for (String word : normalized.split("\\s+")) {
            String candidate = line.length() == 0 ? word : line + " " + word;
            if (line.length() > 0 && textPaint.measureText(candidate) > maxWidth) {
                lines.add(line.toString());
                line.setLength(0);
                if (lines.size() >= maxLines) break;
            }
            if (line.length() > 0) line.append(' ');
            line.append(word);
        }
        if (lines.size() < maxLines && line.length() > 0) lines.add(line.toString());
        if (!lines.isEmpty() && (lines.size() == maxLines) && textPaint.measureText(lines.get(lines.size() - 1)) > maxWidth) {
            String last = lines.get(lines.size() - 1);
            while (last.length() > 1 && textPaint.measureText(last + "…") > maxWidth) last = last.substring(0, last.length() - 1);
            lines.set(lines.size() - 1, last + "…");
        }
        return lines;
    }

    private static float number(JSONObject object, String key, float fallback) {
        double value = object.optDouble(key, fallback);
        if (Double.isNaN(value) || Double.isInfinite(value)) return fallback;
        return (float) value;
    }

    private static int parseColor(String value, int fallback) {
        if (value == null || value.trim().isEmpty()) return fallback;
        String color = value.trim();
        try {
            if (color.startsWith("rgba(")) {
                String[] parts = color.substring(5, color.length() - 1).split(",");
                if (parts.length == 4) {
                    int red = Integer.parseInt(parts[0].trim());
                    int green = Integer.parseInt(parts[1].trim());
                    int blue = Integer.parseInt(parts[2].trim());
                    float opacity = Float.parseFloat(parts[3].trim());
                    return Color.argb(Math.round(Math.max(0f, Math.min(1f, opacity)) * 255f), red, green, blue);
                }
            }
            if (color.startsWith("rgb(")) {
                String[] parts = color.substring(4, color.length() - 1).split(",");
                if (parts.length == 3) return Color.rgb(Integer.parseInt(parts[0].trim()), Integer.parseInt(parts[1].trim()), Integer.parseInt(parts[2].trim()));
            }
            return Color.parseColor(color);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty() && !"null".equals(value)) return value.trim();
        }
        return "";
    }

    private static final class LiveEvent {
        final String id;
        final String type;
        final String username;
        final String detail;
        final String userAvatar;
        final double amount;
        final double viewerCount;
        final double totalLikeCount;
        final double repeatCount;
        final long timestamp;

        LiveEvent(String id, String type, String username, String detail, String userAvatar, double amount,
                  double viewerCount, double totalLikeCount, double repeatCount, long timestamp) {
            this.id = id;
            this.type = type;
            this.username = username;
            this.detail = detail;
            this.userAvatar = userAvatar;
            this.amount = amount;
            this.viewerCount = viewerCount;
            this.totalLikeCount = totalLikeCount;
            this.repeatCount = repeatCount;
            this.timestamp = timestamp > 0 ? timestamp : System.currentTimeMillis();
        }
    }

    private static final class OverlayElement {
        final String type;
        final float x, y, width, height, opacity, rotation;
        final int layer;
        final JSONObject properties;
        final String triggerEventType;
        final int triggerDurationSec;

        private OverlayElement(String type, float x, float y, float width, float height,
                               float opacity, float rotation, int layer, JSONObject properties,
                               String triggerEventType, int triggerDurationSec) {
            this.type = type;
            this.x = clamp(x, 0f, MAX_PERCENT);
            this.y = clamp(y, 0f, MAX_PERCENT);
            this.width = clamp(width, 0f, MAX_PERCENT);
            this.height = clamp(height, 0f, MAX_PERCENT);
            this.opacity = clamp(opacity, 0f, MAX_PERCENT);
            this.rotation = rotation;
            this.layer = layer;
            this.properties = properties == null ? new JSONObject() : properties;
            this.triggerEventType = triggerEventType == null ? "" : triggerEventType;
            this.triggerDurationSec = Math.max(1, Math.min(60, triggerDurationSec));
        }

        static OverlayElement from(JSONObject object) {
            String type = object.optString("type", "");
            if (type.isEmpty()) return null;
            JSONObject properties = object.optJSONObject("properties");
            JSONObject triggerConfig = object.optJSONObject("triggerConfig");
            return new OverlayElement(type,
                    (float) object.optDouble("x", 0d),
                    (float) object.optDouble("y", 0d),
                    (float) object.optDouble("width", 0d),
                    (float) object.optDouble("height", 0d),
                    (float) object.optDouble("opacity", 100d),
                    (float) object.optDouble("rotation", 0d),
                    object.optInt("layer", 0), properties,
                    triggerConfig == null ? "" : triggerConfig.optString("eventType", ""),
                    triggerConfig == null ? 5 : triggerConfig.optInt("durationSec", 5));
        }

        private static float clamp(float value, float min, float max) {
            if (Float.isNaN(value) || Float.isInfinite(value)) return min;
            return Math.max(min, Math.min(max, value));
        }
    }
}
