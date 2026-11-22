package com.syntxrr.streamtools;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import androidx.annotation.Nullable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * StudioOrientationPlugin
 *
 * Minimal Capacitor bridge for requesting explicit Activity orientation
 * ("portrait" / "landscape") while editing presets inside the Studio workspace,
 * capturing the Activity's initial requested orientation on entry and restoring it
 * when leaving Studio without altering Android's system-wide Auto-Rotate setting.
 */
@CapacitorPlugin(name = "StudioOrientation")
public class StudioOrientationPlugin extends Plugin {

    private final Object orientationLock = new Object();

    @Nullable
    private Integer savedInitialOrientation = null;

    @PluginMethod
    public void setOrientation(PluginCall call) {
        String rawOrientation = call.getString("orientation");
        if (rawOrientation == null) {
            call.reject("Parameter 'orientation' wajib disertakan ('portrait' atau 'landscape').");
            return;
        }

        final String normalized = rawOrientation.trim().toLowerCase();
        final int requestedConstant;
        if ("landscape".equals(normalized)) {
            requestedConstant = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE;
        } else if ("portrait".equals(normalized)) {
            requestedConstant = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
        } else {
            call.reject("Nilai 'orientation' harus 'portrait' atau 'landscape'.");
            return;
        }

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            JSObject result = new JSObject();
            result.put("applied", false);
            result.put("orientation", normalized);
            result.put("reason", "activity_unavailable");
            call.resolve(result);
            return;
        }

        activity.runOnUiThread(() -> {
            JSObject result = new JSObject();
            if (activity.isFinishing() || activity.isDestroyed()) {
                result.put("applied", false);
                result.put("orientation", normalized);
                result.put("reason", "activity_unavailable");
                call.resolve(result);
                return;
            }

            try {
                final int initialOrientation;
                synchronized (orientationLock) {
                    if (savedInitialOrientation == null) {
                        savedInitialOrientation = activity.getRequestedOrientation();
                    }
                    initialOrientation = savedInitialOrientation;
                }

                activity.setRequestedOrientation(requestedConstant);

                result.put("applied", true);
                result.put("orientation", normalized);
                result.put("requestedOrientation", requestedConstant);
                result.put("savedInitialOrientation", initialOrientation);
                call.resolve(result);
            } catch (Exception e) {
                result.put("applied", false);
                result.put("orientation", normalized);
                result.put("reason", e.getMessage() != null ? e.getMessage() : "orientation_request_failed");
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void restoreOrientation(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            synchronized (orientationLock) {
                savedInitialOrientation = null;
            }
            JSObject result = new JSObject();
            result.put("restored", false);
            result.put("reason", "activity_unavailable");
            call.resolve(result);
            return;
        }

        activity.runOnUiThread(() -> {
            JSObject result = new JSObject();
            final Integer initialToRestore;
            synchronized (orientationLock) {
                initialToRestore = savedInitialOrientation;
                savedInitialOrientation = null;
            }

            if (initialToRestore == null) {
                result.put("restored", true);
                result.put("alreadyRestored", true);
                call.resolve(result);
                return;
            }

            if (activity.isFinishing() || activity.isDestroyed()) {
                result.put("restored", false);
                result.put("reason", "activity_unavailable");
                call.resolve(result);
                return;
            }

            try {
                activity.setRequestedOrientation(initialToRestore);
                result.put("restored", true);
                result.put("restoredOrientation", initialToRestore);
                call.resolve(result);
            } catch (Exception e) {
                result.put("restored", false);
                result.put("reason", e.getMessage() != null ? e.getMessage() : "orientation_restore_failed");
                call.resolve(result);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        Activity activity = getActivity();
        final Integer initialToRestore;
        synchronized (orientationLock) {
            initialToRestore = savedInitialOrientation;
            savedInitialOrientation = null;
        }

        if (initialToRestore != null && activity != null && !activity.isChangingConfigurations() && !activity.isDestroyed()) {
            try {
                activity.setRequestedOrientation(initialToRestore);
            } catch (Exception ignored) {
                // Ignore cleanup failure during Activity teardown.
            }
        }
        super.handleOnDestroy();
    }
}
