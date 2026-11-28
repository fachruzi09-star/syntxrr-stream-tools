package com.syntxrr.streamtools;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * FloatingCompanionPlugin
 * Capacitor bridge exposing native Android permissions and CompanionService
 * lifecycle controls to the SYNTXRR STREAM web application.
 *
 * Phase 4.4 / P0-2: the Floating HUD is native-first (it must render above the TikTok app).
 * Native TikTok LIVE states and events update FloatingHudManager directly without waiting
 * for a WebView round-trip, while JS listeners continue receiving events for TTS, SFX,
 * Song Request, and in-app UI. Listener & HUD lifecycle follow CompanionService so
 * Activity pause/recreation never drops live events.
 */
@CapacitorPlugin(
    name = "FloatingCompanion",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        ),
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        )
    }
)
public class FloatingCompanionPlugin extends Plugin {

    private static final long[] MIXER_PROMO_RETRY_DELAYS_MS = { 120L, 250L, 500L };

    private static final long EVENT_BATCH_FLUSH_INTERVAL_MS = 90L;
    private static final int EVENT_BATCH_EARLY_FLUSH_SIZE = 64;
    private static final int EVENT_BATCH_PENDING_CAPACITY = 256;

    private static final Object sSharedLock = new Object();
    private static final NativeTikTokEventBuffer sEventBuffer = new NativeTikTokEventBuffer();
    @Nullable
    private static volatile FloatingHudManager sSharedHudManager;
    @Nullable
    private static volatile WeakReference<FloatingCompanionPlugin> sActivePluginRef;
    private static volatile boolean sTikTokListenerAttached = false;

    private static final TikTokLiveConnector.Listener sSharedTikTokListener =
            new TikTokLiveConnector.Listener() {
                @Override
                public void onStateChanged(@NonNull JSONObject stateJson) {
                    FloatingHudManager hud = getSharedHudManagerIfCreated();
                    if (hud != null) {
                        hud.updateNativeTikTokState(stateJson);
                    }
                    FloatingCompanionPlugin plugin = getActivePlugin();
                    if (plugin != null) {
                        plugin.emitToJs("tiktokLiveState", toJsObject(stateJson));
                    }
                }

                @Override
                public void onEventDecoded(@NonNull JSONObject eventJson) {
                    // 1. Rekam event ke bounded replay buffer native sebelum notifikasi JS.
                    JSONObject sequencedEvent = sEventBuffer.record(eventJson);

                    // 2. Pertahankan alur Native Floating HUD menggunakan payload asli.
                    FloatingHudManager hud = getSharedHudManagerIfCreated();
                    if (hud != null) {
                        hud.pushNativeTikTokEvent(eventJson);
                    }

                    // 3. Antrekan salinan berurutan ke batch queue plugin aktif (jika ada).
                    FloatingCompanionPlugin plugin = getActivePlugin();
                    if (plugin != null) {
                        plugin.enqueueTikTokEventForBatch(sequencedEvent);
                    }
                }
            };

    @Nullable
    private static FloatingCompanionPlugin getActivePlugin() {
        WeakReference<FloatingCompanionPlugin> ref = sActivePluginRef;
        return ref != null ? ref.get() : null;
    }

    @Nullable
    private static FloatingHudManager getSharedHudManagerIfCreated() {
        return sSharedHudManager;
    }

    /**
     * Dipanggil ketika CompanionService benar-benar dihentikan (termasuk saat Activity
     * sudah dihancurkan): lepas listener native, hentikan konektor jika masih aktif, dan
     * bersihkan buffer 60 item Floating HUD serta replay buffer proses.
     */
    public static void onNativeCompanionStopped(@NonNull Context appContext) {
        Context safeContext = appContext.getApplicationContext();
        TikTokLiveConnector connector = TikTokLiveConnector.getInstance(safeContext);
        connector.setListener(null);
        if (connector.isSessionActive()) {
            connector.disconnect("Companion Service dihentikan.");
        }

        FloatingCompanionPlugin activePlugin = getActivePlugin();
        if (activePlugin != null) {
            activePlugin.clearPendingTikTokEventBatch();
        }
        sEventBuffer.beginSession();

        final FloatingHudManager hud;
        final boolean shouldDestroyHud;
        synchronized (sSharedLock) {
            sTikTokListenerAttached = false;
            hud = sSharedHudManager;
            shouldDestroyHud = hud != null && getActivePlugin() == null;
            if (shouldDestroyHud) {
                sSharedHudManager = null;
            }
        }
        if (hud != null) {
            hud.clearNativeTikTokSession(true);
            if (shouldDestroyHud) {
                hud.destroy();
            }
        }
    }

    private final Object mMicLock = new Object();
    private final CompanionService.OnCompanionLifecycleListener mServiceLifecycleListener =
            new CompanionService.OnCompanionLifecycleListener() {
                @Override
                public void onCompanionStopped() {
                    handleCompanionServiceStopped();
                }
            };

    @Override
    public void load() {
        super.load();
        synchronized (sSharedLock) {
            sActivePluginRef = new WeakReference<>(this);
        }
        CompanionService.setLifecycleListener(mServiceLifecycleListener);
        getHudManager();
        attachTikTokConnectorListener();
    }

    @PluginMethod
    public void checkOverlayPermission(PluginCall call) {
        Context context = getContext();
        boolean hasOverlay = true;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            hasOverlay = Settings.canDrawOverlays(context);
        }

        JSObject ret = new JSObject();
        ret.put("granted", hasOverlay);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        Context context = getContext();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (Settings.canDrawOverlays(context)) {
                JSObject ret = new JSObject();
                ret.put("granted", true);
                ret.put("openedSettings", false);
                call.resolve(ret);
                return;
            }

            try {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + context.getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);

                JSObject ret = new JSObject();
                ret.put("granted", false);
                ret.put("openedSettings", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Gagal membuka halaman pengaturan overlay: " + e.getMessage());
            }
        } else {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            ret.put("openedSettings", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        Context context = getContext();
        boolean granted = true;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // API 33+
            granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;
        } else {
            granted = NotificationManagerCompat.from(context).areNotificationsEnabled();
        }

        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getPermissionState("notifications") == PermissionState.GRANTED) {
                JSObject ret = new JSObject();
                ret.put("granted", true);
                call.resolve(ret);
            } else {
                requestPermissionForAlias("notifications", call, "notificationPermCallback");
            }
        } else {
            boolean granted = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            JSObject ret = new JSObject();
            ret.put("granted", granted);
            call.resolve(ret);
        }
    }

    @PermissionCallback
    private void notificationPermCallback(PluginCall call) {
        boolean granted = getPermissionState("notifications") == PermissionState.GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    private boolean hasRecordAudioPermission() {
        return ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void checkMicPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasRecordAudioPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestMicPermission(PluginCall call) {
        if (hasRecordAudioPermission()) {
            FloatingHudManager hud = getSharedHudManagerIfCreated();
            if (hud != null && hud.isHudVisible() && "mixer".equals(hud.getActivePanel())) {
                syncHudMixerMicStatus();
            }
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        if (getActivity() == null) {
            call.reject("Permintaan izin mikrofon hanya dapat dilakukan saat aplikasi berada di foreground.");
            return;
        }
        requestPermissionForAlias("microphone", call, "micPermCallback");
    }

    @PermissionCallback
    private void micPermCallback(PluginCall call) {
        boolean granted = getPermissionState("microphone") == PermissionState.GRANTED
                || hasRecordAudioPermission();
        if (granted) {
            FloatingHudManager hud = getSharedHudManagerIfCreated();
            if (hud != null && hud.isHudVisible() && "mixer".equals(hud.getActivePanel())) {
                syncHudMixerMicStatus();
            }
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    private boolean refreshCompanionMicrophoneTypeIfForeground() {
        return false;
    }

    /**
     * Menjalankan CompanionService sebagai foreground service. Ini yang mencegah proses
     * dibekukan Android (cached app freezer) saat pengguna berada di aplikasi TikTok,
     * sehingga perintah HUD tetap sampai ke JavaScript.
     */
    private void startCompanionService(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent);
        } else {
            context.startService(intent);
        }
    }

    /**
     * Mengirim event ke JavaScript secara aman. Saat WebView dibekukan atau sedang
     * dibuat ulang, notifikasi bisa gagal; kegagalan dicatat dan tidak boleh membuat
     * overlay crash atau mengubah status palsu.
     */
    private void emitToJs(@NonNull String event, @NonNull JSObject data) {
        tryEmitToJs(event, data);
    }

    private boolean tryEmitToJs(@NonNull String event, @NonNull JSObject data) {
        try {
            notifyListeners(event, data);
            return true;
        } catch (Exception e) {
            android.util.Log.w("FloatingCompanion",
                    "Gagal mengirim event " + event + ": " + e.getMessage());
            return false;
        }
    }

    @PluginMethod
    public void startCompanion(PluginCall call) {
        Context context = getContext();

        // 1. Baca opsi requireOverlay (default false untuk fleksibilitas)
        boolean requireOverlay = call.getBoolean("requireOverlay", false);

        // 2. Evaluasi status izin overlay secara aktual
        boolean overlayGranted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            overlayGranted = Settings.canDrawOverlays(context);
        }

        // 3. Jika pemanggil mewajibkan overlay dan belum ada izin, tolak secara tegas
        if (requireOverlay && !overlayGranted) {
            call.reject("Izin Tampilkan di Atas Aplikasi Lain (Overlay) wajib diaktifkan untuk mode ini.");
            return;
        }

        // 4. Start Companion Service (foreground agar proses tidak dibekukan)
        try {
            Intent intent = new Intent(context, CompanionService.class);
            intent.setAction(CompanionService.ACTION_START);
            startCompanionService(context, intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("isRunning", true);
            ret.put("overlayActive", false); // UI overlay belum dirender di Phase 4.2
            ret.put("overlayPermissionGranted", overlayGranted);
            ret.put("message", overlayGranted
                ? "Companion Service aktif dengan izin overlay tersedia."
                : "Companion Service aktif tanpa izin overlay (background controller mode).");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Gagal menjalankan Companion Service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopCompanion(PluginCall call) {
        Context context = getContext();
        stopMonitorOnCompanionShutdown("Companion Service dihentikan.");
        onNativeCompanionStopped(context.getApplicationContext());

        try {
            Intent intent = new Intent(context, CompanionService.class);
            intent.setAction(CompanionService.ACTION_STOP);
            context.startService(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("isRunning", false);
            ret.put("overlayActive", false);
            ret.put("message", "Companion Service dihentikan.");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Gagal menghentikan Companion Service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isCompanionRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isRunning", CompanionService.isRunning());
        call.resolve(ret);
    }

    // =========================================================================
    // NATIVE FLOATING HUD INTEGRATION
    // =========================================================================

    @Nullable
    private NativeSoundPoolManager mSoundPoolManager;
    @Nullable
    private NativeMicMonitor mMicMonitor;
    private boolean mMicMuted = false;
    private int mMixerPromoRetryIndex = 0;
    private final android.os.Handler mMainHandler =
            new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable mDeferredMixerStartTask = new Runnable() {
        @Override
        public void run() {
            FloatingHudManager hud = getSharedHudManagerIfCreated();
            if (hud == null || !hud.isHudVisible() || !"mixer".equals(hud.getActivePanel())) {
                cancelMixerPromoRetry();
                return;
            }
            boolean muted;
            synchronized (mMicLock) {
                muted = mMicMuted;
            }
            if (muted || !hasRecordAudioPermission()) {
                cancelMixerPromoRetry();
                startNativeMicMonitorIfEligible();
                return;
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R
                    || (CompanionService.isRunning() && CompanionService.hasMicrophoneForegroundType())) {
                cancelMixerPromoRetry();
                startNativeMicMonitorIfEligible();
                return;
            }

            final long nextDelayMs;
            synchronized (mMicLock) {
                mMixerPromoRetryIndex++;
                if (mMixerPromoRetryIndex < MIXER_PROMO_RETRY_DELAYS_MS.length) {
                    nextDelayMs = MIXER_PROMO_RETRY_DELAYS_MS[mMixerPromoRetryIndex];
                } else {
                    mMixerPromoRetryIndex = 0;
                    nextDelayMs = -1L;
                }
            }
            if (nextDelayMs >= 0L) {
                mMainHandler.postDelayed(this, nextDelayMs);
            } else {
                startNativeMicMonitorIfEligible();
            }
        }
    };

    private void scheduleMixerMicStartCheck() {
        synchronized (mMicLock) {
            mMixerPromoRetryIndex = 0;
        }
        mMainHandler.removeCallbacks(mDeferredMixerStartTask);
        mMainHandler.postDelayed(mDeferredMixerStartTask, MIXER_PROMO_RETRY_DELAYS_MS[0]);
    }

    private void cancelMixerPromoRetry() {
        synchronized (mMicLock) {
            mMixerPromoRetryIndex = 0;
        }
        mMainHandler.removeCallbacks(mDeferredMixerStartTask);
    }

    private synchronized NativeSoundPoolManager getSoundPoolManager() {
        if (mSoundPoolManager == null) {
            Context appContext = getContext().getApplicationContext();
            mSoundPoolManager = new NativeSoundPoolManager(appContext);
            mSoundPoolManager.setPlaybackListener(new NativeSoundPoolManager.OnSoundPlaybackListener() {
                @Override
                public void onSoundStarted(final String soundId) {
                    runOnUi(() -> {
                        FloatingHudManager hud = getSharedHudManagerIfCreated();
                        if (hud != null) {
                            hud.setSoundboardPlayingState(soundId, true);
                        }
                    });
                }

                @Override
                public void onSoundCompleted(final String soundId) {
                    runOnUi(() -> {
                        FloatingHudManager hud = getSharedHudManagerIfCreated();
                        if (hud != null) {
                            hud.setSoundboardPlayingState(soundId, false);
                        }
                    });
                }
            });
        }
        return mSoundPoolManager;
    }

    private FloatingHudManager getHudManager() {
        final FloatingHudManager hud;
        synchronized (sSharedLock) {
            if (sSharedHudManager == null) {
                Context appContext = getContext().getApplicationContext();
                sSharedHudManager = new FloatingHudManager(appContext);
            }
            hud = sSharedHudManager;
        }

        // Pastikan callback pada shared HUD selalu menunjuk plugin aktif via WeakReference
        // sehingga Activity recreation tidak membocorkan instance lama maupun memutus aksi.
        hud.setOnHudClickListener(new FloatingHudManager.OnHudClickListener() {
            @Override
            public void onHudClick() {
                FloatingCompanionPlugin plugin = getActivePlugin();
                if (plugin != null) {
                    JSObject data = new JSObject();
                    data.put("timestamp", System.currentTimeMillis());
                    plugin.emitToJs("floatingHudClick", data);
                }
            }
        });

        hud.setOnHudActionListener(new FloatingHudManager.OnHudActionListener() {
            @Override
            public void onHudCommand(@NonNull String action, @Nullable String id, int value) {
                FloatingCompanionPlugin plugin = getActivePlugin();
                FloatingHudManager currentHud = getSharedHudManagerIfCreated();

                if ("soundboard.play".equals(action)) {
                    if (plugin != null) {
                        String soundId = (id != null && !id.isEmpty()) ? id : "horn";
                        plugin.getSoundPoolManager().playSynthSound(soundId, 1.0f);
                    }
                } else if ("music.toggle".equals(action)) {
                    if (currentHud != null) {
                        currentHud.toggleMusicState();
                    }
                } else if ("music.next".equals(action)) {
                    if (currentHud != null) {
                        currentHud.advanceMusicQueue();
                    }
                } else if ("music.mute".equals(action)) {
                    if (currentHud != null) {
                        currentHud.toggleMusicMute();
                    }
                } else if ("music.volume".equals(action)) {
                    if (currentHud != null) {
                        currentHud.setMusicVolume(value);
                    }
                } else if ("mixer.sfx".equals(action)) {
                    if (plugin != null) {
                        plugin.getSoundPoolManager().setMasterVolume(value / 100.0f);
                    }
                } else if ("chat.tab".equals(action)) {
                    if (currentHud == null || !currentHud.selectChatTab(id)) {
                        return;
                    }
                } else if ("mic.mute".equals(action)) {
                    if (plugin != null) {
                        plugin.handleHudMicMuteCommand();
                    }
                }

                if (plugin != null) {
                    JSObject data = new JSObject();
                    data.put("action", action);
                    if (id != null) {
                        data.put("id", id);
                    }
                    data.put("value", value);
                    plugin.emitToJs("hudCommand", data);
                }
            }

            @Override
            public void onHudPanelChanged(@Nullable String panel) {
                FloatingCompanionPlugin plugin = getActivePlugin();
                if (plugin != null) {
                    plugin.cancelMixerPromoRetry();
                    plugin.stopNativeMicMonitor();
                    if ("mixer".equals(panel)) {
                        plugin.syncHudMixerMicStatus();
                    }

                    JSObject data = new JSObject();
                    if (panel != null) {
                        data.put("panel", panel);
                    }
                    plugin.emitToJs("hudPanelChanged", data);
                }
            }
        });

        return hud;
    }

    private void handleHudMicMuteCommand() {
        synchronized (mMicLock) {
            mMicMuted = !mMicMuted;
            mMixerPromoRetryIndex = 0;
        }
        cancelMixerPromoRetry();
        stopNativeMicMonitor();
        syncHudMixerMicStatus();
    }

    private void syncHudMixerMicStatus() {
        FloatingHudManager hud = getSharedHudManagerIfCreated();
        if (hud == null || !hud.isHudVisible() || !"mixer".equals(hud.getActivePanel())) {
            return;
        }
        final boolean muted;
        synchronized (mMicLock) {
            muted = mMicMuted;
        }
        if (muted) {
            hud.updateMixerMicState(
                    false,
                    true,
                    0,
                    "Monitor dimute",
                    "warn",
                    "Monitor lokal SYNTXRR dimute. Mikrofon TikTok LIVE tidak terpengaruh."
            );
            return;
        }

        boolean externalCapture = getMicMonitor().isExternalAudioCaptureActive(-1);
        if (externalCapture || CompanionService.isRunning()) {
            hud.updateMixerMicState(
                    false,
                    false,
                    0,
                    externalCapture ? "Dipakai TikTok LIVE" : "Mode non-intervensi",
                    "ok",
                    "Mikrofon tetap dikelola TikTok LIVE agar audio siaran tidak terputus."
            );
            return;
        }

        if (!hasRecordAudioPermission()) {
            hud.updateMixerMicState(
                    false,
                    false,
                    0,
                    "Izin diperlukan",
                    "off",
                    "Berikan izin mikrofon (RECORD_AUDIO) di aplikasi SYNTXRR."
            );
            return;
        }

        hud.updateMixerMicState(
                false,
                false,
                0,
                "Monitor dijeda",
                "off",
                "Monitor mic overlay tidak mengambil alih mikrofon perangkat."
        );
    }

    private NativeMicMonitor getMicMonitor() {
        synchronized (mMicLock) {
            if (mMicMonitor == null) {
                Context appContext = getContext().getApplicationContext();
                CompanionService.setLifecycleListener(mServiceLifecycleListener);
                mMicMonitor = new NativeMicMonitor(appContext);
                mMicMonitor.setListener(new NativeMicMonitor.OnMicLevelListener() {
                    @Override
                    public void onMicStateChanged(
                            @NonNull NativeMicMonitor.Status status,
                            int level,
                            @Nullable String reason) {
                        handleNativeMicStateChanged(status, level, reason);
                    }
                });
            }
            return mMicMonitor;
        }
    }

    private void startNativeMicMonitorIfEligible() {
        // Jangan pernah membuka AudioRecord(MIC) dari overlay Floating HUD agar tidak
        // merebut atau memutus capture mikrofon aplikasi TikTok LIVE.
        cancelMixerPromoRetry();
        stopNativeMicMonitor();
        syncHudMixerMicStatus();
    }

    private void stopNativeMicMonitor() {
        final NativeMicMonitor monitor;
        synchronized (mMicLock) {
            monitor = mMicMonitor;
        }
        if (monitor != null) {
            monitor.stop();
        }
    }

    private void stopMonitorOnCompanionShutdown(@Nullable String reason) {
        synchronized (mMicLock) {
            mMicMuted = false;
            mMixerPromoRetryIndex = 0;
        }
        mMainHandler.removeCallbacks(mDeferredMixerStartTask);
        stopNativeMicMonitor();
        FloatingHudManager hud = getSharedHudManagerIfCreated();
        if (hud != null && hud.isHudVisible() && "mixer".equals(hud.getActivePanel())) {
            hud.updateMixerMicState(
                    false,
                    false,
                    0,
                    "Monitor dijeda",
                    "off",
                    reason
            );
        }
    }

    private void handleCompanionServiceStopped() {
        mMainHandler.post(() -> {
            if (!CompanionService.isRunning()) {
                stopMonitorOnCompanionShutdown("Companion Service dihentikan.");
            }
        });
    }

    private void handleNativeMicStateChanged(
            @NonNull NativeMicMonitor.Status status,
            int level,
            @Nullable String reason) {
        FloatingHudManager hud = getSharedHudManagerIfCreated();
        if (hud == null || !hud.isHudVisible() || !"mixer".equals(hud.getActivePanel())) {
            return;
        }
        final boolean muted;
        final NativeMicMonitor monitor;
        synchronized (mMicLock) {
            muted = mMicMuted;
            monitor = mMicMonitor;
        }
        if (monitor == null) {
            return;
        }
        if (muted) {
            if (status == NativeMicMonitor.Status.STOPPED) {
                hud.updateMixerMicState(
                        false,
                        true,
                        0,
                        "Monitor dijeda",
                        "warn",
                        "Monitor mic SYNTXRR dimute (tidak memengaruhi aplikasi lain)."
                );
            }
            return;
        }
        if (status != NativeMicMonitor.Status.STOPPED
                && status != NativeMicMonitor.Status.UNAVAILABLE
                && !monitor.isRunning()) {
            return;
        }

        switch (status) {
            case ACTIVE:
                hud.updateMixerMicState(true, false, level, "Aktif", "ok", null);
                break;
            case NO_SIGNAL:
                hud.updateMixerMicState(
                        true,
                        false,
                        0,
                        "Tidak ada sinyal",
                        "warn",
                        reason != null ? reason : "Belum ada sinyal suara masuk."
                );
                break;
            case SILENCED:
                hud.updateMixerMicState(
                        false,
                        false,
                        0,
                        "Mikrofon di-silence oleh Android",
                        "warn",
                        reason != null ? reason : "Capture mikrofon dibisukan oleh sistem Android."
                );
                break;
            case UNAVAILABLE:
                hud.updateMixerMicState(
                        false,
                        false,
                        0,
                        hasRecordAudioPermission() ? "Tidak tersedia" : "Izin diperlukan",
                        "off",
                        reason != null ? reason : "Mikrofon tidak tersedia."
                );
                break;
            case STOPPED:
            default:
                hud.updateMixerMicState(false, false, 0, "Monitor dijeda", "off", reason);
                break;
        }
    }

    private void runOnUi(Runnable task) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(task);
        } else {
            mMainHandler.post(task);
        }
    }

    @PluginMethod
    public void showFloatingHud(PluginCall call) {
        Context context = getContext();

        // 0. Baca geometri bubble dari pengaturan (default 56dp, 100%, sisi kanan)
        Integer sizeDpOpt = call.getInt("sizeDp", 56);
        Integer opacityOpt = call.getInt("opacity", 100);
        String positionOpt = call.getString("position", "right");
        final int sizeDp = sizeDpOpt != null ? sizeDpOpt : 56;
        final int opacity = opacityOpt != null ? opacityOpt : 100;
        final boolean alignLeft = "left".equalsIgnoreCase(positionOpt);

        // 1. Verifikasi izin overlay terlebih dahulu
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            call.reject("Izin Tampilkan di Atas Aplikasi Lain (Overlay) belum aktif.");
            return;
        }

        // 2. Operasi WindowManager harus dijalankan pada UI Thread
        if (getActivity() == null) {
            call.reject("Activity tidak tersedia untuk menampilkan Floating HUD.");
            return;
        }

        // Pastikan CompanionService berjalan sebagai foreground service agar proses tidak
        // dibekukan sistem (Android cached app freezer) saat pengguna membuka TikTok LIVE.
        if (!CompanionService.isRunning()) {
            try {
                Intent serviceIntent = new Intent(context, CompanionService.class);
                serviceIntent.setAction(CompanionService.ACTION_START);
                startCompanionService(context, serviceIntent);
            } catch (Exception e) {
                android.util.Log.w("FloatingCompanion", "Gagal auto-start CompanionService saat showHud: " + e.getMessage());
            }
        }

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    boolean shown = getHudManager().showHud(sizeDp, opacity, alignLeft);
                    JSObject ret = new JSObject();
                    ret.put("success", shown);
                    ret.put("isVisible", shown);
                    ret.put("message", shown
                        ? "Floating HUD berhasil ditampilkan."
                        : "Gagal menampilkan Floating HUD.");
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("Gagal menampilkan Floating HUD: " + e.getMessage());
                }
            }
        });
    }

    /**
     * Terapkan ukuran/opacity/sisi pada bubble yang sedang tampil, tanpa hide/show.
     * Dipanggil dari Settings setiap kali slider atau pilihan sisi berubah.
     */
    @PluginMethod
    public void updateFloatingHud(PluginCall call) {
        Integer sizeDpOpt = call.getInt("sizeDp", 56);
        Integer opacityOpt = call.getInt("opacity", 100);
        String positionOpt = call.getString("position", "right");
        final int sizeDp = sizeDpOpt != null ? sizeDpOpt : 56;
        final int opacity = opacityOpt != null ? opacityOpt : 100;
        final boolean alignLeft = "left".equalsIgnoreCase(positionOpt);

        FloatingHudManager existingHud = getSharedHudManagerIfCreated();
        // Belum tampil: tidak perlu membuat overlay baru, nilai akan dipakai saat showHud.
        if (existingHud == null || !existingHud.isHudVisible()) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("isVisible", false);
            ret.put("updated", false);
            ret.put("message", "Floating HUD belum tampil; nilai akan dipakai saat ditampilkan.");
            call.resolve(ret);
            return;
        }

        runOnUi(new Runnable() {
            @Override
            public void run() {
                try {
                    boolean updated = getHudManager().updateHudAppearance(sizeDp, opacity, alignLeft);
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("isVisible", true);
                    ret.put("updated", updated);
                    ret.put("message", updated
                        ? "Tampilan Floating HUD diperbarui."
                        : "Gagal memperbarui tampilan Floating HUD.");
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("Gagal memperbarui Floating HUD: " + e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void hideFloatingHud(PluginCall call) {
        runOnUi(new Runnable() {
            @Override
            public void run() {
                try {
                    cancelMixerPromoRetry();
                    stopNativeMicMonitor();
                    boolean hidden = getHudManager().hideHud();
                    JSObject ret = new JSObject();
                    ret.put("success", hidden);
                    ret.put("isVisible", false);
                    ret.put("message", "Floating HUD disembunyikan.");
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("Gagal menyembunyikan Floating HUD: " + e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void isFloatingHudVisible(PluginCall call) {
        FloatingHudManager hud = getSharedHudManagerIfCreated();
        boolean visible = hud != null && hud.isHudVisible();
        JSObject ret = new JSObject();
        ret.put("isVisible", visible);
        call.resolve(ret);
    }

    /**
     * Kirim model panel HUD (JSON) dari WebView ke overlay native.
     * Model berisi judul, status, tab, slider, meter, dan baris daftar.
     */
    @PluginMethod
    public void pushHudState(PluginCall call) {
        String model = call.getString("model");
        if (model == null || model.isEmpty()) {
            call.reject("Model HUD kosong.");
            return;
        }

        final String payload = model;
        runOnUi(new Runnable() {
            @Override
            public void run() {
                try {
                    boolean accepted = getHudManager().pushPanelModel(payload);
                    JSObject ret = new JSObject();
                    ret.put("accepted", accepted);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("Gagal mengirim model HUD: " + e.getMessage());
                }
            }
        });
    }

    /** Tutup toolbar/panel tanpa menyembunyikan bubble. */
    @PluginMethod
    public void collapseHudContent(PluginCall call) {
        runOnUi(new Runnable() {
            @Override
            public void run() {
                try {
                    getHudManager().collapseContent();
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("Gagal menutup panel HUD: " + e.getMessage());
                }
            }
        });
    }

    /** Status HUD saat ini, dipakai aplikasi untuk menampilkan kondisi sebenarnya. */
    @PluginMethod
    public void getHudState(PluginCall call) {
        JSObject ret = new JSObject();
        FloatingHudManager hud = getSharedHudManagerIfCreated();
        boolean visible = hud != null && hud.isHudVisible();
        ret.put("isVisible", visible);
        if (hud != null) {
            String panel = hud.getActivePanel();
            if (panel != null) {
                ret.put("activePanel", panel);
            }
        }
        call.resolve(ret);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        TikTokLiveConnector connector = getTikTokConnector();
        boolean liveActive = connector.isSessionActive();
        if (!liveActive) {
            CompanionService.updateStatusDetail("Aplikasi aktif \u00b7 Status HUD disegarkan");
        }
        FloatingHudManager hud = getSharedHudManagerIfCreated();
        if (hud != null) {
            hud.updateNativeTikTokState(connector.getStateSnapshot());
            hud.renderLastKnownModel(!liveActive);
            if (hud.isHudVisible() && "mixer".equals(hud.getActivePanel())) {
                syncHudMixerMicStatus();
            }
        }
        JSObject data = new JSObject();
        data.put("timestamp", System.currentTimeMillis());
        data.put("isVisible", hud != null && hud.isHudVisible());
        if (hud != null) {
            String panel = hud.getActivePanel();
            if (panel != null) {
                data.put("panel", panel);
            }
        }
        emitToJs("hudResync", data);
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        TikTokLiveConnector connector = getTikTokConnector();
        boolean liveActive = connector.isSessionActive();
        // Jangan ubah status ke "Status terakhir" hanya karena onPause jika koneksi
        // TikTok LIVE native sedang aktif; event tetap mengalir via CompanionService.
        if (!liveActive) {
            CompanionService.updateStatusDetail(
                    "Aplikasi di latar belakang \u00b7 Status terakhir dipertahankan");
        }
        FloatingHudManager hud = getSharedHudManagerIfCreated();
        if (hud != null) {
            hud.renderLastKnownModel(!liveActive);
        }
    }

    // =========================================================================
    // TIKTOK LIVE CONNECTOR BRIDGE (MODE A)
    // =========================================================================

    @Nullable
    private volatile TikTokLiveConnector mTikTokConnector;
    private final Object mBatchLock = new Object();
    private final NativeTikTokEventBatchEpochGate mBatchEpochGate = new NativeTikTokEventBatchEpochGate();
    private final ArrayDeque<JSONObject> mPendingEventQueue = new ArrayDeque<>(EVENT_BATCH_PENDING_CAPACITY);
    private int mDroppedPendingCount = 0;
    private int mCoalescedViewerCount = 0;
    private boolean mBatchFlushScheduled = false;
    private boolean mBatchImmediateFlushScheduled = false;
    private long mBatchSessionEpoch = mBatchEpochGate.getCurrentEpoch();
    private final Runnable mFlushTikTokBatchRunnable = new Runnable() {
        @Override
        public void run() {
            flushTikTokEventBatch();
        }
    };

    private void enqueueTikTokEventForBatch(@NonNull JSONObject sequencedEvent) {
        final boolean shouldScheduleDelayed;
        final boolean shouldPostImmediate;
        synchronized (mBatchLock) {
            if (mPendingEventQueue.size() >= EVENT_BATCH_PENDING_CAPACITY) {
                applyPendingBackpressureLocked(sequencedEvent);
            }
            mPendingEventQueue.addLast(sequencedEvent);
            boolean reachedThreshold = mPendingEventQueue.size() >= EVENT_BATCH_EARLY_FLUSH_SIZE;
            if (!mBatchFlushScheduled) {
                mBatchFlushScheduled = true;
                mBatchImmediateFlushScheduled = reachedThreshold;
                shouldPostImmediate = reachedThreshold;
                shouldScheduleDelayed = !reachedThreshold;
            } else if (reachedThreshold && !mBatchImmediateFlushScheduled) {
                mBatchImmediateFlushScheduled = true;
                shouldPostImmediate = true;
                shouldScheduleDelayed = false;
            } else {
                shouldPostImmediate = false;
                shouldScheduleDelayed = false;
            }
        }
        if (shouldPostImmediate) {
            mMainHandler.removeCallbacks(mFlushTikTokBatchRunnable);
            mMainHandler.post(mFlushTikTokBatchRunnable);
        } else if (shouldScheduleDelayed) {
            mMainHandler.postDelayed(mFlushTikTokBatchRunnable, EVENT_BATCH_FLUSH_INTERVAL_MS);
        }
    }

    private void applyPendingBackpressureLocked(@NonNull JSONObject incomingEvent) {
        String incomingMethod = incomingEvent.optString("method", "");
        boolean incomingIsViewerSeq = "WebcastRoomUserSeqMessage".equals(incomingMethod);
        int viewerSeqCount = 0;
        if (!incomingIsViewerSeq) {
            for (JSONObject pending : mPendingEventQueue) {
                if ("WebcastRoomUserSeqMessage".equals(pending.optString("method", ""))) {
                    viewerSeqCount++;
                    if (viewerSeqCount >= 2) {
                        break;
                    }
                }
            }
        }

        // 1. Koalesensikan snapshot WebcastRoomUserSeqMessage lama jika ada snapshot lebih baru.
        if (incomingIsViewerSeq || viewerSeqCount >= 2) {
            Iterator<JSONObject> it = mPendingEventQueue.iterator();
            while (it.hasNext()) {
                JSONObject candidate = it.next();
                if ("WebcastRoomUserSeqMessage".equals(candidate.optString("method", ""))) {
                    it.remove();
                    mCoalescedViewerCount++;
                    return;
                }
            }
        }

        // 2. Jika masih penuh, keluarkan event non-chat/non-gift tertua lebih dulu.
        Iterator<JSONObject> it = mPendingEventQueue.iterator();
        while (it.hasNext()) {
            JSONObject candidate = it.next();
            String method = candidate.optString("method", "");
            if (!"WebcastChatMessage".equals(method) && !"WebcastGiftMessage".equals(method)) {
                it.remove();
                mDroppedPendingCount++;
                return;
            }
        }

        // 3. Fallback terakhir jika seluruh antrean berisi chat/gift: evict event tertua.
        if (mPendingEventQueue.pollFirst() != null) {
            mDroppedPendingCount++;
        }
    }

    private void flushTikTokEventBatch() {
        final List<JSONObject> drained;
        final int dropped;
        final int coalesced;
        final long batchEpoch;
        synchronized (mBatchLock) {
            mBatchFlushScheduled = false;
            mBatchImmediateFlushScheduled = false;
            if (mPendingEventQueue.isEmpty()) {
                return;
            }
            drained = new ArrayList<>(mPendingEventQueue.size());
            while (!mPendingEventQueue.isEmpty()) {
                drained.add(mPendingEventQueue.pollFirst());
            }
            dropped = mDroppedPendingCount;
            coalesced = mCoalescedViewerCount;
            mDroppedPendingCount = 0;
            mCoalescedViewerCount = 0;
            batchEpoch = mBatchSessionEpoch;
        }

        if (mBatchEpochGate.getCurrentEpoch() != batchEpoch) {
            return;
        }

        long firstSeq = drained.get(0).optLong("nativeSequence", 0L);
        long lastSeq = drained.get(drained.size() - 1).optLong("nativeSequence", firstSeq);
        long sessionId = drained.get(0).optLong("nativeSessionId", sEventBuffer.getCurrentSessionId());

        JSONArray eventsArray = new JSONArray();
        for (JSONObject evt : drained) {
            eventsArray.put(evt);
        }

        JSONObject rawBatch = new JSONObject();
        try {
            rawBatch.put("sessionId", sessionId);
            rawBatch.put("events", eventsArray);
            rawBatch.put("firstSequence", firstSeq);
            rawBatch.put("lastSequence", lastSeq);
            rawBatch.put("droppedPendingCount", dropped);
            rawBatch.put("coalescedViewerCount", coalesced);
        } catch (JSONException ignored) {
        }

        final boolean[] emitted = { false };
        boolean executed = mBatchEpochGate.runIfCurrent(batchEpoch, new Runnable() {
            @Override
            public void run() {
                if (getBridge() != null) {
                    emitted[0] = tryEmitToJs("tiktokLiveEventBatch", toJsObject(rawBatch));
                }
            }
        });
        if (executed && !emitted[0]) {
            synchronized (mBatchLock) {
                if (mBatchSessionEpoch == batchEpoch) {
                    mDroppedPendingCount += dropped;
                    mCoalescedViewerCount += coalesced;
                }
            }
        }
    }

    private void clearPendingTikTokEventBatch() {
        synchronized (mBatchLock) {
            mBatchSessionEpoch = mBatchEpochGate.advanceEpoch();
            mPendingEventQueue.clear();
            mDroppedPendingCount = 0;
            mCoalescedViewerCount = 0;
            mBatchFlushScheduled = false;
            mBatchImmediateFlushScheduled = false;
        }
        mMainHandler.removeCallbacks(mFlushTikTokBatchRunnable);
    }

    private static long readLongOption(@NonNull PluginCall call, @NonNull String key, long defaultValue) {
        JSObject data = call.getData();
        if (data == null || !data.has(key) || data.isNull(key)) {
            return defaultValue;
        }
        Object raw = data.opt(key);
        if (raw instanceof Number) {
            return ((Number) raw).longValue();
        }
        try {
            return Long.parseLong(String.valueOf(raw));
        } catch (Exception ignored) {
            return defaultValue;
        }
    }

    private synchronized TikTokLiveConnector getTikTokConnector() {
        if (mTikTokConnector == null) {
            mTikTokConnector = TikTokLiveConnector.getInstance(getContext().getApplicationContext());
        }
        return mTikTokConnector;
    }

    private void attachTikTokConnectorListener() {
        FloatingHudManager hud = getHudManager();
        TikTokLiveConnector connector = getTikTokConnector();
        final boolean shouldAttach;
        synchronized (sSharedLock) {
            shouldAttach = !sTikTokListenerAttached;
            sTikTokListenerAttached = true;
        }
        if (shouldAttach) {
            connector.setListener(sSharedTikTokListener);
        } else {
            hud.updateNativeTikTokState(connector.getStateSnapshot());
        }
    }

    @NonNull
    private static JSObject toJsObject(@NonNull JSONObject source) {
        try {
            return JSObject.fromJSONObject(source);
        } catch (JSONException e) {
            return new JSObject();
        }
    }

    @PluginMethod
    public void connectTikTokLive(PluginCall call) {
        String username = call.getString("username", "");
        String eulerApiKey = call.getString("eulerApiKey", "");
        String eulerJwtKey = call.getString("eulerJwtKey", "");
        boolean allowEulerFallback = Boolean.TRUE.equals(call.getBoolean("allowEulerFallback", true));
        String connectionMethod = call.getString("connectionMethod", "direct");

        // Pastikan CompanionService berjalan sebagai foreground service agar koneksi LIVE
        // tidak dibekukan sistem Android 12+ ketika streamer berpindah ke aplikasi TikTok.
        Context context = getContext();
        if (!CompanionService.isRunning()) {
            try {
                Intent serviceIntent = new Intent(context, CompanionService.class);
                serviceIntent.setAction(CompanionService.ACTION_START);
                startCompanionService(context, serviceIntent);
            } catch (Exception e) {
                android.util.Log.w("FloatingCompanion",
                        "Gagal menjalankan CompanionService untuk koneksi TikTok: " + e.getMessage());
            }
        }

        attachTikTokConnectorListener();
        TikTokLiveConnector connector = getTikTokConnector();
        connector.connect(username, eulerApiKey, eulerJwtKey, allowEulerFallback, connectionMethod);

        clearPendingTikTokEventBatch();
        sEventBuffer.beginSession();

        JSObject ret = new JSObject();
        ret.put("accepted", true);
        ret.put("status", toJsObject(connector.getStateSnapshot()));
        call.resolve(ret);
    }

    @PluginMethod
    public void disconnectTikTokLive(PluginCall call) {
        TikTokLiveConnector connector = getTikTokConnector();
        connector.disconnect("Diputuskan oleh pengguna.");
        connector.setListener(null);
        synchronized (sSharedLock) {
            sTikTokListenerAttached = false;
        }
        clearPendingTikTokEventBatch();
        sEventBuffer.beginSession();

        FloatingHudManager hud = getSharedHudManagerIfCreated();
        if (hud != null) {
            hud.clearNativeTikTokSession(true);
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("status", toJsObject(connector.getStateSnapshot()));
        call.resolve(ret);
    }

    @PluginMethod
    public void getTikTokLiveStatus(PluginCall call) {
        TikTokLiveConnector connector = getTikTokConnector();
        call.resolve(toJsObject(connector.getStateSnapshot()));
    }

    @PluginMethod
    public void getTikTokLiveEventsSince(PluginCall call) {
        long sessionId = readLongOption(call, "sessionId", 0L);
        long afterSequence = readLongOption(call, "afterSequence", 0L);
        Integer limitOpt = call.getInt("limit", NativeTikTokEventBuffer.MAX_CAPACITY);
        int limit = limitOpt != null ? limitOpt : NativeTikTokEventBuffer.MAX_CAPACITY;
        NativeTikTokEventBuffer.Snapshot snapshot =
                sEventBuffer.getEventsSince(sessionId, afterSequence, limit);
        call.resolve(toJsObject(snapshot.toJsonObject()));
    }

    @Override
    protected void handleOnDestroy() {
        clearPendingTikTokEventBatch();
        CompanionService.clearLifecycleListener(mServiceLifecycleListener);
        synchronized (sSharedLock) {
            if (sActivePluginRef != null && sActivePluginRef.get() == this) {
                sActivePluginRef = null;
            }
        }

        TikTokLiveConnector connector = mTikTokConnector;
        boolean keepServiceAlive = CompanionService.isRunning()
                || (connector != null && connector.isSessionActive());

        if (!keepServiceAlive) {
            if (connector != null) {
                connector.setListener(null);
                connector.disconnect("Plugin dihancurkan tanpa CompanionService.");
            }
            sEventBuffer.beginSession();
            final FloatingHudManager hudToDestroy;
            synchronized (sSharedLock) {
                sTikTokListenerAttached = false;
                hudToDestroy = sSharedHudManager;
                sSharedHudManager = null;
            }
            if (hudToDestroy != null) {
                hudToDestroy.destroy();
            }
        }

        mMainHandler.removeCallbacksAndMessages(null);
        final NativeMicMonitor monitor;
        synchronized (mMicLock) {
            mMicMuted = false;
            mMixerPromoRetryIndex = 0;
            monitor = mMicMonitor;
            mMicMonitor = null;
        }
        if (monitor != null) {
            monitor.release();
        }
        if (mSoundPoolManager != null) {
            mSoundPoolManager.release();
            mSoundPoolManager = null;
        }
        super.handleOnDestroy();
    }
}
