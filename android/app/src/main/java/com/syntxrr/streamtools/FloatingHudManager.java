package com.syntxrr.streamtools;

import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

/**
 * FloatingHudManager
 * 
 * Standalone native WindowManager controller for SYNTXRR STREAM Mode A (TikTok LIVE Companion).
 * Responsible for inflating and displaying a lightweight, native 56dp floating bubble over other apps
 * using TYPE_APPLICATION_OVERLAY and FLAG_NOT_FOCUSABLE.
 * 
 * Architecture Note (Phase 4.3A):
 * - Operates entirely independent of WebView.
 * - Does not start services or audio engines.
 * - Enforces strict permission validation and defensive lifecycle guards.
 */
public class FloatingHudManager {

    private static final String TAG = "FloatingHudManager";
    private static final int CLICK_THRESHOLD_PX = 10;

    private final Context mContext;
    @Nullable
    private WindowManager mWindowManager;
    @Nullable
    private View mFloatingView;
    @Nullable
    private WindowManager.LayoutParams mParams;

    private boolean mIsAttached = false;

    // Drag tracking variables
    private int mInitialX;
    private int mInitialY;
    private float mInitialTouchX;
    private float mInitialTouchY;

    public interface OnHudClickListener {
        void onHudClick();
    }

    @Nullable
    private OnHudClickListener mClickListener;

    public FloatingHudManager(@NonNull Context context) {
        // Use application context to prevent leaking activity references
        this.mContext = context.getApplicationContext();
        this.mWindowManager = (WindowManager) mContext.getSystemService(Context.WINDOW_SERVICE);
    }

    public void setOnHudClickListener(@Nullable OnHudClickListener listener) {
        this.mClickListener = listener;
    }

    /**
     * Display the native floating bubble overlay on screen.
     * @return true if successfully attached, false otherwise.
     */
    public synchronized boolean showHud() {
        return showHud(56, 100, false);
    }

    /**
     * Menampilkan bubble dengan ukuran, opacity, dan posisi dari halaman Settings.
     *
     * @param sizeDp         ukuran bubble dalam dp (di-clamp 40-64 agar tetap bisa disentuh)
     * @param opacityPercent opacity 30-100 (%)
     * @param alignLeft      true = menempel di kiri, false = menempel di kanan
     */
    public synchronized boolean showHud(int sizeDp, int opacityPercent, boolean alignLeft) {
        // 1. Guard against duplicate addView() calls
        if (mIsAttached && mFloatingView != null) {
            Log.d(TAG, "Floating HUD is already visible on screen.");
            return true;
        }

        // 2. Guard: verify SYSTEM_ALERT_WINDOW permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(mContext)) {
                Log.w(TAG, "Cannot display Floating HUD: SYSTEM_ALERT_WINDOW permission is not granted.");
                return false;
            }
        }

        if (mWindowManager == null) {
            mWindowManager = (WindowManager) mContext.getSystemService(Context.WINDOW_SERVICE);
            if (mWindowManager == null) {
                Log.e(TAG, "Unable to obtain WindowManager service.");
                return false;
            }
        }

        try {
            // 3. Inflate native layout
            LayoutInflater inflater = LayoutInflater.from(mContext);
            mFloatingView = inflater.inflate(R.layout.floating_companion_hud, null);

            // 4. Style circular container programmatically (56dp circle with dark navy & blue accent)
            View bubbleContainer = mFloatingView.findViewById(R.id.floating_hud_bubble);
            if (bubbleContainer != null) {
                float density = mContext.getResources().getDisplayMetrics().density;
                GradientDrawable circleDrawable = new GradientDrawable();
                circleDrawable.setShape(GradientDrawable.OVAL);
                circleDrawable.setColor(Color.parseColor("#0E1626")); // Premium Dark Navy
                int strokeWidth = Math.max(1, (int) (2 * density));
                circleDrawable.setStroke(strokeWidth, Color.parseColor("#2563EB")); // SYNTXRR Blue Accent
                bubbleContainer.setBackground(circleDrawable);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    bubbleContainer.setElevation(6 * density);
                }
            }

            // 5. Configure WindowManager LayoutParams
            int windowType = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;

            mParams = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    windowType,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, // Do not steal keyboard or touch from TikTok
                    PixelFormat.TRANSLUCENT
            );

            // Position at top-left origin for accurate absolute coordinate calculations
            mParams.gravity = Gravity.TOP | Gravity.START;

            // Posisi awal aman (16dp dari tepi kiri/kanan, 120dp dari atas) memakai nilai pengaturan
            DisplayMetrics metrics = mContext.getResources().getDisplayMetrics();
            int clampedSizeDp = Math.min(64, Math.max(40, sizeDp));
            int viewSizePx = (int) (clampedSizeDp * metrics.density);
            int marginPx = (int) (16 * metrics.density);
            mParams.x = alignLeft ? marginPx : Math.max(0, metrics.widthPixels - viewSizePx - marginPx);
            mParams.y = (int) (120 * metrics.density);

            // Terapkan ukuran bubble dan opacity dari pengaturan (sebelumnya selalu 56dp / 100%)
            if (bubbleContainer != null) {
                android.view.ViewGroup.LayoutParams bubbleParams = bubbleContainer.getLayoutParams();
                if (bubbleParams != null) {
                    bubbleParams.width = viewSizePx;
                    bubbleParams.height = viewSizePx;
                    bubbleContainer.setLayoutParams(bubbleParams);
                }
            }
            if (mFloatingView != null) {
                int clampedOpacity = Math.min(100, Math.max(30, opacityPercent));
                mFloatingView.setAlpha(clampedOpacity / 100f);
            }

            // 6. Setup touch and drag handling
            setupTouchListener(mFloatingView, mParams, viewSizePx);

            // 7. Attach to WindowManager
            mWindowManager.addView(mFloatingView, mParams);
            mIsAttached = true;
            Log.i(TAG, "Floating HUD successfully attached to WindowManager.");
            return true;

        } catch (IllegalArgumentException e) {
            Log.e(TAG, "IllegalArgumentException when adding Floating HUD to WindowManager: " + e.getMessage(), e);
            mFloatingView = null;
            mIsAttached = false;
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Unexpected error adding Floating HUD view: " + e.getMessage(), e);
            mFloatingView = null;
            mIsAttached = false;
            return false;
        }
    }

    /**
     * Hide and remove the floating bubble overlay from screen.
     * Idempotent and safe to call multiple times.
     * @return true if successfully detached or already hidden.
     */
    public synchronized boolean hideHud() {
        if (!mIsAttached || mFloatingView == null) {
            // Already detached, return cleanly
            return true;
        }

        try {
            if (mWindowManager != null) {
                mWindowManager.removeView(mFloatingView);
            }
            Log.i(TAG, "Floating HUD successfully removed from WindowManager.");
        } catch (IllegalArgumentException e) {
            // View may have been already detached by system
            Log.w(TAG, "Floating HUD view was not attached when attempting to remove: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error removing Floating HUD view: " + e.getMessage(), e);
        } finally {
            mFloatingView = null;
            mParams = null;
            mIsAttached = false;
        }
        return true;
    }

    /**
     * Check whether the floating HUD is currently attached and visible.
     */
    public synchronized boolean isHudVisible() {
        return mIsAttached && mFloatingView != null;
    }

    /**
     * Configure touch listener for drag-and-drop movement and click detection.
     */
    private void setupTouchListener(@NonNull View view, @NonNull WindowManager.LayoutParams params, int viewSizePx) {
        view.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                if (mWindowManager == null || mFloatingView == null) {
                    return false;
                }

                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        mInitialX = params.x;
                        mInitialY = params.y;
                        mInitialTouchX = event.getRawX();
                        mInitialTouchY = event.getRawY();
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        int deltaX = (int) (event.getRawX() - mInitialTouchX);
                        int deltaY = (int) (event.getRawY() - mInitialTouchY);

                        int newX = mInitialX + deltaX;
                        int newY = mInitialY + deltaY;

                        // Clamp coordinates to safe visible screen bounds
                        DisplayMetrics metrics = mContext.getResources().getDisplayMetrics();
                        int maxX = Math.max(0, metrics.widthPixels - viewSizePx);
                        int maxY = Math.max(0, metrics.heightPixels - viewSizePx);

                        params.x = Math.max(0, Math.min(newX, maxX));
                        params.y = Math.max(0, Math.min(newY, maxY));

                        try {
                            mWindowManager.updateViewLayout(mFloatingView, params);
                        } catch (IllegalArgumentException e) {
                            Log.w(TAG, "View not attached during updateViewLayout: " + e.getMessage());
                        }
                        return true;

                    case MotionEvent.ACTION_UP:
                        float totalDeltaX = Math.abs(event.getRawX() - mInitialTouchX);
                        float totalDeltaY = Math.abs(event.getRawY() - mInitialTouchY);

                        // If touch moved less than threshold, treat as click
                        if (totalDeltaX < CLICK_THRESHOLD_PX && totalDeltaY < CLICK_THRESHOLD_PX) {
                            v.performClick();
                            if (mClickListener != null) {
                                mClickListener.onHudClick();
                            }
                        }
                        return true;

                    default:
                        return false;
                }
            }
        });
    }

    /**
     * Cleanup resources and release WindowManager reference.
     */
    public synchronized void destroy() {
        hideHud();
        mClickListener = null;
        mWindowManager = null;
    }
}
