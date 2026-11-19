package com.syntxrr.streamtools;

import android.content.Context;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

/** Optional user-tap reshare control shown only while Mode B is waiting for a fresh projection token. */
final class ModeBReshareFloatingOverlay {
    private final Context context;
    private final WindowManager windowManager;
    private TextView button;
    private boolean attached;

    ModeBReshareFloatingOverlay(Context context) {
        this.context = context.getApplicationContext();
        this.windowManager = (WindowManager) this.context.getSystemService(Context.WINDOW_SERVICE);
    }

    boolean show(Runnable onClick) {
        return show("Bagikan layar lagi", onClick);
    }

    boolean show(String label, Runnable onClick) {
        if (attached && button != null) {
            button.setText(label == null ? "Layar tunggu" : label);
            button.setOnClickListener(v -> { if (onClick != null) onClick.run(); });
            return true;
        }
        if (windowManager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) return false;
        try {
            TextView view = new TextView(context);
            view.setText(label == null ? "Layar tunggu" : label);
            view.setTextColor(0xFFFFFFFF);
            view.setTextSize(13f);
            view.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
            view.setGravity(Gravity.CENTER);
            view.setPadding(dp(16), dp(12), dp(16), dp(12));
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(0xEE172B46);
            bg.setCornerRadius(dp(24));
            bg.setStroke(dp(1), 0xFF60A5FA);
            view.setBackground(bg);
            view.setElevation(dp(8));
            view.setOnClickListener(v -> {
                if (onClick != null) onClick.run();
            });

            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;
            WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    type,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.TRANSLUCENT);
            params.gravity = Gravity.TOP | Gravity.END;
            params.x = dp(14);
            params.y = dp(180);
            windowManager.addView(view, params);
            button = view;
            attached = true;
            return true;
        } catch (RuntimeException permissionOrWindowFailure) {
            button = null;
            attached = false;
            return false;
        }
    }

    void hide() {
        TextView current = button;
        button = null;
        if (!attached || current == null || windowManager == null) {
            attached = false;
            return;
        }
        attached = false;
        try { windowManager.removeView(current); } catch (RuntimeException ignored) { }
    }

    boolean isAttached() { return attached; }

    private int dp(float value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
