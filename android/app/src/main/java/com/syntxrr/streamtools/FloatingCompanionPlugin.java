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
        )
    }
)
public class FloatingCompanionPlugin extends Plugin {

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
    private FloatingHudManager mHudManager;

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

            // Kanal perintah HUD -> aplikasi (satu sumber kebenaran di JS).
            mHudManager.setOnHudActionListener(new FloatingHudManager.OnHudActionListener() {
                @Override
                public void onHudCommand(@NonNull String action, @Nullable String id, int value) {
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
        boolean visible = mHudManager != null && mHudManager.isHudVisible();
        ret.put("isVisible", visible);
        if (mHudManager != null) {
            String panel = mHudManager.getActivePanel();
            if (panel != null) {
                ret.put("activePanel", panel);
            }
        }
        call.resolve(ret);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        // Setelah proses dibekukan sistem selama aplikasi di background, state JS bisa
        // tertinggal dari kondisi layanan sebenarnya. Minta aplikasi mengirim ulang model
        // panel aktif; tidak ada status yang dipalsukan di sisi native.
        JSObject data = new JSObject();
        data.put("timestamp", System.currentTimeMillis());
        data.put("isVisible", mHudManager != null && mHudManager.isHudVisible());
        if (mHudManager != null) {
            String panel = mHudManager.getActivePanel();
            if (panel != null) {
                data.put("panel", panel);
            }
        }
        emitToJs("hudResync", data);
    }

    @Override
    protected void handleOnDestroy() {
        if (mHudManager != null) {
            mHudManager.destroy();
            mHudManager = null;
        }
        super.handleOnDestroy();
    }
}
