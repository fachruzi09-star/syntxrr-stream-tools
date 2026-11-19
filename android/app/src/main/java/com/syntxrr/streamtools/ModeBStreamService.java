package com.syntxrr.streamtools;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.graphics.SurfaceTexture;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.Surface;

import java.io.File;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.pedro.common.ConnectChecker;
import com.pedro.encoder.Frame;
import com.pedro.encoder.input.audio.GetMicrophoneData;
import com.pedro.encoder.input.sources.audio.AudioSource;
import com.pedro.encoder.input.sources.audio.SilenceAudioSource;
import com.pedro.encoder.input.sources.video.NoVideoSource;
import com.pedro.encoder.input.sources.video.VideoSource;
import com.pedro.encoder.input.gl.render.filters.object.SurfaceFilterRender;
import com.pedro.library.rtmp.RtmpStream;
import com.pedro.library.util.streamclient.RtmpStreamClient;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Deque;
import java.lang.ref.WeakReference;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native Mode B capture + hardware encoder + RTMP transport.
 * The user must grant a fresh MediaProjection token for every streaming session.
 */
public final class ModeBStreamService extends Service implements ConnectChecker {
    public interface Listener {
        void onModeBStreamState(String status, String message, boolean streaming, long bitrateKbps);
    }

    public interface SceneReplacementCallback {
        void onResult(boolean success, String message);
    }

    public static final String ACTION_START = "com.syntxrr.streamtools.MODE_B_START";
    public static final String ACTION_STOP = "com.syntxrr.streamtools.MODE_B_STOP";
    public static final String ACTION_RESHARE = "com.syntxrr.streamtools.MODE_B_RESHARE";
    public static final String ACTION_RESHARE_CANCELLED = "com.syntxrr.streamtools.MODE_B_RESHARE_CANCELLED";
    public static final String ACTION_SET_HOST_WAIT = "com.syntxrr.streamtools.MODE_B_SET_HOST_WAIT";
    public static final String EXTRA_HOST_WAIT_ENABLED = "hostWaitEnabled";
    public static final String EXTRA_RESHARE_MESSAGE = "reshareMessage";
    public static final String EXTRA_RESULT_CODE = "projectionResultCode";
    public static final String EXTRA_RESULT_DATA = "projectionResultData";
    public static final String EXTRA_RTMP_URL = "rtmpUrl";
    public static final String EXTRA_WIDTH = "width";
    public static final String EXTRA_HEIGHT = "height";
    public static final String EXTRA_BITRATE = "videoBitrate";
    public static final String EXTRA_FPS = "fps";
    public static final String EXTRA_AUDIO_BITRATE = "audioBitrate";
    public static final String EXTRA_AUDIO_SOURCE = "audioSource";
    public static final String EXTRA_OVERLAY_ELEMENTS = "overlayElements";
    public static final String EXTRA_SCREEN_CAPTURE_LAYER = "screenCaptureLayer";
    public static final String EXTRA_BACKGROUND_ASSET_ID = "backgroundAssetId";
    public static final String EXTRA_SCENE_ASSET_NAMESPACE = "sceneAssetNamespace";
    public static final String EXTRA_BACKGROUND_ASSET_NAMESPACE = "backgroundAssetNamespace";
    public static final String EXTRA_SCREENSAVER_ASSET_NAMESPACE = "screensaverAssetNamespace";
    public static final String EXTRA_SCREENSAVER = "screensaver";

    private static final String CHANNEL_ID = "syntxrr_mode_b_stream";
    private static final int NOTIFICATION_ID = 7402;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final GetMicrophoneData AUDIO_PREFLIGHT_SINK = new GetMicrophoneData() {
        @Override public void inputPCMData(Frame frame) {
            // Intentionally discard only the short preflight PCM window. RootEncoder will
            // replace this callback with its encoder callback when startStream() begins.
        }
    };
    private static WeakReference<Listener> listenerRef = new WeakReference<>(null);
    private static volatile WeakReference<ModeBStreamService> activeInstance = new WeakReference<>(null);
    private static final ModeBSessionReadinessPolicy.Tracker READINESS_TRACKER =
            new ModeBSessionReadinessPolicy.Tracker();
    private static volatile String lastStatus = "idle";
    private static volatile String lastMessage = "Mode B belum dimulai.";
    private static volatile boolean lastStreaming = false;
    private static volatile long lastBitrateKbps = 0;

    private RtmpStream stream;
    private MediaProjection mediaProjection;
    private MediaProjection.Callback projectionCallback;
    private volatile long projectionGeneration = 0L;
    private boolean reshareWaiting;
    private boolean reshareInProgress;
    private boolean audioSilencedForReshare;
    private boolean reshareFinishing;
    private boolean hostWaitActive;
    private boolean capturedContentVisible = true;
    private long hostWaitGeneration;
    private ValueAnimator hostWaitAnimator;
    private ModeBScreensaverPolicy screensaverPolicy = ModeBScreensaverPolicy.disabled();
    private String activeAudioRoute = "mix";
    private ModeBReshareWaitingView reshareWaitingView;
    private ModeBReshareFloatingOverlay reshareFloatingOverlay;
    private ModeBSceneReplacementFilter reshareWaitingFilter;
    private SurfaceTexture screenCaptureSurfaceTexture;
    private int screenCaptureLayerWidth;
    private int screenCaptureLayerHeight;
    private StudioOverlayView studioOverlayView;
    private ModeBSceneReplacementFilter overlayFilterRender;
    private StudioBackgroundView studioBackgroundView;
    private ModeBBitmapBudget bitmapBudget;
    private ModeBSceneReplacementFilter backgroundFilterRender;
    private ModeBSceneLayerOpacityState liveSceneLayerOpacityState;
    private SurfaceFilterRender screenCaptureFilterRender;
    private int nextFilterPosition;
    private int overlayFilterPosition = -1;
    private int streamOutputWidth;
    private int streamOutputHeight;
    private int streamOutputFps = 30;
    private String activeBackgroundAssetId = "";
    private String activeSceneAssetNamespace = "";
    private String activeBackgroundAssetNamespace = "";
    private String activeScreensaverAssetNamespace = "";
    private String pendingScreensaverAssetNamespace = "";
    private ModeBVisualWorker visualWorker;
    private ModeBScreensaverAudioPcmQueue screensaverAudioQueue;
    // Retain sources whose cleanup may have been skipped by an earlier RootEncoder failure.
    private final List<AudioSource> audioSourcesForTeardown = new ArrayList<>();
    private final List<StudioOverlayView> retiringSceneViews = new ArrayList<>();
    private final java.util.Map<StudioOverlayView, String> retiringSceneNamespaces = new java.util.HashMap<>();
    private volatile boolean assetCleanupCompleted = true;
    // Tracks exceptions escaping RootEncoder stop/release APIs. RootEncoder's internal GL
    // secureSubmit may swallow its own executor failures, so this is an API-boundary result,
    // not a claim that every internal EGL operation was independently acknowledged.
    private volatile boolean streamTeardownApiCompleted = true;
    private volatile String streamTeardownApiFailure = "";
    private ModeBScreenCaptureLayerSpec activeCaptureSpec;
    private boolean sceneReplacementPending;
    private StudioOverlayView pendingSceneView;
    private ModeBSceneReplacementFilter pendingSceneFilter;
    private StudioBackgroundView pendingBackgroundView;
    private ModeBSceneReplacementFilter pendingBackgroundFilter;
    private String pendingBackgroundAssetNamespace = "";
    private String pendingBackgroundAssetId = "";
    private SceneReplacementCallback pendingSceneCallback;
    private String pendingSceneAssetNamespace = "";
    private Runnable sceneReplacementTimeout;
    private Runnable sceneReplacementAssetPoll;
    private ValueAnimator sceneTransitionAnimator;
    private ModeBScreenCaptureVideoSource directScreenCaptureVideoSource;
    private ModeBCaptureEnginePolicy.Engine captureEngine = ModeBCaptureEnginePolicy.Engine.NONE;
    private VirtualDisplay screenCaptureVirtualDisplay;
    private final Object screenCaptureLock = new Object();
    private ModeBProjectionLayerGuard screenCaptureGuard = new ModeBProjectionLayerGuard();
    private String overlayNotice = "";
    private String captureLayerNotice = "";
    private volatile boolean screenCaptureLayerRequired;
    private final AtomicBoolean screenCaptureFirstFrameReady = new AtomicBoolean(false);
    private final Runnable reshareFrameTimeout = () -> {
        if (reshareInProgress && !screenCaptureFirstFrameReady.get()) {
            returnReshareToWaiting(projectionGeneration, "Belum ada frame layar baru. LIVE tetap berjalan; tekan Bagikan Layar Lagi untuk mencoba kembali.");
        }
    };
    private volatile boolean connectionEstablished;
    private volatile long latestConnectedBitrateKbps;
    private final AtomicBoolean cleanedUp = new AtomicBoolean(false);
    private final AtomicBoolean stopRequested = new AtomicBoolean(false);
    private final AtomicBoolean retryPending = new AtomicBoolean(false);
    private static final long SCREEN_CAPTURE_READY_TIMEOUT_MS = 15_000L;
    private final Runnable screenCaptureReadyTimeout = () -> {
        boolean firstFrameReady = screenCaptureFirstFrameReady.get();
        if (ModeBStreamReadinessPolicy.shouldFailCaptureTimeout(
                screenCaptureLayerRequired, firstFrameReady, stopRequested.get())) {
            endSession("error", "Layer Tangkapan Layar tidak siap. Android tidak mengirim frame layar pertama ke compositor; periksa izin berbagi layar lalu coba mulai lagi.");
        }
    };
    private final Deque<String> pendingOverlayEvents = new ArrayDeque<>();
    private static final int MAX_PENDING_OVERLAY_EVENTS = 30;
    private static final long STREAM_HEALTH_INTERVAL_MS = 5_000L;
    private static final long STREAM_SEND_STALL_TIMEOUT_MS = 20_000L;
    private volatile long streamGeneration = 0L;
    private volatile boolean streamConfirmedLive = false;
    private volatile boolean sessionWasLive = false;
    private long lastObservedSentBytes = -1L;
    private long lastSendProgressAtMs = 0L;
    private final Runnable streamHealthCheck = new Runnable() {
        @Override public void run() {
            checkStreamSendProgress();
        }
    };

    public static void setListener(@Nullable Listener listener) {
        listenerRef = new WeakReference<>(listener);
        if (listener != null) {
            final String status = lastStatus;
            final String message = lastMessage;
            final boolean streaming = lastStreaming;
            final long bitrate = lastBitrateKbps;
            MAIN.post(() -> listener.onModeBStreamState(status, message, streaming, bitrate));
        }
    }

    public static String getLastStatus() { return lastStatus; }
    public static String getLastMessage() { return lastMessage; }
    public static boolean isLastStreaming() { return lastStreaming; }
    public static long getLastBitrateKbps() { return lastBitrateKbps; }
    public static boolean canStartNewSession() { return READINESS_TRACKER.canStartNewSession(); }
    public static String getNewSessionBlockMessage() { return READINESS_TRACKER.getBlockedReason(); }

    public static boolean canRequestScreenReshare() {
        ModeBStreamService service = activeInstance.get();
        return service != null && service.reshareWaiting && !service.reshareInProgress
                && !service.retryPending.get() && !service.stopRequested.get() && !service.cleanedUp.get() && service.stream != null;
    }

    public static boolean setHostWait(boolean enabled) {
        ModeBStreamService service = activeInstance.get();
        if (service == null || service.stopRequested.get() || service.cleanedUp.get()
                || !service.screensaverPolicy.enabled || service.reshareWaiting || service.reshareInProgress) return false;
        Runnable action = () -> service.setHostWaitFromUser(enabled);
        if (Looper.myLooper() == Looper.getMainLooper()) action.run();
        else MAIN.post(action);
        return true;
    }

    public static void hideReshareFloatingControl() {
        ModeBStreamService service = activeInstance.get();
        if (service == null) return;
        if (Looper.myLooper() == Looper.getMainLooper()) service.hideReshareFloatingControlInternal();
        else MAIN.post(service::hideReshareFloatingControlInternal);
    }

    public static void restoreReshareFloatingControl(String message) {
        ModeBStreamService service = activeInstance.get();
        if (service != null) MAIN.post(() -> {
            if (!service.reshareWaiting || service.stopRequested.get()) return;
            service.showReshareFloatingControl();
            service.updateStreamingNotification("LIVE berjalan · menunggu layar dibagikan kembali");
            service.publish("reshare_waiting", message == null || message.trim().isEmpty()
                    ? "LIVE tetap berjalan. Bagikan layar lagi untuk melanjutkan tampilan."
                    : message, true, service.latestConnectedBitrateKbps);
        });
    }

    private static void publish(String status, String message, boolean streaming, long bitrateKbps) {
        lastStatus = status;
        lastMessage = message == null ? "" : message;
        lastStreaming = streaming;
        lastBitrateKbps = Math.max(0, bitrateKbps);
        Listener listener = listenerRef.get();
        if (listener != null) {
            final String messageSnapshot = lastMessage;
            final long bitrateSnapshot = lastBitrateKbps;
            MAIN.post(() -> listener.onModeBStreamState(status, messageSnapshot, streaming, bitrateSnapshot));
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        activeInstance = new WeakReference<>(this);
    }

    public static boolean requestLiveOverlaySceneReplacement(String overlayJson, String backgroundAssetId,
            String backgroundAssetNamespace, String screenCaptureLayerJson, String assetNamespace,
            String screensaverAssetNamespace, String screensaverJson, int transitionOutDurationMs,
            int transitionInDurationMs, SceneReplacementCallback callback) {
        ModeBStreamService service = activeInstance.get();
        if (service == null || callback == null) return false;
        MAIN.post(() -> service.replaceLiveOverlaySceneOnMain(
                overlayJson, backgroundAssetId, backgroundAssetNamespace, screenCaptureLayerJson, assetNamespace,
                screensaverAssetNamespace, screensaverJson, transitionOutDurationMs, transitionInDurationMs, callback));
        return true;
    }

    public static boolean pushOverlayEvent(String eventJson) {
        ModeBStreamService service = activeInstance.get();
        if (service == null || eventJson == null || eventJson.length() > 4096 || service.stopRequested.get()) return false;
        MAIN.post(() -> {
            if (service.stopRequested.get()) return;
            StudioOverlayView activeView = service.studioOverlayView;
            StudioOverlayView stagedView = service.pendingSceneView;
            if (activeView != null) activeView.addLiveEvent(eventJson);
            // Keep the staged scene's feed/counters in sync during the GL handoff window.
            // Otherwise an event arriving after copyLiveStateTo() but before commit could
            // disappear when the previous scene is retired.
            if (stagedView != null && stagedView != activeView) stagedView.addLiveEvent(eventJson);
            if (activeView == null && stagedView == null) {
                synchronized (service.pendingOverlayEvents) {
                    while (service.pendingOverlayEvents.size() >= MAX_PENDING_OVERLAY_EVENTS) {
                        service.pendingOverlayEvents.removeFirst();
                    }
                    service.pendingOverlayEvents.addLast(eventJson);
                }
            }
        });
        return true;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            endSession("stopped", "Siaran dihentikan.");
            return START_NOT_STICKY;
        }
        if (ACTION_RESHARE.equals(intent.getAction())) {
            try { reattachProjectionAndResume(intent); }
            catch (SecurityException securityException) {
                returnReshareToWaiting(projectionGeneration, explainSecurityException(securityException));
            } catch (Exception exception) {
                returnReshareToWaiting(projectionGeneration, safeMessage(exception, "Gagal menyambungkan ulang layar. LIVE tetap menunggu."));
            }
            return START_NOT_STICKY;
        }
        if (ACTION_RESHARE_CANCELLED.equals(intent.getAction())) {
            String message = intent.getStringExtra(EXTRA_RESHARE_MESSAGE);
            restoreReshareFloatingControl(message);
            return START_NOT_STICKY;
        }
        if (ACTION_SET_HOST_WAIT.equals(intent.getAction())) {
            setHostWaitFromUser(intent.getBooleanExtra(EXTRA_HOST_WAIT_ENABLED, false));
            return START_NOT_STICKY;
        }
        if (!ACTION_START.equals(intent.getAction())) return START_NOT_STICKY;

        try {
            if (!resetAfterCompletedSession()) {
                publish("error", "Sesi siaran sebelumnya belum selesai dibersihkan. Coba hentikan lalu mulai lagi.", false, 0);
                return START_NOT_STICKY;
            }
            if (READINESS_TRACKER.tryBeginSession() < 0L) {
                publish("error", READINESS_TRACKER.getBlockedReason(), false, 0);
                return START_NOT_STICKY;
            }
            publish("starting", "Menyiapkan izin capture, audio, dan encoder.", false, 0);
            startForegroundForProjection(intent);
            startProjectionAndEncoder(intent);
        } catch (SecurityException securityException) {
            endSession("error", explainSecurityException(securityException));
        } catch (Exception exception) {
            endSession("error", safeMessage(exception, "Gagal menyiapkan encoder Mode B."));
        }
        return START_NOT_STICKY;
    }

    private void startForegroundForProjection(Intent intent) {
        createNotificationChannel();
        String source = intent.getStringExtra(EXTRA_AUDIO_SOURCE);
        boolean usesMicrophone = "mix".equals(source) || "microphone".equals(source);
        boolean usesCamera = ModeBStreamPolicy.hasVisibleCameraOverlay(
                intent.getStringExtra(EXTRA_OVERLAY_ELEMENTS));
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int foregroundType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
            if (usesMicrophone && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                foregroundType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            }
            if (usesCamera && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                foregroundType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
            }
            startForeground(NOTIFICATION_ID, notification, foregroundType);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "SYNTXRR Mode B Streaming",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Menjaga encoder dan siaran RTMP Mode B tetap berjalan.");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        Intent stopIntent = new Intent(this, ModeBStreamService.class);
        stopIntent.setAction(ACTION_STOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent stopPendingIntent = PendingIntent.getService(this, NOTIFICATION_ID, stopIntent, flags);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.presence_video_online)
                .setContentTitle("SYNTXRR STREAM · Mode B")
                .setContentText("Menangkap layar dan menyiapkan siaran RTMP")
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .addAction(android.R.drawable.ic_media_pause, "Hentikan", stopPendingIntent)
                .build();
    }

    private void startProjectionAndEncoder(Intent intent) {
        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        String rtmpUrl = intent.getStringExtra(EXTRA_RTMP_URL);
        if (resultCode != android.app.Activity.RESULT_OK || resultData == null) {
            throw new IllegalArgumentException("Izin berbagi layar tidak diterima.");
        }
        if (rtmpUrl == null || !(rtmpUrl.startsWith("rtmp://") || rtmpUrl.startsWith("rtmps://"))) {
            throw new IllegalArgumentException("Alamat RTMP/RTMPS tidak valid.");
        }

        String overlayJson = intent.getStringExtra(EXTRA_OVERLAY_ELEMENTS);
        boolean cameraRequired = ModeBStreamPolicy.hasVisibleCameraOverlay(overlayJson);
        if (cameraRequired && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            throw new SecurityException("Preset Studio memerlukan izin CAMERA untuk elemen kamera.");
        }

        int width = clampEven(intent.getIntExtra(EXTRA_WIDTH, 1280), 320, 2560);
        int height = clampEven(intent.getIntExtra(EXTRA_HEIGHT, 720), 320, 2560);
        int videoBitrate = clamp(intent.getIntExtra(EXTRA_BITRATE, 4_000_000), 500_000, 20_000_000);
        int fps = clamp(intent.getIntExtra(EXTRA_FPS, 30), 15, 60);
        int audioBitrate = clamp(intent.getIntExtra(EXTRA_AUDIO_BITRATE, 128_000), 64_000, 320_000);
        String audioSource = intent.getStringExtra(EXTRA_AUDIO_SOURCE);
        if (audioSource == null) audioSource = "mix";
        if (!ModeBStreamPolicy.isSupportedAudioSource(audioSource)) {
            throw new IllegalArgumentException("Sumber audio Mode B tidak dikenali.");
        }
        if (ModeBStreamPolicy.requiresRecordAudioPermission(audioSource)
                && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            throw new SecurityException("Android memerlukan izin RECORD_AUDIO untuk sumber audio Mode B yang dipilih. "
                    + "Mode Internal tetap menangkap audio perangkat dan tidak dialihkan ke mikrofon.");
        }

        // One queue is shared by the current audio source and the Screensaver MP4 decoder.
        // It is session-scoped and closed only after all native media readers are retired.
        screensaverAudioQueue = new ModeBScreensaverAudioPcmQueue();

        MediaProjectionManager projectionManager =
                (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (projectionManager == null) throw new IllegalStateException("MediaProjection tidak tersedia pada perangkat ini.");

        // A permission result is consumed once; this projection is never reused for another session.
        mediaProjection = projectionManager.getMediaProjection(resultCode, resultData);
        if (mediaProjection == null) throw new IllegalStateException("Android gagal membuat sesi berbagi layar.");
        projectionGeneration++;

        // Build the selected source before prepareAudio(). Internal audio remains a strict
        // playback-capture route and is never silently replaced with microphone-only audio.
        String audioNotice = null;
        AudioSource selectedAudioSource;
        if ("internal".equals(audioSource)) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                throw new IllegalArgumentException("Audio internal memerlukan Android 10 atau lebih baru.");
            }
            selectedAudioSource = new ModeBSafeInternalAudioSource(mediaProjection, screensaverAudioQueue);
        } else if ("mix".equals(audioSource) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                selectedAudioSource = new ModeBSafeMixAudioSource(mediaProjection, screensaverAudioQueue);
            } catch (RuntimeException captureException) {
                // Mix mode already requested RECORD_AUDIO in the Capacitor permission flow.
                selectedAudioSource = new ModeBSafeMicrophoneSource(screensaverAudioQueue);
                audioNotice = "Audio sistem tidak tersedia pada perangkat ini; memakai mikrofon saja.";
            }
        } else {
            selectedAudioSource = new ModeBSafeMicrophoneSource(screensaverAudioQueue);
            if ("mix".equals(audioSource)) {
                audioNotice = "Audio sistem memerlukan Android 10; memakai mikrofon.";
            }
        }

        ModeBScreenCaptureLayerSpec captureSpec = ModeBScreenCaptureLayerSpec.fromJson(
                intent.getStringExtra(EXTRA_SCREEN_CAPTURE_LAYER));
        String backgroundAssetId = intent.getStringExtra(EXTRA_BACKGROUND_ASSET_ID);
        if (backgroundAssetId != null && !backgroundAssetId.trim().isEmpty()
                && !ModeBStreamPolicy.isValidOverlayAssetId(backgroundAssetId)) {
            throw new IllegalArgumentException("ID aset background preset tidak valid.");
        }
        screenCaptureLayerRequired = captureSpec != null && captureSpec.enabled && captureSpec.opacity > 0f;
        captureEngine = ModeBCaptureEnginePolicy.resolve(captureSpec,
                backgroundAssetId != null && !backgroundAssetId.trim().isEmpty());
        activeCaptureSpec = captureSpec;
        screensaverPolicy = ModeBScreensaverPolicy.fromJson(intent.getStringExtra(EXTRA_SCREENSAVER));
        activeBackgroundAssetId = backgroundAssetId == null ? "" : backgroundAssetId.trim();
        activeSceneAssetNamespace = intent.getStringExtra(EXTRA_SCENE_ASSET_NAMESPACE);
        activeBackgroundAssetNamespace = intent.getStringExtra(EXTRA_BACKGROUND_ASSET_NAMESPACE);
        activeScreensaverAssetNamespace = intent.getStringExtra(EXTRA_SCREENSAVER_ASSET_NAMESPACE);
        if (!ModeBAssetNamespace.isValid(activeSceneAssetNamespace)) {
            throw new IllegalArgumentException("Namespace aset overlay scene tidak valid. Siapkan ulang media preset.");
        }
        if (!activeBackgroundAssetId.isEmpty() && !ModeBAssetNamespace.isValid(activeBackgroundAssetNamespace)) {
            throw new IllegalArgumentException("Namespace background preset tidak valid. Siapkan ulang gambar background.");
        }
        if (activeBackgroundAssetId.isEmpty()) activeBackgroundAssetNamespace = "";
        if (activeScreensaverAssetNamespace == null || !ModeBAssetNamespace.isValid(activeScreensaverAssetNamespace)) {
            activeScreensaverAssetNamespace = "";
        }
        streamOutputWidth = width;
        streamOutputHeight = height;
        streamOutputFps = fps;
        nextFilterPosition = 0;
        overlayFilterPosition = -1;

        stream = createStream(createVideoSource(captureEngine), selectedAudioSource, fps);
        boolean videoPrepared = stream.prepareVideo(width, height, videoBitrate, fps, 2, 0);
        boolean enableMicEffects = ModeBStreamPolicy.shouldEnableMicrophoneEffects(audioSource);
        boolean audioPrepared = videoPrepared && stream.prepareAudio(44_100, true, audioBitrate,
                enableMicEffects, enableMicEffects);

        // Mix mode is a convenience path: if Android allows mic capture but rejects
        // playback capture on this device/app, retry explicitly as microphone-only.
        // A user who selected Internal audio must never receive a silent source swap.
        if (!audioPrepared && videoPrepared && "mix".equals(audioSource)) {
            try {
                stream.release();
                untrackAudioSourceForTeardown(selectedAudioSource);
            } catch (Exception ignored) {
                // Retain this source: RootEncoder may have exited before reaching audio cleanup.
            }
            selectedAudioSource = new ModeBSafeMicrophoneSource(screensaverAudioQueue);
            stream = createStream(createVideoSource(captureEngine), selectedAudioSource, fps);
            videoPrepared = stream.prepareVideo(width, height, videoBitrate, fps, 2, 0);
            audioPrepared = videoPrepared && stream.prepareAudio(44_100, true, audioBitrate, true, true);
            if (audioPrepared) {
                audioNotice = "Audio campuran tidak didukung perangkat ini; siaran memakai mikrofon saja.";
            }
        }

        if (!videoPrepared || !audioPrepared) {
            String detail = "internal".equals(audioSource)
                    ? "Audio internal gagal disiapkan. Perangkat atau aplikasi sumber mungkin tidak mengizinkan playback capture."
                    : "Perangkat tidak dapat menyiapkan encoder video/audio pada resolusi dan bitrate yang dipilih.";
            throw new IllegalStateException(detail);
        }

        final long initialProjectionGeneration = projectionGeneration;
        projectionCallback = new MediaProjection.Callback() {
            @Override public void onStop() {
                MAIN.post(() -> onProjectionStopped(initialProjectionGeneration));
            }
            @Override public void onCapturedContentVisibilityChanged(boolean isVisible) {
                if (Build.VERSION.SDK_INT >= 34) {
                    MAIN.post(() -> handleCapturedContentVisibility(initialProjectionGeneration, isVisible));
                }
            }
        };
        mediaProjection.registerCallback(projectionCallback, MAIN);

        // The mix source deliberately performs no AudioRecord allocation in prepareAudio().
        // Its real playback-capture handshake happens in start(). Preflight it NOW, before
        // the compositor creates the one permitted VirtualDisplay for this consent token.
        // If capture is rejected, the mix source can be safely replaced by microphone-only
        // audio without consuming the MediaProjection session twice on Android 14+.
        if (selectedAudioSource instanceof ModeBSafeMixAudioSource) {
            final AudioSource preflightSource = selectedAudioSource;
            try {
                // Important: preflight uses a discard sink only briefly. RootEncoder skips
                // AudioSource.start() when the source is already running, so leaving this
                // source alive would keep the discard sink attached and the live stream silent.
                ModeBAudioPreflight.verifyAndRelease(new ModeBAudioPreflight.CaptureSource() {
                    @Override public void start(GetMicrophoneData sink) { preflightSource.start(sink); }
                    @Override public void stop() { preflightSource.stop(); }
                }, AUDIO_PREFLIGHT_SINK);
            } catch (RuntimeException preflightFailure) {
                if (!isAudioStartFailure(preflightFailure)
                        || !ModeBAudioSourceSwap.isRecoverySafe(preflightFailure)) throw preflightFailure;
                RtmpStream failedPreparedStream = stream;
                stream = null;
                ++streamGeneration;
                if (failedPreparedStream != null) {
                    try {
                        failedPreparedStream.release();
                        untrackAudioSourceForTeardown(selectedAudioSource);
                    } catch (Exception ignored) {
                        // Preserve the old source for the independent session teardown fallback.
                    }
                }
                selectedAudioSource = new ModeBSafeMicrophoneSource(screensaverAudioQueue);
                stream = createStream(createVideoSource(captureEngine), selectedAudioSource, fps);
                videoPrepared = stream.prepareVideo(width, height, videoBitrate, fps, 2, 0);
                audioPrepared = videoPrepared && stream.prepareAudio(44_100, true, audioBitrate, true, true);
                if (!videoPrepared || !audioPrepared) {
                    throw new IllegalStateException("Audio campuran ditolak Android dan mikrofon cadangan gagal disiapkan. "
                            + safeMessage(preflightFailure, "Periksa izin mikrofon dan perangkat audio."));
                }
                audioNotice = "Audio sistem tidak tersedia; siaran memakai mikrofon saja.";
            }
        }

        // Internal audio uses the same app-owned lifecycle discipline as Mix and microphone-only.
        // Preflight the real playback-capture recorder before startStream(), but never fall back
        // to microphone when the user explicitly selected Internal.
        if (selectedAudioSource instanceof ModeBSafeInternalAudioSource) {
            final AudioSource preflightSource = selectedAudioSource;
            try {
                ModeBAudioPreflight.verifyAndRelease(new ModeBAudioPreflight.CaptureSource() {
                    @Override public void start(GetMicrophoneData sink) { preflightSource.start(sink); }
                    @Override public void stop() { preflightSource.stop(); }
                }, AUDIO_PREFLIGHT_SINK);
            } catch (RuntimeException preflightFailure) {
                throw new IllegalStateException(
                        "Audio internal tidak dapat disiapkan. Pastikan Android mengizinkan playback capture dan aplikasi sumber mengizinkan audionya ditangkap.",
                        preflightFailure);
            }
        }

        // Microphone-only uses an app-owned source as well: the RootEncoder 2.8.1 implementation
        // allocates once in create() and again in start(), overwriting the first AudioRecord.
        // Verify the real microphone can start now, before startStream() opens the RTMP session.
        if (selectedAudioSource instanceof ModeBSafeMicrophoneSource) {
            final AudioSource preflightSource = selectedAudioSource;
            try {
                ModeBAudioPreflight.verifyAndRelease(new ModeBAudioPreflight.CaptureSource() {
                    @Override public void start(GetMicrophoneData sink) { preflightSource.start(sink); }
                    @Override public void stop() { preflightSource.stop(); }
                }, AUDIO_PREFLIGHT_SINK);
            } catch (RuntimeException preflightFailure) {
                throw new IllegalStateException(
                        "Mikrofon tidak dapat disiapkan. Periksa izin mikrofon dan pastikan tidak ada aplikasi lain yang mengunci perangkat audio.",
                        preflightFailure);
            }
        }

        if (selectedAudioSource instanceof ModeBSafeMixAudioSource) activeAudioRoute = "mix";
        else if (selectedAudioSource instanceof ModeBSafeInternalAudioSource) activeAudioRoute = "internal";
        else activeAudioRoute = "microphone";
        audioSilencedForReshare = false;
        reshareWaiting = false;
        reshareInProgress = false;

        // The source engine is selected before the one-shot MediaProjection token is consumed
        // by a VirtualDisplay. The direct source is used only for an unchanged full-frame scene;
        // scenes that need background/object transforms use the compatibility GL object layer.
        stream.getGlInterface().setCameraOrientation(0);
        // One admission budget covers static assets and protected camera/MP4 frame memory
        // across both native views for this LIVE session.
        bitmapBudget = new ModeBBitmapBudget();
        attachBackgroundLayer(backgroundAssetId, width, height);
        attachScreenCaptureLayer(captureSpec, width, height);
        attachStudioOverlay(overlayJson, width, height, fps);

        String startMessage = audioNotice == null
                ? "Compositor siap; sedang menghubungkan ke server RTMP."
                : audioNotice + " Menghubungkan ke server RTMP.";
        if (!captureLayerNotice.isEmpty()) startMessage += " " + captureLayerNotice;
        if (!overlayNotice.isEmpty()) startMessage += " " + overlayNotice;
        publish("connecting", startMessage, false, 0);
        stream.startStream(rtmpUrl);
        if (screenCaptureLayerRequired && !screenCaptureFirstFrameReady.get()) {
            MAIN.removeCallbacks(screenCaptureReadyTimeout);
            MAIN.postDelayed(screenCaptureReadyTimeout, SCREEN_CAPTURE_READY_TIMEOUT_MS);
        }
    }

    /** A stopped projection may be replaced only while the already-published RTMP session is healthy. */
    private void onProjectionStopped(long expectedGeneration) {
        if (expectedGeneration != projectionGeneration || stopRequested.get() || cleanedUp.get()) return;
        if (reshareInProgress) {
            returnReshareToWaiting(expectedGeneration,
                    "Berbagi layar baru terputus sebelum siap. LIVE tetap berjalan; bagikan layar lagi untuk mencoba kembali.");
            return;
        }
        final boolean projectionDependent = screenCaptureLayerRequired
                || ModeBAudioResharePolicy.requiresProjectionAudio(activeAudioRoute);
        if (!projectionDependent) {
            MediaProjection unusedProjection = mediaProjection;
            MediaProjection.Callback unusedCallback = projectionCallback;
            mediaProjection = null;
            projectionCallback = null;
            projectionGeneration = expectedGeneration + 1L;
            if (unusedProjection != null && unusedCallback != null) {
                try { unusedProjection.unregisterCallback(unusedCallback); } catch (RuntimeException ignored) { }
            }
            RtmpStream activeStream = stream;
            if (sessionWasLive && activeStream != null && activeStream.isStreaming()) {
                publish("live", "Siaran tetap berjalan; scene aktif tidak menggunakan MediaProjection.",
                        true, latestConnectedBitrateKbps);
                return;
            }
            endSession("capture_lost", "Izin berbagi layar terputus sebelum sesi LIVE siap. Mulai ulang siaran untuk meminta izin baru.");
            return;
        }
        RtmpStream current = stream;
        boolean canKeep = ModeBResharePolicy.shouldKeepRtmpAlive(
                true, sessionWasLive,
                current != null && current.isStreaming(),
                stopRequested.get(), cleanedUp.get());
        if (!canKeep) {
            endSession("capture_lost", "Izin berbagi layar terputus sebelum sesi LIVE siap. Mulai ulang siaran untuk meminta izin baru.");
            return;
        }
        enterReshareWaiting(expectedGeneration);
    }

    private void enterReshareWaiting(long stoppedGeneration) {
        if (stoppedGeneration != projectionGeneration || reshareWaiting || reshareInProgress) return;
        MAIN.removeCallbacks(screenCaptureReadyTimeout);
        screenCaptureFirstFrameReady.set(false);
        reshareWaiting = true;
        reshareInProgress = false;
        reshareFinishing = false;
        capturedContentVisible = false;
        hostWaitActive = false;
        hostWaitGeneration++;
        cancelHostWaitAnimator();
        if (reshareWaitingView != null) reshareWaitingView.setCardOpacity(1f);
        if (studioOverlayView != null) studioOverlayView.pauseVideoPlayback();

        // Detach the projection producer, but retain the encoder Surface/GL objects and RTMP encoders.
        if (directScreenCaptureVideoSource != null) {
            directScreenCaptureVideoSource.suspendProjection(stoppedGeneration);
        } else if (screenCaptureLayerRequired) {
            synchronized (screenCaptureLock) {
                if (screenCaptureSurfaceTexture != null) {
                    try { screenCaptureSurfaceTexture.setOnFrameAvailableListener(null); } catch (RuntimeException ignored) { }
                }
                VirtualDisplay oldDisplay = screenCaptureVirtualDisplay;
                screenCaptureVirtualDisplay = null;
                screenCaptureGuard.close();
                screenCaptureGuard = new ModeBProjectionLayerGuard();
                if (oldDisplay != null) {
                    try { oldDisplay.release(); } catch (RuntimeException ignored) { }
                }
            }
        }

        MediaProjection oldProjection = mediaProjection;
        MediaProjection.Callback oldCallback = projectionCallback;
        mediaProjection = null;
        projectionCallback = null;
        projectionGeneration = stoppedGeneration + 1L;
        if (oldProjection != null && oldCallback != null) {
            try { oldProjection.unregisterCallback(oldCallback); } catch (RuntimeException ignored) { }
        }

        // Internal and mixed playback capture depend on the expired projection. Replace it with
        // paced silence so RootEncoder does not keep reading a revoked AudioRecord in its loop.
        if (ModeBAudioResharePolicy.shouldSilenceForProjectionLoss(activeAudioRoute,
                audioSilencedForReshare)) {
            try {
                RtmpStream current = stream;
                if (current == null) throw new IllegalStateException("Encoder audio tidak tersedia.");
                AudioSource waitingAudio = shouldPlayScreensaverAudio()
                        ? new ModeBScreensaverAudioSource(screensaverAudioQueue)
                        : new SilenceAudioSource();
                replaceAudioSourceSafely(current, waitingAudio);
                audioSilencedForReshare = true;
            } catch (RuntimeException audioFailure) {
                endSession("error", "Sumber audio tidak dapat diamankan setelah berbagi layar terputus: "
                        + safeMessage(audioFailure, "audio capture gagal dilepas."));
                return;
            }
        }

        try {
            ensureReshareWaitingFilterAttached();
        } catch (RuntimeException renderFailure) {
            endSession("error", "Kartu pemulihan layar tidak dapat ditampilkan: "
                    + safeMessage(renderFailure, "renderer tidak tersedia."));
            return;
        }

        showReshareFloatingControl();
        updateStreamingNotification("LIVE berjalan · menunggu layar dibagikan kembali");
        String waitingMessage = "LIVE tetap berjalan. Bagikan layar lagi untuk melanjutkan tampilan.";
        if (audioSilencedForReshare) waitingMessage += " Audio internal/campuran dibisukan sementara.";
        else waitingMessage += " Audio mikrofon tetap berjalan.";
        publish("reshare_waiting", waitingMessage, true, latestConnectedBitrateKbps);
    }

    private void showReshareFloatingControl() {
        if (reshareFloatingOverlay == null) reshareFloatingOverlay = new ModeBReshareFloatingOverlay(getApplicationContext());
        reshareFloatingOverlay.show("Bagikan layar lagi", () -> {
            hideReshareFloatingControlInternal();
            try {
                Intent activity = new Intent(this, ModeBReshareActivity.class);
                activity.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(activity);
            } catch (RuntimeException activityFailure) {
                showReshareFloatingControl();
                publish("reshare_waiting", "LIVE tetap berjalan. Buka SYNTXRR lalu tekan Bagikan Layar Lagi untuk melanjutkan.",
                        true, latestConnectedBitrateKbps);
            }
        });
    }

    private void hideReshareFloatingControlInternal() {
        if (reshareFloatingOverlay != null) reshareFloatingOverlay.hide();
    }

    private void ensureReshareWaitingFilterAttached() {
        String title = screensaverPolicy.enabled ? screensaverPolicy.text : "LIVE tetap berjalan";
        String detail = reshareWaiting ? "Bagikan layar lagi untuk melanjutkan tampilan." : "";
        if (reshareWaitingView == null) {
            reshareWaitingView = new ModeBReshareWaitingView(getApplicationContext(), title, detail,
                    screensaverPolicy.enabled ? screensaverPolicy.mediaAssetId : "", screensaverPolicy.mediaType,
                    activeScreensaverAssetNamespace, getOrCreateVisualWorker(), bitmapBudget,
                    screensaverAudioQueue);
        } else {
            reshareWaitingView.setCardMessage(title, detail);
        }
        if (reshareWaitingFilter != null) return;
        RtmpStream current = stream;
        if (current == null) throw new IllegalStateException("Encoder RTMP sudah tidak tersedia.");
        ModeBSceneReplacementFilter waitingFilter = createSceneReplacementFilter();
        waitingFilter.setScale(100f, 100f);
        waitingFilter.setPosition(0f, 0f);
        waitingFilter.setTargetFps(screensaverPolicy.enabled
                ? Math.max(1, Math.min(30, streamOutputFps)) : 2);
        waitingFilter.setView(reshareWaitingView);
        long generation = ++hostWaitGeneration;
        boolean fadeIn = screensaverPolicy.enabled && screensaverPolicy.enterDurationMs > 0;
        reshareWaitingView.setCardOpacity(fadeIn ? 0f : 1f);
        if (fadeIn) {
            waitingFilter.setNextOutputFrameListener(() -> MAIN.post(() -> {
                if (generation != hostWaitGeneration || !reshareWaiting || reshareWaitingFilter != waitingFilter) return;
                animateHostWaitOpacity(0f, 1f, screensaverPolicy.enterDurationMs, generation, () -> {
                    if (generation == hostWaitGeneration && reshareWaiting) {
                        publish("reshare_waiting", "LIVE tetap berjalan. " + screensaverPolicy.text
                                + " Bagikan layar lagi untuk melanjutkan tampilan." + screensaverPolicy.runtimeNotice(),
                                true, latestConnectedBitrateKbps);
                    }
                });
            }));
        }
        reshareWaitingFilter = waitingFilter;
        current.getGlInterface().addFilter(waitingFilter);
    }

    private void reattachProjectionAndResume(Intent intent) {
        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        RtmpStream current = stream;
        if (!ModeBResharePolicy.canAcceptReshare(reshareWaiting, reshareInProgress,
                stopRequested.get(), cleanedUp.get(), resultCode, resultData != null,
                current != null && current.isStreaming())) {
            throw new IllegalStateException("Sesi tidak sedang menunggu izin berbagi layar baru.");
        }
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (manager == null) throw new IllegalStateException("Layanan MediaProjection tidak tersedia.");
        MediaProjection newProjection = manager.getMediaProjection(resultCode, resultData);
        if (newProjection == null) throw new IllegalStateException("Android tidak memberikan MediaProjection baru.");

        hideReshareFloatingControlInternal();
        final long newGeneration = ++projectionGeneration;
        mediaProjection = newProjection;
        // Treat the newly consented capture as visible until Android reports otherwise.
        // A single-app visibility callback can arrive while reshare is still attaching the
        // VirtualDisplay; keep that latest value instead of overwriting it on completion.
        capturedContentVisible = true;
        projectionCallback = new MediaProjection.Callback() {
            @Override public void onStop() {
                MAIN.post(() -> onProjectionStopped(newGeneration));
            }
            @Override public void onCapturedContentVisibilityChanged(boolean isVisible) {
                if (Build.VERSION.SDK_INT >= 34) {
                    MAIN.post(() -> handleCapturedContentVisibility(newGeneration, isVisible));
                }
            }
        };
        newProjection.registerCallback(projectionCallback, MAIN);
        reshareInProgress = true;
        reshareFinishing = false;
        screenCaptureFirstFrameReady.set(false);

        // Resume projection-backed audio from the fresh consent token before waiting for the
        // first screen frame. Mix may use the documented microphone fallback; Internal never does.
        if (ModeBAudioResharePolicy.shouldRestoreAfterReshare(activeAudioRoute,
                audioSilencedForReshare)) {
            try {
                if ("internal".equals(activeAudioRoute)) {
                    replaceAudioSourceSafely(current, new ModeBSafeInternalAudioSource(newProjection, screensaverAudioQueue));
                    audioSilencedForReshare = false;
                } else if (ModeBAudioResharePolicy.allowsMicrophoneFallback(activeAudioRoute)) {
                    try {
                        replaceAudioSourceSafely(current, new ModeBSafeMixAudioSource(newProjection, screensaverAudioQueue));
                        audioSilencedForReshare = false;
                    } catch (RuntimeException mixFailure) {
                        if (!ModeBAudioSourceSwap.isRecoverySafe(mixFailure)) throw mixFailure;
                        replaceAudioSourceSafely(current, new ModeBSafeMicrophoneSource(screensaverAudioQueue));
                        activeAudioRoute = "microphone";
                        audioSilencedForReshare = false;
                        publish("resharing", "Audio capture sistem tidak tersedia pada izin baru; melanjutkan dengan mikrofon sesuai fallback Mode Campuran.", true, latestConnectedBitrateKbps);
                    }
                }
            } catch (RuntimeException audioFailure) {
                // If failed-candidate cleanup is uncertain, do not keep an encoder alive with
                // a possibly orphaned AudioRecord/MediaProjection callback. Clean failure may
                // return to waiting; uncertain cleanup fails closed and ends this session.
                if (!ModeBAudioSourceSwap.isRecoverySafe(audioFailure)) {
                    endSession("error", "Pembersihan sumber audio gagal saat pemulihan layar: "
                            + safeMessage(audioFailure, "resource audio tidak dapat dipastikan bersih."));
                } else {
                    // Internal mode is never silently converted to microphone.
                    returnReshareToWaiting(newGeneration,
                            "Izin layar baru diterima, tetapi audio internal belum dapat dipulihkan. LIVE tetap berjalan; coba Bagikan Layar Lagi.");
                }
                return;
            }
        }

        if (screenCaptureLayerRequired) {
            if (captureEngine == ModeBCaptureEnginePolicy.Engine.DIRECT_SCREEN_SOURCE) {
                if (directScreenCaptureVideoSource == null) throw new IllegalStateException("Direct screen source tidak tersedia untuk reshare.");
                directScreenCaptureVideoSource.reattachProjection(newProjection, newGeneration);
            } else if (captureEngine == ModeBCaptureEnginePolicy.Engine.COMPATIBILITY_OBJECT_LAYER) {
                attachFreshProjectionToCompatibilityLayer(newProjection, newGeneration);
            } else {
                throw new IllegalStateException("Capture engine aktif tidak mendukung reshare.");
            }
            MAIN.removeCallbacks(reshareFrameTimeout);
            MAIN.postDelayed(reshareFrameTimeout, SCREEN_CAPTURE_READY_TIMEOUT_MS);
        } else {
            screenCaptureFirstFrameReady.set(true);
            finishReshareAfterFirstFrame();
        }
        publish("resharing", "Izin baru diterima. Menyambungkan layar ke sesi LIVE yang sama…", true, latestConnectedBitrateKbps);
    }

    private void attachFreshProjectionToCompatibilityLayer(MediaProjection projection, long generation) {
        synchronized (screenCaptureLock) {
            if (stopRequested.get() || cleanedUp.get() || projection != mediaProjection) {
                throw new IllegalStateException("Sesi berubah sebelum layar baru dipasang.");
            }
            if (screenCaptureFilterRender == null || screenCaptureSurfaceTexture == null) {
                throw new IllegalStateException("Surface compatibility compositor tidak tersedia untuk reshare.");
            }
            if (!screenCaptureGuard.tryBeginCreation()) {
                throw new IllegalStateException("VirtualDisplay sebelumnya belum siap dilepas.");
            }
            Surface surface = screenCaptureFilterRender.getSurface();
            if (surface == null || !surface.isValid()) throw new IllegalStateException("Surface screen capture tidak valid.");
            SurfaceTexture texture = screenCaptureSurfaceTexture;
            texture.setDefaultBufferSize(screenCaptureLayerWidth, screenCaptureLayerHeight);
            texture.setOnFrameAvailableListener(frameSource -> {
                if (generation != projectionGeneration || stopRequested.get()) return;
                if (screenCaptureFirstFrameReady.compareAndSet(false, true)) {
                    MAIN.removeCallbacks(reshareFrameTimeout);
                    finishReshareAfterFirstFrame();
                }
            }, MAIN);
            screenCaptureVirtualDisplay = projection.createVirtualDisplay(
                    "SYNTXRR_Mode_B_Compositor_Reshare", screenCaptureLayerWidth, screenCaptureLayerHeight,
                    getResources().getDisplayMetrics().densityDpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, surface,
                    new VirtualDisplay.Callback() {
                        @Override public void onStopped() {
                            MAIN.post(() -> onProjectionStopped(generation));
                        }
                    }, MAIN);
            if (screenCaptureVirtualDisplay == null) throw new IllegalStateException("Android gagal membuat VirtualDisplay baru.");
        }
    }

    private void finishReshareAfterFirstFrame() {
        if (!reshareInProgress || reshareFinishing || stopRequested.get()) return;
        if (screenCaptureLayerRequired && !screenCaptureFirstFrameReady.get()) return;
        reshareFinishing = true;
        MAIN.removeCallbacks(reshareFrameTimeout);
        ModeBSceneReplacementFilter waitingFilter = reshareWaitingFilter;
        if (waitingFilter == null) {
            completeReshareAfterWaitingFilterReleased();
            return;
        }
        long generation = ++hostWaitGeneration;
        Runnable retireWaitingFilter = () -> {
            if (generation != hostWaitGeneration || !reshareInProgress || stopRequested.get()) return;
            waitingFilter.setOnReleasedListener(() -> MAIN.post(() -> {
                if (reshareWaitingFilter != waitingFilter || stopRequested.get()) return;
                waitingFilter.setView(null);
                reshareWaitingFilter = null;
                if (reshareWaiting) {
                    try { ensureReshareWaitingFilterAttached(); }
                    catch (RuntimeException ignored) { endSession("error", "Kartu pemulihan layar gagal dipasang kembali."); }
                    return;
                }
                if (reshareWaitingView != null) reshareWaitingView.releaseMedia();
                reshareWaitingView = null;
                completeReshareAfterWaitingFilterReleased();
            }));
            waitingFilter.setNextOutputFrameListener(() -> {
                if (generation != hostWaitGeneration || !reshareInProgress) return;
                try {
                    RtmpStream current = stream;
                    if (current == null || cleanedUp.get()) return;
                    current.getGlInterface().removeFilter(waitingFilter);
                } catch (RuntimeException removeFailure) {
                    waitingFilter.setOnReleasedListener(null);
                    reshareFinishing = false;
                    returnReshareToWaiting(projectionGeneration,
                            "Layar baru siap, tetapi kartu pemulihan belum dapat dilepas. LIVE tetap menunggu; coba lagi.");
                }
            });
        };
        if (screensaverPolicy.enabled && screensaverPolicy.exitDurationMs > 0) {
            animateHostWaitOpacity(1f, 0f, screensaverPolicy.exitDurationMs, generation, retireWaitingFilter);
        } else {
            retireWaitingFilter.run();
        }
    }

    private void completeReshareAfterWaitingFilterReleased() {
        if (stopRequested.get() || !reshareInProgress) return;
        reshareWaiting = false;
        reshareInProgress = false;
        reshareFinishing = false;
        hostWaitActive = false;
        hostWaitGeneration++;
        if (hostWaitAnimator != null) { try { hostWaitAnimator.cancel(); } catch (RuntimeException ignored) { } }
        hostWaitAnimator = null;
        audioSilencedForReshare = false;
        hideReshareFloatingControlInternal();
        if (studioOverlayView != null) studioOverlayView.startVideoPlayback();
        updateStreamingNotification("LIVE · layar tersambung kembali");
        if (screensaverPolicy.enabled) showHostWaitFloatingControl();
        String message = "Layar berhasil dibagikan kembali. Sesi RTMP yang sama tetap berjalan." + screensaverPolicy.runtimeNotice();
        if (studioOverlayView != null) message += " " + studioOverlayView.getRenderSummary();
        publish("live", message, true, latestConnectedBitrateKbps);
        // Android may report that the selected single-app target is still outside the
        // foreground while reshare is attaching. The callback is recorded during that
        // phase, then the host-wait card is applied only after the reshare card is retired.
        if (ModeBHostWaitVisibilityPolicy.shouldShowAfterReshare(
                screensaverPolicy.enabled, screenCaptureLayerRequired, capturedContentVisible,
                reshareWaiting, reshareInProgress, stopRequested.get())) {
            setHostWaitFromUser(true);
        }
    }

    private void returnReshareToWaiting(long expectedGeneration, String message) {
        if (expectedGeneration != projectionGeneration || stopRequested.get() || cleanedUp.get()) return;
        MAIN.removeCallbacks(reshareFrameTimeout);
        reshareInProgress = false;
        reshareFinishing = false;
        reshareWaiting = true;
        hostWaitGeneration++;
        cancelHostWaitAnimator();
        if (reshareWaitingView != null) reshareWaitingView.setCardOpacity(1f);
        screenCaptureFirstFrameReady.set(false);
        if (directScreenCaptureVideoSource != null) {
            directScreenCaptureVideoSource.suspendProjection(expectedGeneration);
        } else if (screenCaptureLayerRequired) {
            synchronized (screenCaptureLock) {
                if (screenCaptureSurfaceTexture != null) {
                    try { screenCaptureSurfaceTexture.setOnFrameAvailableListener(null); } catch (RuntimeException ignored) { }
                }
                VirtualDisplay failedDisplay = screenCaptureVirtualDisplay;
                screenCaptureVirtualDisplay = null;
                screenCaptureGuard.close();
                screenCaptureGuard = new ModeBProjectionLayerGuard();
                if (failedDisplay != null) try { failedDisplay.release(); } catch (RuntimeException ignored) { }
            }
        }
        MediaProjection failedProjection = mediaProjection;
        MediaProjection.Callback failedCallback = projectionCallback;
        mediaProjection = null;
        projectionCallback = null;
        projectionGeneration = expectedGeneration + 1L;
        if (failedProjection != null) {
            if (failedCallback != null) try { failedProjection.unregisterCallback(failedCallback); } catch (RuntimeException ignored) { }
            try { failedProjection.stop(); } catch (RuntimeException ignored) { }
        }
        if (ModeBAudioResharePolicy.shouldSilenceForProjectionLoss(activeAudioRoute,
                audioSilencedForReshare)) {
            try {
                RtmpStream current = stream;
                if (current == null) throw new IllegalStateException("Encoder audio tidak tersedia.");
                AudioSource waitingAudio = shouldPlayScreensaverAudio()
                        ? new ModeBScreensaverAudioSource(screensaverAudioQueue)
                        : new SilenceAudioSource();
                replaceAudioSourceSafely(current, waitingAudio);
                audioSilencedForReshare = true;
            } catch (RuntimeException audioFailure) {
                endSession("error", "Audio capture lama tidak dapat diamankan setelah pemulihan gagal: "
                        + safeMessage(audioFailure, "audio capture masih aktif."));
                return;
            }
        }
        showReshareFloatingControl();
        updateStreamingNotification("LIVE berjalan · menunggu layar dibagikan kembali");
        publish("reshare_waiting", message == null ? "LIVE tetap berjalan. Bagikan layar lagi untuk mencoba kembali." : message,
                true, latestConnectedBitrateKbps);
    }

    private void showHostWaitFloatingControl() {
        if (!screensaverPolicy.enabled || reshareWaiting || reshareInProgress || stopRequested.get()) return;
        if (reshareFloatingOverlay == null) reshareFloatingOverlay = new ModeBReshareFloatingOverlay(getApplicationContext());
        reshareFloatingOverlay.show(hostWaitActive ? "Lanjutkan tampilan" : "Jeda · Layar tunggu",
                () -> MAIN.post(() -> setHostWaitFromUser(!hostWaitActive)));
    }

    private void handleCapturedContentVisibility(long expectedGeneration, boolean isVisible) {
        if (expectedGeneration != projectionGeneration || stopRequested.get() || cleanedUp.get()) return;
        capturedContentVisible = isVisible;
        if (!screensaverPolicy.enabled || !screenCaptureLayerRequired || reshareWaiting || reshareInProgress) return;
        if (!isVisible) setHostWaitFromUser(true);
        else if (hostWaitActive) setHostWaitFromUser(false);
    }

    private void setHostWaitFromUser(boolean enabled) {
        if (stopRequested.get() || cleanedUp.get() || !screensaverPolicy.enabled || reshareWaiting || reshareInProgress) return;
        RtmpStream current = stream;
        if (current == null || !sessionWasLive || !current.isStreaming()) return;
        if (enabled && hostWaitActive) return;
        if (!enabled && !hostWaitActive) return;
        if (!enabled && screenCaptureLayerRequired && !capturedContentVisible) {
            showHostWaitFloatingControl();
            publish("host_wait", "Kembali ke aplikasi yang dibagikan untuk melanjutkan tampilan. LIVE tetap berjalan.", true, latestConnectedBitrateKbps);
            updateStreamingNotification("LIVE berjalan · menunggu aplikasi yang dibagikan");
            return;
        }
        if (enabled) {
            hostWaitActive = true;
            long generation = ++hostWaitGeneration;
            try {
                ensureHostWaitFilterAttached();
                reshareWaitingView.setCardOpacity(0f);
                animateHostWaitOpacity(0f, 1f, screensaverPolicy.enterDurationMs, generation, () -> {
                    if (!hostWaitActive || generation != hostWaitGeneration || stopRequested.get()) return;
                    showHostWaitFloatingControl();
                    updateStreamingNotification("LIVE berjalan · layar tunggu aktif");
                    publish("host_wait", screensaverPolicy.text + " · LIVE tetap berjalan." + screensaverPolicy.runtimeNotice(),
                            true, latestConnectedBitrateKbps);
                });
            } catch (RuntimeException renderFailure) {
                hostWaitActive = false;
                publish("live", "Layar tunggu gagal dipasang: " + safeMessage(renderFailure, "renderer tidak tersedia."),
                        true, latestConnectedBitrateKbps);
            }
        } else {
            long generation = ++hostWaitGeneration;
            animateHostWaitOpacity(1f, 0f, screensaverPolicy.exitDurationMs, generation, () -> {
                if (generation != hostWaitGeneration || stopRequested.get()) return;
                retireHostWaitFilter(generation);
            });
        }
    }

    private void ensureHostWaitFilterAttached() {
        if (reshareWaitingFilter != null) {
            if (reshareWaitingView != null) reshareWaitingView.setCardMessage(screensaverPolicy.text, "");
            return;
        }
        RtmpStream current = stream;
        if (current == null) throw new IllegalStateException("Encoder RTMP tidak tersedia.");
        reshareWaitingView = new ModeBReshareWaitingView(getApplicationContext(), screensaverPolicy.text, "",
                screensaverPolicy.enabled ? screensaverPolicy.mediaAssetId : "", screensaverPolicy.mediaType,
                activeScreensaverAssetNamespace, getOrCreateVisualWorker(), bitmapBudget,
                screensaverAudioQueue);
        ModeBSceneReplacementFilter filter = createSceneReplacementFilter();
        filter.setScale(100f, 100f);
        filter.setPosition(0f, 0f);
        filter.setTargetFps(Math.max(1, Math.min(30, streamOutputFps)));
        filter.setView(reshareWaitingView);
        current.getGlInterface().addFilter(filter);
        reshareWaitingFilter = filter;
    }

    private void animateHostWaitOpacity(float from, float to, int durationMs, long generation, Runnable onComplete) {
        cancelHostWaitAnimator();
        ModeBReshareWaitingView view = reshareWaitingView;
        if (view == null) { if (onComplete != null) onComplete.run(); return; }
        if (durationMs <= 0) {
            view.setCardOpacity(to);
            if (onComplete != null) onComplete.run();
            return;
        }
        ValueAnimator animator = ValueAnimator.ofFloat(from, to);
        animator.setDuration(durationMs);
        hostWaitAnimator = animator;
        animator.addUpdateListener(value -> {
            if (generation == hostWaitGeneration && reshareWaitingView == view) {
                view.setCardOpacity((Float) value.getAnimatedValue());
            }
        });
        animator.addListener(new AnimatorListenerAdapter() {
            private boolean cancelled;
            @Override public void onAnimationCancel(Animator animation) { cancelled = true; }
            @Override public void onAnimationEnd(Animator animation) {
                if (hostWaitAnimator == animator) hostWaitAnimator = null;
                if (!cancelled && generation == hostWaitGeneration && onComplete != null) onComplete.run();
            }
        });
        animator.start();
    }

    private void retireHostWaitFilter(long generation) {
        ModeBSceneReplacementFilter filter = reshareWaitingFilter;
        if (filter == null) {
            hostWaitActive = false;
            publish("live", "Tampilan LIVE dilanjutkan.", true, latestConnectedBitrateKbps);
            showHostWaitFloatingControl();
            return;
        }
        filter.setOnReleasedListener(() -> MAIN.post(() -> {
            if (generation != hostWaitGeneration || reshareWaiting) return;
            filter.setView(null);
            if (reshareWaitingFilter == filter) reshareWaitingFilter = null;
            if (reshareWaitingView != null) reshareWaitingView.releaseMedia();
            reshareWaitingView = null;
            hostWaitActive = false;
            showHostWaitFloatingControl();
            updateStreamingNotification("LIVE · siaran aktif");
            publish("live", "Tampilan LIVE dilanjutkan.", true, latestConnectedBitrateKbps);
        }));
        filter.setNextOutputFrameListener(() -> {
            if (generation != hostWaitGeneration || reshareWaiting) return;
            try {
                RtmpStream current = stream;
                if (current == null || cleanedUp.get()) return;
                current.getGlInterface().removeFilter(filter);
            } catch (RuntimeException removeFailure) {
                filter.setOnReleasedListener(null);
                showHostWaitFloatingControl();
                publish("host_wait", "Layar tunggu tetap aktif karena renderer belum dapat melepasnya.", true, latestConnectedBitrateKbps);
            }
        });
    }

    private void cancelHostWaitAnimator() {
        ValueAnimator animator = hostWaitAnimator;
        hostWaitAnimator = null;
        if (animator != null) { try { animator.cancel(); } catch (RuntimeException ignored) { } }
    }

    private void updateStreamingNotification(String content) {
        try {
            Intent stopIntent = new Intent(this, ModeBStreamService.class);
            stopIntent.setAction(ACTION_STOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent stopPendingIntent = PendingIntent.getService(this, NOTIFICATION_ID, stopIntent, flags);
            NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.presence_video_online)
                    .setContentTitle("SYNTXRR STREAM · Mode B")
                    .setContentText(content)
                    .setCategory(NotificationCompat.CATEGORY_SERVICE)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true);
            if (reshareWaiting && !reshareInProgress) {
                Intent reshareIntent = new Intent(this, ModeBReshareActivity.class);
                reshareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent resharePendingIntent = PendingIntent.getActivity(this, NOTIFICATION_ID + 1,
                        reshareIntent, flags);
                notificationBuilder.addAction(android.R.drawable.ic_menu_share, "Bagikan layar lagi", resharePendingIntent);
            } else if (screensaverPolicy.enabled && sessionWasLive && (connectionEstablished || hostWaitActive)) {
                Intent waitIntent = new Intent(this, ModeBStreamService.class);
                waitIntent.setAction(ACTION_SET_HOST_WAIT);
                waitIntent.putExtra(EXTRA_HOST_WAIT_ENABLED, !hostWaitActive);
                PendingIntent waitPendingIntent = PendingIntent.getService(this, NOTIFICATION_ID + 2,
                        waitIntent, flags);
                notificationBuilder.addAction(android.R.drawable.ic_media_pause,
                        hostWaitActive ? "Lanjutkan tampilan" : "Jeda · Layar tunggu", waitPendingIntent);
            }
            notificationBuilder.addAction(android.R.drawable.ic_media_pause, "Hentikan", stopPendingIntent);
            Notification notification = notificationBuilder.build();
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.notify(NOTIFICATION_ID, notification);
        } catch (RuntimeException ignored) { }
    }

    private VideoSource createVideoSource(ModeBCaptureEnginePolicy.Engine engine) {
        if (engine != ModeBCaptureEnginePolicy.Engine.DIRECT_SCREEN_SOURCE) {
            directScreenCaptureVideoSource = null;
            return new NoVideoSource();
        }
        final long sourceProjectionGeneration = projectionGeneration;
        ModeBScreenCaptureVideoSource source = new ModeBScreenCaptureVideoSource(
                getApplicationContext(),
                mediaProjection,
                sourceProjectionGeneration,
                surfaceTexture -> {
                    RtmpStream current = stream;
                    if (current != null && !stopRequested.get()) {
                        current.getGlInterface().onFrameAvailable(surfaceTexture);
                    }
                },
                expectedGeneration -> MAIN.post(() -> {
                    if (!ModeBProjectionFramePolicy.shouldAcceptFrame(
                            stopRequested.get(), mediaProjection != null,
                            expectedGeneration, projectionGeneration)) return;
                    screenCaptureFirstFrameReady.set(true);
                    MAIN.removeCallbacks(screenCaptureReadyTimeout);
                    publishLiveWhenProjectionReady();
                }),
                expectedGeneration -> MAIN.post(() -> onProjectionStopped(expectedGeneration))
        );
        directScreenCaptureVideoSource = source;
        return source;
    }

    private boolean shouldPlayScreensaverAudio() {
        return screensaverAudioQueue != null && screensaverPolicy.enabled
                && "video".equals(screensaverPolicy.mediaType)
                && screensaverPolicy.mediaAssetId != null && !screensaverPolicy.mediaAssetId.isEmpty();
    }

    /**
     * RootEncoder 2.8.1 restores the previous AudioSource when a replacement start fails,
     * but it does not stop/release the failed candidate. The internal and Mode B
     * mix source may already have created a HandlerThread, registered a MediaProjection callback,
     * or partially acquired an AudioRecord before throwing. Retire that candidate explicitly.
     */
    private void replaceAudioSourceSafely(RtmpStream target, AudioSource candidate) {
        if (target == null || candidate == null) {
            throw new IllegalArgumentException("Stream dan sumber audio pengganti wajib tersedia.");
        }
        if (!target.isStreaming() || target != stream) {
            throw new IllegalStateException("Sumber audio hanya boleh diganti pada sesi RTMP LIVE yang masih aktif.");
        }
        final long expectedGeneration = streamGeneration;
        final AudioSource previousAudioSource = target.getAudioSource();
        trackAudioSourceForTeardown(candidate);
        boolean replaced = false;
        try {
            ModeBAudioSourceSwap.replace(
                    () -> {
                        target.changeAudioSource(candidate);
                        if (target.getAudioSource() != candidate || !candidate.isRunning()) {
                            throw new IllegalStateException("RootEncoder tidak berhasil mengaktifkan sumber audio pengganti.");
                        }
                    },
                    () -> {
                        Throwable cleanupFailure = null;
                        try { candidate.stop(); } catch (RuntimeException | Error failure) { cleanupFailure = failure; }
                        try { candidate.release(); } catch (RuntimeException | Error failure) {
                            if (cleanupFailure == null) cleanupFailure = failure;
                            else cleanupFailure.addSuppressed(failure);
                        }
                        if (cleanupFailure instanceof RuntimeException) throw (RuntimeException) cleanupFailure;
                        if (cleanupFailure instanceof Error) throw (Error) cleanupFailure;
                    },
                    () -> target.getAudioSource() != null && target.getAudioSource().isRunning(),
                    () -> target == stream && streamGeneration == expectedGeneration && target.isStreaming());
            replaced = true;
        } finally {
            if (replaced) untrackAudioSourceForTeardown(previousAudioSource);
            trackAudioSourceForTeardown(target.getAudioSource());
        }
    }

    private void trackAudioSourceForTeardown(AudioSource source) {
        if (source == null) return;
        for (AudioSource tracked : audioSourcesForTeardown) {
            if (tracked == source) return;
        }
        audioSourcesForTeardown.add(source);
    }

    private void untrackAudioSourceForTeardown(AudioSource source) {
        if (source == null) return;
        for (int i = audioSourcesForTeardown.size() - 1; i >= 0; i--) {
            if (audioSourcesForTeardown.get(i) == source) audioSourcesForTeardown.remove(i);
        }
    }

    private Runnable createAudioSourceTeardownFallback(List<AudioSource> sources) {
        if (sources == null || sources.isEmpty()) return null;
        final List<AudioSource> retainedSources = new ArrayList<>(sources);
        return () -> {
            List<ModeBAudioSourceTeardown.Source> operations = new ArrayList<>();
            for (final AudioSource source : retainedSources) {
                if (source == null) continue;
                operations.add(new ModeBAudioSourceTeardown.Source() {
                    @Override public void stop() { source.stop(); }
                    @Override public void release() { source.release(); }
                });
            }
            ModeBAudioSourceTeardown.run(operations).throwIfFailed();
        };
    }

    /** Creates an app-owned scene filter whose producer failures fail the owning RTMP generation. */
    private ModeBSceneReplacementFilter createSceneReplacementFilter() {
        final long filterGeneration = streamGeneration;
        ModeBSceneReplacementFilter filter = new ModeBSceneReplacementFilter();
        filter.setOnRenderFailureListener(failure -> MAIN.post(() -> {
            if (!ModeBRenderFailurePolicy.shouldEndSession(
                    filterGeneration, streamGeneration, stopRequested.get(), cleanedUp.get())) return;
            String detail = failure == null ? "" : failure.getMessage();
            String message = "Worker render scene gagal dan tidak dapat melanjutkan siaran. Sesi dihentikan "
                    + "untuk melindungi compositor.";
            if (detail != null && !detail.trim().isEmpty()) message += " Detail: " + detail;
            endSession("error", message);
        }));
        return filter;
    }

    private RtmpStream createStream(VideoSource videoSource, AudioSource audioSource, int fps) {
        trackAudioSourceForTeardown(audioSource);
        final long generation = ++streamGeneration;
        ConnectChecker generationCheckedConnectChecker = new ConnectChecker() {
            private boolean isCurrent() { return generation == streamGeneration && !stopRequested.get(); }
            @Override public void onConnectionStarted(String url) {
                if (isCurrent()) ModeBStreamService.this.onConnectionStarted(url);
            }
            @Override public void onConnectionSuccess() {
                if (isCurrent()) ModeBStreamService.this.onConnectionSuccess();
            }
            @Override public void onConnectionFailed(String reason) {
                if (isCurrent()) ModeBStreamService.this.onConnectionFailed(reason);
            }
            @Override public void onDisconnect() {
                if (isCurrent()) ModeBStreamService.this.onDisconnect();
            }
            @Override public void onAuthError() {
                if (isCurrent()) ModeBStreamService.this.onAuthError();
            }
            @Override public void onAuthSuccess() {
                if (isCurrent()) ModeBStreamService.this.onAuthSuccess();
            }
            @Override public void onNewBitrate(long bitrate) {
                if (isCurrent()) ModeBStreamService.this.onNewBitrate(bitrate);
            }
        };
        RtmpStream created = new RtmpStream(
                getApplicationContext(),
                generationCheckedConnectChecker,
                videoSource,
                audioSource
        );
        // This app accepts RTMP/RTMPS only. Use the RTMP-specific client so the
        // post-publish read-failure and ping controls are not hidden by GenericStreamClient.
        // A short retry budget handles transient Wi-Fi/mobile handoffs without
        // retrying indefinitely or hiding authentication failures.
        final RtmpStreamClient rtmpClient = created.getStreamClient();
        ModeBRtmpRecoveryPolicy.configure(new ModeBRtmpRecoveryPolicy.ClientSettings() {
            @Override public void setRetries(int count) { rtmpClient.setReTries(count); }
            @Override public void setFailOnRead(boolean enabled) { rtmpClient.shouldFailOnRead(enabled); }
            @Override public void setSendPings(boolean enabled) { rtmpClient.shouldSendPings(enabled); }
        });
        created.getGlInterface().setForceRender(true, fps);
        created.getGlInterface().setRenderErrorCallback(error -> MAIN.post(() -> {
            if (!ModeBRenderFailurePolicy.shouldEndSession(
                    generation, streamGeneration, stopRequested.get(), cleanedUp.get())) return;
            String detail = error == null ? "" : error.getMessage();
            String message = "Renderer GL gagal dan tidak dapat melanjutkan siaran. Sesi dihentikan "
                    + "untuk melindungi compositor.";
            if (detail != null && !detail.trim().isEmpty()) message += " Detail: " + detail;
            endSession("error", message);
        }));
        return created;
    }

    private boolean isAudioStartFailure(Throwable error) {
        return ModeBStreamPolicy.isAudioStartFailure(error);
    }

    /** Adds the local preset background first so every later object is composited above it. */
    private void attachBackgroundLayer(String assetId, int width, int height) {
        if (assetId == null || assetId.trim().isEmpty()) return;
        if (!ModeBStreamPolicy.isValidOverlayAssetId(assetId)) {
            throw new IllegalArgumentException("ID aset background preset tidak valid.");
        }
        studioBackgroundView = new StudioBackgroundView(getApplicationContext(), width, height, assetId, activeBackgroundAssetNamespace, bitmapBudget);
        if (!studioBackgroundView.isReady()) {
            String failure = studioBackgroundView.getFailure();
            studioBackgroundView.releaseBitmap();
            studioBackgroundView = null;
            throw new IllegalStateException(failure == null || failure.isEmpty()
                    ? "Background preset gagal dimuat." : failure);
        }
        int widthSpec = View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY);
        int heightSpec = View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY);
        studioBackgroundView.measure(widthSpec, heightSpec);
        studioBackgroundView.layout(0, 0, width, height);
        backgroundFilterRender = createSceneReplacementFilter();
        liveSceneLayerOpacityState = new ModeBSceneLayerOpacityState();
        studioBackgroundView.bindSceneOpacityState(liveSceneLayerOpacityState);
        backgroundFilterRender.bindSceneLayerOpacityState(
                liveSceneLayerOpacityState, ModeBSceneLayerOpacityState.ROLE_BACKGROUND);
        backgroundFilterRender.setScale(100f, 100f);
        backgroundFilterRender.setPosition(0f, 0f);
        // The bitmap itself is static. Scene-wide opacity is applied by the GL shader per output
        // pass, so this source can remain at 1 fps without slowing or stepping its fade transition.
        backgroundFilterRender.setTargetFps(1);
        backgroundFilterRender.setView(studioBackgroundView);
        stream.getGlInterface().addFilter(backgroundFilterRender);
        nextFilterPosition++;
    }

    /** Adds the MediaProjection output as a movable/resizable GL object layer. */
    private void attachScreenCaptureLayer(ModeBScreenCaptureLayerSpec spec, int width, int height) {
        screenCaptureLayerRequired = spec != null && spec.enabled && spec.opacity > 0f;
        if (!screenCaptureLayerRequired) {
            captureLayerNotice = "Elemen Tangkapan Layar disembunyikan; output tidak memuat gambar layar.";
            return;
        }
        if (captureEngine == ModeBCaptureEnginePolicy.Engine.DIRECT_SCREEN_SOURCE) {
            captureLayerNotice = "Screen capture memakai direct source; overlay Studio dirender di atas layar.";
            return;
        }
        if (captureEngine != ModeBCaptureEnginePolicy.Engine.COMPATIBILITY_OBJECT_LAYER) {
            throw new IllegalStateException("Engine Tangkapan Layar Mode B tidak dapat ditentukan.");
        }
        screenCaptureFilterRender = new SurfaceFilterRender(
                surfaceTexture -> createScreenCaptureVirtualDisplay(surfaceTexture, width, height));
        screenCaptureFilterRender.setAlpha(spec.opacity / 100f);

        // RootEncoder draws a full-screen quad and transforms the object UV coordinates. For
        // quarter turns, Fit must use the rotated source aspect while keeping the fitted output
        // rectangle at the Studio element's own x/y/width/height. Arbitrary angles are rejected
        // because the current normalized-UV sprite cannot preserve pixel geometry on all canvases.
        ModeBScreenCaptureGeometry.Result geometry = ModeBScreenCaptureGeometry.fit(width, height, spec);
        screenCaptureFilterRender.setScale(geometry.scaleXPercent, geometry.scaleYPercent);
        screenCaptureFilterRender.setPosition(geometry.positionXPercent, geometry.positionYPercent);
        screenCaptureFilterRender.setRotation(geometry.spriteRotation);
        // Added after the optional background and before the aggregated Studio overlay.
        stream.getGlInterface().addFilter(screenCaptureFilterRender);
        nextFilterPosition++;
        captureLayerNotice = "Screen capture memakai compatibility object layer agar mengikuti transformasi Studio.";
    }

    /**
     * SurfaceFilterRender creates and owns this SurfaceTexture/Surface on RootEncoder's GL
     * thread, then calls us on main. Reuse that exact Surface: one projection token, one
     * VirtualDisplay, no second screen-capture session and no duplicate producer Surface.
     */
    private void createScreenCaptureVirtualDisplay(SurfaceTexture surfaceTexture, int width, int height) {
        String failureMessage = null;
        synchronized (screenCaptureLock) {
            if (stopRequested.get() || cleanedUp.get() || mediaProjection == null) return;
            if (!screenCaptureGuard.tryBeginCreation()) return;
            try {
                if (screenCaptureFilterRender == null || surfaceTexture == null) {
                    throw new IllegalStateException("Surface GL untuk Tangkapan Layar belum siap.");
                }
                screenCaptureSurfaceTexture = surfaceTexture;
                screenCaptureLayerWidth = width;
                screenCaptureLayerHeight = height;
                Surface surface = screenCaptureFilterRender.getSurface();
                if (surface == null || !surface.isValid()) {
                    throw new IllegalStateException("Surface GL Tangkapan Layar tidak valid.");
                }
                surfaceTexture.setDefaultBufferSize(width, height);
                screenCaptureFirstFrameReady.set(false);
                final long expectedProjectionGeneration = projectionGeneration;
                surfaceTexture.setOnFrameAvailableListener(frameSource -> {
                    if (expectedProjectionGeneration != projectionGeneration || stopRequested.get()) return;
                    if (screenCaptureFirstFrameReady.compareAndSet(false, true)) {
                        MAIN.removeCallbacks(screenCaptureReadyTimeout);
                        if (reshareInProgress) finishReshareAfterFirstFrame();
                        else publishLiveWhenProjectionReady();
                    }
                }, MAIN);
                int densityDpi = getResources().getDisplayMetrics().densityDpi;
                screenCaptureVirtualDisplay = mediaProjection.createVirtualDisplay(
                        "SYNTXRR_Mode_B_Compositor",
                        width,
                        height,
                        densityDpi,
                        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                        surface,
                        new VirtualDisplay.Callback() {
                            @Override public void onStopped() {
                                MAIN.post(() -> onProjectionStopped(expectedProjectionGeneration));
                            }
                        },
                        MAIN
                );
                if (screenCaptureVirtualDisplay == null) {
                    throw new IllegalStateException("Android gagal membuat VirtualDisplay untuk layer Tangkapan Layar.");
                }
            } catch (RuntimeException exception) {
                failureMessage = "Gagal menghubungkan MediaProjection ke compositor: "
                        + safeMessage(exception, "periksa izin berbagi layar Android.");
            }
        }
        if (failureMessage != null) {
            endSession("error", failureMessage);
        }
        // Do not publish LIVE here. The first real projection buffer callback is the
        // readiness boundary and will cancel the timeout after SurfaceTexture receives it.
    }

    /** Adds the aggregate Studio overlay as one stable GL filter slot. */
    private void attachStudioOverlay(String overlayJson, int width, int height, int fps) {
        studioOverlayView = new StudioOverlayView(getApplicationContext(), width, height, overlayJson, bitmapBudget,
                activeSceneAssetNamespace, getOrCreateVisualWorker());
        synchronized (pendingOverlayEvents) {
            while (!pendingOverlayEvents.isEmpty()) studioOverlayView.addLiveEvent(pendingOverlayEvents.removeFirst());
        }

        try {
            if (liveSceneLayerOpacityState == null) {
                liveSceneLayerOpacityState = new ModeBSceneLayerOpacityState();
            }
            studioOverlayView.bindSceneOpacityState(liveSceneLayerOpacityState);
            int widthSpec = View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY);
            int heightSpec = View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY);
            studioOverlayView.measure(widthSpec, heightSpec);
            studioOverlayView.layout(0, 0, width, height);

            overlayFilterRender = createSceneReplacementFilter();
            overlayFilterRender.bindSceneLayerOpacityState(liveSceneLayerOpacityState,
                    backgroundFilterRender != null
                            ? ModeBSceneLayerOpacityState.ROLE_OVERLAY
                            : ModeBSceneLayerOpacityState.ROLE_SINGLE);
            overlayFilterRender.setScale(100f, 100f);
            overlayFilterRender.setPosition(0f, 0f);
            overlayFilterRender.setTargetFps(Math.max(1, Math.min(30, fps)));
            overlayFilterRender.setView(studioOverlayView);
            overlayFilterPosition = nextFilterPosition;
            stream.getGlInterface().addFilter(overlayFilterRender);
            nextFilterPosition++;
            overlayNotice = studioOverlayView.getRenderSummary();
        } catch (Exception exception) {
            if (overlayFilterRender != null) {
                try { overlayFilterRender.setView(null); } catch (Exception ignored) { }
            }
            overlayFilterRender = null;
            overlayFilterPosition = -1;
            overlayNotice = "Overlay Studio gagal diinisialisasi; siaran layar tetap berjalan tanpa elemen Studio.";
            if (studioOverlayView != null) studioOverlayView.releaseAssets();
            studioOverlayView = null;
        }
    }

    private void replaceLiveOverlaySceneOnMain(String overlayJson, String backgroundAssetId,
            String nextBackgroundAssetNamespace, String screenCaptureLayerJson, String nextAssetNamespace,
            String nextScreensaverAssetNamespace, String screensaverJson, int transitionOutDurationMs,
            int transitionInDurationMs, SceneReplacementCallback callback) {
        if (callback == null) return;
        final java.util.concurrent.atomic.AtomicBoolean callbackDelivered = new java.util.concurrent.atomic.AtomicBoolean(false);
        final SceneReplacementCallback resultCallback = new SceneReplacementCallback() {
            @Override public void onResult(boolean success, String message) {
                if (callbackDelivered.compareAndSet(false, true)) callback.onResult(success, message);
            }
        };
        String incomingScreensaverNamespace = nextScreensaverAssetNamespace == null
                ? "" : nextScreensaverAssetNamespace.trim();
        // Do not overwrite the in-flight request's namespace before rejecting a second request.
        // The first scene may still be decoding from that directory; deleting/losing its handle
        // here would race the active staging transaction.
        if (sceneReplacementPending) {
            if (ModeBAssetNamespace.isValid(nextAssetNamespace)
                    && !nextAssetNamespace.equals(pendingSceneAssetNamespace)
                    && !nextAssetNamespace.equals(activeSceneAssetNamespace)) {
                ModeBAssetNamespace.deleteNamespace(getApplicationContext(), nextAssetNamespace);
            }
            String incomingBackground = nextBackgroundAssetNamespace == null ? "" : nextBackgroundAssetNamespace.trim();
            if (ModeBAssetNamespace.isValid(incomingBackground)
                    && !incomingBackground.equals(pendingBackgroundAssetNamespace)
                    && !incomingBackground.equals(activeBackgroundAssetNamespace)) {
                ModeBAssetNamespace.deleteNamespace(getApplicationContext(), incomingBackground);
            }
            if (ModeBAssetNamespace.isValid(incomingScreensaverNamespace)
                    && !incomingScreensaverNamespace.equals(pendingScreensaverAssetNamespace)
                    && !incomingScreensaverNamespace.equals(activeScreensaverAssetNamespace)) {
                ModeBAssetNamespace.deleteNamespace(getApplicationContext(), incomingScreensaverNamespace);
            }
            resultCallback.onResult(false, "Pergantian scene sebelumnya masih diproses. Tunggu hingga selesai.");
            return;
        }
        pendingScreensaverAssetNamespace = incomingScreensaverNamespace;
        final ModeBScreensaverPolicy nextScreensaverPolicy;
        try {
            nextScreensaverPolicy = ModeBScreensaverPolicy.fromJson(screensaverJson);
        } catch (RuntimeException invalidScreensaver) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundAssetNamespace, resultCallback,
                    safeMessage(invalidScreensaver, "Pengaturan layar tunggu preset baru tidak valid."));
            return;
        }
        if (nextScreensaverPolicy.mediaRequested && !ModeBAssetNamespace.isValid(pendingScreensaverAssetNamespace)) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundAssetNamespace, resultCallback,
                    "Namespace media layar tunggu preset baru tidak valid.");
            return;
        }
        if (!pendingScreensaverAssetNamespace.isEmpty() && !ModeBAssetNamespace.isValid(pendingScreensaverAssetNamespace)) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundAssetNamespace, resultCallback,
                    "Namespace media layar tunggu preset baru tidak valid.");
            return;
        }
        if (!ModeBPresetTransitionPolicy.isDurationValid(transitionOutDurationMs)
                || !ModeBPresetTransitionPolicy.isDurationValid(transitionInDurationMs)) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundAssetNamespace, resultCallback,
                    "Durasi transisi preset tidak valid.");
            return;
        }
        String nextBackgroundId = backgroundAssetId == null ? "" : backgroundAssetId.trim();
        String nextBackgroundNamespace = nextBackgroundAssetNamespace == null ? "" : nextBackgroundAssetNamespace.trim();
        if (stopRequested.get() || cleanedUp.get() || stream == null || !lastStreaming
                || !"live".equals(lastStatus)) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                    "Pergantian scene hanya tersedia saat Mode B sudah LIVE dan compositor aktif.");
            return;
        }
        if (overlayFilterPosition < 0 || overlayFilterRender == null || studioOverlayView == null
                || overlayFilterPosition >= stream.getGlInterface().filtersCount()) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                    "Slot overlay native belum siap untuk mengganti scene.");
            return;
        }
        if (!ModeBAssetNamespace.isValid(nextAssetNamespace)
                || nextAssetNamespace.equals(activeSceneAssetNamespace)) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                    "Namespace aset scene baru tidak valid atau masih dipakai scene LIVE lama.");
            return;
        }

        final boolean activeHasBackground = activeBackgroundAssetId != null && !activeBackgroundAssetId.isEmpty();
        final boolean activeHasBackgroundNamespace = activeBackgroundAssetNamespace != null
                && !activeBackgroundAssetNamespace.isEmpty();
        if (!ModeBBackgroundReplacementPolicy.hasConsistentActiveState(activeHasBackground,
                activeHasBackgroundNamespace, studioBackgroundView != null, backgroundFilterRender != null)
                || (activeHasBackground && !ModeBAssetNamespace.isValid(activeBackgroundAssetNamespace))) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                    "Status background LIVE tidak konsisten. Hentikan LIVE lalu mulai ulang sebelum mengganti preset.");
            return;
        }

        final boolean backgroundChanged = !activeBackgroundAssetId.equals(nextBackgroundId);
        if (!backgroundChanged && !nextBackgroundNamespace.isEmpty()) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                    "Background yang sama tidak memerlukan namespace staging baru.");
            return;
        }
        if (backgroundChanged && (!ModeBBackgroundReplacementPolicy.canReplace(
                captureEngine == ModeBCaptureEnginePolicy.Engine.DIRECT_SCREEN_SOURCE,
                !activeBackgroundAssetId.isEmpty(), !nextBackgroundId.isEmpty())
                || (captureEngine == ModeBCaptureEnginePolicy.Engine.DIRECT_SCREEN_SOURCE && !nextBackgroundId.isEmpty()))) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                    "Background hanya dapat diganti LIVE pada jalur compositor berlapis. Hentikan LIVE untuk mengubah background pada sesi direct screen source.");
            return;
        }
        if (backgroundChanged && !nextBackgroundId.isEmpty()
                && (!ModeBAssetNamespace.isValid(nextBackgroundNamespace)
                || nextBackgroundNamespace.equals(activeBackgroundAssetNamespace)
                || nextBackgroundNamespace.equals(activeSceneAssetNamespace))) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                    "Namespace background baru tidak valid atau masih dipakai aset aktif.");
            return;
        }
        if ((!backgroundChanged || nextBackgroundId.isEmpty()) && !nextBackgroundNamespace.isEmpty()) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                    "Namespace background tidak sesuai dengan background preset tujuan.");
            return;
        }
        final ModeBScreenCaptureLayerSpec nextCaptureSpec;
        try {
            nextCaptureSpec = ModeBScreenCaptureLayerSpec.fromJson(screenCaptureLayerJson);
        } catch (RuntimeException exception) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                    "Konfigurasi screen capture scene baru tidak valid.");
            return;
        }
        ModeBCaptureEnginePolicy.Engine requestedEngine =
                ModeBCaptureEnginePolicy.resolve(nextCaptureSpec, !nextBackgroundId.isEmpty());
        boolean sameCaptureConfiguration = activeCaptureSpec != null
                && activeCaptureSpec.hasSameConfiguration(nextCaptureSpec);
        boolean engineCanRemainStable = captureEngine == ModeBCaptureEnginePolicy.Engine.COMPATIBILITY_OBJECT_LAYER
                ? ModeBBackgroundReplacementPolicy.canKeepCompatibilityEngine(sameCaptureConfiguration, true)
                : requestedEngine == captureEngine;
        if (!sameCaptureConfiguration || !engineCanRemainStable) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                    "Scene baru harus mempertahankan konfigurasi screen capture yang sedang LIVE dan tidak boleh memaksa pergantian engine.");
            return;
        }

        final String boundedJson = overlayJson == null || overlayJson.trim().isEmpty() ? "[]" : overlayJson;
        if (boundedJson.length() > 128_000) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                    "Snapshot overlay scene terlalu besar untuk diganti saat LIVE.");
            return;
        }
        boolean reuseCameraOwner = false;
        try {
            org.json.JSONArray array = new org.json.JSONArray(boundedJson);
            java.util.ArrayList<String> types = new java.util.ArrayList<>();
            for (int index = 0; index < array.length(); index++) {
                org.json.JSONObject element = array.optJSONObject(index);
                if (element == null) {
                    rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                            "Data elemen scene baru tidak valid.");
                    return;
                }
                if (!element.optBoolean("visible", true)) continue;
                types.add(element.optString("type", ""));
            }
            if (!ModeBLiveScenePolicy.supportsStaticOverlayTypes(types)) {
                rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                        "Pergantian LIVE mendukung teks, widget, gambar, stiker, MP4 lokal, dan kamera dengan pemilik lensa yang sama. Elemen lain yang belum didukung harus disiapkan saat LIVE dihentikan.");
                return;
            }
            ModeBCameraScenePolicy.Spec nextCameraSpec = ModeBCameraScenePolicy.inspect(array);
            ModeBCameraScenePolicy.Decision cameraDecision = ModeBCameraScenePolicy.evaluate(
                    studioOverlayView.hasVisibleCameraLayer(), studioOverlayView.isCameraFrontFacing(),
                    studioOverlayView.hasTransferableCameraOwner(), nextCameraSpec);
            if (cameraDecision == ModeBCameraScenePolicy.Decision.REJECT) {
                rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                        "Pergantian scene harus mempertahankan kamera yang sedang aktif dan arah lensanya. Kamera baru atau perubahan kamera depan/belakang memerlukan LIVE dihentikan lalu dimulai ulang.");
                return;
            }
            reuseCameraOwner = cameraDecision == ModeBCameraScenePolicy.Decision.REUSE_OWNER;
            if (ModeBPresetTransitionPolicy.hasTransition(transitionOutDurationMs, transitionInDurationMs)
                    && (studioOverlayView.hasVisibleCameraLayer() || nextCameraSpec.hasCamera)) {
                rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                        "Transisi fade LIVE belum tersedia untuk scene yang memakai kamera. Gunakan pergantian langsung atau hentikan LIVE untuk mengubah scene kamera.");
                return;
            }
        } catch (org.json.JSONException exception) {
            rejectSceneReplacementNamespaces(nextAssetNamespace, nextBackgroundNamespace, resultCallback, "JSON overlay scene baru tidak valid.");
            return;
        }

        final boolean shouldReuseCameraOwner = reuseCameraOwner;
        final StudioOverlayView previousView = studioOverlayView;
        final ModeBSceneReplacementFilter previousFilter = overlayFilterRender;
        StudioOverlayView stagedCandidate = null;
        ModeBSceneReplacementFilter filterCandidate = null;
        StudioBackgroundView stagedBackgroundCandidate = null;
        ModeBSceneReplacementFilter backgroundFilterCandidate = null;
        try {
            if (backgroundChanged && !nextBackgroundId.isEmpty()) {
                stagedBackgroundCandidate = new StudioBackgroundView(getApplicationContext(),
                        streamOutputWidth, streamOutputHeight, nextBackgroundId,
                        nextBackgroundNamespace, bitmapBudget);
                if (!stagedBackgroundCandidate.isReady()) {
                    throw new IllegalStateException(stagedBackgroundCandidate.getFailure().isEmpty()
                            ? "Background preset baru gagal dimuat." : stagedBackgroundCandidate.getFailure());
                }
                int bgWidthSpec = View.MeasureSpec.makeMeasureSpec(streamOutputWidth, View.MeasureSpec.EXACTLY);
                int bgHeightSpec = View.MeasureSpec.makeMeasureSpec(streamOutputHeight, View.MeasureSpec.EXACTLY);
                stagedBackgroundCandidate.measure(bgWidthSpec, bgHeightSpec);
                stagedBackgroundCandidate.layout(0, 0, streamOutputWidth, streamOutputHeight);
                backgroundFilterCandidate = createSceneReplacementFilter();
                backgroundFilterCandidate.setScale(100f, 100f);
                backgroundFilterCandidate.setPosition(0f, 0f);
                backgroundFilterCandidate.setTargetFps(Math.max(1, Math.min(30, streamOutputFps)));
                backgroundFilterCandidate.setView(stagedBackgroundCandidate);
            }
            stagedCandidate = new StudioOverlayView(getApplicationContext(), streamOutputWidth,
                    streamOutputHeight, boundedJson, bitmapBudget, nextAssetNamespace, getOrCreateVisualWorker(),
                    shouldReuseCameraOwner);
            if (stagedCandidate.getOmittedElementCount() > 0) {
                cleanupUnattachedStagedResources(stagedCandidate, filterCandidate, stagedBackgroundCandidate,
                        backgroundFilterCandidate, nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                        "Sebagian gambar/video/background scene baru tidak dapat disiapkan. Scene LIVE lama dipertahankan.");
                return;
            }
            if (shouldReuseCameraOwner && !stagedCandidate.requiresCameraOwnerTransfer()) {
                cleanupUnattachedStagedResources(stagedCandidate, filterCandidate, stagedBackgroundCandidate,
                        backgroundFilterCandidate, nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                        "Layer kamera scene baru tidak dapat disiapkan untuk memakai kamera LIVE yang sedang aktif.");
                return;
            }
            previousView.copyLiveStateTo(stagedCandidate);
            int widthSpec = View.MeasureSpec.makeMeasureSpec(streamOutputWidth, View.MeasureSpec.EXACTLY);
            int heightSpec = View.MeasureSpec.makeMeasureSpec(streamOutputHeight, View.MeasureSpec.EXACTLY);
            stagedCandidate.measure(widthSpec, heightSpec);
            stagedCandidate.layout(0, 0, streamOutputWidth, streamOutputHeight);
            stagedCandidate.startVideoPlayback();
            filterCandidate = createSceneReplacementFilter();
            filterCandidate.setScale(100f, 100f);
            filterCandidate.setPosition(0f, 0f);
            filterCandidate.setTargetFps(Math.max(1, Math.min(30, streamOutputFps)));
            filterCandidate.setView(stagedCandidate);
        } catch (RuntimeException | OutOfMemoryError exception) {
            final String failureMessage = exception instanceof OutOfMemoryError
                    ? "Memori perangkat tidak cukup untuk menyiapkan scene/background baru. Scene LIVE lama dipertahankan."
                    : (exception.getMessage() == null || exception.getMessage().isEmpty()
                        ? "Scene baru gagal disiapkan. Scene LIVE lama dipertahankan." : exception.getMessage());
            cleanupUnattachedStagedResources(stagedCandidate, filterCandidate, stagedBackgroundCandidate,
                    backgroundFilterCandidate, nextAssetNamespace, nextBackgroundNamespace, resultCallback,
                    failureMessage);
            return;
        }

        final StudioOverlayView stagedView = stagedCandidate;
        final ModeBSceneReplacementFilter stagedFilter = filterCandidate;
        final StudioBackgroundView stagedBackgroundView = stagedBackgroundCandidate;
        final ModeBSceneReplacementFilter stagedBackgroundFilter = backgroundFilterCandidate;
        sceneReplacementPending = true;
        pendingSceneView = stagedView;
        pendingSceneFilter = stagedFilter;
        pendingBackgroundView = stagedBackgroundView;
        pendingBackgroundFilter = stagedBackgroundFilter;
        pendingBackgroundAssetNamespace = backgroundChanged ? nextBackgroundNamespace : "";
        pendingBackgroundAssetId = nextBackgroundId;
        pendingSceneCallback = resultCallback;
        pendingSceneAssetNamespace = nextAssetNamespace;

        final long assetReadyDeadline = SystemClock.uptimeMillis() + 5_000L;
        sceneReplacementAssetPoll = new Runnable() {
            @Override public void run() {
                if (!sceneReplacementPending || pendingSceneView != stagedView || stopRequested.get()) return;
                String failure = stagedView.getVideoPreparationFailure();
                if (failure != null && !failure.isEmpty()) {
                    abortStagedSceneBeforeAttach(stagedView, stagedFilter, stagedBackgroundView,
                            stagedBackgroundFilter, resultCallback, nextAssetNamespace, nextBackgroundNamespace,
                            "Video scene baru gagal disiapkan: " + failure);
                    return;
                }
                if (!stagedView.areVideoFramesReadyForLiveReplacement()) {
                    if (SystemClock.uptimeMillis() >= assetReadyDeadline) {
                        abortStagedSceneBeforeAttach(stagedView, stagedFilter, stagedBackgroundView,
                                stagedBackgroundFilter, resultCallback, nextAssetNamespace, nextBackgroundNamespace,
                                "Frame awal video scene baru belum siap. Scene LIVE lama tetap digunakan.");
                    } else {
                        MAIN.postDelayed(this, 50L);
                    }
                    return;
                }
                sceneReplacementAssetPoll = null;
                attachStagedLiveSceneFilter(previousView, previousFilter, stagedView, stagedFilter,
                        stagedBackgroundView, stagedBackgroundFilter, backgroundChanged,
                        nextBackgroundId, nextBackgroundNamespace, transitionOutDurationMs,
                        transitionInDurationMs, resultCallback, nextAssetNamespace);
            }
        };
        MAIN.post(sceneReplacementAssetPoll);
    }

    private void rejectSceneReplacementNamespaces(String sceneAssetNamespace, String backgroundAssetNamespace,
            SceneReplacementCallback callback, String message) {
        if (ModeBAssetNamespace.isValid(sceneAssetNamespace)
                && !sceneAssetNamespace.equals(activeSceneAssetNamespace)) {
            ModeBAssetNamespace.deleteNamespace(getApplicationContext(), sceneAssetNamespace);
        }
        if (ModeBAssetNamespace.isValid(backgroundAssetNamespace)
                && !backgroundAssetNamespace.equals(activeBackgroundAssetNamespace)) {
            ModeBAssetNamespace.deleteNamespace(getApplicationContext(), backgroundAssetNamespace);
        }
        if (ModeBAssetNamespace.isValid(pendingScreensaverAssetNamespace)
                && !pendingScreensaverAssetNamespace.equals(activeScreensaverAssetNamespace)) {
            ModeBAssetNamespace.deleteNamespace(getApplicationContext(), pendingScreensaverAssetNamespace);
        }
        pendingScreensaverAssetNamespace = "";
        callback.onResult(false, message);
    }

    private void cleanupUnattachedStagedResources(StudioOverlayView stagedView,
            ModeBSceneReplacementFilter stagedFilter, StudioBackgroundView stagedBackgroundView,
            ModeBSceneReplacementFilter stagedBackgroundFilter, String sceneAssetNamespace,
            String backgroundAssetNamespace, SceneReplacementCallback callback, String message) {
        if (stagedFilter != null) {
            stagedFilter.setNextOutputFrameListener(null);
            stagedFilter.setOnReleasedListener(null);
            try { stagedFilter.setView(null); } catch (Exception ignored) { }
        }
        if (stagedBackgroundFilter != null) {
            stagedBackgroundFilter.setNextOutputFrameListener(null);
            stagedBackgroundFilter.setOnReleasedListener(null);
            try { stagedBackgroundFilter.setView(null); } catch (Exception ignored) { }
        }
        Runnable finish = () -> MAIN.post(() -> {
            if (stagedBackgroundView != null) stagedBackgroundView.releaseBitmap();
            if (ModeBAssetNamespace.isValid(sceneAssetNamespace)) {
                ModeBAssetNamespace.deleteNamespace(getApplicationContext(), sceneAssetNamespace);
            }
            if (ModeBAssetNamespace.isValid(backgroundAssetNamespace)
                    && !backgroundAssetNamespace.equals(activeBackgroundAssetNamespace)) {
                ModeBAssetNamespace.deleteNamespace(getApplicationContext(), backgroundAssetNamespace);
            }
            if (ModeBAssetNamespace.isValid(pendingScreensaverAssetNamespace)
                    && !pendingScreensaverAssetNamespace.equals(activeScreensaverAssetNamespace)) {
                ModeBAssetNamespace.deleteNamespace(getApplicationContext(), pendingScreensaverAssetNamespace);
            }
            pendingScreensaverAssetNamespace = "";
            callback.onResult(false, message);
        });
        if (stagedView != null) stagedView.releaseAssets(finish);
        else finish.run();
    }

    private ModeBVisualWorker getOrCreateVisualWorker() {
        if (visualWorker == null) visualWorker = new ModeBVisualWorker();
        return visualWorker;
    }

    private void abortStagedSceneBeforeAttach(StudioOverlayView stagedView, ModeBSceneReplacementFilter stagedFilter,
            StudioBackgroundView stagedBackgroundView, ModeBSceneReplacementFilter stagedBackgroundFilter,
            SceneReplacementCallback callback, String sceneAssetNamespace, String backgroundAssetNamespace,
            String message) {
        if (sceneReplacementAssetPoll != null) MAIN.removeCallbacks(sceneReplacementAssetPoll);
        sceneReplacementAssetPoll = null;
        cleanupUnattachedStagedResources(stagedView, stagedFilter, stagedBackgroundView, stagedBackgroundFilter,
                sceneAssetNamespace, backgroundAssetNamespace, new SceneReplacementCallback() {
                    @Override public void onResult(boolean success, String cleanupMessage) {
                        if (pendingSceneView == stagedView) {
                            pendingSceneView = null;
                            pendingSceneFilter = null;
                            pendingBackgroundView = null;
                            pendingBackgroundFilter = null;
                            pendingBackgroundAssetNamespace = "";
                            pendingBackgroundAssetId = "";
                            pendingSceneCallback = null;
                            pendingSceneAssetNamespace = "";
                            sceneReplacementPending = false;
                        }
                        callback.onResult(false, message);
                    }
                }, message);
    }

    private void attachStagedLiveSceneFilter(StudioOverlayView previousView,
            ModeBSceneReplacementFilter previousFilter, StudioOverlayView stagedView,
            ModeBSceneReplacementFilter stagedFilter, StudioBackgroundView stagedBackgroundView,
            ModeBSceneReplacementFilter stagedBackgroundFilter, boolean backgroundChanged,
            String nextBackgroundId, String nextBackgroundNamespace,
            int transitionOutDurationMs, int transitionInDurationMs,
            SceneReplacementCallback callback, String nextAssetNamespace) {
        if (!sceneReplacementPending || pendingSceneView != stagedView || stopRequested.get()
                || stream == null || cleanedUp.get()) return;

        boolean cameraTransferred = false;
        if (stagedView.requiresCameraOwnerTransfer()) {
            cameraTransferred = previousView.transferCameraOwnerTo(stagedView);
            if (!cameraTransferred) {
                abortStagedSceneBeforeAttach(stagedView, stagedFilter, stagedBackgroundView,
                        stagedBackgroundFilter, callback, nextAssetNamespace, nextBackgroundNamespace,
                        "Pemilik kamera aktif tidak dapat dipindahkan dengan aman. Scene LIVE lama tetap digunakan.");
                return;
            }
        }

        final boolean transferredCamera = cameraTransferred;
        final java.util.concurrent.atomic.AtomicBoolean initialOverlayReady = new java.util.concurrent.atomic.AtomicBoolean(false);
        final java.util.concurrent.atomic.AtomicBoolean initialBackgroundReady =
                new java.util.concurrent.atomic.AtomicBoolean(stagedBackgroundFilter == null);
        final java.util.concurrent.atomic.AtomicBoolean transitionStarted = new java.util.concurrent.atomic.AtomicBoolean(false);
        final java.util.concurrent.atomic.AtomicBoolean finalOverlayReady = new java.util.concurrent.atomic.AtomicBoolean(false);
        final java.util.concurrent.atomic.AtomicBoolean finalBackgroundReady =
                new java.util.concurrent.atomic.AtomicBoolean(stagedBackgroundFilter == null);
        final java.util.concurrent.atomic.AtomicBoolean retirementStarted = new java.util.concurrent.atomic.AtomicBoolean(false);
        final ModeBSceneReplacementFilter previousBackgroundFilter = backgroundChanged ? backgroundFilterRender : null;
        final StudioBackgroundView previousBackgroundView = backgroundChanged ? studioBackgroundView : null;
        final String previousBackgroundNamespace = backgroundChanged ? activeBackgroundAssetNamespace : "";
        final boolean[] attached = new boolean[] { false, false }; // overlay, background
        final boolean transitionEnabled = ModeBPresetTransitionPolicy.hasTransition(
                transitionOutDurationMs, transitionInDurationMs);

        // A scene overlay and its matching background share one opacity state. The GL filters
        // snapshot it in compositor order: background starts the output-pass value, then overlay
        // consumes the same value. Canvas producer cadence no longer controls transition opacity.
        final ModeBSceneLayerOpacityState stagedLayerOpacity =
                new ModeBSceneLayerOpacityState(transitionEnabled ? 0f : stagedView.getSceneOpacity());
        stagedView.bindSceneOpacityState(stagedLayerOpacity);
        if (stagedBackgroundView != null) stagedBackgroundView.bindSceneOpacityState(stagedLayerOpacity);
        stagedFilter.bindSceneLayerOpacityState(stagedLayerOpacity,
                stagedBackgroundFilter != null
                        ? ModeBSceneLayerOpacityState.ROLE_OVERLAY
                        : ModeBSceneLayerOpacityState.ROLE_SINGLE);
        if (stagedBackgroundFilter != null) {
            stagedBackgroundFilter.bindSceneLayerOpacityState(
                    stagedLayerOpacity, ModeBSceneLayerOpacityState.ROLE_BACKGROUND);
        }

        final ModeBSceneLayerOpacityState previousLayerOpacity =
                new ModeBSceneLayerOpacityState(previousView.getSceneOpacity());
        previousView.bindSceneOpacityState(previousLayerOpacity);
        previousFilter.bindSceneLayerOpacityState(previousLayerOpacity,
                previousBackgroundFilter != null
                        ? ModeBSceneLayerOpacityState.ROLE_OVERLAY
                        : ModeBSceneLayerOpacityState.ROLE_SINGLE);
        if (previousBackgroundView != null) previousBackgroundView.bindSceneOpacityState(previousLayerOpacity);
        if (previousBackgroundFilter != null) {
            previousBackgroundFilter.bindSceneLayerOpacityState(
                    previousLayerOpacity, ModeBSceneLayerOpacityState.ROLE_BACKGROUND);
        }

        if (transitionEnabled) {
            stagedView.setSceneOpacity(0f);
            if (stagedBackgroundView != null) stagedBackgroundView.setSceneOpacity(0f);
            previousView.setSceneOpacity(1f);
            if (previousBackgroundView != null) previousBackgroundView.setSceneOpacity(1f);
        }

        Runnable maybeRetireOldFilters = () -> MAIN.post(() -> {
            if (!sceneReplacementPending || pendingSceneView != stagedView || stopRequested.get()
                    || cleanedUp.get() || !finalOverlayReady.get() || !finalBackgroundReady.get()
                    || !retirementStarted.compareAndSet(false, true)) return;
            if (sceneReplacementTimeout != null) MAIN.removeCallbacks(sceneReplacementTimeout);
            sceneReplacementTimeout = null;
            final int releaseCount = 1 + (previousBackgroundFilter != null ? 1 : 0);
            final java.util.concurrent.atomic.AtomicInteger remaining = new java.util.concurrent.atomic.AtomicInteger(releaseCount);
            final java.util.concurrent.atomic.AtomicBoolean committed = new java.util.concurrent.atomic.AtomicBoolean(false);
            final java.util.concurrent.atomic.AtomicBoolean retirementFailed = new java.util.concurrent.atomic.AtomicBoolean(false);
            Runnable filterReleased = () -> MAIN.post(() -> {
                if (remaining.decrementAndGet() == 0 && !retirementFailed.get()
                        && committed.compareAndSet(false, true)) {
                    if (stopRequested.get() || cleanedUp.get()) return;
                    String previousSceneNamespace = activeSceneAssetNamespace;
                    studioOverlayView = stagedView;
                    overlayFilterRender = stagedFilter;
                    liveSceneLayerOpacityState = stagedLayerOpacity;
                    activeSceneAssetNamespace = nextAssetNamespace;
                    pendingSceneView = null;
                    pendingSceneFilter = null;
                    screensaverPolicy = nextScreensaverPolicy;
                    String previousScreensaverNamespace = activeScreensaverAssetNamespace;
                    activeScreensaverAssetNamespace = pendingScreensaverAssetNamespace;
                    pendingScreensaverAssetNamespace = "";
                    if (reshareWaitingView != null) {
                        reshareWaitingView.setCardMessage(screensaverPolicy.text,
                                reshareWaiting ? "Bagikan layar lagi untuk melanjutkan tampilan." : "");
                        reshareWaitingView.setMediaAsset(screensaverPolicy.enabled ? screensaverPolicy.mediaAssetId : "",
                                screensaverPolicy.mediaType, activeScreensaverAssetNamespace,
                                getOrCreateVisualWorker(), bitmapBudget, () -> {
                                    if (ModeBAssetNamespace.isValid(previousScreensaverNamespace)
                                            && !previousScreensaverNamespace.equals(activeScreensaverAssetNamespace)) {
                                        ModeBAssetNamespace.deleteNamespace(getApplicationContext(), previousScreensaverNamespace);
                                    }
                                });
                    } else if (ModeBAssetNamespace.isValid(previousScreensaverNamespace)
                            && !previousScreensaverNamespace.equals(activeScreensaverAssetNamespace)) {
                        ModeBAssetNamespace.deleteNamespace(getApplicationContext(), previousScreensaverNamespace);
                    }
                    if (backgroundChanged) {
                        studioBackgroundView = stagedBackgroundView;
                        backgroundFilterRender = stagedBackgroundFilter;
                        activeBackgroundAssetId = nextBackgroundId;
                        activeBackgroundAssetNamespace = nextBackgroundId.isEmpty() ? "" : nextBackgroundNamespace;
                        if (previousBackgroundView != null) previousBackgroundView.releaseBitmap();
                        if (ModeBAssetNamespace.isValid(previousBackgroundNamespace)
                                && !previousBackgroundNamespace.equals(activeBackgroundAssetNamespace)) {
                            ModeBAssetNamespace.deleteNamespace(getApplicationContext(), previousBackgroundNamespace);
                        }
                        if (stagedBackgroundView != null) pendingBackgroundView = null;
                        pendingBackgroundFilter = null;
                        pendingBackgroundAssetNamespace = "";
                        pendingBackgroundAssetId = "";
                        if (previousBackgroundFilter == null && stagedBackgroundFilter != null) {
                            overlayFilterPosition++;
                        } else if (previousBackgroundFilter != null && stagedBackgroundFilter == null) {
                            overlayFilterPosition--;
                        }
                    }
                    if (!retiringSceneViews.contains(previousView)) retiringSceneViews.add(previousView);
                    retiringSceneNamespaces.put(previousView, previousSceneNamespace);
                    previousView.releaseAssets(() -> MAIN.post(() -> {
                        retiringSceneViews.remove(previousView);
                        retiringSceneNamespaces.remove(previousView);
                        if (ModeBAssetNamespace.isValid(previousSceneNamespace)
                                && !previousSceneNamespace.equals(activeBackgroundAssetNamespace)) {
                            ModeBAssetNamespace.deleteNamespace(getApplicationContext(), previousSceneNamespace);
                        }
                        if (stopRequested.get() || cleanedUp.get()) return;
                        pendingSceneCallback = null;
                        pendingSceneAssetNamespace = "";
                        sceneReplacementPending = false;
                        overlayNotice = stagedView.getRenderSummary();
                        String changeLabel = backgroundChanged ? "Scene dan background LIVE berhasil diperbarui" : "Scene overlay dan media LIVE berhasil diperbarui";
                        publishSceneReplacementCompletionState(changeLabel);
                        callback.onResult(true, backgroundChanged
                                ? "Scene dan background diperbarui pada output LIVE."
                                : "Scene overlay/media diperbarui pada output LIVE.");
                    }));
                }
            });

            previousFilter.setOnReleasedListener(filterReleased);
            if (previousBackgroundFilter != null) previousBackgroundFilter.setOnReleasedListener(filterReleased);
            try {
                RtmpStream current = stream;
                if (current == null || cleanedUp.get()) throw new IllegalStateException("Sesi renderer sudah dihentikan.");
                RuntimeException removalFailure = ModeBFilterRemovalBatch.attemptAllWithRetry(2,
                        () -> current.getGlInterface().removeFilter(previousFilter),
                        previousBackgroundFilter == null ? null
                                : () -> current.getGlInterface().removeFilter(previousBackgroundFilter));
                if (removalFailure != null) throw removalFailure;
            } catch (RuntimeException exception) {
                // Each filter removal is attempted independently. A thrown request still leaves
                // retirement uncertain, so keep the transaction fail-closed until session teardown.
                retirementFailed.set(true);
                callback.onResult(false, "Renderer gagal menjadwalkan pelepasan scene lama. Hentikan LIVE lalu mulai ulang untuk memulihkan compositor.");
            }
        });

        Runnable armFinalOutputFences = () -> {
            if (stopRequested.get() || cleanedUp.get() || !sceneReplacementPending || pendingSceneView != stagedView) return;
            if (!transitionEnabled) {
                finalOverlayReady.set(true);
                finalBackgroundReady.set(true);
                maybeRetireOldFilters.run();
                return;
            }
            stagedFilter.setNextOutputFrameListener(() -> {
                finalOverlayReady.set(true);
                maybeRetireOldFilters.run();
            });
            if (stagedBackgroundFilter != null) {
                stagedBackgroundFilter.setNextOutputFrameListener(() -> {
                    finalBackgroundReady.set(true);
                    maybeRetireOldFilters.run();
                });
            }
        };

        Runnable beginEntryTransition = () -> {
            if (stopRequested.get() || cleanedUp.get() || !sceneReplacementPending || pendingSceneView != stagedView) return;
            if (transitionInDurationMs > 0) {
                animateSceneLayerOpacity(stagedView, stagedBackgroundView, 0f, 1f,
                        transitionInDurationMs, armFinalOutputFences);
            } else {
                stagedView.setSceneOpacity(1f);
                if (stagedBackgroundView != null) stagedBackgroundView.setSceneOpacity(1f);
                armFinalOutputFences.run();
            }
        };

        Runnable beginPresetTransition = () -> {
            if (!sceneReplacementPending || pendingSceneView != stagedView || stopRequested.get()
                    || cleanedUp.get() || !initialOverlayReady.get() || !initialBackgroundReady.get()
                    || !transitionStarted.compareAndSet(false, true)) return;
            if (sceneReplacementTimeout != null) MAIN.removeCallbacks(sceneReplacementTimeout);
            sceneReplacementTimeout = () -> {
                if (!sceneReplacementPending || pendingSceneView != stagedView) return;
                abortStagedSceneAfterAttach(stagedView, stagedFilter, stagedBackgroundView,
                        stagedBackgroundFilter, attached[0], attached[1], callback, nextAssetNamespace,
                        nextBackgroundNamespace, "Transisi preset tidak selesai. Scene LIVE lama dipertahankan.");
            };
            MAIN.postDelayed(sceneReplacementTimeout, 5_000L + transitionOutDurationMs + transitionInDurationMs);
            if (transitionOutDurationMs > 0) {
                animateSceneLayerOpacity(previousView, previousBackgroundView, 1f, 0f,
                        transitionOutDurationMs, beginEntryTransition);
            } else {
                beginEntryTransition.run();
            }
        };

        // SYNTXRR's view filter invokes its output fence on RootEncoder's GL thread. ValueAnimator
        // and the scene transition state machine must run on the main Looper, so marshal the
        // readiness callbacks before attempting to start either fade.
        stagedFilter.setNextOutputFrameListener(() -> {
            initialOverlayReady.set(true);
            MAIN.post(beginPresetTransition);
        });
        if (stagedBackgroundFilter != null) {
            stagedBackgroundFilter.setNextOutputFrameListener(() -> {
                initialBackgroundReady.set(true);
                MAIN.post(beginPresetTransition);
            });
        }

        sceneReplacementTimeout = () -> {
            if (!sceneReplacementPending || pendingSceneView != stagedView) return;
            abortStagedSceneAfterAttach(stagedView, stagedFilter, stagedBackgroundView,
                    stagedBackgroundFilter, attached[0], attached[1], callback, nextAssetNamespace,
                    nextBackgroundNamespace, "GL belum mengonfirmasi frame scene/background baru. Scene LIVE lama tetap digunakan.");
        };
        MAIN.postDelayed(sceneReplacementTimeout, 4_000L);
        try {
            if (stagedBackgroundFilter != null) {
                // Background filters always sit below screen capture and Studio overlay.
                // Insert after the old background so the new opaque background covers it,
                // while later screen-capture and overlay filters remain above both.
                int position = previousBackgroundFilter != null ? 1 : 0;
                stream.getGlInterface().addFilter(position, stagedBackgroundFilter);
                attached[1] = true;
            }
            stream.getGlInterface().addFilter(stagedFilter);
            attached[0] = true;
        } catch (RuntimeException exception) {
            MAIN.removeCallbacks(sceneReplacementTimeout);
            sceneReplacementTimeout = null;
            if (transferredCamera) stagedView.transferCameraOwnerTo(previousView);
            if (attached[0] || attached[1]) {
                abortStagedSceneAfterAttach(stagedView, stagedFilter, stagedBackgroundView,
                        stagedBackgroundFilter, attached[0], attached[1], callback, nextAssetNamespace,
                        nextBackgroundNamespace, "Native renderer menolak menyiapkan scene/background baru. Scene LIVE lama tetap digunakan.");
            } else {
                abortStagedSceneBeforeAttach(stagedView, stagedFilter, stagedBackgroundView,
                        stagedBackgroundFilter, callback, nextAssetNamespace, nextBackgroundNamespace,
                        "Native renderer menolak menyiapkan scene/background baru. Scene LIVE lama tetap digunakan.");
            }
        }
    }

    /**
     * A scene replacement can outlive the projection state in which it was started. For example,
     * Android may revoke screen sharing while staged GL filters are fading in/out. The scene
     * transaction is independent of RTMP capture and may still commit, but its completion must
     * not overwrite the newer recovery/host-wait status or hide the reshare entry point.
     */
    private void publishSceneReplacementCompletionState(String changeLabel) {
        ModeBSceneReplacementCompletionPolicy.State state =
                ModeBSceneReplacementCompletionPolicy.resolve(
                        stopRequested.get(), cleanedUp.get(), reshareWaiting, reshareInProgress, hostWaitActive);
        switch (state) {
            case STOPPED:
                return;
            case RESHARE_WAITING:
                showReshareFloatingControl();
                updateStreamingNotification("LIVE berjalan · menunggu layar dibagikan kembali");
                publish("reshare_waiting", changeLabel
                        + ". LIVE RTMP tetap berjalan; bagikan layar lagi untuk melanjutkan tampilan."
                        + screensaverPolicy.runtimeNotice(), true, latestConnectedBitrateKbps);
                return;
            case RESHARING:
                hideReshareFloatingControlInternal();
                updateStreamingNotification("LIVE berjalan · menyambungkan layar kembali");
                publish("resharing", changeLabel
                        + ". Menunggu frame pertama dari layar yang baru dibagikan…", true,
                        latestConnectedBitrateKbps);
                return;
            case HOST_WAIT:
                showHostWaitFloatingControl();
                updateStreamingNotification("LIVE berjalan · layar tunggu aktif");
                publish("host_wait", changeLabel + " · " + screensaverPolicy.text
                        + " · LIVE tetap berjalan.", true, latestConnectedBitrateKbps);
                return;
            case LIVE:
            default:
                if (screensaverPolicy.enabled) showHostWaitFloatingControl();
                else hideReshareFloatingControlInternal();
                updateStreamingNotification("LIVE · siaran aktif");
                publish("live", changeLabel
                        + " tanpa menghentikan koneksi RTMP atau sesi MediaProjection.", true, lastBitrateKbps);
        }
    }

    private void animateSceneLayerOpacity(StudioOverlayView overlayView, StudioBackgroundView backgroundView,
            float from, float to, int durationMs, Runnable onCompleted) {
        if (durationMs <= 0) {
            if (overlayView != null) overlayView.setSceneOpacity(to);
            if (backgroundView != null) backgroundView.setSceneOpacity(to);
            if (onCompleted != null) onCompleted.run();
            return;
        }
        ValueAnimator animator = ValueAnimator.ofFloat(from, to);
        animator.setDuration(durationMs);
        sceneTransitionAnimator = animator;
        animator.addUpdateListener(valueAnimator -> {
            float opacity = (Float) valueAnimator.getAnimatedValue();
            if (overlayView != null) overlayView.setSceneOpacity(opacity);
            if (backgroundView != null) backgroundView.setSceneOpacity(opacity);
        });
        animator.addListener(new AnimatorListenerAdapter() {
            private boolean cancelled;
            @Override public void onAnimationCancel(Animator animation) { cancelled = true; }
            @Override public void onAnimationEnd(Animator animation) {
                if (sceneTransitionAnimator == animator) sceneTransitionAnimator = null;
                if (!cancelled && !stopRequested.get() && !cleanedUp.get() && onCompleted != null) onCompleted.run();
            }
        });
        animator.start();
    }

    private void cancelSceneTransitionAnimator() {
        ValueAnimator animator = sceneTransitionAnimator;
        sceneTransitionAnimator = null;
        if (animator != null) {
            try { animator.cancel(); } catch (RuntimeException ignored) { }
        }
    }

    private void abortStagedSceneAfterAttach(StudioOverlayView stagedView, ModeBSceneReplacementFilter stagedFilter,
            StudioBackgroundView stagedBackgroundView, ModeBSceneReplacementFilter stagedBackgroundFilter,
            boolean overlayAttached, boolean backgroundAttached, SceneReplacementCallback callback,
            String sceneAssetNamespace, String backgroundAssetNamespace, String message) {
        if (sceneReplacementTimeout != null) MAIN.removeCallbacks(sceneReplacementTimeout);
        sceneReplacementTimeout = null;
        cancelSceneTransitionAnimator();
        StudioOverlayView activeView = studioOverlayView;
        if (activeView != null) {
            activeView.setSceneOpacity(1f);
            stagedView.transferCameraOwnerTo(activeView);
        }
        if (studioBackgroundView != null) studioBackgroundView.setSceneOpacity(1f);
        stagedFilter.setNextOutputFrameListener(null);
        if (stagedBackgroundFilter != null) stagedBackgroundFilter.setNextOutputFrameListener(null);
        final int attachedCount = (overlayAttached ? 1 : 0) + (backgroundAttached ? 1 : 0);
        final java.util.concurrent.atomic.AtomicInteger remaining = new java.util.concurrent.atomic.AtomicInteger(attachedCount);
        final java.util.concurrent.atomic.AtomicBoolean cleanupStarted = new java.util.concurrent.atomic.AtomicBoolean(false);
        final java.util.concurrent.atomic.AtomicBoolean callbackDelivered = new java.util.concurrent.atomic.AtomicBoolean(false);
        Runnable reportFailureOnce = () -> {
            if (callbackDelivered.compareAndSet(false, true)) callback.onResult(false, message);
        };
        Runnable finish = () -> {
            if (!cleanupStarted.compareAndSet(false, true)) return;
            Runnable cleanupViews = () -> MAIN.post(() -> {
                if (stagedBackgroundView != null) stagedBackgroundView.releaseBitmap();
                if (ModeBAssetNamespace.isValid(sceneAssetNamespace)) {
                    ModeBAssetNamespace.deleteNamespace(getApplicationContext(), sceneAssetNamespace);
                }
                if (ModeBAssetNamespace.isValid(backgroundAssetNamespace)
                        && !backgroundAssetNamespace.equals(activeBackgroundAssetNamespace)) {
                    ModeBAssetNamespace.deleteNamespace(getApplicationContext(), backgroundAssetNamespace);
                }
                if (ModeBAssetNamespace.isValid(pendingScreensaverAssetNamespace)
                        && !pendingScreensaverAssetNamespace.equals(activeScreensaverAssetNamespace)) {
                    ModeBAssetNamespace.deleteNamespace(getApplicationContext(), pendingScreensaverAssetNamespace);
                }
                pendingScreensaverAssetNamespace = "";
                if (pendingSceneView == stagedView) {
                    pendingSceneView = null;
                    pendingSceneFilter = null;
                    pendingBackgroundView = null;
                    pendingBackgroundFilter = null;
                    pendingBackgroundAssetNamespace = "";
                    pendingBackgroundAssetId = "";
                    pendingSceneCallback = null;
                    pendingSceneAssetNamespace = "";
                    sceneReplacementPending = false;
                }
                reportFailureOnce.run();
            });
            stagedView.releaseAssets(cleanupViews);
        };
        if (!overlayAttached) {
            stagedFilter.setOnReleasedListener(null);
            try { stagedFilter.setView(null); } catch (Exception ignored) { }
        } else {
            stagedFilter.setOnReleasedListener(() -> MAIN.post(() -> {
                if (remaining.decrementAndGet() == 0) finish.run();
            }));
        }
        if (stagedBackgroundFilter == null || !backgroundAttached) {
            if (stagedBackgroundFilter != null) {
                stagedBackgroundFilter.setOnReleasedListener(null);
                try { stagedBackgroundFilter.setView(null); } catch (Exception ignored) { }
            }
        } else {
            stagedBackgroundFilter.setOnReleasedListener(() -> MAIN.post(() -> {
                if (remaining.decrementAndGet() == 0) finish.run();
            }));
        }
        if (attachedCount == 0) {
            finish.run();
            return;
        }
        RuntimeException removalFailure;
        RtmpStream current = stream;
        if (current == null || cleanedUp.get()) {
            removalFailure = new IllegalStateException("Sesi renderer sudah dihentikan.");
        } else {
            removalFailure = ModeBFilterRemovalBatch.attemptAllWithRetry(2,
                    overlayAttached ? () -> current.getGlInterface().removeFilter(stagedFilter) : null,
                    backgroundAttached && stagedBackgroundFilter != null
                            ? () -> current.getGlInterface().removeFilter(stagedBackgroundFilter) : null);
        }
        if (removalFailure != null) {
            // All attached filters were attempted, but an unacknowledged removal keeps the
            // pending slot and its resources alive until renderer teardown proves them safe.
            reportFailureOnce.run();
        }
    }

    /** Allows a stopped service instance to begin a fresh consent-backed projection session. */
    private boolean resetAfterCompletedSession() {
        if (!READINESS_TRACKER.canStartNewSession()) return false;
        if (!stopRequested.get()) return stream == null && mediaProjection == null;
        if (!cleanedUp.get() || !assetCleanupCompleted || !streamTeardownApiCompleted) return false;
        stream = null;
        mediaProjection = null;
        projectionCallback = null;
        studioOverlayView = null;
        overlayFilterRender = null;
        studioBackgroundView = null;
        backgroundFilterRender = null;
        liveSceneLayerOpacityState = null;
        screenCaptureFilterRender = null;
        screenCaptureVirtualDisplay = null;
        directScreenCaptureVideoSource = null;
        captureEngine = ModeBCaptureEnginePolicy.Engine.NONE;
        activeCaptureSpec = null;
        activeBackgroundAssetId = "";
        activeSceneAssetNamespace = "";
        activeBackgroundAssetNamespace = "";
        activeScreensaverAssetNamespace = "";
        pendingScreensaverAssetNamespace = "";
        retiringSceneViews.clear();
        retiringSceneNamespaces.clear();
        visualWorker = null;
        screensaverAudioQueue = null;
        nextFilterPosition = 0;
        overlayFilterPosition = -1;
        streamOutputWidth = 0;
        streamOutputHeight = 0;
        streamOutputFps = 30;
        sceneReplacementPending = false;
        pendingSceneView = null;
        pendingSceneFilter = null;
        pendingBackgroundView = null;
        pendingBackgroundFilter = null;
        pendingBackgroundAssetNamespace = "";
        pendingBackgroundAssetId = "";
        pendingSceneCallback = null;
        sceneReplacementTimeout = null;
        sceneTransitionAnimator = null;
        screenCaptureGuard = new ModeBProjectionLayerGuard();
        overlayNotice = "";
        captureLayerNotice = "";
        screenCaptureLayerRequired = false;
        screenCaptureFirstFrameReady.set(false);
        connectionEstablished = false;
        sessionWasLive = false;
        latestConnectedBitrateKbps = 0L;
        MAIN.removeCallbacks(screenCaptureReadyTimeout);
        synchronized (pendingOverlayEvents) { pendingOverlayEvents.clear(); }
        cleanedUp.set(false);
        stopRequested.set(false);
        retryPending.set(false);
        projectionGeneration = 0L;
        reshareWaiting = false;
        reshareInProgress = false;
        reshareFinishing = false;
        audioSilencedForReshare = false;
        activeAudioRoute = "mix";
        reshareWaitingView = null;
        reshareWaitingFilter = null;
        hideReshareFloatingControlInternal();
        reshareFloatingOverlay = null;
        screenCaptureSurfaceTexture = null;
        screenCaptureLayerWidth = 0;
        screenCaptureLayerHeight = 0;
        MAIN.removeCallbacks(reshareFrameTimeout);
        return true;
    }

    private void endSession(String status, String message) {
        if (!stopRequested.compareAndSet(false, true)) return;
        cleanupResources();
        if (!streamTeardownApiCompleted) {
            status = "error";
            message = appendStreamTeardownFailure(message);
        }
        publish(status, message, false, 0);
        try {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Exception ignored) { }
        stopSelf();
    }

    private String appendStreamTeardownFailure(String message) {
        String result = message == null ? "" : message;
        result += " Pembersihan encoder/renderer tidak selesai; sesi baru ditahan demi keamanan.";
        if (streamTeardownApiFailure != null && !streamTeardownApiFailure.isEmpty()) {
            result += " Detail cleanup: " + streamTeardownApiFailure;
        }
        return result;
    }

    private void cleanupResources() {
        if (!cleanedUp.compareAndSet(false, true)) return;
        final long cleanupEpoch = READINESS_TRACKER.beginCleanup();
        final Context appContext = getApplicationContext();
        final AtomicBoolean asyncReadinessNotifyReady = new AtomicBoolean(false);
        sessionWasLive = false;
        ++streamGeneration;
        stopStreamHealthMonitor();
        MAIN.removeCallbacks(screenCaptureReadyTimeout);
        MAIN.removeCallbacks(reshareFrameTimeout);
        cancelHostWaitAnimator();
        hostWaitActive = false;
        if (sceneReplacementTimeout != null) MAIN.removeCallbacks(sceneReplacementTimeout);
        cancelSceneTransitionAnimator();
        if (sceneReplacementAssetPoll != null) MAIN.removeCallbacks(sceneReplacementAssetPoll);
        sceneReplacementTimeout = null;
        sceneReplacementAssetPoll = null;
        SceneReplacementCallback interruptedSceneCallback = pendingSceneCallback;
        StudioOverlayView stagedSceneView = pendingSceneView;
        ModeBSceneReplacementFilter stagedSceneFilter = pendingSceneFilter;
        StudioBackgroundView stagedBackgroundView = pendingBackgroundView;
        ModeBSceneReplacementFilter stagedBackgroundFilter = pendingBackgroundFilter;
        ModeBSceneReplacementFilter currentReshareFilter = reshareWaitingFilter;
        ModeBReshareWaitingView currentReshareWaitingView = reshareWaitingView;
        reshareWaitingFilter = null;
        hideReshareFloatingControlInternal();
        reshareWaitingView = null;
        reshareWaiting = false;
        reshareInProgress = false;
        reshareFinishing = false;
        audioSilencedForReshare = false;
        pendingSceneCallback = null;
        pendingSceneView = null;
        pendingSceneFilter = null;
        pendingBackgroundView = null;
        pendingBackgroundFilter = null;
        pendingBackgroundAssetNamespace = "";
        pendingBackgroundAssetId = "";
        pendingSceneAssetNamespace = "";
        sceneReplacementPending = false;

        RtmpStream currentStream = stream;
        ModeBGlTeardownGuard.Guard glTeardownGuard = null;
        ModeBGlEglStateGuard.Guard glEglStateGuard = null;
        String glTeardownCaptureFailure = "";
        String glEglStateCaptureFailure = "";
        if (currentStream != null) {
            try {
                // RootEncoder 2.8.1 owns this private executor and clears its field immediately
                // after shutdownNow(); retain the exact worker before stop/release for a real
                // post-release termination check.
                glTeardownGuard = ModeBGlTeardownGuard.capture(currentStream.getGlInterface());
            } catch (RuntimeException captureFailure) {
                glTeardownCaptureFailure = captureFailure.getMessage() == null
                        ? captureFailure.getClass().getSimpleName() : captureFailure.getMessage();
            }
            try {
                // Snapshot every standard and multi-preview SurfaceManager before RootEncoder
                // clears its private collections; final validation checks Java-side EGL handles.
                glEglStateGuard = ModeBGlEglStateGuard.capture(currentStream.getGlInterface());
            } catch (RuntimeException captureFailure) {
                glEglStateCaptureFailure = captureFailure.getMessage() == null
                        ? captureFailure.getClass().getSimpleName() : captureFailure.getMessage();
            }
        }
        final ModeBGlTeardownGuard.Guard retainedGlGuard = glTeardownGuard;
        final ModeBGlEglStateGuard.Guard retainedGlEglStateGuard = glEglStateGuard;
        final String retainedGlCaptureFailure = glTeardownCaptureFailure;
        final String retainedGlEglStateCaptureFailure = glEglStateCaptureFailure;
        List<AudioSource> currentAudioSources = new ArrayList<>(audioSourcesForTeardown);
        if (currentStream != null) {
            AudioSource streamAudioSource = currentStream.getAudioSource();
            boolean alreadyTracked = false;
            for (AudioSource tracked : currentAudioSources) {
                if (tracked == streamAudioSource) { alreadyTracked = true; break; }
            }
            if (streamAudioSource != null && !alreadyTracked) currentAudioSources.add(streamAudioSource);
        }
        audioSourcesForTeardown.clear();
        stream = null;
        StudioOverlayView currentOverlayView = studioOverlayView;
        studioOverlayView = null;
        ModeBSceneReplacementFilter currentOverlayFilter = overlayFilterRender;
        overlayFilterRender = null;
        StudioBackgroundView currentBackgroundView = studioBackgroundView;
        studioBackgroundView = null;
        ModeBSceneReplacementFilter currentBackgroundFilter = backgroundFilterRender;
        backgroundFilterRender = null;
        VirtualDisplay currentScreenCaptureDisplay;
        SurfaceTexture currentScreenCaptureSurfaceTexture;
        ModeBScreenCaptureVideoSource currentDirectScreenSource = directScreenCaptureVideoSource;
        directScreenCaptureVideoSource = null;
        synchronized (screenCaptureLock) {
            screenCaptureGuard.close();
            currentScreenCaptureDisplay = screenCaptureVirtualDisplay;
            currentScreenCaptureSurfaceTexture = screenCaptureSurfaceTexture;
            screenCaptureVirtualDisplay = null;
            screenCaptureFilterRender = null;
            screenCaptureSurfaceTexture = null;
            screenCaptureLayerWidth = 0;
            screenCaptureLayerHeight = 0;
        }

        // Detach app-owned retirable scene-filter views first. Stop the screen-capture producer
        // while SurfaceFilterRender still owns a valid producer Surface; only afterward may
        // RootEncoder stop encoder consumption and release that Surface/SurfaceTexture.
        if (currentBackgroundFilter != null) {
            try { currentBackgroundFilter.setView(null); } catch (Exception ignored) { }
        }
        if (currentOverlayFilter != null) {
            try { currentOverlayFilter.setOnReleasedListener(null); } catch (Exception ignored) { }
            try { currentOverlayFilter.setView(null); } catch (Exception ignored) { }
        }
        if (stagedSceneFilter != null) {
            try { stagedSceneFilter.setNextOutputFrameListener(null); } catch (Exception ignored) { }
            try { stagedSceneFilter.setOnReleasedListener(null); } catch (Exception ignored) { }
            try { stagedSceneFilter.setView(null); } catch (Exception ignored) { }
        }
        if (stagedBackgroundFilter != null) {
            try { stagedBackgroundFilter.setNextOutputFrameListener(null); } catch (Exception ignored) { }
            try { stagedBackgroundFilter.setOnReleasedListener(null); } catch (Exception ignored) { }
            try { stagedBackgroundFilter.setView(null); } catch (Exception ignored) { }
        }
        if (currentReshareFilter != null) {
            try { currentReshareFilter.setOnReleasedListener(null); } catch (Exception ignored) { }
            try { currentReshareFilter.setView(null); } catch (Exception ignored) { }
        }
        // SurfaceFilterRender owns the Surface passed to MediaProjection. Detach its frame
        // callback and release VirtualDisplay before RtmpStream.release() can release the
        // filter's SurfaceTexture/Surface. Both operations are independent and best-effort.
        RuntimeException screenCaptureLayerReleaseFailure =
                ModeBScreenCaptureLayerRetirement.releaseBeforeRenderer(
                        currentScreenCaptureSurfaceTexture != null
                                ? () -> currentScreenCaptureSurfaceTexture.setOnFrameAvailableListener(null) : null,
                        currentScreenCaptureDisplay != null ? currentScreenCaptureDisplay::release : null);
        sceneReplacementTimeout = null;
        streamTeardownApiFailure = "";
        // Run the strict worker check only after RtmpStream.release() had the opportunity to
        // stop MediaCodec and the GL renderer. A slow but already-quiescent HandlerThread must
        // not make RootEncoder's sequential stopSources() exit before those resources are tried.
        Runnable directSourceFallback = currentDirectScreenSource != null
                ? currentDirectScreenSource::stopAndRequireWorkerRetired : null;
        Runnable audioSourceFallback = createAudioSourceTeardownFallback(currentAudioSources);
        Runnable glFallback = currentStream != null
                ? () -> {
                    Runnable stopGl = retainedGlGuard != null
                            ? () -> retainedGlGuard.stopAndRetry(currentStream.getGlInterface()::stop,
                                    ModeBGlTeardownGuard.DEFAULT_TIMEOUT_MS)
                            : currentStream.getGlInterface()::stop;
                    Runnable workerRetirementCheck = retainedGlGuard != null
                            ? () -> retainedGlGuard.requireTerminated(ModeBGlTeardownGuard.DEFAULT_TIMEOUT_MS)
                            : () -> { throw new IllegalStateException(
                                    "Status worker GL tidak dapat diverifikasi: " + retainedGlCaptureFailure); };
                    Runnable managerRecovery = retainedGlEglStateGuard != null
                            ? retainedGlEglStateGuard::releaseOutstandingManagers
                            : () -> { throw new IllegalStateException(
                                    "Snapshot SurfaceManager tidak tersedia: "
                                            + retainedGlEglStateCaptureFailure); };
                    // Even if stop() throws midway through RootEncoder's sequential manager
                    // cleanup, the independent worker check still runs. Manager releases are
                    // attempted only after the original GL worker is proven terminated.
                    ModeBGlResourceRecovery.run(stopGl, workerRetirementCheck, managerRecovery);
                } : null;
        Runnable glWorkerCheck = currentStream != null
                ? () -> {
                    if (retainedGlGuard == null) {
                        throw new IllegalStateException(
                                "Status worker GL tidak dapat diverifikasi: " + retainedGlCaptureFailure);
                    }
                    retainedGlGuard.requireTerminated(ModeBGlTeardownGuard.DEFAULT_TIMEOUT_MS);
                    if (retainedGlEglStateGuard == null) {
                        throw new IllegalStateException(
                                "Status EGL SurfaceManager tidak dapat diverifikasi: "
                                        + retainedGlEglStateCaptureFailure);
                    }
                    retainedGlEglStateGuard.requireReleased();
                } : null;
        streamTeardownApiCompleted = currentStream == null && directSourceFallback == null
                && audioSourceFallback == null;
        if (currentStream != null || directSourceFallback != null || audioSourceFallback != null) {
            ModeBStreamTeardown.Result teardown = ModeBStreamTeardown.run(
                    currentStream != null && currentStream.isStreaming()
                            ? () -> currentStream.stopStream() : null,
                    currentStream != null ? currentStream::release : null,
                    directSourceFallback, audioSourceFallback, glFallback, glWorkerCheck);
            streamTeardownApiCompleted = teardown.isSuccessful();
            streamTeardownApiFailure = teardown.failureMessage();
        }
        if (screenCaptureLayerReleaseFailure != null) {
            streamTeardownApiCompleted = false;
            String detail = screenCaptureLayerReleaseFailure.getMessage();
            if (detail == null || detail.isEmpty()) detail = screenCaptureLayerReleaseFailure.getClass().getSimpleName();
            streamTeardownApiFailure = streamTeardownApiFailure.isEmpty()
                    ? detail : streamTeardownApiFailure + "; " + detail;
        }
        READINESS_TRACKER.recordStreamTeardownResult(
                cleanupEpoch, streamTeardownApiCompleted, streamTeardownApiFailure);
        if (interruptedSceneCallback != null) {
            try { interruptedSceneCallback.onResult(false, "Sesi Mode B dihentikan sebelum pergantian scene selesai."); } catch (Exception ignored) { }
        }

        if (currentBackgroundView != null) {
            try { currentBackgroundView.releaseBitmap(); } catch (Exception ignored) { }
        }
        if (stagedBackgroundView != null && stagedBackgroundView != currentBackgroundView) {
            try { stagedBackgroundView.releaseBitmap(); } catch (Exception ignored) { }
        }

        // A scene's MediaMetadataRetriever may still be queued on the session visual worker.
        // Keep every namespace until every view confirms that its decoder has released the file.
        final List<StudioOverlayView> viewsToRelease = new ArrayList<>();
        if (currentOverlayView != null) viewsToRelease.add(currentOverlayView);
        if (stagedSceneView != null && !viewsToRelease.contains(stagedSceneView)) viewsToRelease.add(stagedSceneView);
        for (StudioOverlayView retiring : new ArrayList<>(retiringSceneViews)) {
            if (retiring != null && !viewsToRelease.contains(retiring)) viewsToRelease.add(retiring);
        }
        retiringSceneViews.clear();
        retiringSceneNamespaces.clear();
        final ModeBVisualWorker workerToStop = visualWorker;
        visualWorker = null;
        final ModeBScreensaverAudioPcmQueue audioQueueToClose = screensaverAudioQueue;
        assetCleanupCompleted = false;
        final int waitingMediaReleaseCount = currentReshareWaitingView != null ? 1 : 0;
        final java.util.concurrent.atomic.AtomicInteger pendingViewReleases =
                new java.util.concurrent.atomic.AtomicInteger(viewsToRelease.size() + waitingMediaReleaseCount);
        Runnable finishAssetCleanup = () -> {
            if (pendingViewReleases.get() != 0) return;
            Runnable finalize = () -> {
                if (audioQueueToClose != null) audioQueueToClose.close();
                if (screensaverAudioQueue == audioQueueToClose) screensaverAudioQueue = null;
                if (workerToStop != null) workerToStop.shutdownAfterQueuedTasks();

                // A completed media-worker barrier proves that files are no longer in use; it
                // does not prove that the filesystem actually removed every namespace. Keep
                // session restart gated until deleteAll() confirms success.
                final class NamespaceCleanupAttempt implements Runnable {
                    private int retriesScheduled;

                    @Override public void run() {
                        boolean deleted = false;
                        try {
                            deleted = ModeBAssetNamespace.deleteAll(appContext);
                        } catch (RuntimeException ignored) {
                            // Retry transient filesystem failures; never acknowledge them as done.
                        }
                        if (deleted) {
                            assetCleanupCompleted = true;
                            boolean becameReady = READINESS_TRACKER.markAssetCleanupSucceeded(cleanupEpoch);
                            if (asyncReadinessNotifyReady.get() && becameReady && !lastStreaming) {
                                publish(lastStatus, lastMessage, false, 0);
                            }
                            return;
                        }

                        assetCleanupCompleted = false;
                        if (ModeBAssetCleanupRetryPolicy.shouldRetry(retriesScheduled)) {
                            long delayMs = ModeBAssetCleanupRetryPolicy.retryDelayMs(retriesScheduled);
                            retriesScheduled++;
                            // A rejected retry also leaves cleanup incomplete (fail closed).
                            if (!MAIN.postDelayed(this, delayMs)) {
                                READINESS_TRACKER.markAssetCleanupFailed(
                                        cleanupEpoch, "Gagal menjadwalkan ulang pembersihan cache aset.");
                                if (asyncReadinessNotifyReady.get() && !lastStreaming) {
                                    publish("error", READINESS_TRACKER.getBlockedReason(), false, 0);
                                }
                            }
                        } else {
                            READINESS_TRACKER.markAssetCleanupFailed(
                                    cleanupEpoch, "Cache aset Mode B gagal dibersihkan setelah batas retry.");
                            if (asyncReadinessNotifyReady.get() && !lastStreaming) {
                                publish("error", READINESS_TRACKER.getBlockedReason(), false, 0);
                            }
                        }
                    }
                }
                new NamespaceCleanupAttempt().run();
            };
            if (Looper.myLooper() == Looper.getMainLooper()) finalize.run();
            else MAIN.post(finalize);
        };
        if (currentReshareWaitingView != null) {
            currentReshareWaitingView.releaseMedia(() -> {
                pendingViewReleases.decrementAndGet();
                finishAssetCleanup.run();
            });
        }
        if (viewsToRelease.isEmpty() && waitingMediaReleaseCount == 0) {
            finishAssetCleanup.run();
        } else {
            for (StudioOverlayView view : viewsToRelease) {
                view.releaseAssets(() -> {
                    pendingViewReleases.decrementAndGet();
                    finishAssetCleanup.run();
                });
            }
        }
        bitmapBudget = null;
        synchronized (pendingOverlayEvents) { pendingOverlayEvents.clear(); }
        MediaProjection currentProjection = mediaProjection;
        MediaProjection.Callback currentCallback = projectionCallback;
        mediaProjection = null;
        projectionCallback = null;
        if (currentProjection != null) {
            try {
                if (currentCallback != null) currentProjection.unregisterCallback(currentCallback);
            } catch (Exception ignored) { }
            try {
                currentProjection.stop();
            } catch (Exception ignored) { }
        }
        asyncReadinessNotifyReady.set(true);
    }

    private void clearOverlayAssetDirectory() {
        ModeBAssetNamespace.deleteAll(getApplicationContext());
    }

    @Override
    public void onDestroy() {
        if (activeInstance.get() == this) activeInstance.clear();
        if (stopRequested.compareAndSet(false, true)) {
            cleanupResources();
            if (streamTeardownApiCompleted) {
                publish("stopped", "Layanan siaran dihentikan oleh sistem.", false, 0);
            } else {
                publish("error", appendStreamTeardownFailure("Layanan siaran dihentikan oleh sistem."), false, 0);
            }
        } else {
            cleanupResources();
        }
        super.onDestroy();
    }

    /** Starts a watchdog only after the RTMP publish handshake has succeeded. */
    private void startStreamHealthMonitor() {
        stopStreamHealthMonitor();
        RtmpStream current = stream;
        if (current == null || stopRequested.get()) return;
        sessionWasLive = true;
        try {
            lastObservedSentBytes = current.getStreamClient().getBytesSend();
        } catch (Exception ignored) {
            lastObservedSentBytes = -1L;
        }
        lastSendProgressAtMs = SystemClock.elapsedRealtime();
        streamConfirmedLive = true;
        MAIN.removeCallbacks(streamHealthCheck);
        MAIN.postDelayed(streamHealthCheck, STREAM_HEALTH_INTERVAL_MS);
    }

    private void stopStreamHealthMonitor() {
        streamConfirmedLive = false;
        MAIN.removeCallbacks(streamHealthCheck);
        lastObservedSentBytes = -1L;
        lastSendProgressAtMs = 0L;
    }

    /**
     * RootEncoder 2.8.1 deliberately ignores socket read timeouts in its read loop. A Wi-Fi
     * handoff can therefore leave the publish session apparently alive without sending bytes.
     * Monitor bytes counted after successful RTMP packet writes and let the bounded retry policy
     * recover only after a sustained lack of transport progress.
     */
    private void checkStreamSendProgress() {
        if (!streamConfirmedLive || stopRequested.get() || retryPending.get()) return;
        RtmpStream current = stream;
        if (current == null || !current.isStreaming()) {
            stopStreamHealthMonitor();
            return;
        }

        final long now = SystemClock.elapsedRealtime();
        final long sentBytes;
        try {
            sentBytes = current.getStreamClient().getBytesSend();
        } catch (Exception exception) {
            MAIN.postDelayed(streamHealthCheck, STREAM_HEALTH_INTERVAL_MS);
            return;
        }

        if (ModeBStreamHealthPolicy.hasSendProgress(sentBytes, lastObservedSentBytes)) {
            lastObservedSentBytes = sentBytes;
            lastSendProgressAtMs = now;
        } else if (ModeBStreamHealthPolicy.isSendStalled(
                now, lastSendProgressAtMs, STREAM_SEND_STALL_TIMEOUT_MS)) {
            onConnectionFailed("RTMP send stalled: no successfully transmitted audio/video bytes for "
                    + (STREAM_SEND_STALL_TIMEOUT_MS / 1000L) + " seconds. Checking network and retrying.");
            return;
        }

        if (streamConfirmedLive && !stopRequested.get()) {
            MAIN.postDelayed(streamHealthCheck, STREAM_HEALTH_INTERVAL_MS);
        }
    }

    /** Do not report LIVE until RTMP is connected and the projection layer delivered its first frame. */
    private void publishLiveWhenProjectionReady() {
        if (reshareWaiting && !reshareInProgress) {
            if (connectionEstablished && !streamConfirmedLive && !retryPending.get()) startStreamHealthMonitor();
            updateStreamingNotification("LIVE berjalan · menunggu layar dibagikan kembali");
            publish("reshare_waiting", "RTMP tetap aktif. Bagikan layar lagi untuk melanjutkan tampilan.",
                    true, latestConnectedBitrateKbps);
            return;
        }
        if (reshareInProgress && screenCaptureLayerRequired && !screenCaptureFirstFrameReady.get()) {
            if (connectionEstablished && !streamConfirmedLive && !retryPending.get()) startStreamHealthMonitor();
            publish("resharing", "RTMP tetap aktif. Menunggu frame pertama dari layar yang baru dibagikan…",
                    true, latestConnectedBitrateKbps);
            return;
        }
        if (reshareInProgress && (!screenCaptureLayerRequired || screenCaptureFirstFrameReady.get())) {
            finishReshareAfterFirstFrame();
            return;
        }
        boolean projectionReady = !screenCaptureLayerRequired || screenCaptureFirstFrameReady.get();
        if (!ModeBStreamReadinessPolicy.canPublishLive(
                connectionEstablished, retryPending.get(), screenCaptureLayerRequired,
                projectionReady, stopRequested.get())) {
            if (!stopRequested.get() && connectionEstablished && screenCaptureLayerRequired && !projectionReady
                    && !retryPending.get()) {
                publish("connecting", "RTMP tersambung; menunggu frame layar pertama dari MediaProjection.", false, 0);
            }
            return;
        }
        if (!streamConfirmedLive) {
            if (studioOverlayView != null) studioOverlayView.startVideoPlayback();
            startStreamHealthMonitor();
        }
        // Android 14 single-app capture can report the selected app hidden before the first
        // RTMP-ready callback. Apply the waiting card once the transport is genuinely live.
        if (screensaverPolicy.enabled && screenCaptureLayerRequired
                && !capturedContentVisible && !hostWaitActive) {
            setHostWaitFromUser(true);
        }
        String message = "Siaran RTMP berhasil terhubung.";
        if (studioOverlayView != null) message += " " + studioOverlayView.getRenderSummary();
        else if (!overlayNotice.isEmpty()) message += " " + overlayNotice;
        if (!captureLayerNotice.isEmpty()) message += " " + captureLayerNotice;
        message += screensaverPolicy.runtimeNotice();
        if (hostWaitActive) {
            publish("host_wait", screensaverPolicy.text + " · LIVE tetap berjalan.", true, latestConnectedBitrateKbps);
        } else {
            publish("live", message, true, latestConnectedBitrateKbps);
        }
        if (screensaverPolicy.enabled && !reshareWaiting) showHostWaitFloatingControl();
        updateStreamingNotification(hostWaitActive ? "LIVE berjalan · layar tunggu aktif" : "LIVE · siaran aktif");
    }

    @Override
    public void onConnectionStarted(String url) {
        stopStreamHealthMonitor();
        connectionEstablished = false;
        if (studioOverlayView != null) studioOverlayView.pauseVideoPlayback();
        retryPending.set(false);
        if (!stopRequested.get()) {
            if (reshareWaiting || reshareInProgress) {
                publish(reshareInProgress ? "resharing" : "reshare_waiting",
                        "RTMP sedang menyambung ulang. Setelah koneksi pulih, bagikan layar lagi untuk melanjutkan tampilan.",
                        true, latestConnectedBitrateKbps);
            } else if (hostWaitActive) {
                updateStreamingNotification("LIVE berjalan · layar tunggu aktif · RTMP menyambung ulang");
                publish("host_wait", screensaverPolicy.text + " · RTMP sedang menyambung ulang.", true, latestConnectedBitrateKbps);
            } else {
                publish("connecting", "Menghubungkan encoder ke server RTMP.", false, 0);
            }
        }
    }

    @Override
    public void onConnectionSuccess() {
        retryPending.set(false);
        if (!stopRequested.get()) {
            connectionEstablished = true;
            MAIN.post(this::publishLiveWhenProjectionReady);
        }
    }

    @Override
    public void onNewBitrate(long bitrate) {
        if (!stopRequested.get()) {
            latestConnectedBitrateKbps = Math.max(0, bitrate / 1000);
            MAIN.post(this::publishLiveWhenProjectionReady);
        }
    }

    @Override
    public void onConnectionFailed(String reason) {
        if (stopRequested.get()) return;
        // Reject any late bitrate callback from the failed connection while a bounded retry is pending.
        connectionEstablished = false;
        stopStreamHealthMonitor();
        if (studioOverlayView != null) studioOverlayView.pauseVideoPlayback();
        String failure = reason == null ? "Koneksi RTMP gagal." : reason;
        if (isPermanentRtmpFailure(failure)) {
            endSession("error", "Server menolak stream. Periksa alamat server dan Stream Key. Detail: " + failure);
            return;
        }
        if (!retryPending.compareAndSet(false, true)) return;
        RtmpStream current = stream;
        boolean retryAccepted = false;
        if (current != null) {
            try {
                retryAccepted = current.getStreamClient().reTry(1800L, failure);
            } catch (Exception ignored) { }
        }
        if (retryAccepted) {
            publish("connecting", "Koneksi RTMP terganggu. Mencoba sambung ulang (maksimal 3 percobaan)…", false, 0);
            return;
        }
        retryPending.set(false);
        endSession("error", safeMessage(null, "Koneksi RTMP gagal setelah percobaan ulang: " + failure));
    }

    private boolean isPermanentRtmpFailure(String reason) {
        return ModeBStreamPolicy.isPermanentRtmpFailure(reason);
    }

    @Override
    public void onDisconnect() {
        stopStreamHealthMonitor();
        retryPending.set(false);
        if (!stopRequested.get()) endSession("disconnected", "Koneksi RTMP terputus.");
    }

    @Override
    public void onAuthError() {
        stopStreamHealthMonitor();
        retryPending.set(false);
        if (!stopRequested.get()) {
            endSession("error", "Server menolak autentikasi Stream Key. Periksa alamat server dan Stream Key.");
        }
    }

    @Override
    public void onAuthSuccess() {
        if (!stopRequested.get()) publish("connecting", "Autentikasi server berhasil.", false, 0);
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static int clampEven(int value, int min, int max) {
        int bounded = clamp(value, min, max);
        return bounded % 2 == 0 ? bounded : bounded - 1;
    }

    private static String safeMessage(@Nullable Exception exception, String fallback) {
        if (exception != null && exception.getMessage() != null && !exception.getMessage().trim().isEmpty()) {
            return exception.getMessage();
        }
        return fallback == null || fallback.trim().isEmpty() ? "Terjadi kesalahan pada siaran RTMP." : fallback;
    }

    private String explainSecurityException(SecurityException exception) {
        return "Android menolak izin capture, audio, kamera, atau foreground service. Periksa izin berbagi layar, RECORD_AUDIO untuk sumber audio, dan CAMERA bila preset memakai elemen kamera, lalu coba lagi.";
    }
}
