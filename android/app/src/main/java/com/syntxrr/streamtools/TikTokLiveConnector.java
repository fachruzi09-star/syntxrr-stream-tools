package com.syntxrr.streamtools;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * TikTokLiveConnector
 *
 * Pemilik lifecycle koneksi TikTok LIVE Mode A di sisi native Android (singleton yang terikat
 * dengan CompanionService sebagai pemilik lifecycle background).
 *
 * Alur koneksi (sesuai arsitektur StreamingIn):
 * TikTokRoomResolver -> Direct WebSocket -> (jika ditolak & diizinkan) EulerStream Fallback
 * -> TikTokWebcastDecoder -> Listener (FloatingCompanionPlugin -> JS streamEventBus)
 *
 * State resmi:
 * - disconnected
 * - resolving_room
 * - connecting_direct
 * - connected_direct
 * - connecting_euler
 * - connected_euler
 * - reconnecting
 * - waiting_for_live
 * - error
 */
public final class TikTokLiveConnector {

    private static final String TAG = "TikTokLiveConnector";
    private static final int MAX_RECONNECT_ATTEMPTS = 3;
    private static final long[] RECONNECT_DELAYS_MS = {2_000L, 5_000L, 10_000L};

    public interface Listener {
        void onStateChanged(@NonNull JSONObject stateJson);
        void onEventDecoded(@NonNull JSONObject eventJson);
    }

    @Nullable
    private static volatile TikTokLiveConnector sInstance;

    public static TikTokLiveConnector getInstance(@NonNull Context context) {
        if (sInstance == null) {
            synchronized (TikTokLiveConnector.class) {
                if (sInstance == null) {
                    sInstance = new TikTokLiveConnector(context.getApplicationContext());
                }
            }
        }
        return sInstance;
    }

    private final Context mAppContext;
    private final Object mLock = new Object();
    private final AtomicLong mSessionGeneration = new AtomicLong(0L);
    private final ExecutorService mWorker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "TikTokLiveWorker");
        t.setDaemon(true);
        return t;
    });
    private final ScheduledExecutorService mScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "TikTokLiveScheduler");
        t.setDaemon(true);
        return t;
    });

    @Nullable
    private volatile Listener mListener;
    @Nullable
    private TikTokWebSocketTransport mActiveWs;
    @Nullable
    private ScheduledFuture<?> mPendingTask;

    // Session state (disimpan di memori saja selama sesi aktif)
    @NonNull
    private String mState = "disconnected";
    @NonNull
    private String mTransportMode = "none"; // none | direct_ws | euler
    @NonNull
    private String mUsername = "";
    @NonNull
    private String mRoomId = "";
    @NonNull
    private String mEulerApiKey = "";
    private boolean mAllowEulerFallback = true;
    @NonNull
    private String mCursor = "";
    @NonNull
    private String mInternalExt = "";
    @NonNull
    private Map<String, String> mSessionCookies = new LinkedHashMap<>();
    private long mViewerCount = 0L;
    private long mTotalLikeCount = 0L;
    @NonNull
    private String mMessage = "Belum terhubung ke TikTok LIVE.";
    @NonNull
    private String mErrorCode = "";
    private int mReconnectAttempt = 0;

    private TikTokLiveConnector(@NonNull Context appContext) {
        this.mAppContext = appContext;
    }

    public void setListener(@Nullable Listener listener) {
        mListener = listener;
        if (listener != null) {
            listener.onStateChanged(getStateSnapshot());
        }
    }

    @NonNull
    public JSONObject getStateSnapshot() {
        synchronized (mLock) {
            JSONObject obj = new JSONObject();
            try {
                obj.put("state", mState);
                obj.put("transport", mTransportMode);
                obj.put("username", mUsername);
                obj.put("roomId", mRoomId);
                obj.put("viewerCount", mViewerCount);
                obj.put("totalLikeCount", mTotalLikeCount);
                obj.put("message", mMessage);
                obj.put("errorCode", mErrorCode);
                obj.put("timestamp", System.currentTimeMillis());
            } catch (Exception ignored) {
            }
            return obj;
        }
    }

    public boolean isSessionActive() {
        synchronized (mLock) {
            return !"disconnected".equals(mState)
                    && !"error".equals(mState)
                    && !"waiting_for_live".equals(mState);
        }
    }

    public void connect(
            @Nullable String rawUsername,
            @Nullable String eulerApiKey,
            boolean allowEulerFallback
    ) {
        String normalized = TikTokRoomResolver.normalizeUsername(rawUsername);
        if (normalized.isEmpty()) {
            stopInternal("error", "INVALID_INPUT", "Username TikTok tidak valid atau kosong.");
            return;
        }

        final long gen;
        synchronized (mLock) {
            boolean alreadySameSession = isSessionActive()
                    && normalized.equalsIgnoreCase(mUsername)
                    && allowEulerFallback == mAllowEulerFallback;
            if (alreadySameSession) {
                emitCurrentState();
                return;
            }

            gen = mSessionGeneration.incrementAndGet();
            cancelPendingTaskLocked();
            closeActiveWsLocked();

            mUsername = normalized;
            mEulerApiKey = eulerApiKey != null ? eulerApiKey.trim() : "";
            mAllowEulerFallback = allowEulerFallback;
            mRoomId = "";
            mCursor = "";
            mInternalExt = "";
            mSessionCookies.clear();
            mViewerCount = 0L;
            mTotalLikeCount = 0L;
            mReconnectAttempt = 0;
            mTransportMode = "none";
            mErrorCode = "";
            setStateLocked("resolving_room", "none", "Mencari room LIVE @" + normalized + "...");
        }

        mWorker.execute(() -> runRoomResolution(gen, normalized));
    }

    public void disconnect(@Nullable String reason) {
        String finalReason = (reason != null && !reason.trim().isEmpty())
                ? reason.trim()
                : "Koneksi TikTok LIVE diputuskan.";
        stopInternal("disconnected", "", finalReason);
    }

    private void stopInternal(@NonNull String terminalState, @NonNull String errorCode, @NonNull String message) {
        synchronized (mLock) {
            mSessionGeneration.incrementAndGet();
            cancelPendingTaskLocked();
            closeActiveWsLocked();
            mEulerApiKey = "";
            mSessionCookies.clear();
            mCursor = "";
            mInternalExt = "";
            mReconnectAttempt = 0;
            mErrorCode = errorCode;
            setStateLocked(terminalState, "none", message);
        }
    }

    private boolean isStaleGeneration(long gen) {
        return mSessionGeneration.get() != gen;
    }

    private void runRoomResolution(long gen, @NonNull String username) {
        if (isStaleGeneration(gen)) return;

        TikTokRoomResolver.Result res = TikTokRoomResolver.resolve(username);
        if (isStaleGeneration(gen)) return;

        switch (res.status) {
            case INVALID_INPUT:
                failSessionIfCurrent(gen, "error", "INVALID_INPUT", res.message);
                return;
            case ACCOUNT_NOT_FOUND:
                failSessionIfCurrent(gen, "error", "ACCOUNT_NOT_FOUND", res.message);
                return;
            case NOT_LIVE:
                failSessionIfCurrent(gen, "waiting_for_live", "NOT_LIVE", res.message);
                return;
            case ROOM_UNREADABLE:
                failSessionIfCurrent(gen, "error", "ROOM_UNREADABLE", res.message);
                return;
            case NETWORK_ERROR:
                scheduleReconnectOrFail(gen, "NETWORK_ERROR", res.message, false);
                return;
            case RESOLVED_LIVE:
                synchronized (mLock) {
                    if (isStaleGeneration(gen)) return;
                    mRoomId = res.roomId;
                    mSessionCookies = new LinkedHashMap<>(res.sessionCookies);
                    mReconnectAttempt = 0;
                }
                startDirectWebSocket(gen);
                return;
        }
    }

    private void startDirectWebSocket(long gen) {
        final String roomId;
        final String cursor;
        final String internalExt;
        final Map<String, String> cookies;
        final boolean allowEuler;
        final String username;

        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            roomId = mRoomId;
            cursor = mCursor;
            internalExt = mInternalExt;
            cookies = new LinkedHashMap<>(mSessionCookies);
            allowEuler = mAllowEulerFallback;
            username = mUsername;
            closeActiveWsLocked();
            setStateLocked(
                    "connecting_direct",
                    "direct_ws",
                    "Menghubungkan WebSocket langsung ke @" + username + "..."
            );
        }

        String wsUrl = TikTokWebSocketTransport.buildWebSocketUrl(
                TikTokWebSocketTransport.DIRECT_WS_BASE_URL,
                roomId,
                true,
                10_000L,
                true,
                0L,
                cursor,
                internalExt,
                null
        );

        TikTokWebSocketTransport ws = new TikTokWebSocketTransport();
        synchronized (mLock) {
            if (isStaleGeneration(gen)) {
                ws.close();
                return;
            }
            mActiveWs = ws;
        }

        ws.connect(wsUrl, cookies, 10_000L, new TikTokWebSocketTransport.Listener() {
            @Override
            public void onConnected(int httpStatus) {
                synchronized (mLock) {
                    if (isStaleGeneration(gen)) return;
                    mReconnectAttempt = 0;
                    mErrorCode = "";
                    setStateLocked(
                            "connected_direct",
                            "direct_ws",
                            "Terhubung langsung ke TikTok LIVE @" + mUsername
                    );
                }
            }

            @Override
            public void onBinaryFrame(@NonNull byte[] payload) {
                if (isStaleGeneration(gen)) return;
                handleDecodedWebSocketFrame(gen, ws, payload);
            }

            @Override
            public void onTextFrame(@NonNull String text) {
                // Direct Webcast menggunakan binary Protobuf PushFrame; teks tidak dipalsukan sebagai event.
            }

            @Override
            public void onHandshakeRejected(int httpStatus, @NonNull String reason) {
                if (isStaleGeneration(gen)) return;
                Log.w(TAG, "Direct WebSocket handshake ditolak (http=" + httpStatus + ")");
                if (allowEuler) {
                    startEulerFallback(gen, "Koneksi langsung ditolak (" + reason + "); mencoba fallback EulerStream...");
                } else {
                    failSessionIfCurrent(
                            gen,
                            "error",
                            "DIRECT_WS_REJECTED",
                            reason + " Aktifkan fallback EulerStream di Integrasi jika diperlukan."
                    );
                }
            }

            @Override
            public void onClosed(int code, @NonNull String reason, boolean byRemote) {
                if (isStaleGeneration(gen) || !byRemote) return;
                String msg = "Koneksi WebSocket langsung ditutup server (kode " + code + ").";
                scheduleReconnectOrFail(gen, "WS_CLOSED", msg, false);
            }

            @Override
            public void onError(@NonNull String reason) {
                if (isStaleGeneration(gen)) return;
                scheduleReconnectOrFail(gen, "WS_ERROR", reason, false);
            }
        });
    }

    private void startEulerFallback(long gen, @NonNull String initialMessage) {
        final String roomId;
        final String cursor;
        final String internalExt;
        final String apiKey;

        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            closeActiveWsLocked();
            cancelPendingTaskLocked();
            roomId = mRoomId;
            cursor = mCursor;
            internalExt = mInternalExt;
            apiKey = mEulerApiKey;
            setStateLocked("connecting_euler", "euler", initialMessage);
        }

        mWorker.execute(() -> executeEulerFetchStep(gen, roomId, cursor, internalExt, apiKey, false));
    }

    private void executeEulerFetchStep(
            long gen,
            @NonNull String roomId,
            @NonNull String cursor,
            @NonNull String internalExt,
            @NonNull String apiKey,
            boolean alreadyConnected
    ) {
        if (isStaleGeneration(gen)) return;

        EulerStreamTransport.FetchResult res = EulerStreamTransport.fetch(
                roomId,
                cursor,
                internalExt,
                apiKey
        );
        if (isStaleGeneration(gen)) return;

        if (res.status != EulerStreamTransport.FetchStatus.OK || res.decoded == null) {
            switch (res.status) {
                case AUTH_OR_SIGNING_ERROR:
                    failSessionIfCurrent(gen, "error", "EULER_AUTH_ERROR", res.message);
                    return;
                case RATE_LIMITED:
                    failSessionIfCurrent(gen, "error", "EULER_RATE_LIMITED", res.message);
                    return;
                case MISSING_CURSOR_OR_BAD_REQUEST:
                    failSessionIfCurrent(gen, "error", "EULER_BAD_REQUEST", res.message);
                    return;
                case NOT_FOUND:
                    failSessionIfCurrent(gen, "waiting_for_live", "ROOM_NOT_FOUND", res.message);
                    return;
                case TIMEOUT:
                case NETWORK_ERROR:
                    scheduleReconnectOrFail(gen, "EULER_NETWORK_ERROR", res.message, true);
                    return;
                case UNREADABLE_RESPONSE:
                default:
                    failSessionIfCurrent(gen, "error", "EULER_UNREADABLE", res.message);
                    return;
            }
        }

        TikTokWebcastDecoder.DecodedResponse decoded = res.decoded;
        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            if (!decoded.cursor.isEmpty()) mCursor = decoded.cursor;
            if (!decoded.internalExt.isEmpty()) mInternalExt = decoded.internalExt;
            mReconnectAttempt = 0;
            mErrorCode = "";
        }

        boolean liveEnded = emitDecodedEvents(gen, decoded);
        if (liveEnded || isStaleGeneration(gen)) return;

        if (!decoded.pushServer.isEmpty() && decoded.pushServer.startsWith("wss://")) {
            connectEulerWebSocket(gen, decoded);
            return;
        }

        // Jalur polling fetch Euler jika tidak mengembalikan pushServer WebSocket
        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            if (!alreadyConnected || !"connected_euler".equals(mState)) {
                setStateLocked(
                        "connected_euler",
                        "euler",
                        "Terhubung via EulerStream ke @" + mUsername
                );
            }
            long intervalMs = Math.max(1_500L, Math.min(10_000L,
                    decoded.fetchIntervalMs > 0L ? decoded.fetchIntervalMs : 2_000L));
            final String nextCursor = mCursor;
            final String nextExt = mInternalExt;
            final String keySnapshot = mEulerApiKey;
            mPendingTask = mScheduler.schedule(
                    () -> mWorker.execute(() ->
                            executeEulerFetchStep(gen, roomId, nextCursor, nextExt, keySnapshot, true)),
                    intervalMs,
                    TimeUnit.MILLISECONDS
            );
        }
    }

    private void connectEulerWebSocket(long gen, @NonNull TikTokWebcastDecoder.DecodedResponse fetchDecoded) {
        final String roomId;
        final Map<String, String> cookies;
        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            roomId = mRoomId;
            cookies = new LinkedHashMap<>(mSessionCookies);
            closeActiveWsLocked();
        }

        long hbMs = fetchDecoded.heartbeatDurationMs > 0L ? fetchDecoded.heartbeatDurationMs : 10_000L;
        String wsUrl = TikTokWebSocketTransport.buildWebSocketUrl(
                fetchDecoded.pushServer,
                roomId,
                false,
                hbMs,
                true,
                0L,
                fetchDecoded.cursor,
                fetchDecoded.internalExt,
                fetchDecoded.routeParams
        );

        TikTokWebSocketTransport ws = new TikTokWebSocketTransport();
        synchronized (mLock) {
            if (isStaleGeneration(gen)) {
                ws.close();
                return;
            }
            mActiveWs = ws;
        }

        ws.connect(wsUrl, cookies, hbMs, new TikTokWebSocketTransport.Listener() {
            @Override
            public void onConnected(int httpStatus) {
                synchronized (mLock) {
                    if (isStaleGeneration(gen)) return;
                    mReconnectAttempt = 0;
                    mErrorCode = "";
                    setStateLocked(
                            "connected_euler",
                            "euler",
                            "Terhubung via EulerStream WebSocket ke @" + mUsername
                    );
                }
            }

            @Override
            public void onBinaryFrame(@NonNull byte[] payload) {
                if (isStaleGeneration(gen)) return;
                handleDecodedWebSocketFrame(gen, ws, payload);
            }

            @Override
            public void onTextFrame(@NonNull String text) {
            }

            @Override
            public void onHandshakeRejected(int httpStatus, @NonNull String reason) {
                if (isStaleGeneration(gen)) return;
                failSessionIfCurrent(gen, "error", "EULER_WS_REJECTED", reason);
            }

            @Override
            public void onClosed(int code, @NonNull String reason, boolean byRemote) {
                if (isStaleGeneration(gen) || !byRemote) return;
                scheduleReconnectOrFail(
                        gen,
                        "EULER_WS_CLOSED",
                        "WebSocket EulerStream ditutup (kode " + code + ").",
                        true
                );
            }

            @Override
            public void onError(@NonNull String reason) {
                if (isStaleGeneration(gen)) return;
                scheduleReconnectOrFail(gen, "EULER_WS_ERROR", reason, true);
            }
        });
    }

    private void handleDecodedWebSocketFrame(
            long gen,
            @NonNull TikTokWebSocketTransport ws,
            @NonNull byte[] payload
    ) {
        TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(payload);
        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            if (!decoded.cursor.isEmpty()) mCursor = decoded.cursor;
            if (!decoded.internalExt.isEmpty()) mInternalExt = decoded.internalExt;
        }

        if (decoded.needAck && decoded.logId > 0L) {
            ws.sendBinary(TikTokWebcastDecoder.encodePushFrameAck(decoded.logId, decoded.internalExt));
        }

        emitDecodedEvents(gen, decoded);
    }

    /** @return true jika menerima WebcastControlMessage yang menandakan LIVE berakhir */
    private boolean emitDecodedEvents(long gen, @NonNull TikTokWebcastDecoder.DecodedResponse decoded) {
        Listener listener = mListener;
        boolean ended = false;
        boolean stateStatsUpdated = false;

        for (JSONObject evt : decoded.events) {
            if (isStaleGeneration(gen)) return true;

            String method = evt.optString("method", "");
            if ("WebcastRoomUserSeqMessage".equals(method) && evt.has("viewerCount")) {
                long vc = evt.optLong("viewerCount", 0L);
                synchronized (mLock) {
                    if (vc != mViewerCount) {
                        mViewerCount = vc;
                        stateStatsUpdated = true;
                    }
                }
            } else if ("WebcastLikeMessage".equals(method) && evt.has("totalLikeCount")) {
                long totalLikes = evt.optLong("totalLikeCount", 0L);
                synchronized (mLock) {
                    if (totalLikes > mTotalLikeCount) {
                        mTotalLikeCount = totalLikes;
                    }
                }
            } else if ("WebcastControlMessage".equals(method)) {
                long action = evt.optLong("controlAction", 0L);
                if (action == 3L) {
                    ended = true;
                }
            }

            if (listener != null) {
                try {
                    listener.onEventDecoded(evt);
                } catch (Exception e) {
                    Log.w(TAG, "Gagal meneruskan event Webcast ke listener: " + e.getMessage());
                }
            }
        }

        if (ended) {
            synchronized (mLock) {
                if (!isStaleGeneration(gen)) {
                    mSessionGeneration.incrementAndGet();
                    cancelPendingTaskLocked();
                    closeActiveWsLocked();
                    mSessionCookies.clear();
                    mErrorCode = "LIVE_ENDED";
                    setStateLocked(
                            "waiting_for_live",
                            "none",
                            "Siaran LIVE @" + mUsername + " telah berakhir."
                    );
                }
            }
            return true;
        }

        if (stateStatsUpdated) {
            emitCurrentState();
        }
        return false;
    }

    private void scheduleReconnectOrFail(
            long gen,
            @NonNull String errorCode,
            @NonNull String reason,
            boolean useEuler
    ) {
        final int attemptIdx;
        final long delayMs;
        final String targetUsername;
        final boolean hasRoomId;

        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            closeActiveWsLocked();
            cancelPendingTaskLocked();

            if (mReconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
                mSessionGeneration.incrementAndGet();
                mSessionCookies.clear();
                mErrorCode = errorCode;
                setStateLocked("error", "none", reason);
                return;
            }

            attemptIdx = mReconnectAttempt;
            mReconnectAttempt++;
            delayMs = RECONNECT_DELAYS_MS[Math.min(attemptIdx, RECONNECT_DELAYS_MS.length - 1)];
            targetUsername = mUsername;
            hasRoomId = !mRoomId.isEmpty();
            mErrorCode = errorCode;
            setStateLocked(
                    "reconnecting",
                    mTransportMode,
                    "Menyambung ulang (" + (attemptIdx + 1) + "/" + MAX_RECONNECT_ATTEMPTS + "): " + reason
            );
        }

        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            mPendingTask = mScheduler.schedule(() -> {
                if (isStaleGeneration(gen)) return;
                if (!hasRoomId) {
                    mWorker.execute(() -> runRoomResolution(gen, targetUsername));
                } else if (useEuler) {
                    startEulerFallback(gen, "Menyambung ulang via EulerStream...");
                } else {
                    startDirectWebSocket(gen);
                }
            }, delayMs, TimeUnit.MILLISECONDS);
        }
    }

    private void failSessionIfCurrent(
            long gen,
            @NonNull String state,
            @NonNull String errorCode,
            @NonNull String message
    ) {
        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            mSessionGeneration.incrementAndGet();
            cancelPendingTaskLocked();
            closeActiveWsLocked();
            mSessionCookies.clear();
            mErrorCode = errorCode;
            setStateLocked(state, "none", message);
        }
    }

    private void setStateLocked(
            @NonNull String nextState,
            @NonNull String transportMode,
            @NonNull String message
    ) {
        mState = nextState;
        mTransportMode = transportMode;
        mMessage = message;
        updateCompanionNotification(nextState, mUsername);
        emitCurrentState();
    }

    private void updateCompanionNotification(@NonNull String state, @NonNull String username) {
        if (!CompanionService.isRunning()) return;
        String detail;
        switch (state) {
            case "connected_direct":
                detail = "TikTok LIVE aktif (@" + username + " \u00b7 Direct)";
                break;
            case "connected_euler":
                detail = "TikTok LIVE aktif (@" + username + " \u00b7 EulerStream)";
                break;
            case "resolving_room":
            case "connecting_direct":
            case "connecting_euler":
            case "reconnecting":
                detail = "Menghubungkan TikTok LIVE (@" + username + ")...";
                break;
            case "waiting_for_live":
                detail = "Menunggu @" + username + " LIVE";
                break;
            case "error":
                detail = "Koneksi TikTok LIVE terhenti";
                break;
            default:
                detail = "Floating HUD aktif";
                break;
        }
        CompanionService.updateStatusDetail(detail);
    }

    private void emitCurrentState() {
        Listener listener = mListener;
        if (listener != null) {
            try {
                listener.onStateChanged(getStateSnapshot());
            } catch (Exception e) {
                Log.w(TAG, "Gagal mengirim perubahan status TikTok: " + e.getMessage());
            }
        }
    }

    private void cancelPendingTaskLocked() {
        if (mPendingTask != null) {
            mPendingTask.cancel(false);
            mPendingTask = null;
        }
    }

    private void closeActiveWsLocked() {
        if (mActiveWs != null) {
            mActiveWs.close();
            mActiveWs = null;
        }
    }
}
