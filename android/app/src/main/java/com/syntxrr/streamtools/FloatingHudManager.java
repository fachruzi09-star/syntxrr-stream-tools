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
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
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
    private static final long PENDING_CHAT_TAB_TTL_MS = 4000L;

    private static final int PANEL_WIDTH_DP = 224;
    private static final int TOOLBAR_WIDTH_DP = 48;
    private static final int GAP_DP = 6;
    private static final int PANEL_PADDING_DP = 8;
    private static final int BUBBLE_MIN_DP = 40;
    private static final int BUBBLE_MAX_DP = 64;

    private static final String[] PANEL_IDS = {"chat", "soundboard", "music", "mixer"};
    private static final String[] PANEL_SHORT_LABELS = {"Chat", "Sound", "Music", "Mix"};
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

    private final Handler mMainHandler = new Handler(Looper.getMainLooper());

    @Nullable
    private String mActivePanel = null;
    @Nullable
    private String mLastModelJson = null;
    @Nullable
    private String mPendingChatTab = null;
    private long mPendingChatTabAtMs = 0L;
    @Nullable
    private String mLastRenderedPanelId = null;
    @Nullable
    private String mLastRenderedModelJson = null;
    private boolean mLastRenderedStale = false;

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
        initDefaultPanelModels();
    }

    private void initDefaultPanelModels() {
        try {
            // Default Soundboard (Immediate native offline capability)
            JSONObject sb = new JSONObject();
            sb.put("panel", "soundboard");
            sb.put("title", "Soundboard");
            JSONObject sbStatus = new JSONObject();
            sbStatus.put("text", "Siap");
            sbStatus.put("tone", "ok");
            sb.put("status", sbStatus);
            JSONObject grid = new JSONObject();
            grid.put("columns", 3);
            JSONArray items = new JSONArray();
            String[] ids = {"sb_1", "sb_2", "sb_3", "sb_4", "sb_5", "sb_6"};
            String[] labels = {"Airhorn", "Level Up", "Cheer", "Tada", "Bell", "Game Over"};
            for (int i = 0; i < ids.length; i++) {
                JSONObject it = new JSONObject();
                it.put("id", ids[i]);
                it.put("label", labels[i]);
                it.put("action", "soundboard.play");
                it.put("active", false);
                items.put(it);
            }
            grid.put("items", items);
            sb.put("grid", grid);
            mPanelModels.put("soundboard", sb.toString());

            // Default Music Player
            JSONObject music = new JSONObject();
            music.put("panel", "music");
            music.put("title", "Music Player");
            JSONObject mStatus = new JSONObject();
            mStatus.put("text", "Jeda");
            mStatus.put("tone", "off");
            music.put("status", mStatus);
            JSONArray buttons = new JSONArray();
            JSONObject bPlay = new JSONObject();
            bPlay.put("id", "play");
            bPlay.put("label", "Putar");
            bPlay.put("action", "music.toggle");
            bPlay.put("active", false);
            buttons.put(bPlay);
            JSONObject bNext = new JSONObject();
            bNext.put("id", "next");
            bNext.put("label", "Berikutnya");
            bNext.put("action", "music.next");
            bNext.put("active", false);
            buttons.put(bNext);
            JSONObject bMute = new JSONObject();
            bMute.put("id", "mute");
            bMute.put("label", "Mute");
            bMute.put("action", "music.mute");
            bMute.put("active", false);
            buttons.put(bMute);
            music.put("buttons", buttons);
            JSONArray sliders = new JSONArray();
            JSONObject sVol = new JSONObject();
            sVol.put("id", "music_vol");
            sVol.put("label", "Volume Musik");
            sVol.put("value", 85);
            sVol.put("max", 100);
            sVol.put("action", "music.volume");
            sliders.put(sVol);
            music.put("sliders", sliders);
            JSONArray rows = new JSONArray();
            JSONObject r1 = new JSONObject();
            r1.put("label", "Antrean Musik");
            r1.put("sub", "Belum ada trek lokal yang dimainkan");
            r1.put("trailing", "");
            rows.put(r1);
            music.put("rows", rows);
            mPanelModels.put("music", music.toString());

            // Default Mixer
            JSONObject mixer = new JSONObject();
            mixer.put("panel", "mixer");
            mixer.put("title", "Audio Mixer");
            JSONObject mixStatus = new JSONObject();
            mixStatus.put("text", "Aktif");
            mixStatus.put("tone", "ok");
            mixer.put("status", mixStatus);
            JSONObject meter = new JSONObject();
            meter.put("label", "Level mic");
            meter.put("value", 70);
            meter.put("muted", false);
            meter.put("available", true);
            mixer.put("meter", meter);
            JSONArray mixSliders = new JSONArray();
            JSONObject sl1 = new JSONObject();
            sl1.put("id", "music");
            sl1.put("label", "Musik");
            sl1.put("value", 85);
            sl1.put("max", 100);
            sl1.put("action", "mixer.music");
            mixSliders.put(sl1);
            JSONObject sl2 = new JSONObject();
            sl2.put("id", "sfx");
            sl2.put("label", "Soundboard");
            sl2.put("value", 90);
            sl2.put("max", 100);
            sl2.put("action", "mixer.sfx");
            mixSliders.put(sl2);
            JSONObject sl3 = new JSONObject();
            sl3.put("id", "tts");
            sl3.put("label", "TTS Donasi");
            sl3.put("value", 85);
            sl3.put("max", 100);
            sl3.put("action", "mixer.tts");
            mixSliders.put(sl3);
            mixer.put("sliders", mixSliders);
            mPanelModels.put("mixer", mixer.toString());

            // Default Live Chat
            JSONObject chat = new JSONObject();
            chat.put("panel", "chat");
            chat.put("title", "Live Chat");
            JSONObject chatStatus = new JSONObject();
            chatStatus.put("text", "Menunggu koneksi");
            chatStatus.put("tone", "warn");
            chat.put("status", chatStatus);
            JSONArray tabs = new JSONArray();
            String[] tIds = {"chat", "gift", "like", "follow"};
            String[] tLabels = {"Chat", "Gift", "Like", "Follow"};
            JSONObject rowsByTab = new JSONObject();
            JSONObject emptyTextByTab = new JSONObject();
            for (int i = 0; i < tIds.length; i++) {
                JSONObject tab = new JSONObject();
                tab.put("id", tIds[i]);
                tab.put("label", tLabels[i]);
                tabs.put(tab);
                rowsByTab.put(tIds[i], new JSONArray());
                emptyTextByTab.put(tIds[i], defaultEmptyTextForTab(tIds[i]));
            }
            chat.put("tabs", tabs);
            chat.put("activeTab", "chat");
            chat.put("rows", new JSONArray());
            chat.put("rowsByTab", rowsByTab);
            chat.put("emptyTextByTab", emptyTextByTab);
            chat.put("emptyText", defaultEmptyTextForTab("chat"));
            mPanelModels.put("chat", chat.toString());
        } catch (Exception e) {
            Log.w(TAG, "Gagal menginisialisasi default model: " + e.getMessage());
        }
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

    /** Cache model per panel agar overlay dapat digambar tanpa WebView aktif. */
    private final java.util.HashMap<String, String> mPanelModels = new java.util.HashMap<>();

    /**
     * Terima model panel dari WebView (JSON). Native hanya menggambar; seluruh nilai
     * (musik, queue, soundboard, mic) berasal dari state aplikasi.
     *
     * Menerima dua bentuk: satu model panel, atau snapshot berisi semua panel
     * ({"panels":{chat:...,soundboard:...,music:...,mixer:...}}). Snapshot disimpan per
     * panel sehingga panel mana pun tetap dapat dirender saat WebView dijeda Android.
     */
    public synchronized boolean pushPanelModel(@Nullable String json) {
        if (json == null || json.isEmpty()) {
            return false;
        }

        String singlePanel = "";
        try {
            JSONObject root = new JSONObject(json);
            JSONObject panels = root.optJSONObject("panels");
            if (panels != null) {
                java.util.Iterator<String> keys = panels.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    JSONObject model = panels.optJSONObject(key);
                    if (model != null) {
                        if ("chat".equals(key)) {
                            applyPendingChatTabIfNeeded(model);
                        }
                        mPanelModels.put(key, model.toString());
                    }
                }
                if (mActivePanel != null && mPanelModels.containsKey(mActivePanel)) {
                    mLastModelJson = mPanelModels.get(mActivePanel);
                }
                renderLastKnownModel(false);
                return true;
            }
            singlePanel = root.optString("panel", "");
            if ("chat".equals(singlePanel)) {
                applyPendingChatTabIfNeeded(root);
            }
            String storedJson = root.toString();
            if (!singlePanel.isEmpty()) {
                mPanelModels.put(singlePanel, storedJson);
            }
            if (mActivePanel != null && mActivePanel.equals(singlePanel)) {
                mLastModelJson = storedJson;
            }
        } catch (JSONException e) {
            Log.w(TAG, "Model HUD tidak valid: " + e.getMessage());
            return false;
        }

        if (!mIsAttached || mRoot == null || mPanelContainer == null) {
            return false;
        }

        if (mActivePanel != null && mActivePanel.equals(singlePanel)) {
            renderLastKnownModel(false);
        }
        return true;
    }

    /**
     * Update active soundboard play state and synchronize button indicator in real-time.
     */
    public synchronized void setSoundboardPlayingState(@Nullable final String soundId, final boolean isPlaying) {
        String sbJson = mPanelModels.get("soundboard");
        if (sbJson == null) return;
        try {
            JSONObject model = new JSONObject(sbJson);
            JSONObject status = model.optJSONObject("status");
            if (status == null) {
                status = new JSONObject();
                model.put("status", status);
            }
            status.put("text", isPlaying ? "Memutar..." : "Siap");
            status.put("tone", "ok");

            JSONObject grid = model.optJSONObject("grid");
            if (grid != null) {
                JSONArray items = grid.optJSONArray("items");
                if (items != null) {
                    for (int i = 0; i < items.length(); i++) {
                        JSONObject item = items.optJSONObject(i);
                        if (item != null) {
                            String id = item.optString("id", "");
                            if (isPlaying && soundId != null && (id.equalsIgnoreCase(soundId) || soundId.toLowerCase().contains(id.toLowerCase()))) {
                                item.put("active", true);
                            } else {
                                item.put("active", false);
                            }
                        }
                    }
                }
            }

            mPanelModels.put("soundboard", model.toString());

            if ("soundboard".equals(mActivePanel)) {
                mLastModelJson = mPanelModels.get("soundboard");
                renderLastKnownModel(false);
            }
        } catch (Exception e) {
            Log.w(TAG, "Gagal memperbarui status Soundboard: " + e.getMessage());
        }
    }

    public synchronized void toggleMusicState() {
        String musicJson = mPanelModels.get("music");
        if (musicJson == null) return;
        try {
            JSONObject model = new JSONObject(musicJson);
            JSONObject status = model.optJSONObject("status");
            if (status == null) {
                status = new JSONObject();
                model.put("status", status);
            }
            boolean currentlyPlaying = "Memutar".equalsIgnoreCase(status.optString("text"));
            boolean nextPlaying = !currentlyPlaying;
            status.put("text", nextPlaying ? "Memutar" : "Jeda");
            status.put("tone", nextPlaying ? "ok" : "off");

            JSONArray buttons = model.optJSONArray("buttons");
            if (buttons != null) {
                for (int i = 0; i < buttons.length(); i++) {
                    JSONObject b = buttons.optJSONObject(i);
                    if (b != null && "play".equals(b.optString("id"))) {
                        b.put("label", nextPlaying ? "Jeda" : "Putar");
                        b.put("active", nextPlaying);
                    }
                }
            }
            mPanelModels.put("music", model.toString());
            if ("music".equals(mActivePanel)) {
                mLastModelJson = mPanelModels.get("music");
                renderLastKnownModel(false);
            }
        } catch (Exception ignored) {}
    }

    public synchronized void advanceMusicQueue() {
        String musicJson = mPanelModels.get("music");
        if (musicJson == null) return;
        try {
            JSONObject model = new JSONObject(musicJson);
            JSONObject status = model.optJSONObject("status");
            if (status != null) {
                status.put("text", "Memutar");
                status.put("tone", "ok");
            }
            JSONArray buttons = model.optJSONArray("buttons");
            if (buttons != null) {
                for (int i = 0; i < buttons.length(); i++) {
                    JSONObject b = buttons.optJSONObject(i);
                    if (b != null && "play".equals(b.optString("id"))) {
                        b.put("label", "Jeda");
                        b.put("active", true);
                    }
                }
            }
            mPanelModels.put("music", model.toString());
            if ("music".equals(mActivePanel)) {
                mLastModelJson = mPanelModels.get("music");
                renderLastKnownModel(false);
            }
        } catch (Exception ignored) {}
    }

    public synchronized void toggleMusicMute() {
        String musicJson = mPanelModels.get("music");
        if (musicJson == null) return;
        try {
            JSONObject model = new JSONObject(musicJson);
            JSONArray buttons = model.optJSONArray("buttons");
            if (buttons != null) {
                for (int i = 0; i < buttons.length(); i++) {
                    JSONObject b = buttons.optJSONObject(i);
                    if (b != null && "mute".equals(b.optString("id"))) {
                        boolean active = b.optBoolean("active", false);
                        b.put("active", !active);
                    }
                }
            }
            mPanelModels.put("music", model.toString());
            if ("music".equals(mActivePanel)) {
                mLastModelJson = mPanelModels.get("music");
                renderLastKnownModel(false);
            }
        } catch (Exception ignored) {}
    }

    public synchronized void setMusicVolume(int volumePercent) {
        String musicJson = mPanelModels.get("music");
        if (musicJson == null) return;
        try {
            JSONObject model = new JSONObject(musicJson);
            JSONArray sliders = model.optJSONArray("sliders");
            if (sliders != null) {
                for (int i = 0; i < sliders.length(); i++) {
                    JSONObject s = sliders.optJSONObject(i);
                    if (s != null && "music_vol".equals(s.optString("id"))) {
                        s.put("value", Math.max(0, Math.min(100, volumePercent)));
                    }
                }
            }
            mPanelModels.put("music", model.toString());
        } catch (Exception ignored) {}
    }

    /** Tutup toolbar/panel tanpa menyembunyikan bubble. */
    public synchronized void collapseContent() {
        resetRenderedCache();
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
        mToolbar.setBackground(rounded(dp(14), C_SURFACE, dp(1), C_BORDER));
        mToolbar.setPadding(dp(5), dp(5), dp(5), dp(5));
        mToolbar.setVisibility(View.GONE);

        for (int i = 0; i < PANEL_IDS.length; i++) {
            final String panelId = PANEL_IDS[i];
            TextView icon = text(PANEL_SHORT_LABELS[i], 9f, C_TEXT, true);
            icon.setMaxLines(1);
            icon.setGravity(Gravity.CENTER);
            icon.setContentDescription(PANEL_LABELS[i]);
            icon.setBackground(rounded(dp(10), C_SURFACE_SOFT, 0, Color.TRANSPARENT));
            LinearLayout.LayoutParams iconParams =
                    new LinearLayout.LayoutParams(dp(38), dp(38));
            iconParams.topMargin = i == 0 ? 0 : dp(3);
            icon.setOnClickListener(v -> openPanel(panelId));
            mToolbar.addView(icon, iconParams);
        }

        LinearLayout.LayoutParams toolbarParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        mContent.addView(mToolbar, toolbarParams);

        // Container satu panel aktif
        mPanelContainer = new LinearLayout(mContext);
        mPanelContainer.setOrientation(LinearLayout.VERTICAL);
        mPanelContainer.setBackground(rounded(dp(14), C_SURFACE, dp(1), C_BORDER));
        mPanelContainer.setPadding(
                dp(PANEL_PADDING_DP), dp(PANEL_PADDING_DP),
                dp(PANEL_PADDING_DP), dp(PANEL_PADDING_DP));
        mPanelContainer.setVisibility(View.GONE);

        LinearLayout.LayoutParams panelParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        mContent.addView(mPanelContainer, panelParams);
    }

    private void openPanel(@NonNull String panelId) {
        mActivePanel = panelId;
        mToolbarVisible = false;
        resetRenderedCache();

        if (mToolbar != null) {
            mToolbar.setVisibility(View.GONE);
        }
        if (mPanelContainer != null) {
            mPanelContainer.setVisibility(View.VISIBLE);
            if (!mPanelModels.containsKey(panelId)) {
                showPanelPlaceholder(panelId);
            }
        }
        if (mContent != null) {
            mContent.setVisibility(View.VISIBLE);
        }

        updateContentWidth();
        notifyPanelChanged(panelId);
        layoutWindow(true);

        // Jika model panel ini sudah pernah dibuat atau didorong, tampilkan langsung
        renderLastKnownModel(false);
        if (mRoot != null) {
            mRoot.post(this::clampAfterContentChange);
        }
    }

    private void showToolbar() {
        mActivePanel = null;
        mToolbarVisible = true;
        resetRenderedCache();

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
    // MODEL RENDERING & NATIVE CHAT TAB SWITCHING
    // =========================================================================

    private boolean isValidChatTab(@Nullable String tabId) {
        return "chat".equals(tabId)
                || "gift".equals(tabId)
                || "like".equals(tabId)
                || "follow".equals(tabId);
    }

    @NonNull
    private String defaultEmptyTextForTab(@NonNull String tabId) {
        if ("chat".equals(tabId)) {
            return "Belum ada pesan chat masuk.";
        }
        return "Belum ada event " + tabId + ".";
    }

    private void applyTabSelectionToChatModel(@NonNull JSONObject chatModel, @NonNull String tabId) {
        try {
            String previousTab = chatModel.optString("activeTab", "");
            chatModel.put("activeTab", tabId);

            JSONObject rowsByTab = chatModel.optJSONObject("rowsByTab");
            if (rowsByTab != null) {
                JSONArray tabRows = rowsByTab.optJSONArray(tabId);
                chatModel.put("rows", tabRows != null ? tabRows : new JSONArray());
            } else if (!tabId.equals(previousTab)) {
                chatModel.put("rows", new JSONArray());
            }

            JSONObject emptyTextByTab = chatModel.optJSONObject("emptyTextByTab");
            if (emptyTextByTab != null && emptyTextByTab.has(tabId)) {
                chatModel.put("emptyText", emptyTextByTab.optString(tabId, defaultEmptyTextForTab(tabId)));
            } else {
                chatModel.put("emptyText", defaultEmptyTextForTab(tabId));
            }
        } catch (JSONException e) {
            Log.w(TAG, "Gagal menerapkan tab chat " + tabId + ": " + e.getMessage());
        }
    }

    private void applyPendingChatTabIfNeeded(@NonNull JSONObject chatModel) {
        if (mPendingChatTab == null) {
            return;
        }
        String incomingTab = chatModel.optString("activeTab", "");
        long elapsed = SystemClock.uptimeMillis() - mPendingChatTabAtMs;
        if (mPendingChatTab.equals(incomingTab) || elapsed > PENDING_CHAT_TAB_TTL_MS) {
            mPendingChatTab = null;
            mPendingChatTabAtMs = 0L;
            return;
        }
        applyTabSelectionToChatModel(chatModel, mPendingChatTab);
    }

    public synchronized boolean selectChatTab(@Nullable String rawTabId) {
        String tabId = rawTabId != null ? rawTabId.trim() : null;
        if (!isValidChatTab(tabId)) {
            Log.w(TAG, "Tab chat tidak valid diabaikan: " + rawTabId);
            return false;
        }

        mPendingChatTab = tabId;
        mPendingChatTabAtMs = SystemClock.uptimeMillis();

        String chatJson = mPanelModels.get("chat");
        if (chatJson != null) {
            try {
                JSONObject model = new JSONObject(chatJson);
                applyTabSelectionToChatModel(model, tabId);
                String updated = model.toString();
                mPanelModels.put("chat", updated);
                if ("chat".equals(mActivePanel)) {
                    mLastModelJson = updated;
                }
            } catch (JSONException e) {
                Log.w(TAG, "Gagal memperbarui cache tab chat: " + e.getMessage());
            }
        }

        if ("chat".equals(mActivePanel)) {
            renderLastKnownModel(mLastRenderedStale);
        }
        return true;
    }

    private void resetRenderedCache() {
        mLastRenderedPanelId = null;
        mLastRenderedModelJson = null;
        mLastRenderedStale = false;
    }

    private void runOnUiThreadSafe(@NonNull Runnable task) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            task.run();
        } else {
            mMainHandler.post(task);
        }
    }

    private void showPanelPlaceholder(@NonNull String panelId) {
        if (mPanelContainer == null) {
            return;
        }
        resetRenderedCache();
        mPanelContainer.removeAllViews();
        // Placeholder jujur: tanpa status palsu dan tanpa keadaan "memuat" tanpa akhir.
        // Bila model terakhir masih tersedia, renderLastKnownModel() langsung menggantikannya.
        mPanelContainer.addView(buildHeader(panelTitle(panelId), "Menunggu aplikasi", "warn"));
        mPanelContainer.addView(buildEmpty("Data panel dimuat saat aplikasi aktif."));
    }

    /**
     * Gambar ulang model terakhir yang valid untuk panel aktif.
     *
     * Dipakai ketika WebView dijeda sistem (aplikasi di background) dan saat resume sebelum
     * model baru dikirim, agar panel mempertahankan data terakhir alih-alih placeholder
     * kosong. Saat markStale = true header ditandai "Status terakhir" supaya data lama tidak
     * tampil seolah-olah masih segar atau masih terhubung ke sumber LIVE.
     */
    public void renderLastKnownModel(final boolean markStale) {
        runOnUiThreadSafe(() -> {
            synchronized (FloatingHudManager.this) {
                if (mActivePanel == null || !mIsAttached || mPanelContainer == null) {
                    return;
                }
                final String activePanel = mActivePanel;
                // Utamakan cache khusus panel aktif; mLastModelJson hanya cadangan.
                String cachedJson = mPanelModels.get(activePanel);
                if (cachedJson == null) {
                    cachedJson = mLastModelJson;
                }
                if (cachedJson == null) {
                    return;
                }
                if (activePanel.equals(mLastRenderedPanelId)
                        && markStale == mLastRenderedStale
                        && cachedJson.equals(mLastRenderedModelJson)
                        && mPanelContainer.getChildCount() > 0) {
                    return;
                }
                try {
                    JSONObject cached = new JSONObject(cachedJson);
                    if (!activePanel.equals(cached.optString("panel"))) {
                        return; // cache milik panel lain
                    }
                    renderModel(cached, markStale);
                    mLastRenderedPanelId = activePanel;
                    mLastRenderedModelJson = cachedJson;
                    mLastRenderedStale = markStale;
                    layoutWindow(true);
                    if (mRoot != null) {
                        mRoot.post(this::clampAfterContentChange);
                    }
                } catch (JSONException ignored) {
                    // model usang diabaikan
                }
            }
        });
    }

    private void renderModel(@NonNull JSONObject model, boolean stale) {
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
            if (stale && "chat".equals(model.optString("panel"))) {
                // Data dari cache saat WebView dijeda: jangan mengklaim "Terhubung" atau
                // nilai yang mungkin sudah kedaluwarsa khusus untuk stream LIVE TikTok.
                statusText = "Status terakhir";
                tone = "warn";
            }
            mPanelContainer.addView(buildHeader(title, statusText, tone));

            JSONArray tabs = model.optJSONArray("tabs");
            if (tabs != null && tabs.length() > 0) {
                mPanelContainer.addView(buildTabs(tabs, model.optString("activeTab", "")));
            }

            boolean hasBody = false;

            JSONArray buttons = model.optJSONArray("buttons");
            if (buttons != null && buttons.length() > 0) {
                mPanelContainer.addView(buildButtons(buttons));
                hasBody = true;
            }

            JSONObject grid = model.optJSONObject("grid");
            if (grid != null) {
                View gridView = buildGrid(grid);
                if (gridView != null) {
                    mPanelContainer.addView(gridView);
                    hasBody = true;
                }
            }

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
                scrollParams.topMargin = dp(3);
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
        header.setPadding(dp(2), 0, dp(2), dp(6));

        TextView titleView = text(title, 12f, C_TEXT, true);
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
        int count = tabs.length();
        LinearLayout row = new LinearLayout(mContext);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, 0, 0, dp(4));

        boolean fitEqually = count > 0 && count <= 4;
        for (int i = 0; i < count; i++) {
            JSONObject tab = tabs.optJSONObject(i);
            if (tab == null) {
                continue;
            }
            final String id = tab.optString("id", "");
            String label = tab.optString("label", id);
            boolean active = id.equals(activeTab);

            TextView chip = text(label, 10f, active ? C_TEXT : C_TEXT_DIM, active);
            chip.setGravity(Gravity.CENTER);
            chip.setSingleLine(true);
            chip.setEllipsize(TextUtils.TruncateAt.END);
            chip.setMinHeight(dp(48));
            chip.setPadding(dp(4), 0, dp(4), 0);
            chip.setBackground(rounded(dp(10), active ? 0xFF2563EB : C_SURFACE_SOFT, 0, Color.TRANSPARENT));
            chip.setContentDescription(label);
            chip.setClickable(true);
            chip.setFocusable(true);
            chip.setOnClickListener(v -> emitCommand("chat.tab", id, 0));

            LinearLayout.LayoutParams chipParams;
            if (fitEqually) {
                chipParams = new LinearLayout.LayoutParams(0, dp(48), 1f);
            } else {
                chip.setMinWidth(dp(48));
                chip.setPadding(dp(10), 0, dp(10), 0);
                chipParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT, dp(48));
            }
            if (row.getChildCount() > 0) {
                chipParams.setMarginStart(dp(4));
            }
            row.addView(chip, chipParams);
        }

        if (fitEqually) {
            row.setLayoutParams(new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT));
            return row;
        }

        HorizontalScrollView scroll = new HorizontalScrollView(mContext);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setClipToPadding(false);
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
            TextView subView = text(sub, 9f, C_TEXT_DIM, false);
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

    /**
     * Deretan tombol aksi ringkas (Play/Pause, Next, Mute). Teks saja, tanpa emoji,
     * dan setiap tombol mengirim aksi yang sama seperti sebelumnya.
     */
    private View buildButtons(JSONArray buttons) {
        LinearLayout row = new LinearLayout(mContext);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        rowParams.bottomMargin = dp(4);
        row.setLayoutParams(rowParams);

        int count = buttons.length();
        for (int i = 0; i < count; i++) {
            JSONObject button = buttons.optJSONObject(i);
            if (button == null) {
                continue;
            }
            final String action = button.optString("action", "");
            final String id = button.optString("id", "");
            boolean active = button.optBoolean("active", false);
            String label = button.optString("label", "");

            TextView view = text(label, 10f, active ? C_TEXT : C_TEXT_DIM, true);
            view.setGravity(Gravity.CENTER);
            view.setSingleLine(true);
            view.setEllipsize(TextUtils.TruncateAt.END);
            view.setContentDescription(label);
            view.setBackground(rounded(dp(9),
                    active ? 0xFF2563EB : C_SURFACE_SOFT, 0, Color.TRANSPARENT));

            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(30), 1f);
            if (i > 0) {
                params.setMarginStart(dp(4));
            }
            if (!action.isEmpty() && !"noop".equals(action)) {
                view.setClickable(true);
                view.setFocusable(true);
                view.setOnClickListener(v -> emitCommand(action, id, 0));
            }
            row.addView(view, params);
        }
        return row;
    }

    /**
     * Grid tombol persegi (Soundboard 4 kolom). Ukuran sel dihitung dari lebar panel
     * agar tetap persegi tanpa membuat panel melebar.
     */
    @Nullable
    private View buildGrid(JSONObject grid) {
        JSONArray items = grid.optJSONArray("items");
        if (items == null || items.length() == 0) {
            return null;
        }

        int columns = Math.max(1, Math.min(4, grid.optInt("columns", 4)));
        int innerWidth = dp(PANEL_WIDTH_DP) - dp(PANEL_PADDING_DP) * 2;
        int gap = dp(4);
        int cellPx = Math.max(dp(30), (innerWidth - gap * (columns - 1)) / columns);

        LinearLayout wrap = new LinearLayout(mContext);
        wrap.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams wrapParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        wrapParams.bottomMargin = dp(4);
        wrap.setLayoutParams(wrapParams);

        LinearLayout row = null;
        for (int i = 0; i < items.length(); i++) {
            if (i % columns == 0) {
                row = new LinearLayout(mContext);
                row.setOrientation(LinearLayout.HORIZONTAL);
                LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT);
                rowParams.bottomMargin = dp(4);
                wrap.addView(row, rowParams);
            }

            JSONObject item = items.optJSONObject(i);
            if (item == null || row == null) {
                continue;
            }

            final String action = item.optString("action", "");
            final String id = item.optString("id", "");
            boolean active = item.optBoolean("active", false);
            String label = item.optString("label", "");

            TextView cell = text(label, 9f, C_TEXT, false);
            cell.setGravity(Gravity.CENTER);
            cell.setMaxLines(2);
            cell.setEllipsize(TextUtils.TruncateAt.END);
            cell.setContentDescription(label);
            cell.setBackground(rounded(dp(8),
                    active ? 0xFF2563EB : C_SURFACE_SOFT, 0, Color.TRANSPARENT));

            LinearLayout.LayoutParams cellParams = new LinearLayout.LayoutParams(cellPx, cellPx);
            if (i % columns != 0) {
                cellParams.setMarginStart(gap);
            }
            if (!action.isEmpty() && !"noop".equals(action)) {
                cell.setClickable(true);
                cell.setFocusable(true);
                cell.setOnClickListener(v -> emitCommand(action, id, 0));
            }
            row.addView(cell, cellParams);
        }
        return wrap;
    }

    private View buildSlider(JSONObject slider) {
        LinearLayout wrap = new LinearLayout(mContext);
        wrap.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams wrapParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        wrapParams.topMargin = dp(3);
        wrap.setLayoutParams(wrapParams);

        final String action = slider.optString("action", "");
        final String id = slider.optString("id", "");
        int max = Math.max(1, slider.optInt("max", 100));
        int value = Math.max(0, Math.min(max, slider.optInt("value", 0)));

        LinearLayout labelRow = new LinearLayout(mContext);
        labelRow.setOrientation(LinearLayout.HORIZONTAL);
        labelRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView label = text(slider.optString("label", ""), 9.5f, C_TEXT_DIM, false);
        label.setSingleLine(true);
        labelRow.addView(label, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        TextView valueView = text(value + "%", 9f, C_ACCENT, true);
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
        mMainHandler.removeCallbacksAndMessages(null);
        mPendingChatTab = null;
        mPendingChatTabAtMs = 0L;
        resetRenderedCache();
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
