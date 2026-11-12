package com.syntxrr.streamtools;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.PorterDuff;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.WindowMetrics;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * FloatingHudManager
 *
 * Native WindowManager controller for the SYNTXRR STREAM Mode A Floating HUD.
 *
 * Architecture:
 * - Exactly ONE overlay window is ever attached (TYPE_APPLICATION_OVERLAY, FLAG_NOT_FOCUSABLE).
 * - The window root is a horizontal LinearLayout: [bubble][content] or [content][bubble],
 *   depending on which screen edge the bubble sits on, so the toolbar/panel always expands
 *   away from that edge and is never clipped.
 * - "content" is either the 4-icon toolbar (Chat, Soundboard, Music, Audio Mixer) or exactly
 *   ONE feature panel. Panels are rendered from a JSON model pushed by the WebView, so the
 *   HUD never keeps its own copy of music/queue/soundboard/mic state.
 * - The bubble is the master toggle. It stays draggable while the toolbar or a panel is open,
 *   and the toolbar/panel follow it because they live in the same window.
 * - No outside-touch dismissal, no per-panel close button, no auto-reopen after unlock.
 *
 * The manager never plays audio, never starts services and never invents state.
 */
public class FloatingHudManager {

    private static final String TAG = "FloatingHudManager";

    /** Jarak gerak (px) sebelum sentuhan dianggap drag, bukan tap. */
    private static final int CLICK_THRESHOLD_PX = 14;

    private static final int PANEL_WIDTH_DP = 272;
    private static final int TOOLBAR_WIDTH_DP = 56;
    private static final int GAP_DP = 8;
    private static final int BUBBLE_MIN_DP = 40;
    private static final int BUBBLE_MAX_DP = 64;

    private static final String[] PANEL_IDS = {"chat", "soundboard", "music", "mixer"};
    private static final String[] PANEL_GLYPHS = {"\uD83D\uDCAC", "\uD83D\uDD0A", "\uD83C\uDFB5", "\uD83C\uDF9A"};
    private static final String[] PANEL_LABELS = {"Chat", "Soundboard", "Music", "Audio Mixer"};

    private static final int C_SURFACE = 0xF5162033;
    private static final int C_SURFACE_SOFT = 0x14FFFFFF;
    private static final int C_BORDER = 0x4D3B82F6;
    private static final int C_TEXT = 0xFFFFFFFF;
    private static final int C_TEXT_DIM = 0xFF9FB0CC;
    private static final int C_ACCENT = 0xFF8B9DFF;
    private static final int C_OK = 0xFF22C55E;
    private static final int C_WARN = 0xFFF59E0B;
    private static final int C_OFF = 0xFF64748B;

    private final Context mContext;

    @Nullable
    private WindowManager mWindowManager;
    @Nullable
    private LinearLayout mRoot;
    @Nullable
    private FrameLayout mBubble;
    @Nullable
    private LinearLayout mContent;
    @Nullable
    private LinearLayout mToolbar;
    @Nullable
    private LinearLayout mPanelContainer;
    @Nullable
    private WindowManager.LayoutParams mParams;

    private boolean mIsAttached = false;
    private boolean mWantedVisible = false;

    private int mSizePx = 0;
    private int mOpacityPercent = 100;
    private boolean mAlignLeft = false;
    private boolean mAppliedLeftOrder = true;
    private boolean mToolbarVisible = false;

    @Nullable
    private String mActivePanel = null;
    @Nullable
    private String mLastModelJson = null;

    /** Posisi absolut bubble di layar (bukan posisi window). */
    private int mBubbleScreenX = -1;
    private int mBubbleScreenY = -1;

    private int mScreenW = 0;
    private int mScreenH = 0;
    private int mTopInsetPx = 0;
    private int mBottomInsetPx = 0;

    private boolean mBindingModel = false;
    private boolean mScreenReceiverRegistered = false;

    // Drag tracking
    private boolean mHasDragged = false;
    private float mDownRawX;
    private float mDownRawY;
    private int mDownBubbleX;
    private int mDownBubbleY;

    public interface OnHudClickListener {
        void onHudClick();
    }

    /** Perintah dari HUD ke aplikasi (WebView). Tidak ada aksi yang dieksekusi native. */
    public interface OnHudActionListener {
        void onHudCommand(@NonNull String action, @Nullable String id, int value);

        void onHudPanelChanged(@Nullable String panel);
    }

    @Nullable
    private OnHudClickListener mClickListener;
    @Nullable
    private OnHudActionListener mActionListener;

    private final BroadcastReceiver mScreenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent != null ? intent.getAction() : null;
            if (Intent.ACTION_SCREEN_OFF.equals(action)) {
                handleScreenOff();
            } else if (Intent.ACTION_SCREEN_ON.equals(action)) {
                handleScreenOn();
            }
        }
    };

    public FloatingHudManager(@NonNull Context context) {
        this.mContext = context.getApplicationContext();
        this.mWindowManager = (WindowManager) mContext.getSystemService(Context.WINDOW_SERVICE);
    }

    public void setOnHudClickListener(@Nullable OnHudClickListener listener) {
        this.mClickListener = listener;
    }

    public void setOnHudActionListener(@Nullable OnHudActionListener listener) {
        this.mActionListener = listener;
    }

    @Nullable
    public String getActivePanel() {
        return mActivePanel;
    }

    // =========================================================================
    // SHOW / UPDATE / HIDE
    // =========================================================================

    public synchronized boolean showHud() {
        return showHud(56, 100, false);
    }

    public synchronized boolean showHud(int sizeDp, int opacityPercent, boolean alignLeft) {
        mWantedVisible = true;

        if (mIsAttached && mRoot != null) {
            updateHudAppearance(sizeDp, opacityPercent, alignLeft);
            return true;
        }

        // Window sudah pernah dibuat (mis. disembunyikan saat layar terkunci) -> pasang ulang.
        if (mRoot != null && mParams != null) {
            updateBubbleGeometry(sizeDp, opacityPercent, alignLeft);
            if (alignLeft != mAlignLeft) {
                mAlignLeft = alignLeft;
                applySideOrder();
            }
            if (reattachWindow()) {
                layoutWindow(true);
                return true;
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(mContext)) {
            Log.w(TAG, "Tidak dapat menampilkan HUD: izin SYSTEM_ALERT_WINDOW belum aktif.");
            return false;
        }

        if (mWindowManager == null) {
            mWindowManager = (WindowManager) mContext.getSystemService(Context.WINDOW_SERVICE);
        }
        if (mWindowManager == null) {
            Log.e(TAG, "WindowManager tidak tersedia.");
            return false;
        }

        try {
            refreshBounds();

            LayoutInflater inflater = LayoutInflater.from(mContext);
            mRoot = (LinearLayout) inflater.inflate(R.layout.floating_companion_hud, null);
            mBubble = mRoot.findViewById(R.id.floating_hud_bubble);
            mContent = mRoot.findViewById(R.id.floating_hud_content);

            updateBubbleGeometry(sizeDp, opacityPercent, alignLeft);

            mActivePanel = null;
            mToolbarVisible = false;
            buildContent();

            mAppliedLeftOrder = !mAlignLeft; // paksa applySideOrder() benar-benar menata ulang
            applySideOrder();
            updateContentWidth();
            if (mContent != null) {
                mContent.setVisibility(View.GONE);
            }

            int windowType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;

            mParams = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    windowType,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                    PixelFormat.TRANSLUCENT
            );
            mParams.gravity = Gravity.TOP | Gravity.START;

            // Posisi awal: bubble menempel di sisi pilihan pengguna.
            mBubbleScreenX = mAlignLeft
                    ? dp(16)
                    : Math.max(0, mScreenW - mSizePx - dp(16));
            mBubbleScreenY = dp(120);
            mParams.x = mAlignLeft ? mBubbleScreenX : Math.max(0, mBubbleScreenX - 0);
            mParams.y = mBubbleScreenY;

            setupBubbleTouch();

            mWindowManager.addView(mRoot, mParams);
            mIsAttached = true;
            registerScreenReceiver();

            layoutWindow(true);
            mRoot.post(this::clampAfterContentChange);
            Log.i(TAG, "Floating HUD terpasang (size=" + mSizePx + "px, left=" + mAlignLeft + ").");
            return true;
        } catch (IllegalArgumentException e) {
            Log.e(TAG, "Gagal menambahkan HUD ke WindowManager: " + e.getMessage(), e);
            mRoot = null;
            mIsAttached = false;
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Kesalahan tak terduga saat menampilkan HUD: " + e.getMessage(), e);
            mRoot = null;
            mIsAttached = false;
            return false;
        }
    }

    /**
     * Terapkan ukuran/opacity/sisi pada bubble yang sudah tampil, tanpa hide/show,
     * sehingga perubahan Settings langsung terlihat dan tidak membuat overlay ganda.
     */
    public synchronized boolean updateHudAppearance(int sizeDp, int opacityPercent, boolean alignLeft) {
        if (!mIsAttached || mRoot == null || mParams == null || mWindowManager == null) {
            return false;
        }

        updateBubbleGeometry(sizeDp, opacityPercent, alignLeft);

        if (alignLeft != mAlignLeft) {
            mAlignLeft = alignLeft;
            mBubbleScreenX = mAlignLeft
                    ? dp(16)
                    : Math.max(0, mScreenW - mSizePx - dp(16));
            applySideOrder();
        }

        layoutWindow(true);
        mRoot.post(this::clampAfterContentChange);
        Log.d(TAG, "HUD diperbarui in-place (sizeDp=" + sizeDp + ", opacity=" + opacityPercent
                + ", alignLeft=" + alignLeft + ").");
        return true;
    }

    public synchronized boolean hideHud() {
        mWantedVisible = false;
        collapseContent();
        removeWindowOnly();
        return true;
    }

    public synchronized boolean isHudVisible() {
        return mIsAttached && mRoot != null;
    }

    /**
     * Terima model panel dari WebView (JSON). Native hanya menggambar; seluruh nilai
     * (musik, queue, soundboard, mic) berasal dari state aplikasi.
     */
    public synchronized boolean pushPanelModel(@Nullable String json) {
        if (json == null || json.isEmpty()) {
            return false;
        }
        mLastModelJson = json;

        if (!mIsAttached || mRoot == null || mPanelContainer == null) {
            return false;
        }

        final String payload = json;
        mRoot.post(() -> {
            if (!mIsAttached || mPanelContainer == null) {
                return;
            }
            try {
                JSONObject model = new JSONObject(payload);
                String panel = model.optString("panel", "");
                if (panel.isEmpty() || mActivePanel == null || !mActivePanel.equals(panel)) {
                    return; // model usang dari panel lain
                }
                renderModel(model);
                layoutWindow(true);
                if (mRoot != null) {
                    mRoot.post(this::clampAfterContentChange);
                }
            } catch (JSONException e) {
                Log.w(TAG, "Model HUD tidak valid: " + e.getMessage());
            }
        });
        return true;
    }

    /** Tutup toolbar/panel tanpa menyembunyikan bubble. */
    public synchronized void collapseContent() {
        if (mContent == null) {
            mActivePanel = null;
            mToolbarVisible = false;
            return;
        }
        mActivePanel = null;
        mToolbarVisible = false;
        if (mToolbar != null) {
            mToolbar.setVisibility(View.GONE);
        }
        if (mPanelContainer != null) {
            mPanelContainer.setVisibility(View.GONE);
            mPanelContainer.removeAllViews();
        }
        mContent.setVisibility(View.GONE);
        updateContentWidth();
        notifyPanelChanged(null);
        layoutWindow(true);
    }

    // =========================================================================
    // VIEW CONSTRUCTION
    // =========================================================================

    private void buildContent() {
        if (mContent == null) {
            return;
        }
        mContent.removeAllViews();

        // Toolbar 4 ikon
        mToolbar = new LinearLayout(mContext);
        mToolbar.setOrientation(LinearLayout.VERTICAL);
        mToolbar.setBackground(rounded(dp(18), C_SURFACE, dp(1), C_BORDER));
        mToolbar.setPadding(dp(6), dp(6), dp(6), dp(6));
        mToolbar.setVisibility(View.GONE);

        for (int i = 0; i < PANEL_IDS.length; i++) {
            final String panelId = PANEL_IDS[i];
            TextView icon = text(PANEL_GLYPHS[i], 17f, C_TEXT, false);
            icon.setGravity(Gravity.CENTER);
            icon.setContentDescription(PANEL_LABELS[i]);
            icon.setBackground(rounded(dp(14), C_SURFACE_SOFT, 0, Color.TRANSPARENT));
            LinearLayout.LayoutParams iconParams =
                    new LinearLayout.LayoutParams(dp(44), dp(44));
            iconParams.topMargin = i == 0 ? 0 : dp(4);
            icon.setOnClickListener(v -> openPanel(panelId));
            mToolbar.addView(icon, iconParams);
        }

        LinearLayout.LayoutParams toolbarParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        mContent.addView(mToolbar, toolbarParams);

        // Container satu panel aktif
        mPanelContainer = new LinearLayout(mContext);
        mPanelContainer.setOrientation(LinearLayout.VERTICAL);
        mPanelContainer.setBackground(rounded(dp(18), C_SURFACE, dp(1), C_BORDER));
        mPanelContainer.setPadding(dp(10), dp(10), dp(10), dp(10));
        mPanelContainer.setVisibility(View.GONE);

        LinearLayout.LayoutParams panelParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        mContent.addView(mPanelContainer, panelParams);
    }

    private void openPanel(@NonNull String panelId) {
        mActivePanel = panelId;
        mToolbarVisible = false;

        if (mToolbar != null) {
            mToolbar.setVisibility(View.GONE);
        }
        if (mPanelContainer != null) {
            mPanelContainer.setVisibility(View.VISIBLE);
            showPanelPlaceholder(panelId);
        }
        if (mContent != null) {
            mContent.setVisibility(View.VISIBLE);
        }

        updateContentWidth();
        notifyPanelChanged(panelId);
        layoutWindow(true);

        // Jika model panel ini sudah pernah dikirim, tampilkan langsung tanpa menunggu.
        if (mLastModelJson != null) {
            try {
                JSONObject cached = new JSONObject(mLastModelJson);
                if (panelId.equals(cached.optString("panel"))) {
                    renderModel(cached);
                }
            } catch (JSONException ignored) {
                // model usang diabaikan
            }
        }
        if (mRoot != null) {
            mRoot.post(this::clampAfterContentChange);
        }
    }

    private void showToolbar() {
        mActivePanel = null;
        mToolbarVisible = true;

        if (mPanelContainer != null) {
            mPanelContainer.setVisibility(View.GONE);
            mPanelContainer.removeAllViews();
        }
        if (mToolbar != null) {
            mToolbar.setVisibility(View.VISIBLE);
        }
        if (mContent != null) {
            mContent.setVisibility(View.VISIBLE);
        }

        updateContentWidth();
        notifyPanelChanged(null);
        layoutWindow(true);
    }

    private void toggleHud() {
        if (mToolbarVisible || mActivePanel != null) {
            collapseContent();
        } else {
            showToolbar();
        }
        if (mClickListener != null) {
            mClickListener.onHudClick();
        }
    }

    // =========================================================================
    // MODEL RENDERING
    // =========================================================================

    private void showPanelPlaceholder(@NonNull String panelId) {
        if (mPanelContainer == null) {
            return;
        }
        mPanelContainer.removeAllViews();
        mPanelContainer.addView(buildHeader(panelTitle(panelId), "Memuat\u2026", "warn"));
        mPanelContainer.addView(buildEmpty("Menunggu data dari aplikasi\u2026"));
    }

    private void renderModel(@NonNull JSONObject model) {
        if (mPanelContainer == null) {
            return;
        }

        mBindingModel = true;
        try {
            mPanelContainer.removeAllViews();

            String title = model.optString("title", "SYNTXRR");
            JSONObject status = model.optJSONObject("status");
            String statusText = status != null ? status.optString("text", "") : "";
            String tone = status != null ? status.optString("tone", "off") : "off";
            mPanelContainer.addView(buildHeader(title, statusText, tone));

            JSONArray tabs = model.optJSONArray("tabs");
            if (tabs != null && tabs.length() > 0) {
                mPanelContainer.addView(buildTabs(tabs, model.optString("activeTab", "")));
            }

            boolean hasBody = false;

            JSONArray sliders = model.optJSONArray("sliders");
            if (sliders != null && sliders.length() > 0) {
                for (int i = 0; i < sliders.length(); i++) {
                    JSONObject slider = sliders.optJSONObject(i);
                    if (slider != null) {
                        mPanelContainer.addView(buildSlider(slider));
                        hasBody = true;
                    }
                }
            }

            JSONObject meter = model.optJSONObject("meter");
            if (meter != null) {
                mPanelContainer.addView(buildMeter(meter));
                hasBody = true;
            }

            JSONArray rows = model.optJSONArray("rows");
            int rowCount = rows != null ? rows.length() : 0;
            if (rowCount > 0) {
                LinearLayout list = new LinearLayout(mContext);
                list.setOrientation(LinearLayout.VERTICAL);
                for (int i = 0; i < rowCount; i++) {
                    JSONObject row = rows.optJSONObject(i);
                    if (row != null) {
                        list.addView(buildRow(row));
                    }
                }

                ScrollView scroll = new ScrollView(mContext);
                scroll.setVerticalScrollBarEnabled(true);
                scroll.setClipToPadding(false);
                scroll.addView(list, new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT));

                int listHeightDp = model.optInt("listHeightDp", 0);
                LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        listHeightDp > 0 ? dp(listHeightDp) : LinearLayout.LayoutParams.WRAP_CONTENT);
                scrollParams.topMargin = dp(4);
                mPanelContainer.addView(scroll, scrollParams);
                hasBody = true;
            }

            if (!hasBody) {
                mPanelContainer.addView(buildEmpty(model.optString("emptyText", "Belum ada data.")));
            }
        } finally {
            mBindingModel = false;
        }
    }

    private View buildHeader(String title, String statusText, String tone) {
        LinearLayout header = new LinearLayout(mContext);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(2), 0, dp(2), dp(8));

        TextView titleView = text(title, 13f, C_TEXT, true);
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        header.addView(titleView, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        View dot = new View(mContext);
        GradientDrawable dotDrawable = new GradientDrawable();
        dotDrawable.setShape(GradientDrawable.OVAL);
        dotDrawable.setColor(toneColor(tone));
        dot.setBackground(dotDrawable);
        LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(dp(7), dp(7));
        dotParams.setMarginStart(dp(6));
        header.addView(dot, dotParams);

        if (!statusText.isEmpty()) {
            TextView statusView = text(statusText, 9.5f, C_TEXT_DIM, false);
            statusView.setSingleLine(true);
            statusView.setEllipsize(TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams statusParams =
                    new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT);
            statusParams.setMarginStart(dp(5));
            header.addView(statusView, statusParams);
        }
        return header;
    }

    private View buildTabs(JSONArray tabs, String activeTab) {
        HorizontalScrollView scroll = new HorizontalScrollView(mContext);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setClipToPadding(false);

        LinearLayout row = new LinearLayout(mContext);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, 0, 0, dp(6));

        for (int i = 0; i < tabs.length(); i++) {
            JSONObject tab = tabs.optJSONObject(i);
            if (tab == null) {
                continue;
            }
            final String id = tab.optString("id", "");
            String label = tab.optString("label", id);
            boolean active = id.equals(activeTab);

            TextView chip = text(label, 10.5f, active ? C_TEXT : C_TEXT_DIM, active);
            chip.setGravity(Gravity.CENTER);
            chip.setPadding(dp(10), dp(5), dp(10), dp(5));
            chip.setBackground(rounded(dp(12), active ? 0xFF2563EB : C_SURFACE_SOFT, 0, Color.TRANSPARENT));
            chip.setContentDescription(label);
            chip.setOnClickListener(v -> emitCommand("chat.tab", id, 0));

            LinearLayout.LayoutParams chipParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            chipParams.setMarginEnd(dp(5));
            row.addView(chip, chipParams);
        }

        scroll.addView(row, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT));
        return scroll;
    }

    private View buildRow(JSONObject row) {
        LinearLayout item = new LinearLayout(mContext);
        item.setOrientation(LinearLayout.VERTICAL);
        item.setPadding(dp(9), dp(6), dp(9), dp(6));
        item.setBackground(rounded(dp(10), C_SURFACE_SOFT, 0, Color.TRANSPARENT));

        LinearLayout.LayoutParams itemParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        itemParams.bottomMargin = dp(4);
        item.setLayoutParams(itemParams);

        LinearLayout topRow = new LinearLayout(mContext);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView label = text(row.optString("label", ""), 11.5f, C_TEXT, false);
        label.setSingleLine(true);
        label.setEllipsize(TextUtils.TruncateAt.END);
        topRow.addView(label, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        String trailing = row.optString("trailing", "");
        if (!trailing.isEmpty()) {
            TextView trailingView = text(trailing, 9.5f, C_ACCENT, true);
            LinearLayout.LayoutParams trailingParams =
                    new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT);
            trailingParams.setMarginStart(dp(6));
            topRow.addView(trailingView, trailingParams);
        }
        item.addView(topRow);

        String sub = row.optString("sub", "");
        if (!sub.isEmpty()) {
            TextView subView = text(sub, 10f, C_TEXT_DIM, false);
            subView.setMaxLines(2);
            subView.setEllipsize(TextUtils.TruncateAt.END);
            item.addView(subView);
        }

        final String action = row.optString("action", "");
        final String id = row.optString("id", "");
        if (!action.isEmpty() && !"noop".equals(action)) {
            item.setClickable(true);
            item.setFocusable(true);
            item.setOnClickListener(v -> emitCommand(action, id, 0));
        }
        return item;
    }

    private View buildSlider(JSONObject slider) {
        LinearLayout wrap = new LinearLayout(mContext);
        wrap.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams wrapParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        wrapParams.topMargin = dp(4);
        wrap.setLayoutParams(wrapParams);

        final String action = slider.optString("action", "");
        final String id = slider.optString("id", "");
        int max = Math.max(1, slider.optInt("max", 100));
        int value = Math.max(0, Math.min(max, slider.optInt("value", 0)));

        LinearLayout labelRow = new LinearLayout(mContext);
        labelRow.setOrientation(LinearLayout.HORIZONTAL);
        labelRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView label = text(slider.optString("label", ""), 10.5f, C_TEXT_DIM, false);
        label.setSingleLine(true);
        labelRow.addView(label, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        TextView valueView = text(value + "%", 10f, C_ACCENT, true);
        labelRow.addView(valueView);
        wrap.addView(labelRow);

        SeekBar seekBar = new SeekBar(mContext);
        seekBar.setMax(max);
        seekBar.setProgress(value);
        if (seekBar.getProgressDrawable() != null) {
            seekBar.getProgressDrawable().setColorFilter(0xFF3B82F6, PorterDuff.Mode.SRC_IN);
        }
        if (seekBar.getThumb() != null) {
            seekBar.getThumb().setColorFilter(0xFF8B9DFF, PorterDuff.Mode.SRC_IN);
        }
        seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                valueView.setText(progress + "%");
                if (fromUser && !mBindingModel) {
                    emitCommand(action, id, progress);
                }
            }

            @Override
            public void onStartTrackingTouch(SeekBar bar) {
                // tidak ada aksi
            }

            @Override
            public void onStopTrackingTouch(SeekBar bar) {
                // nilai sudah dikirim saat perubahan
            }
        });
        wrap.addView(seekBar, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return wrap;
    }

    private View buildMeter(JSONObject meter) {
        LinearLayout wrap = new LinearLayout(mContext);
        wrap.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams wrapParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        wrapParams.topMargin = dp(2);
        wrap.setLayoutParams(wrapParams);

        String label = meter.optString("label", "Level mic");
        boolean muted = meter.optBoolean("muted", false);
        boolean available = meter.optBoolean("available", true);
        int value = Math.max(0, Math.min(100, meter.optInt("value", 0)));

        LinearLayout labelRow = new LinearLayout(mContext);
        labelRow.setOrientation(LinearLayout.HORIZONTAL);
        labelRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView labelView = text(label, 10.5f, C_TEXT_DIM, false);
        labelView.setSingleLine(true);
        labelRow.addView(labelView, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        String stateText = !available ? "Tidak tersedia" : (muted ? "Mute" : value + "%");
        int stateColor = !available ? C_OFF : (muted ? C_WARN : C_ACCENT);
        labelRow.addView(text(stateText, 9.5f, stateColor, true));
        wrap.addView(labelRow);

        ProgressBar bar = new ProgressBar(mContext, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setProgress(muted || !available ? 0 : value);
        if (bar.getProgressDrawable() != null) {
            bar.getProgressDrawable().setColorFilter(
                    muted || !available ? C_OFF : 0xFF3B82F6, PorterDuff.Mode.SRC_IN);
        }
        wrap.addView(bar, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(6)));
        return wrap;
    }

    private View buildEmpty(String message) {
        TextView empty = text(message, 10.5f, C_TEXT_DIM, false);
        empty.setGravity(Gravity.CENTER);
        empty.setPadding(dp(6), dp(14), dp(6), dp(14));
        return empty;
    }

    // =========================================================================
    // GEOMETRY / POSITIONING
    // =========================================================================

    private void updateBubbleGeometry(int sizeDp, int opacityPercent, boolean alignLeft) {
        DisplayMetrics metrics = mContext.getResources().getDisplayMetrics();
        int clampedSizeDp = Math.min(BUBBLE_MAX_DP, Math.max(BUBBLE_MIN_DP, sizeDp));
        mSizePx = (int) (clampedSizeDp * metrics.density);
        mOpacityPercent = Math.min(100, Math.max(30, opacityPercent));
        mAlignLeft = alignLeft;

        if (mBubble != null) {
            ViewGroup.LayoutParams bubbleParams = mBubble.getLayoutParams();
            if (bubbleParams != null) {
                bubbleParams.width = mSizePx;
                bubbleParams.height = mSizePx;
                mBubble.setLayoutParams(bubbleParams);
            }
            GradientDrawable circle = new GradientDrawable();
            circle.setShape(GradientDrawable.OVAL);
            circle.setColor(0xE60E1626);
            circle.setStroke(Math.max(1, dp(2)), 0xFF2563EB);
            mBubble.setBackground(circle);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                mBubble.setElevation(dp(6));
            }
            // Opacity hanya untuk bubble: panel tetap pekat agar teks terbaca di atas LIVE.
            mBubble.setAlpha(mOpacityPercent / 100f);

            View icon = mBubble.findViewById(R.id.floating_hud_icon);
            if (icon != null) {
                ViewGroup.LayoutParams iconParams = icon.getLayoutParams();
                if (iconParams != null) {
                    int iconSize = Math.max(dp(18), Math.round(mSizePx * 0.54f));
                    iconParams.width = iconSize;
                    iconParams.height = iconSize;
                    icon.setLayoutParams(iconParams);
                }
            }
        }

        if (mRoot != null) {
            mRoot.setAlpha(1f);
        }
    }

    private void applySideOrder() {
        if (mRoot == null || mBubble == null || mContent == null) {
            return;
        }

        boolean bubbleFirst = mAlignLeft;
        if (bubbleFirst != mAppliedLeftOrder || mRoot.getChildCount() != 2) {
            mRoot.removeAllViews();
            if (bubbleFirst) {
                mRoot.addView(mBubble);
                mRoot.addView(mContent);
            } else {
                mRoot.addView(mContent);
                mRoot.addView(mBubble);
            }
            mAppliedLeftOrder = bubbleFirst;
        }

        ViewGroup.LayoutParams raw = mContent.getLayoutParams();
        if (raw instanceof LinearLayout.LayoutParams) {
            LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) raw;
            lp.setMarginStart(bubbleFirst ? dp(GAP_DP) : 0);
            lp.setMarginEnd(bubbleFirst ? 0 : dp(GAP_DP));
            mContent.setLayoutParams(lp);
        }
    }

    private void updateContentWidth() {
        if (mContent == null) {
            return;
        }
        ViewGroup.LayoutParams raw = mContent.getLayoutParams();
        if (raw instanceof LinearLayout.LayoutParams) {
            LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) raw;
            lp.width = contentWidthPx();
            lp.height = LinearLayout.LayoutParams.WRAP_CONTENT;
            mContent.setLayoutParams(lp);
        }
    }

    private int contentWidthPx() {
        if (mActivePanel != null) {
            return dp(PANEL_WIDTH_DP);
        }
        if (mToolbarVisible) {
            return dp(TOOLBAR_WIDTH_DP);
        }
        return 0;
    }

    private int windowWidthPx() {
        int content = contentWidthPx();
        return mSizePx + (content > 0 ? content + dp(GAP_DP) : 0);
    }

    private void layoutWindow(boolean keepBubbleAnchor) {
        if (mParams == null || mRoot == null) {
            return;
        }

        refreshBounds();

        int windowW = windowWidthPx();
        int maxX = Math.max(0, mScreenW - windowW);

        int anchorX;
        if (keepBubbleAnchor && mBubbleScreenX >= 0) {
            anchorX = mBubbleScreenX;
        } else {
            anchorX = mAlignLeft ? dp(16) : Math.max(0, mScreenW - mSizePx - dp(16));
        }

        int x = mAlignLeft ? anchorX : anchorX - (windowW - mSizePx);
        mParams.x = Math.min(Math.max(x, 0), maxX);
        mBubbleScreenX = mAlignLeft ? mParams.x : mParams.x + (windowW - mSizePx);

        int anchorY = mBubbleScreenY >= 0 ? mBubbleScreenY : dp(120);
        int contentH = mContent != null && mContent.getVisibility() == View.VISIBLE
                ? mContent.getHeight() : 0;
        int neededH = Math.max(mSizePx, contentH);
        int maxY = Math.max(mTopInsetPx, mScreenH - mBottomInsetPx - neededH);
        mParams.y = Math.min(Math.max(anchorY, mTopInsetPx), maxY);
        mBubbleScreenY = mParams.y;

        updateViewLayoutSafe();
    }

    /** Setelah konten selesai diukur, pastikan panel tidak keluar dari area aman layar. */
    private void clampAfterContentChange() {
        if (!mIsAttached || mParams == null || mRoot == null || mWindowManager == null) {
            return;
        }
        refreshBounds();

        int contentH = mContent != null && mContent.getVisibility() == View.VISIBLE
                ? mContent.getHeight() : 0;
        int neededH = Math.max(mSizePx, contentH);
        int maxY = Math.max(mTopInsetPx, mScreenH - mBottomInsetPx - neededH);

        int windowW = windowWidthPx();
        int maxX = Math.max(0, mScreenW - windowW);

        int newY = Math.min(Math.max(mParams.y, mTopInsetPx), maxY);
        int newX = Math.min(Math.max(mParams.x, 0), maxX);

        if (newX != mParams.x || newY != mParams.y) {
            mParams.x = newX;
            mParams.y = newY;
            mBubbleScreenX = mAlignLeft ? newX : newX + (windowW - mSizePx);
            mBubbleScreenY = newY;
            updateViewLayoutSafe();
        }
    }

    private void updateViewLayoutSafe() {
        if (!mIsAttached || mRoot == null || mParams == null || mWindowManager == null) {
            return;
        }
        try {
            mWindowManager.updateViewLayout(mRoot, mParams);
        } catch (IllegalArgumentException e) {
            Log.w(TAG, "updateViewLayout gagal: " + e.getMessage());
        }
    }

    private void refreshBounds() {
        DisplayMetrics metrics = mContext.getResources().getDisplayMetrics();
        int width = metrics.widthPixels;
        int height = metrics.heightPixels;
        int top = 0;
        int bottom = 0;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && mWindowManager != null) {
            try {
                WindowMetrics windowMetrics = mWindowManager.getCurrentWindowMetrics();
                Rect bounds = windowMetrics.getBounds();
                width = bounds.width();
                height = bounds.height();
                WindowInsets insets = windowMetrics.getWindowInsets();
                android.graphics.Insets bars = insets.getInsetsIgnoringVisibility(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                top = bars.top;
                bottom = bars.bottom;
            } catch (Exception e) {
                Log.w(TAG, "Tidak dapat membaca window metrics: " + e.getMessage());
            }
        }

        if (top == 0) {
            int statusBarId = mContext.getResources()
                    .getIdentifier("status_bar_height", "dimen", "android");
            if (statusBarId > 0) {
                top = mContext.getResources().getDimensionPixelSize(statusBarId);
            }
        }

        mScreenW = width;
        mScreenH = height;
        mTopInsetPx = top + dp(4);
        mBottomInsetPx = bottom + dp(4);
    }

    // =========================================================================
    // TOUCH HANDLING
    // =========================================================================

    private void setupBubbleTouch() {
        if (mBubble == null || mParams == null) {
            return;
        }
        final View bubble = mBubble;
        bubble.setOnTouchListener((v, event) -> {
            if (mParams == null || !mIsAttached) {
                return false;
            }

            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    mDownRawX = event.getRawX();
                    mDownRawY = event.getRawY();
                    mDownBubbleX = mBubbleScreenX;
                    mDownBubbleY = mBubbleScreenY;
                    mHasDragged = false;
                    return true;

                case MotionEvent.ACTION_MOVE: {
                    int dx = (int) (event.getRawX() - mDownRawX);
                    int dy = (int) (event.getRawY() - mDownRawY);

                    if (!mHasDragged
                            && (Math.abs(dx) > CLICK_THRESHOLD_PX || Math.abs(dy) > CLICK_THRESHOLD_PX)) {
                        mHasDragged = true;
                    }
                    if (mHasDragged) {
                        mBubbleScreenX = mDownBubbleX + dx;
                        mBubbleScreenY = mDownBubbleY + dy;
                        // Toolbar/panel mengikuti bubble karena berada di window yang sama.
                        layoutWindow(true);
                    }
                    return true;
                }

                case MotionEvent.ACTION_UP: {
                    float totalX = Math.abs(event.getRawX() - mDownRawX);
                    float totalY = Math.abs(event.getRawY() - mDownRawY);

                    if (!mHasDragged && totalX < CLICK_THRESHOLD_PX && totalY < CLICK_THRESHOLD_PX) {
                        v.performClick();
                        toggleHud();
                    } else {
                        updateSideFromBubblePosition();
                    }
                    return true;
                }

                case MotionEvent.ACTION_CANCEL:
                    if (mHasDragged) {
                        updateSideFromBubblePosition();
                    }
                    mHasDragged = false;
                    return true;

                default:
                    return false;
            }
        });

        bubble.setOnClickListener(v -> {
            // Ditangani oleh OnTouchListener agar tap dan drag tidak saling memicu.
        });
    }

    private void updateSideFromBubblePosition() {
        refreshBounds();
        boolean shouldAlignLeft = (mBubbleScreenX + mSizePx / 2) < (mScreenW / 2);
        if (shouldAlignLeft != mAlignLeft) {
            mAlignLeft = shouldAlignLeft;
            applySideOrder();
        }
        layoutWindow(true);
        mRoot.post(this::clampAfterContentChange);
    }

    // =========================================================================
    // SCREEN LOCK / SERVICE RECOVERY
    // =========================================================================

    private void handleScreenOff() {
        if (!mWantedVisible) {
            return;
        }
        // Sembunyikan HUD saat layar terkunci; panel tidak dibuka ulang setelah unlock.
        collapseContent();
        removeWindowOnly();
    }

    private void handleScreenOn() {
        if (!mWantedVisible || mIsAttached) {
            return;
        }
        if (reattachWindow()) {
            layoutWindow(true);
            Log.i(TAG, "HUD dipulihkan setelah layar aktif kembali.");
        }
    }

    private void registerScreenReceiver() {
        if (mScreenReceiverRegistered) {
            return;
        }
        try {
            IntentFilter filter = new IntentFilter();
            filter.addAction(Intent.ACTION_SCREEN_OFF);
            filter.addAction(Intent.ACTION_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                mContext.registerReceiver(mScreenReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                mContext.registerReceiver(mScreenReceiver, filter);
            }
            mScreenReceiverRegistered = true;
        } catch (Exception e) {
            Log.w(TAG, "Gagal mendaftarkan receiver status layar: " + e.getMessage());
        }
    }

    private void unregisterScreenReceiver() {
        if (!mScreenReceiverRegistered) {
            return;
        }
        try {
            mContext.unregisterReceiver(mScreenReceiver);
        } catch (Exception e) {
            Log.w(TAG, "Gagal melepas receiver status layar: " + e.getMessage());
        } finally {
            mScreenReceiverRegistered = false;
        }
    }

    private void removeWindowOnly() {
        if (!mIsAttached || mRoot == null || mWindowManager == null) {
            return;
        }
        try {
            mWindowManager.removeView(mRoot);
        } catch (IllegalArgumentException e) {
            Log.w(TAG, "HUD sudah terlepas saat removeView: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Gagal melepas HUD: " + e.getMessage(), e);
        } finally {
            mIsAttached = false;
        }
    }

    private boolean reattachWindow() {
        if (mIsAttached || mRoot == null || mParams == null || mWindowManager == null) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(mContext)) {
            Log.w(TAG, "Tidak dapat memasang ulang HUD: izin overlay dicabut.");
            return false;
        }
        try {
            mWindowManager.addView(mRoot, mParams);
            mIsAttached = true;
            registerScreenReceiver();
            return true;
        } catch (Exception e) {
            Log.w(TAG, "Gagal memasang ulang HUD: " + e.getMessage());
            return false;
        }
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private void emitCommand(@NonNull String action, @Nullable String id, int value) {
        if (mActionListener != null) {
            mActionListener.onHudCommand(action, id, value);
        }
    }

    private void notifyPanelChanged(@Nullable String panel) {
        if (mActionListener != null) {
            mActionListener.onHudPanelChanged(panel);
        }
    }

    private String panelTitle(@NonNull String panelId) {
        for (int i = 0; i < PANEL_IDS.length; i++) {
            if (PANEL_IDS[i].equals(panelId)) {
                return PANEL_LABELS[i];
            }
        }
        return "SYNTXRR";
    }

    private int toneColor(String tone) {
        if ("ok".equals(tone)) {
            return C_OK;
        }
        if ("warn".equals(tone)) {
            return C_WARN;
        }
        return C_OFF;
    }

    private TextView text(String value, float sizeSp, int color, boolean bold) {
        TextView view = new TextView(mContext);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        view.setTextColor(color);
        if (bold) {
            view.setTypeface(view.getTypeface(), Typeface.BOLD);
        }
        return view;
    }

    private GradientDrawable rounded(int radiusPx, int fillColor, int strokePx, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setCornerRadius(radiusPx);
        drawable.setColor(fillColor);
        if (strokePx > 0) {
            drawable.setStroke(strokePx, strokeColor);
        }
        return drawable;
    }

    private int dp(float value) {
        return Math.round(value * mContext.getResources().getDisplayMetrics().density);
    }

    public synchronized void destroy() {
        mWantedVisible = false;
        unregisterScreenReceiver();
        hideHud();
        mClickListener = null;
        mActionListener = null;
        mRoot = null;
        mBubble = null;
        mContent = null;
        mToolbar = null;
        mPanelContainer = null;
        mParams = null;
        mWindowManager = null;
    }
}
