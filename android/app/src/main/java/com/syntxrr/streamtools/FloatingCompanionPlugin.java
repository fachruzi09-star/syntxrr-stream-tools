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

import org.json.JSONException;
import org.json.JSONObject;

/**
 * FloatingCompanionPlugin
 * Capacitor bridge exposing native Android permissions and CompanionService
 * lifecycle controls to the SYNTXRR STREAM web application.
 *
 * Phase 4.4: the Floating HUD is fully native (it must render above the TikTok app),
 * so the WebView only supplies panel models and receives user commands. No state is
 * duplicated here: the plugin forwards "hudCommand" / "hudPanelChanged" to JS, and JS
 * applies them to the same services that the main application uses.
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
        CompanionService.setLifecycleListener(mServiceLifecycleListener);
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
            boolean upgraded = refreshCompanionMicrophoneTypeIfForeground();
            FloatingHudManager hud = mHudManager;
            if (hud != null && hud.isHudVisible() && "mixer".equals(hud.getActivePanel())) {
                if (upgraded) {
                    scheduleMixerMicStartCheck();
                } else {
                    startNativeMicMonitorIfEligible();
                }
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
            boolean upgraded = refreshCompanionMicrophoneTypeIfForeground();
            FloatingHudManager hud = mHudManager;
            if (hud != null && hud.isHudVisible() && "mixer".equals(hud.getActivePanel())) {
                if (upgraded) {
                    scheduleMixerMicStartCheck();
                } else {
                    startNativeMicMonitorIfEligible();
                }
            }
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    private boolean refreshCompanionMicrophoneTypeIfForeground() {
        if (getActivity() == null || !CompanionService.isRunning()
                || !hasRecordAudioPermission() || CompanionService.hasMicrophoneForegroundType()) {
            return false;
        }
        try {
            Context context = getContext();
            Intent intent = new Intent(context, CompanionService.class);
            intent.setAction(CompanionService.ACTION_START);
            startCompanionService(context, intent);
            return true;
        } catch (Exception e) {
            android.util.Log.w("FloatingCompanion",
                    "Gagal menyegarkan tipe microphone CompanionService: " + e.getMessage());
            return false;
        }
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
        try {
            notifyListeners(event, data);
        } catch (Exception e) {
            android.util.Log.w("FloatingCompanion",
                    "Gagal mengirim event " + event + ": " + e.getMessage());
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
    private volatile FloatingHudManager mHudManager;
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
            FloatingHudManager hud = mHudManager;
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
                        if (mHudManager != null) {
                            mHudManager.setSoundboardPlayingState(soundId, true);
                        }
                    });
                }

                @Override
                public void onSoundCompleted(final String soundId) {
                    runOnUi(() -> {
                        if (mHudManager != null) {
                            mHudManager.setSoundboardPlayingState(soundId, false);
                        }
                    });
                }
            });
        }
        return mSoundPoolManager;
    }

    private synchronized FloatingHudManager getHudManager() {
        if (mHudManager == null) {
            Context appContext = getContext().getApplicationContext();
            mHudManager = new FloatingHudManager(appContext);

            // Kompatibilitas: event klik bubble tetap dikirim.
            mHudManager.setOnHudClickListener(new FloatingHudManager.OnHudClickListener() {
                @Override
                public void onHudClick() {
                    JSObject data = new JSObject();
                    data.put("timestamp", System.currentTimeMillis());
                    emitToJs("floatingHudClick", data);
                }
            });

            // Kanal perintah HUD -> aplikasi.
            // Aksi audio & tampilan HUD dijalankan langsung di native agar tetap berfungsi
            // saat aplikasi di-background (WebView di-pause oleh Android saat buka TikTok LIVE).
            mHudManager.setOnHudActionListener(new FloatingHudManager.OnHudActionListener() {
                @Override
                public void onHudCommand(@NonNull String action, @Nullable String id, int value) {
                    // Direct native execution for background responsiveness
                    if ("soundboard.play".equals(action)) {
                        String soundId = (id != null && !id.isEmpty()) ? id : "horn";
                        getSoundPoolManager().playSynthSound(soundId, 1.0f);
                    } else if ("music.toggle".equals(action)) {
                        if (mHudManager != null) {
                            mHudManager.toggleMusicState();
                        }
                    } else if ("music.next".equals(action)) {
                        if (mHudManager != null) {
                            mHudManager.advanceMusicQueue();
                        }
                    } else if ("music.mute".equals(action)) {
                        if (mHudManager != null) {
                            mHudManager.toggleMusicMute();
                        }
                    } else if ("music.volume".equals(action)) {
                        if (mHudManager != null) {
                            mHudManager.setMusicVolume(value);
                        }
                    } else if ("mixer.sfx".equals(action)) {
                        getSoundPoolManager().setMasterVolume(value / 100.0f);
                    } else if ("chat.tab".equals(action)) {
                        if (mHudManager == null || !mHudManager.selectChatTab(id)) {
                            return;
                        }
                    } else if ("mic.mute".equals(action)) {
                        final boolean mutedNow;
                        synchronized (mMicLock) {
                            mMicMuted = !mMicMuted;
                            mutedNow = mMicMuted;
                            if (mutedNow) {
                                mMixerPromoRetryIndex = 0;
                            }
                        }
                        if (mutedNow) {
                            cancelMixerPromoRetry();
                            stopNativeMicMonitor();
                            FloatingHudManager hud = mHudManager;
                            if (hud != null && hud.isHudVisible() && "mixer".equals(hud.getActivePanel())) {
                                hud.updateMixerMicState(
                                        false,
                                        true,
                                        0,
                                        "Monitor dijeda",
                                        "warn",
                                        "Monitor mic SYNTXRR dimute (tidak memengaruhi aplikasi lain)."
                                );
                            }
                        } else {
                            startNativeMicMonitorIfEligible();
                        }
                    }

                    // Forward to JS so application state stays synchronized
                    JSObject data = new JSObject();
                    data.put("action", action);
                    if (id != null) {
                        data.put("id", id);
                    }
                    data.put("value", value);
                    emitToJs("hudCommand", data);
                }

                @Override
                public void onHudPanelChanged(@Nullable String panel) {
                    if ("mixer".equals(panel)) {
                        startNativeMicMonitorIfEligible();
                    } else {
                        cancelMixerPromoRetry();
                        stopNativeMicMonitor();
                    }

                    JSObject data = new JSObject();
                    if (panel != null) {
                        data.put("panel", panel);
                    }
                    emitToJs("hudPanelChanged", data);
                }
            });
        }
        return mHudManager;
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
        FloatingHudManager hud = mHudManager;
        if (hud == null || !hud.isHudVisible() || !"mixer".equals(hud.getActivePanel())) {
            cancelMixerPromoRetry();
            stopNativeMicMonitor();
            return;
        }
        final boolean muted;
        synchronized (mMicLock) {
            muted = mMicMuted;
        }
        if (muted) {
            cancelMixerPromoRetry();
            stopNativeMicMonitor();
            hud.updateMixerMicState(
                    false,
                    true,
                    0,
                    "Monitor dijeda",
                    "warn",
                    "Monitor mic SYNTXRR dimute (tidak memengaruhi aplikasi lain)."
            );
            return;
        }
        if (!hasRecordAudioPermission()) {
            cancelMixerPromoRetry();
            stopNativeMicMonitor();
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                && (!CompanionService.isRunning() || !CompanionService.hasMicrophoneForegroundType())) {
            stopNativeMicMonitor();
            hud.updateMixerMicState(
                    false,
                    false,
                    0,
                    "Tidak tersedia",
                    "off",
                    "Aktifkan atau segarkan Mode A dari aplikasi utama agar monitor mikrofon latar belakang siap."
            );
            return;
        }

        NativeMicMonitor monitor = getMicMonitor();
        boolean started = monitor.start();
        if (!started && hud.isHudVisible() && "mixer".equals(hud.getActivePanel())) {
            String failReason = monitor.getStatusReason();
            hud.updateMixerMicState(
                    false,
                    false,
                    0,
                    hasRecordAudioPermission() ? "Tidak tersedia" : "Izin diperlukan",
                    "off",
                    failReason != null ? failReason : "Mikrofon tidak tersedia."
            );
        }
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
        FloatingHudManager hud = mHudManager;
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
        FloatingHudManager hud = mHudManager;
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
            task.run();
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
        if (!CompanionService.isRunning()
                || (hasRecordAudioPermission() && !CompanionService.hasMicrophoneForegroundType())) {
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

        // Belum tampil: tidak perlu membuat overlay baru, nilai akan dipakai saat showHud.
        if (mHudManager == null || !mHudManager.isHudVisible()) {
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
        boolean visible = mHudManager != null && mHudManager.isHudVisible();
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
        FloatingHudManager hud = mHudManager;
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
        boolean upgradedMicType = refreshCompanionMicrophoneTypeIfForeground();
        // Setelah proses dibekukan sistem selama aplikasi di background, state JS bisa
        // tertinggal dari kondisi layanan sebenarnya. Minta aplikasi mengirim ulang model
        // panel aktif; tidak ada status yang dipalsukan di sisi native.
        CompanionService.updateStatusDetail("Aplikasi aktif \u00b7 Status HUD disegarkan");
        FloatingHudManager hud = mHudManager;
        if (hud != null) {
            // Tampilkan data terakhir lebih dulu, ditandai "Status terakhir", sampai model
            // baru dari WebView tiba dan menggantikannya.
            hud.renderLastKnownModel(true);
            if (hud.isHudVisible() && "mixer".equals(hud.getActivePanel())) {
                if (upgradedMicType) {
                    scheduleMixerMicStartCheck();
                } else {
                    startNativeMicMonitorIfEligible();
                }
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
        // WebView dijeda sistem saat aplikasi masuk background: hentikan klaim kesegaran
        // data, pertahankan model terakhir yang valid, dan perbarui notifikasi secara jujur.
        CompanionService.updateStatusDetail(
                "Aplikasi di latar belakang \u00b7 Status terakhir dipertahankan");
        FloatingHudManager hud = mHudManager;
        if (hud != null) {
            hud.renderLastKnownModel(true);
        }
    }

    // =========================================================================
    // TIKTOK LIVE CONNECTOR BRIDGE (MODE A)
    // =========================================================================

    @Nullable
    private volatile TikTokLiveConnector mTikTokConnector;

    private final TikTokLiveConnector.Listener mTikTokListener = new TikTokLiveConnector.Listener() {
        @Override
        public void onStateChanged(@NonNull JSONObject stateJson) {
            emitToJs("tiktokLiveState", toJsObject(stateJson));
        }

        @Override
        public void onEventDecoded(@NonNull JSONObject eventJson) {
            emitToJs("tiktokLiveEvent", toJsObject(eventJson));
        }
    };

    private synchronized TikTokLiveConnector getTikTokConnector() {
        if (mTikTokConnector == null) {
            mTikTokConnector = TikTokLiveConnector.getInstance(getContext().getApplicationContext());
        }
        return mTikTokConnector;
    }

    private void attachTikTokConnectorListener() {
        getTikTokConnector().setListener(mTikTokListener);
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

        TikTokLiveConnector connector = getTikTokConnector();
        connector.setListener(mTikTokListener);
        connector.connect(username, eulerApiKey, allowEulerFallback, connectionMethod);

        JSObject ret = new JSObject();
        ret.put("accepted", true);
        ret.put("status", toJsObject(connector.getStateSnapshot()));
        call.resolve(ret);
    }

    @PluginMethod
    public void disconnectTikTokLive(PluginCall call) {
        TikTokLiveConnector connector = getTikTokConnector();
        connector.disconnect("Diputuskan oleh pengguna.");

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

    @Override
    protected void handleOnDestroy() {
        CompanionService.clearLifecycleListener(mServiceLifecycleListener);
        if (mTikTokConnector != null) {
            mTikTokConnector.setListener(null);
            if (!CompanionService.isRunning()) {
                mTikTokConnector.disconnect("Plugin dihancurkan tanpa CompanionService.");
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
        if (mHudManager != null) {
            mHudManager.destroy();
            mHudManager = null;
        }
        if (mSoundPoolManager != null) {
            mSoundPoolManager.release();
            mSoundPoolManager = null;
        }
        super.handleOnDestroy();
    }
}
