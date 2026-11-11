package com.syntxrr.streamtools;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
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

        // 4. Start Companion Service
        try {
            Intent intent = new Intent(context, CompanionService.class);
            intent.setAction(CompanionService.ACTION_START);
            context.startService(intent);

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
    // NATIVE FLOATING HUD INTEGRATION (PHASE 4.3B)
    // =========================================================================

    @Nullable
    private FloatingHudManager mHudManager;

    private synchronized FloatingHudManager getHudManager() {
        if (mHudManager == null) {
            Context appContext = getContext().getApplicationContext();
            mHudManager = new FloatingHudManager(appContext);
            mHudManager.setOnHudClickListener(new FloatingHudManager.OnHudClickListener() {
                @Override
                public void onHudClick() {
                    JSObject data = new JSObject();
                    data.put("timestamp", System.currentTimeMillis());
                    notifyListeners("floatingHudClick", data);
                }
            });
        }
        return mHudManager;
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
        if (getActivity() != null) {
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
        } else {
            call.reject("Activity tidak tersedia untuk menampilkan Floating HUD.");
        }
    }

    @PluginMethod
    public void hideFloatingHud(PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(new Runnable() {
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
        } else {
            // Fallback jika activity dilepas, tetap jalankan hide
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
    }

    @PluginMethod
    public void isFloatingHudVisible(PluginCall call) {
        boolean visible = mHudManager != null && mHudManager.isHudVisible();
        JSObject ret = new JSObject();
        ret.put("isVisible", visible);
        call.resolve(ret);
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
