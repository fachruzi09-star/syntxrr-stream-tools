package com.syntxrr.streamtools;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

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
    private static final int MAX_RECONNECT_ATTEMPTS = 10;
    private static final int MAX_DETERMINISTIC_DIRECT_RETRIES = 2;
    private static final long DETERMINISTIC_RETRY_DELAY_MS = 3_000L;
    private static final long[] RECONNECT_DELAYS_MS = {
            1_000L, 2_000L, 4_000L, 8_000L, 16_000L,
            30_000L, 30_000L, 30_000L, 30_000L, 30_000L
    };
    private static final long WAITING_LIVE_BASE_INTERVAL_MS = 15_000L;
    private static final long WAITING_LIVE_MAX_INTERVAL_MS = 60_000L;
    private static final long ROOM_ENTER_ACK_TIMEOUT_MS = 18_000L;

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
    private String mConnectionMethod = "direct"; // direct | euler
    @NonNull
    private String mRoomStatus = "unknown"; // unknown | not_live | live | not_found | unreadable
    @NonNull
    private String mUsername = "";
    @NonNull
    private String mRoomId = "";
    @NonNull
    private String mDeviceId = "";
    @NonNull
    private String mResolvedPushServerUrl = "";
    private boolean mLastImFetchOk = false;
    private long mDirectHeartbeatMs = 10_000L;
    private long mLastImFetchRttMs = 0L;
    @NonNull
    private Map<String, String> mRouteParams = new LinkedHashMap<>();
    @NonNull
    private String mEulerApiKey = "";
    @NonNull
    private String mEulerJwtKey = "";
    private boolean mAllowEulerFallback = true;
    private boolean mEulerFallbackUnavailable = false;
    private boolean mUseAlternateDirectWsHost = false;
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
    private int mDeterministicRejectCount = 0;
    private int mWaitingLiveAttempt = 0;
    private long mTransportConnectedAtMs = 0L;

    // Mode A connection diagnostics (in-memory per session, never persisted or logged with secrets)
    private static final Pattern SENSITIVE_QUERY_PARAM_PATTERN = Pattern.compile(
            "(?i)(apiKey|jwtKey|token|access_token|refresh_token|ttwid|sessionid|cookie|authorization)=([^&\\s]+)"
    );
    private static final Pattern JWT_LIKE_PATTERN = Pattern.compile(
            "eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*"
    );

    @NonNull
    private String mDiagStage = "idle";
    @Nullable
    private Integer mDiagRoomLookupHttpStatus = null;
    private boolean mDiagHasTtwidCookie = false;
    @Nullable
    private Integer mDiagCookieWarmUpHomepageHttpStatus = null;
    @Nullable
    private Boolean mDiagCookieWarmUpHomepageHasSetCookie = null;
    @Nullable
    private Integer mDiagCookieWarmUpHomepageCookieCount = null;
    @Nullable
    private Boolean mDiagCookieWarmUpHomepageHasTtwid = null;
    @Nullable
    private Boolean mDiagCookieWarmUpLivePageAttempted = null;
    @Nullable
    private Integer mDiagCookieWarmUpLivePageHttpStatus = null;
    @Nullable
    private Boolean mDiagCookieWarmUpLivePageHasSetCookie = null;
    @Nullable
    private Integer mDiagCookieWarmUpLivePageCookieCount = null;
    @Nullable
    private Boolean mDiagCookieWarmUpLivePageHasTtwid = null;
    @NonNull
    private String mDiagCookieWarmUpResult = "";
    @Nullable
    private Integer mDiagWebsocketHttpStatus = null;
    @NonNull
    private String mDiagWebsocketAttemptHost = "";
    @NonNull
    private String mDiagWebsocketContentType = "";
    @NonNull
    private String mDiagWebsocketRedirectLocation = "";
    @NonNull
    private String mDiagWebsocketServerHeader = "";
    @NonNull
    private String mDiagWebsocketUpgradeHeader = "";
    @NonNull
    private String mDiagWebsocketConnectionHeader = "";
    @Nullable
    private Boolean mDiagWebsocketHasAcceptHeader = null;
    @Nullable
    private Integer mDiagWebsocketBodyBytes = null;
    @NonNull
    private String mDiagWebsocketBodyKind = "";
    @NonNull
    private String mDiagWebsocketResponseClass = "";
    @NonNull
    private String mDiagWebsocketRejectionReason = "";
    private boolean mDiagRoomEntryFrameSent = false;
    private boolean mDiagRoomEntryConfirmed = false;
    private boolean mDiagEventReceivedBeforeRoomAck = false;
    @NonNull
    private String mDiagLastPayloadType = "";
    @Nullable
    private Long mDiagLastFrameReceivedAt = null;
    private int mDiagDecodedEventCount = 0;
    @NonNull
    private String mDiagLastDecodedEventMethod = "";
    @Nullable
    private Long mDiagLastEventReceivedAt = null;
    @NonNull
    private String mDiagLastTransportError = "";

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
                obj.put("connectionMethod", mConnectionMethod);
                obj.put("roomStatus", mRoomStatus);
                obj.put("username", mUsername);
                obj.put("roomId", mRoomId);
                obj.put("viewerCount", mViewerCount);
                obj.put("totalLikeCount", mTotalLikeCount);
                obj.put("message", mMessage);
                obj.put("errorCode", mErrorCode);
                obj.put("timestamp", System.currentTimeMillis());
                obj.put("diagnosticStage", mDiagStage);
                obj.put("roomLookupHttpStatus",
                        mDiagRoomLookupHttpStatus != null ? mDiagRoomLookupHttpStatus : JSONObject.NULL);
                obj.put("hasTtwidCookie", mDiagHasTtwidCookie);
                obj.put("cookieWarmUpHomepageHttpStatus",
                        mDiagCookieWarmUpHomepageHttpStatus != null
                                ? mDiagCookieWarmUpHomepageHttpStatus
                                : JSONObject.NULL);
                obj.put("cookieWarmUpHomepageHasSetCookie",
                        mDiagCookieWarmUpHomepageHasSetCookie != null
                                ? mDiagCookieWarmUpHomepageHasSetCookie
                                : JSONObject.NULL);
                obj.put("cookieWarmUpHomepageCookieCount",
                        mDiagCookieWarmUpHomepageCookieCount != null
                                ? mDiagCookieWarmUpHomepageCookieCount
                                : JSONObject.NULL);
                obj.put("cookieWarmUpHomepageHasTtwid",
                        mDiagCookieWarmUpHomepageHasTtwid != null
                                ? mDiagCookieWarmUpHomepageHasTtwid
                                : JSONObject.NULL);
                obj.put("cookieWarmUpLivePageAttempted",
                        mDiagCookieWarmUpLivePageAttempted != null
                                ? mDiagCookieWarmUpLivePageAttempted
                                : JSONObject.NULL);
                obj.put("cookieWarmUpLivePageHttpStatus",
                        mDiagCookieWarmUpLivePageHttpStatus != null
                                ? mDiagCookieWarmUpLivePageHttpStatus
                                : JSONObject.NULL);
                obj.put("cookieWarmUpLivePageHasSetCookie",
                        mDiagCookieWarmUpLivePageHasSetCookie != null
                                ? mDiagCookieWarmUpLivePageHasSetCookie
                                : JSONObject.NULL);
                obj.put("cookieWarmUpLivePageCookieCount",
                        mDiagCookieWarmUpLivePageCookieCount != null
                                ? mDiagCookieWarmUpLivePageCookieCount
                                : JSONObject.NULL);
                obj.put("cookieWarmUpLivePageHasTtwid",
                        mDiagCookieWarmUpLivePageHasTtwid != null
                                ? mDiagCookieWarmUpLivePageHasTtwid
                                : JSONObject.NULL);
                obj.put("cookieWarmUpResult",
                        !mDiagCookieWarmUpResult.isEmpty()
                                ? mDiagCookieWarmUpResult
                                : JSONObject.NULL);
                obj.put("websocketHttpStatus",
                        mDiagWebsocketHttpStatus != null ? mDiagWebsocketHttpStatus : JSONObject.NULL);
                obj.put("websocketAttemptHost", mDiagWebsocketAttemptHost);
                obj.put("websocketContentType", mDiagWebsocketContentType);
                obj.put("websocketRedirectLocation", mDiagWebsocketRedirectLocation);
                obj.put("websocketServerHeader", mDiagWebsocketServerHeader);
                obj.put("websocketUpgradeHeader", mDiagWebsocketUpgradeHeader);
                obj.put("websocketConnectionHeader", mDiagWebsocketConnectionHeader);
                obj.put("websocketHasAcceptHeader",
                        mDiagWebsocketHasAcceptHeader != null ? mDiagWebsocketHasAcceptHeader : JSONObject.NULL);
                obj.put("websocketBodyBytes",
                        mDiagWebsocketBodyBytes != null ? mDiagWebsocketBodyBytes : JSONObject.NULL);
                obj.put("websocketBodyKind", mDiagWebsocketBodyKind);
                obj.put("websocketResponseClass", mDiagWebsocketResponseClass);
                obj.put("websocketRejectionReason", mDiagWebsocketRejectionReason);
                obj.put("roomEntryFrameSent", mDiagRoomEntryFrameSent);
                obj.put("roomEntryConfirmed", mDiagRoomEntryConfirmed);
                obj.put("eventReceivedBeforeRoomAck", mDiagEventReceivedBeforeRoomAck);
                obj.put("lastPayloadType", mDiagLastPayloadType);
                obj.put("lastFrameReceivedAt",
                        mDiagLastFrameReceivedAt != null ? mDiagLastFrameReceivedAt : JSONObject.NULL);
                obj.put("decodedEventCount", mDiagDecodedEventCount);
                obj.put("lastDecodedEventMethod", mDiagLastDecodedEventMethod);
                obj.put("lastEventReceivedAt",
                        mDiagLastEventReceivedAt != null ? mDiagLastEventReceivedAt : JSONObject.NULL);
                obj.put("lastTransportError", mDiagLastTransportError);
            } catch (Exception ignored) {
            }
            return obj;
        }
    }

    public boolean isSessionActive() {
        synchronized (mLock) {
            if ("waiting_for_live".equals(mState)) {
                return mPendingTask != null && !mPendingTask.isCancelled();
            }
            return !"disconnected".equals(mState) && !"error".equals(mState);
        }
    }

    static boolean hasEulerCredential(@Nullable String apiKey, @Nullable String jwtKey) {
        return !normalizeSecret(apiKey).isEmpty() || !normalizeSecret(jwtKey).isEmpty();
    }

    static boolean canAttemptEulerFallback(
            boolean allowEulerFallback,
            boolean eulerFallbackUnavailable,
            @Nullable String apiKey,
            @Nullable String jwtKey
    ) {
        return allowEulerFallback && !eulerFallbackUnavailable && hasEulerCredential(apiKey, jwtKey);
    }

    static boolean hasSameSessionConfiguration(
            boolean sessionActive,
            @NonNull String currentState,
            @NonNull String currentUsername,
            @NonNull String suppliedUsername,
            @NonNull String currentMethod,
            @NonNull String suppliedMethod,
            boolean currentAllowFallback,
            boolean suppliedAllowFallback,
            @Nullable String currentApiKey,
            @Nullable String suppliedApiKey,
            @Nullable String currentJwtKey,
            @Nullable String suppliedJwtKey
    ) {
        return sessionActive
                && !"waiting_for_live".equals(currentState)
                && suppliedUsername.equalsIgnoreCase(currentUsername)
                && suppliedMethod.equals(currentMethod)
                && suppliedAllowFallback == currentAllowFallback
                && normalizeSecret(suppliedApiKey).equals(normalizeSecret(currentApiKey))
                && normalizeSecret(suppliedJwtKey).equals(normalizeSecret(currentJwtKey));
    }

    @Nullable
    static String validateEulerCredentialErrorCode(
            @NonNull String method,
            @Nullable String apiKey,
            @Nullable String jwtKey
    ) {
        String cleanApiKey = normalizeSecret(apiKey);
        String cleanJwtKey = normalizeSecret(jwtKey);
        if (!cleanApiKey.isEmpty() && !cleanJwtKey.isEmpty()) {
            return "EULER_CONFLICTING_CREDENTIALS";
        }
        if ("euler".equals(method) && cleanApiKey.isEmpty() && cleanJwtKey.isEmpty()) {
            return "EULER_API_KEY_REQUIRED";
        }
        return null;
    }

    @NonNull
    private static String normalizeSecret(@Nullable String value) {
        return value != null ? value.trim() : "";
    }

    static boolean hasTtwidCookie(@Nullable Map<String, String> cookies) {
        if (cookies == null || cookies.isEmpty()) return false;
        for (Map.Entry<String, String> entry : cookies.entrySet()) {
            if (entry.getKey() != null && "ttwid".equalsIgnoreCase(entry.getKey().trim())) {
                String value = entry.getValue();
                return value != null && !value.trim().isEmpty();
            }
        }
        return false;
    }

    static boolean isDeterministicDirectHandshakeRejection(
            int httpStatus,
            @Nullable String responseClass
    ) {
        if (httpStatus == 401 || httpStatus == 403) {
            return true;
        }
        if ("redirect".equals(responseClass)) {
            return true;
        }
        if (httpStatus >= 200 && httpStatus < 300) {
            return "upgrade_missing".equals(responseClass)
                    || "edge_html".equals(responseClass)
                    || "api_json".equals(responseClass);
        }
        return false;
    }

    @NonNull
    static String sanitizeDirectPushServerUrl(@Nullable String rawPushServer) {
        if (rawPushServer == null) return "";
        String cleaned = rawPushServer.trim();
        if (cleaned.isEmpty()) return "";
        try {
            java.net.URI uri = java.net.URI.create(cleaned);
            String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.US) : "";
            if (!"wss".equals(scheme) && !"https".equals(scheme)) {
                return "";
            }
            if (uri.getRawUserInfo() != null && !uri.getRawUserInfo().isEmpty()) {
                return "";
            }
            String host = uri.getHost() != null ? uri.getHost().trim().toLowerCase(Locale.US) : "";
            if (host.isEmpty()) return "";
            boolean allowedHost = host.endsWith(".tiktok.com")
                    || host.endsWith(".tiktokv.com")
                    || "tiktok.com".equals(host)
                    || "tiktokv.com".equals(host);
            if (!allowedHost) {
                return "";
            }
            int port = uri.getPort();
            String path = uri.getRawPath();
            String safePath = (path != null && !path.isEmpty())
                    ? path
                    : "/webcast/im/ws_proxy/ws_reuse_supplement/";
            StringBuilder out = new StringBuilder("wss://").append(host);
            if (port > 0 && port != 443) {
                out.append(':').append(port);
            }
            out.append(safePath);
            return out.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    @NonNull
    static String sanitizeDiagnosticReason(
            @Nullable String raw,
            @Nullable String apiKey,
            @Nullable String jwtKey
    ) {
        if (raw == null) return "";
        String cleaned = raw.trim();
        if (cleaned.isEmpty()) return "";
        String cleanApiKey = normalizeSecret(apiKey);
        if (!cleanApiKey.isEmpty()) {
            cleaned = cleaned.replace(cleanApiKey, "[REDACTED]");
        }
        String cleanJwtKey = normalizeSecret(jwtKey);
        if (!cleanJwtKey.isEmpty()) {
            cleaned = cleaned.replace(cleanJwtKey, "[REDACTED]");
        }
        cleaned = SENSITIVE_QUERY_PARAM_PATTERN.matcher(cleaned).replaceAll("$1=[REDACTED]");
        cleaned = JWT_LIKE_PATTERN.matcher(cleaned).replaceAll("[REDACTED]");
        if (cleaned.length() > 220) {
            cleaned = cleaned.substring(0, 217) + "...";
        }
        return cleaned;
    }

    private void resetDiagnosticsLocked(@NonNull String initialStage) {
        mDiagStage = initialStage;
        mDiagRoomLookupHttpStatus = null;
        mDiagHasTtwidCookie = false;
        resetCookieWarmUpDiagnosticsLocked();
        resetWebSocketAttemptDiagnosticsLocked();
        mDiagLastPayloadType = "";
        mDiagLastFrameReceivedAt = null;
        mDiagDecodedEventCount = 0;
        mDiagLastDecodedEventMethod = "";
        mDiagLastEventReceivedAt = null;
        mDiagLastTransportError = "";
    }

    private void resetCookieWarmUpDiagnosticsLocked() {
        mDiagCookieWarmUpHomepageHttpStatus = null;
        mDiagCookieWarmUpHomepageHasSetCookie = null;
        mDiagCookieWarmUpHomepageCookieCount = null;
        mDiagCookieWarmUpHomepageHasTtwid = null;
        mDiagCookieWarmUpLivePageAttempted = null;
        mDiagCookieWarmUpLivePageHttpStatus = null;
        mDiagCookieWarmUpLivePageHasSetCookie = null;
        mDiagCookieWarmUpLivePageCookieCount = null;
        mDiagCookieWarmUpLivePageHasTtwid = null;
        mDiagCookieWarmUpResult = "";
    }

    private void applyCookieWarmUpDiagnosticsLocked(
            @Nullable TikTokRoomResolver.CookieWarmUpDiagnostics warmUpDiag
    ) {
        if (warmUpDiag == null) {
            resetCookieWarmUpDiagnosticsLocked();
            return;
        }
        mDiagCookieWarmUpHomepageHttpStatus = warmUpDiag.homepageHttpStatus;
        mDiagCookieWarmUpHomepageHasSetCookie = warmUpDiag.homepageHasSetCookie;
        mDiagCookieWarmUpHomepageCookieCount = warmUpDiag.homepageCookieCount;
        mDiagCookieWarmUpHomepageHasTtwid = warmUpDiag.homepageHasTtwid;
        mDiagCookieWarmUpLivePageAttempted = warmUpDiag.livePageAttempted;
        mDiagCookieWarmUpLivePageHttpStatus = warmUpDiag.livePageHttpStatus;
        mDiagCookieWarmUpLivePageHasSetCookie = warmUpDiag.livePageHasSetCookie;
        mDiagCookieWarmUpLivePageCookieCount = warmUpDiag.livePageCookieCount;
        mDiagCookieWarmUpLivePageHasTtwid = warmUpDiag.livePageHasTtwid;
        mDiagCookieWarmUpResult = warmUpDiag.result;
    }

    private void resetWebSocketAttemptDiagnosticsLocked() {
        mDiagWebsocketHttpStatus = null;
        mDiagWebsocketAttemptHost = "";
        mDiagWebsocketContentType = "";
        mDiagWebsocketRedirectLocation = "";
        mDiagWebsocketServerHeader = "";
        mDiagWebsocketUpgradeHeader = "";
        mDiagWebsocketConnectionHeader = "";
        mDiagWebsocketHasAcceptHeader = null;
        mDiagWebsocketBodyBytes = null;
        mDiagWebsocketBodyKind = "";
        mDiagWebsocketResponseClass = "";
        mDiagWebsocketRejectionReason = "";
        mDiagRoomEntryFrameSent = false;
        mDiagRoomEntryConfirmed = false;
        mDiagEventReceivedBeforeRoomAck = false;
    }

    @NonNull
    private static String extractHostFromWsUrl(@Nullable String wsUrl) {
        if (wsUrl == null || wsUrl.trim().isEmpty()) return "";
        try {
            String host = java.net.URI.create(wsUrl.trim()).getHost();
            return host != null ? host.trim().toLowerCase(Locale.US) : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    private void applyHandshakeDiagnosticsLocked(
            @NonNull TikTokWebSocketTransport.HandshakeDiagnostics diag
    ) {
        mDiagWebsocketHttpStatus = diag.httpStatus;
        if (!diag.attemptedHost.isEmpty()) {
            mDiagWebsocketAttemptHost = diag.attemptedHost;
        }
        mDiagWebsocketContentType = diag.contentType;
        mDiagWebsocketRedirectLocation = diag.redirectLocation;
        mDiagWebsocketServerHeader = diag.serverHeader;
        mDiagWebsocketUpgradeHeader = diag.upgradeHeader;
        mDiagWebsocketConnectionHeader = diag.connectionHeader;
        mDiagWebsocketHasAcceptHeader = diag.hasSecWebSocketAccept;
        mDiagWebsocketBodyBytes = diag.bodyBytes;
        mDiagWebsocketBodyKind = diag.bodyKind;
        mDiagWebsocketResponseClass = diag.responseClass;
        mDiagWebsocketRejectionReason = sanitizeDiagnosticReason(
                diag.rejectionReason, mEulerApiKey, mEulerJwtKey
        );
        mDiagLastTransportError = mDiagWebsocketRejectionReason;
    }

    public void connect(
            @Nullable String rawUsername,
            @Nullable String eulerApiKey,
            boolean allowEulerFallback
    ) {
        connect(rawUsername, eulerApiKey, null, allowEulerFallback, "direct");
    }

    public void connect(
            @Nullable String rawUsername,
            @Nullable String eulerApiKey,
            boolean allowEulerFallback,
            @Nullable String rawConnectionMethod
    ) {
        connect(rawUsername, eulerApiKey, null, allowEulerFallback, rawConnectionMethod);
    }

    public void connect(
            @Nullable String rawUsername,
            @Nullable String eulerApiKey,
            @Nullable String eulerJwtKey,
            boolean allowEulerFallback,
            @Nullable String rawConnectionMethod
    ) {
        String normalized = TikTokRoomResolver.normalizeUsername(rawUsername);
        String method = "euler".equalsIgnoreCase(rawConnectionMethod != null ? rawConnectionMethod.trim() : "")
                ? "euler"
                : "direct";
        String suppliedApiKey = normalizeSecret(eulerApiKey);
        String suppliedJwtKey = normalizeSecret(eulerJwtKey);
        String credentialError = validateEulerCredentialErrorCode(method, suppliedApiKey, suppliedJwtKey);
        if (credentialError != null) {
            synchronized (mLock) {
                resetDiagnosticsLocked("error");
            }
            if ("EULER_CONFLICTING_CREDENTIALS".equals(credentialError)) {
                stopInternal("error", credentialError,
                        "EulerStream hanya menerima tepat satu kredensial: API key atau JWT, bukan keduanya.");
            } else {
                stopInternal("error", credentialError,
                        "EulerStream memerlukan API key atau JWT. Pilih koneksi Direct TikTok untuk koneksi tanpa kunci tambahan.");
            }
            return;
        }
        if (normalized.isEmpty()) {
            synchronized (mLock) {
                resetDiagnosticsLocked("error");
                mRoomStatus = "not_found";
            }
            stopInternal("error", "INVALID_INPUT", "Username TikTok tidak valid atau kosong.");
            return;
        }

        final long gen;
        synchronized (mLock) {
            boolean alreadySameSession = hasSameSessionConfiguration(
                    isSessionActive(),
                    mState,
                    mUsername,
                    normalized,
                    mConnectionMethod,
                    method,
                    mAllowEulerFallback,
                    allowEulerFallback,
                    mEulerApiKey,
                    suppliedApiKey,
                    mEulerJwtKey,
                    suppliedJwtKey
            );
            if (alreadySameSession) {
                emitCurrentState();
                return;
            }

            gen = mSessionGeneration.incrementAndGet();
            cancelPendingTaskLocked();
            closeActiveWsLocked();

            mUsername = normalized;
            mEulerApiKey = suppliedApiKey;
            mEulerJwtKey = suppliedJwtKey;
            mAllowEulerFallback = allowEulerFallback;
            mEulerFallbackUnavailable = false;
            mUseAlternateDirectWsHost = false;
            mConnectionMethod = method;
            mRoomStatus = "unknown";
            mRoomId = "";
            mDeviceId = "";
            mResolvedPushServerUrl = "";
            mLastImFetchOk = false;
            mDirectHeartbeatMs = 10_000L;
            mLastImFetchRttMs = 0L;
            mRouteParams.clear();
            mCursor = "";
            mInternalExt = "";
            mSessionCookies.clear();
            mViewerCount = 0L;
            mTotalLikeCount = 0L;
            mReconnectAttempt = 0;
            mDeterministicRejectCount = 0;
            mWaitingLiveAttempt = 0;
            mTransportConnectedAtMs = 0L;
            mTransportMode = "none";
            mErrorCode = "";
            resetDiagnosticsLocked("resolving_room");
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
            if ("error".equals(terminalState)) {
                mDiagStage = "error";
                mDiagLastTransportError = sanitizeDiagnosticReason(message, mEulerApiKey, mEulerJwtKey);
            } else {
                mDiagStage = "disconnected";
            }
            mEulerApiKey = "";
            mEulerJwtKey = "";
            mSessionCookies.clear();
            mDeviceId = "";
            mResolvedPushServerUrl = "";
            mLastImFetchOk = false;
            mDirectHeartbeatMs = 10_000L;
            mLastImFetchRttMs = 0L;
            mRouteParams.clear();
            mCursor = "";
            mInternalExt = "";
            mReconnectAttempt = 0;
            mDeterministicRejectCount = 0;
            mWaitingLiveAttempt = 0;
            mTransportConnectedAtMs = 0L;
            if ("disconnected".equals(terminalState)) {
                mRoomStatus = "unknown";
            }
            mErrorCode = errorCode;
            setStateLocked(terminalState, "none", message);
        }
    }

    private static final AtomicLong ENTER_UNIQUE_SEQUENCE =
            new AtomicLong(Math.max(1L, System.currentTimeMillis()));

    private static long nextEnterUniqueId() {
        long value = ENTER_UNIQUE_SEQUENCE.incrementAndGet() & Long.MAX_VALUE;
        return value > 0L ? value : 1L;
    }

    private boolean isStaleGeneration(long gen) {
        return mSessionGeneration.get() != gen;
    }

    private boolean isStaleTransport(long gen, @NonNull TikTokWebSocketTransport ws) {
        synchronized (mLock) {
            return mSessionGeneration.get() != gen || mActiveWs != ws;
        }
    }

    private void runRoomResolution(long gen, @NonNull String username) {
        if (isStaleGeneration(gen)) return;

        TikTokRoomResolver.Result res = TikTokRoomResolver.resolve(username);
        if (isStaleGeneration(gen)) return;

        switch (res.status) {
            case INVALID_INPUT:
                synchronized (mLock) {
                    if (isStaleGeneration(gen)) return;
                    mDiagRoomLookupHttpStatus = res.httpStatus;
                    mDiagHasTtwidCookie = hasTtwidCookie(res.sessionCookies);
                    applyCookieWarmUpDiagnosticsLocked(res.cookieWarmUpDiagnostics);
                    mRoomStatus = "not_found";
                }
                failSessionIfCurrent(gen, "error", "INVALID_INPUT", res.message);
                return;
            case ACCOUNT_NOT_FOUND:
                synchronized (mLock) {
                    if (isStaleGeneration(gen)) return;
                    mDiagRoomLookupHttpStatus = res.httpStatus;
                    mDiagHasTtwidCookie = hasTtwidCookie(res.sessionCookies);
                    applyCookieWarmUpDiagnosticsLocked(res.cookieWarmUpDiagnostics);
                    mRoomStatus = "not_found";
                }
                failSessionIfCurrent(gen, "error", "ACCOUNT_NOT_FOUND", res.message);
                return;
            case NOT_LIVE: {
                final boolean tryEuler;
                synchronized (mLock) {
                    if (isStaleGeneration(gen)) return;
                    mDiagRoomLookupHttpStatus = res.httpStatus;
                    mDiagHasTtwidCookie = hasTtwidCookie(res.sessionCookies);
                    applyCookieWarmUpDiagnosticsLocked(res.cookieWarmUpDiagnostics);
                    tryEuler = canAttemptEulerFallback(mAllowEulerFallback, mEulerFallbackUnavailable, mEulerApiKey, mEulerJwtKey)
                            || "euler".equals(mConnectionMethod);
                }
                // A stale/partial TikTok room lookup must not be the final authority.
                // When fallback is enabled (or Euler is the selected method), ask Euler by
                // uniqueId as an independent live-room check before declaring the session idle.
                if (tryEuler) {
                    startEulerFallback(gen, res.message + " Memverifikasi status LIVE melalui EulerStream...");
                } else {
                    scheduleWaitingForLiveCheck(gen, username, res.message);
                }
                return;
            }
            case ROOM_UNREADABLE: {
                final boolean tryEuler;
                synchronized (mLock) {
                    if (isStaleGeneration(gen)) return;
                    mDiagRoomLookupHttpStatus = res.httpStatus;
                    mDiagHasTtwidCookie = hasTtwidCookie(res.sessionCookies);
                    applyCookieWarmUpDiagnosticsLocked(res.cookieWarmUpDiagnostics);
                    mDiagLastTransportError = sanitizeDiagnosticReason(res.message, mEulerApiKey, mEulerJwtKey);
                    mRoomStatus = "unreadable";
                    mSessionCookies.putAll(res.sessionCookies);
                    tryEuler = canAttemptEulerFallback(mAllowEulerFallback, mEulerFallbackUnavailable, mEulerApiKey, mEulerJwtKey)
                            || "euler".equals(mConnectionMethod);
                }
                if (tryEuler) {
                    startEulerFallback(gen, "Lookup room langsung dibatasi (" + res.message + "); mencoba fallback EulerStream...");
                } else {
                    // A blocked public lookup is not proof that the creator is offline and
                    // must not terminate Direct mode or force the user to configure Euler.
                    scheduleUnreadableRoomRetry(gen, username, res.message);
                }
                return;
            }
            case NETWORK_ERROR: {
                final boolean isEuler;
                synchronized (mLock) {
                    if (isStaleGeneration(gen)) return;
                    mDiagRoomLookupHttpStatus = res.httpStatus;
                    mDiagHasTtwidCookie = hasTtwidCookie(res.sessionCookies);
                    applyCookieWarmUpDiagnosticsLocked(res.cookieWarmUpDiagnostics);
                    mDiagLastTransportError = sanitizeDiagnosticReason(res.message, mEulerApiKey, mEulerJwtKey);
                    isEuler = "euler".equals(mConnectionMethod);
                }
                scheduleReconnectOrFail(
                        gen,
                        "NETWORK_ERROR",
                        res.message,
                        isEuler
                );
                return;
            }
            case RESOLVED_LIVE:
                final String method;
                synchronized (mLock) {
                    if (isStaleGeneration(gen)) return;
                    boolean roomChanged = !res.roomId.equals(mRoomId);
                    mRoomId = res.roomId;
                    mRoomStatus = "live";
                    if (mDeviceId.isEmpty() && !res.deviceId.isEmpty()) {
                        mDeviceId = res.deviceId;
                    }
                    if (roomChanged) {
                        // A creator can start a new LIVE with a different room ID. Never
                        // carry a cursor/internalExt or retry budget from the previous room.
                        mSessionCookies = new LinkedHashMap<>(res.sessionCookies);
                        if (!res.deviceId.isEmpty()) {
                            mDeviceId = res.deviceId;
                        }
                        mCursor = "";
                        mInternalExt = "";
                        mRouteParams.clear();
                        mResolvedPushServerUrl = "";
                        mLastImFetchOk = false;
                        mDirectHeartbeatMs = 10_000L;
                        mLastImFetchRttMs = 0L;
                        mReconnectAttempt = 0;
                        mDeterministicRejectCount = 0;
                    } else {
                        mSessionCookies.putAll(res.sessionCookies);
                    }
                    mDiagRoomLookupHttpStatus = res.httpStatus;
                    mDiagHasTtwidCookie = hasTtwidCookie(mSessionCookies);
                    applyCookieWarmUpDiagnosticsLocked(res.cookieWarmUpDiagnostics);
                    mDiagLastTransportError = "";
                    mDiagStage = "room_resolved";
                    mWaitingLiveAttempt = 0;
                    method = mConnectionMethod;
                    emitCurrentState();
                }
                if ("euler".equals(method)) {
                    startEulerFallback(gen, "Menghubungkan via EulerStream ke @" + username + "...");
                } else {
                    startDirectWebSocket(gen);
                }
                return;
        }
    }

    private void scheduleWaitingForLiveCheck(long gen, @NonNull String username, @NonNull String baseMessage) {
        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            closeActiveWsLocked();
            cancelPendingTaskLocked();
            mRoomStatus = "not_live";
            mErrorCode = "NOT_LIVE";
            mDiagStage = "waiting_for_live";

            mWaitingLiveAttempt++;
            int currentAttempt = mWaitingLiveAttempt;
            // Keep monitoring until the user disconnects. Increase the interval gradually,
            // then cap it so a long wait never silently becomes a dead session.
            long multiplier = Math.min(4L, Math.max(0L, (currentAttempt - 1L) / 5L));
            long delayMs = Math.min(WAITING_LIVE_MAX_INTERVAL_MS,
                    WAITING_LIVE_BASE_INTERVAL_MS * (1L << multiplier));
            mPendingTask = mScheduler.schedule(() -> {
                if (isStaleGeneration(gen)) return;
                synchronized (mLock) {
                    if (isStaleGeneration(gen)) return;
                    mPendingTask = null;
                    mDiagStage = "resolving_room";
                    setStateLocked("resolving_room", "none", "Memeriksa kembali status LIVE @" + username + "...");
                }
                mWorker.execute(() -> runRoomResolution(gen, username));
            }, delayMs, TimeUnit.MILLISECONDS);

            setStateLocked(
                    "waiting_for_live",
                    "none",
                    baseMessage + " Tetap memantau LIVE (pemeriksaan ke-" + currentAttempt + ")."
            );
        }
    }

    /**
     * Retry a temporarily unreadable public room lookup without falsely marking the creator
     * offline or ending the user's Direct monitoring session.
     */
    private void scheduleUnreadableRoomRetry(
            long gen,
            @NonNull String username,
            @NonNull String baseMessage
    ) {
        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            closeActiveWsLocked();
            cancelPendingTaskLocked();
            mRoomStatus = "unreadable";
            mErrorCode = "ROOM_UNREADABLE";

            mWaitingLiveAttempt++;
            int attempt = mWaitingLiveAttempt;
            long multiplier = Math.min(4L, Math.max(0L, (attempt - 1L) / 3L));
            long delayMs = Math.min(WAITING_LIVE_MAX_INTERVAL_MS,
                    WAITING_LIVE_BASE_INTERVAL_MS * (1L << multiplier));

            mDiagStage = "reconnecting";
            mDiagLastTransportError = sanitizeDiagnosticReason(baseMessage, mEulerApiKey, mEulerJwtKey);
            setStateLocked(
                    "reconnecting",
                    "none",
                    baseMessage + " Status LIVE belum dapat diverifikasi; Direct akan memeriksa ulang otomatis (percobaan ke-" + attempt + ")."
            );
            mPendingTask = mScheduler.schedule(() -> {
                if (isStaleGeneration(gen)) return;
                synchronized (mLock) {
                    if (isStaleGeneration(gen)) return;
                    mPendingTask = null;
                    mDiagStage = "resolving_room";
                    setStateLocked(
                            "resolving_room",
                            "none",
                            "Mencoba kembali membaca status LIVE publik @" + username + "..."
                    );
                }
                mWorker.execute(() -> runRoomResolution(gen, username));
            }, delayMs, TimeUnit.MILLISECONDS);
        }
    }

    private void startDirectWebSocket(long gen) {
        final String roomId;
        final String deviceId;
        String cursor;
        String internalExt;
        Map<String, String> routeParams;
        String resolvedPushServerUrl;
        long heartbeatMs;
        long lastRttMs;
        final Map<String, String> cookies;
        final boolean allowEuler;
        final boolean useAlternateDirectHost;
        final String username;

        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            roomId = mRoomId;
            deviceId = mDeviceId;
            cursor = mCursor;
            internalExt = mInternalExt;
            routeParams = mRouteParams.isEmpty() ? null : new LinkedHashMap<>(mRouteParams);
            resolvedPushServerUrl = mResolvedPushServerUrl;
            heartbeatMs = mDirectHeartbeatMs > 0L ? mDirectHeartbeatMs : 10_000L;
            lastRttMs = mLastImFetchRttMs;
            cookies = new LinkedHashMap<>(mSessionCookies);
            allowEuler = mAllowEulerFallback;
            useAlternateDirectHost = mUseAlternateDirectWsHost;
            username = mUsername;
            closeActiveWsLocked();
            resetWebSocketAttemptDiagnosticsLocked();
            mDiagStage = "websocket_connecting";
            setStateLocked(
                    "connecting_direct",
                    "direct_ws",
                    "Membuka koneksi Webcast dan meminta masuk ke room LIVE @" + username + "..."
            );
        }

        if (!useAlternateDirectHost) {
            if (!hasTtwidCookie(cookies)) {
                TikTokRoomResolver.tryFetchTtwidFromCheckEndpoint(cookies, deviceId);
                if (isStaleGeneration(gen)) return;
                synchronized (mLock) {
                    if (isStaleGeneration(gen)) return;
                    mSessionCookies.putAll(cookies);
                    mDiagHasTtwidCookie = hasTtwidCookie(mSessionCookies);
                }
            }

            TikTokRoomResolver.InitialFetchResult fetchRes =
                    TikTokRoomResolver.fetchInitialWebcastResponse(roomId, deviceId, cookies);
            if (isStaleGeneration(gen)) return;

            synchronized (mLock) {
                if (isStaleGeneration(gen)) return;
                mSessionCookies.putAll(fetchRes.mergedCookies);
                cookies.clear();
                cookies.putAll(mSessionCookies);
                mDiagHasTtwidCookie = hasTtwidCookie(mSessionCookies);
                mLastImFetchOk = fetchRes.ok;
                if (fetchRes.rttMs > 0L) {
                    mLastImFetchRttMs = fetchRes.rttMs;
                    lastRttMs = fetchRes.rttMs;
                }
                if (fetchRes.ok && fetchRes.decoded != null) {
                    TikTokWebcastDecoder.DecodedResponse decodedFetch = fetchRes.decoded;
                    if (!decodedFetch.cursor.isEmpty()) {
                        mCursor = decodedFetch.cursor;
                        cursor = decodedFetch.cursor;
                    }
                    if (!decodedFetch.internalExt.isEmpty()) {
                        mInternalExt = decodedFetch.internalExt;
                        internalExt = decodedFetch.internalExt;
                    }
                    if (!decodedFetch.routeParams.isEmpty()) {
                        mRouteParams.putAll(decodedFetch.routeParams);
                        routeParams = new LinkedHashMap<>(mRouteParams);
                    }
                    if (decodedFetch.heartbeatDurationMs > 0L) {
                        mDirectHeartbeatMs = decodedFetch.heartbeatDurationMs;
                        heartbeatMs = decodedFetch.heartbeatDurationMs;
                    }
                    String safePush = sanitizeDirectPushServerUrl(decodedFetch.pushServer);
                    if (!safePush.isEmpty()) {
                        mResolvedPushServerUrl = safePush;
                        resolvedPushServerUrl = safePush;
                    }
                }
            }
        }

        String targetWsBase = useAlternateDirectHost
                ? TikTokWebSocketTransport.DIRECT_WS_FALLBACK_BASE_URL
                : (!resolvedPushServerUrl.isEmpty()
                        ? resolvedPushServerUrl
                        : TikTokWebSocketTransport.DIRECT_WS_BASE_URL);

        final String wsBaseForAttempt = targetWsBase;
        String wsUrl = TikTokWebSocketTransport.buildWebSocketUrl(
                wsBaseForAttempt,
                roomId,
                true,
                heartbeatMs,
                true,
                lastRttMs,
                cursor,
                internalExt,
                routeParams,
                deviceId
        );

        TikTokWebSocketTransport ws = new TikTokWebSocketTransport();
        synchronized (mLock) {
            if (isStaleGeneration(gen)) {
                ws.close();
                return;
            }
            mActiveWs = ws;
            mDiagWebsocketAttemptHost = extractHostFromWsUrl(wsUrl);
            emitCurrentState();
        }

        ws.connect(wsUrl, cookies, heartbeatMs,
                "https://www.tiktok.com", true, roomId,
                new TikTokWebSocketTransport.Listener() {
            @Override
            public void onConnected(int httpStatus) {
                if (isStaleTransport(gen, ws)) return;
                synchronized (mLock) {
                    if (isStaleTransport(gen, ws)) return;
                    // A successful HTTP 101 only proves that the socket opened.
                    // Never mark connected_direct on HTTP 101; record websocket_open first.
                    mDiagWebsocketHttpStatus = httpStatus;
                    mDiagWebsocketHasAcceptHeader = true;
                    mDiagWebsocketUpgradeHeader = "websocket";
                    mDiagWebsocketConnectionHeader = "Upgrade";
                    mDiagWebsocketResponseClass = "";
                    mDiagWebsocketRejectionReason = "";
                    mDiagStage = "websocket_open";
                    emitCurrentState();
                }
                final byte[] enterFrame;
                try {
                    enterFrame = TikTokWebcastDecoder.encodePushFrameEnterRoom(roomId, nextEnterUniqueId());
                } catch (Exception e) {
                    failSessionIfCurrent(gen, "error", "DIRECT_ROOM_ENTER_ENCODE_FAILED",
                            "Tidak dapat menyiapkan pesan masuk ke room TikTok: " + safeErrorMessage(e));
                    return;
                }
                if (!ws.sendBinary(enterFrame)) {
                    synchronized (mLock) {
                        if (!isStaleTransport(gen, ws)) {
                            mDiagRoomEntryFrameSent = false;
                        }
                    }
                    scheduleReconnectOrFail(gen, "DIRECT_ROOM_ENTER_SEND_FAILED",
                            "WebSocket terbuka tetapi pesan masuk ke room TikTok gagal dikirim.", false);
                    return;
                }
                synchronized (mLock) {
                    if (isStaleTransport(gen, ws)) return;
                    // Wait for im_enter_room_resp or real webcast data before reporting connected.
                    mTransportConnectedAtMs = 0L;
                    mErrorCode = "";
                    mDiagRoomEntryFrameSent = true;
                    mDiagStage = "room_entry_sent";
                    emitCurrentState();
                    mDiagStage = "waiting_room_ack";
                    setStateLocked(
                            "connecting_direct",
                            "direct_ws",
                            "WebSocket terbuka; meminta masuk ke room LIVE @" + mUsername + "..."
                    );
                    cancelPendingTaskLocked();
                    mPendingTask = mScheduler.schedule(() -> {
                        if (isStaleTransport(gen, ws)) return;
                        boolean stillWaiting;
                        synchronized (mLock) {
                            stillWaiting = !isStaleGeneration(gen)
                                    && mActiveWs == ws
                                    && "connecting_direct".equals(mState);
                        }
                        if (stillWaiting) {
                            scheduleReconnectOrFail(gen, "DIRECT_ROOM_ENTER_TIMEOUT",
                                    "TikTok tidak mengonfirmasi masuk ke room dalam batas waktu.", false);
                        }
                    }, ROOM_ENTER_ACK_TIMEOUT_MS, TimeUnit.MILLISECONDS);
                }
            }

            @Override
            public void onBinaryFrame(@NonNull byte[] payload) {
                if (isStaleTransport(gen, ws)) return;
                handleDecodedWebSocketFrame(gen, ws, payload);
            }

            @Override
            public void onTextFrame(@NonNull String text) {
                // Direct Webcast menggunakan binary Protobuf PushFrame; teks tidak dipalsukan sebagai event.
            }

            @Override
            public void onHandshakeRejected(int httpStatus, @NonNull String reason) {
                onHandshakeRejected(new TikTokWebSocketTransport.HandshakeDiagnostics(
                        httpStatus, extractHostFromWsUrl(wsUrl), "", "", "", "", "",
                        false, 0, "empty", "unknown", reason
                ));
            }

            @Override
            public void onHandshakeRejected(@NonNull TikTokWebSocketTransport.HandshakeDiagnostics diagnostics) {
                if (isStaleTransport(gen, ws)) return;
                int httpStatus = diagnostics.httpStatus;
                String reason = diagnostics.rejectionReason;
                Log.w(TAG, "Direct WebSocket handshake ditolak (http=" + httpStatus
                        + ", host=" + diagnostics.attemptedHost
                        + ", class=" + diagnostics.responseClass
                        + ", body=" + diagnostics.bodyKind + ")");
                final boolean fallbackAvailable;
                final boolean retryOnAlternateHost;
                final boolean hasTtwid;
                final boolean imFetchOk;
                synchronized (mLock) {
                    if (isStaleTransport(gen, ws)) return;
                    applyHandshakeDiagnosticsLocked(diagnostics);
                    fallbackAvailable = canAttemptEulerFallback(allowEuler, mEulerFallbackUnavailable, mEulerApiKey, mEulerJwtKey);
                    mTransportConnectedAtMs = 0L;
                    hasTtwid = mDiagHasTtwidCookie;
                    imFetchOk = mLastImFetchOk;
                    if (!mUseAlternateDirectWsHost
                            && !wsBaseForAttempt.equals(TikTokWebSocketTransport.DIRECT_WS_FALLBACK_BASE_URL)) {
                        mUseAlternateDirectWsHost = true;
                        retryOnAlternateHost = true;
                    } else {
                        mUseAlternateDirectWsHost = false;
                        retryOnAlternateHost = false;
                    }
                }
                if (retryOnAlternateHost) {
                    Log.w(TAG, "Host Webcast utama menolak koneksi; menjadwalkan host alternatif TikTok.");
                    mWorker.execute(() -> startDirectWebSocket(gen));
                } else if (fallbackAvailable) {
                    startEulerFallback(gen, "Koneksi langsung ditolak (" + reason + "); mencoba fallback EulerStream...");
                } else if (isDeterministicDirectHandshakeRejection(httpStatus, diagnostics.responseClass)) {
                    scheduleDeterministicDirectFailureOrRetry(gen, reason, hasTtwid, imFetchOk);
                } else {
                    scheduleReconnectOrFail(
                            gen,
                            "DIRECT_WS_REJECTED",
                            reason + " TikTok menolak handshake saat ini; Direct akan mencoba ulang otomatis.",
                            false
                    );
                }
            }

            @Override
            public void onClosed(int code, @NonNull String reason, boolean byRemote) {
                if (!byRemote || isStaleTransport(gen, ws)) return;
                String msg = "Koneksi WebSocket langsung ditutup server (kode " + code + ").";
                synchronized (mLock) {
                    if (!isStaleTransport(gen, ws) && mTransportConnectedAtMs > 0L
                            && System.currentTimeMillis() - mTransportConnectedAtMs >= 60_000L) {
                        mReconnectAttempt = 0;
                    }
                    mTransportConnectedAtMs = 0L;
                    mDiagLastTransportError = sanitizeDiagnosticReason(
                            reason.isEmpty() ? msg : msg + " " + reason,
                            mEulerApiKey,
                            mEulerJwtKey
                    );
                }
                scheduleReconnectOrFail(gen, "WS_CLOSED", msg, false);
            }

            @Override
            public void onError(@NonNull String reason) {
                if (isStaleTransport(gen, ws)) return;
                synchronized (mLock) {
                    if (!isStaleTransport(gen, ws) && mTransportConnectedAtMs > 0L
                            && System.currentTimeMillis() - mTransportConnectedAtMs >= 60_000L) {
                        mReconnectAttempt = 0;
                    }
                    mTransportConnectedAtMs = 0L;
                    mDiagLastTransportError = sanitizeDiagnosticReason(reason, mEulerApiKey, mEulerJwtKey);
                }
                scheduleReconnectOrFail(gen, "WS_ERROR", reason, false);
            }
        });
    }

    private void startEulerFallback(long gen, @NonNull String initialMessage) {
        final String username;
        final String apiKey;
        final String jwtKey;
        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            closeActiveWsLocked();
            cancelPendingTaskLocked();
            resetWebSocketAttemptDiagnosticsLocked();
            mDiagStage = "websocket_connecting";
            username = mUsername;
            apiKey = mEulerApiKey;
            jwtKey = mEulerJwtKey;
            if (!"reconnecting".equals(mState)) {
                mReconnectAttempt = 0;
            }
            setStateLocked("connecting_euler", "euler", initialMessage);
        }

        final String wsUrl;
        try {
            wsUrl = EulerStreamTransport.buildWebSocketUrl(username, apiKey, jwtKey);
        } catch (Exception e) {
            failSessionIfCurrent(gen, "error", "EULER_URL_ERROR", "Gagal menyiapkan koneksi EulerStream: " + safeErrorMessage(e));
            return;
        }

        TikTokWebSocketTransport ws = new TikTokWebSocketTransport();
        synchronized (mLock) {
            if (isStaleGeneration(gen)) {
                ws.close();
                return;
            }
            mActiveWs = ws;
            mDiagWebsocketAttemptHost = extractHostFromWsUrl(wsUrl);
            emitCurrentState();
        }

        // Euler sends JSON event envelopes by default. Do not send TikTok-specific
        // protobuf heartbeats to Euler; RFC 6455 Ping/Pong is handled by the transport.
        ws.connect(wsUrl, null, 0L, "https://www.eulerstream.com", false,
                new TikTokWebSocketTransport.Listener() {
            @Override
            public void onConnected(int httpStatus) {
                synchronized (mLock) {
                    if (isStaleTransport(gen, ws)) return;
                    mTransportConnectedAtMs = System.currentTimeMillis();
                    mErrorCode = "";
                    mRoomStatus = "live";
                    mDiagWebsocketHttpStatus = httpStatus;
                    mDiagWebsocketHasAcceptHeader = true;
                    mDiagWebsocketUpgradeHeader = "websocket";
                    mDiagWebsocketConnectionHeader = "Upgrade";
                    mDiagWebsocketResponseClass = "";
                    mDiagWebsocketRejectionReason = "";
                    mDiagLastTransportError = "";
                    mDiagStage = "connected";
                    setStateLocked("connected_euler", "euler", "Terhubung via EulerStream ke @" + mUsername);
                }
            }

            @Override
            public void onBinaryFrame(@NonNull byte[] payload) {
                if (isStaleTransport(gen, ws)) return;
                // Optional rawMessages mode compatibility; default Euler mode is JSON.
                handleDecodedWebSocketFrame(gen, ws, payload);
            }

            @Override
            public void onTextFrame(@NonNull String text) {
                if (isStaleTransport(gen, ws)) return;
                synchronized (mLock) {
                    if (isStaleTransport(gen, ws)) return;
                    mDiagLastPayloadType = "euler_json";
                    mDiagLastFrameReceivedAt = System.currentTimeMillis();
                }
                handleEulerJsonFrame(gen, text);
            }

            @Override
            public void onHandshakeRejected(int httpStatus, @NonNull String reason) {
                onHandshakeRejected(new TikTokWebSocketTransport.HandshakeDiagnostics(
                        httpStatus, extractHostFromWsUrl(wsUrl), "", "", "", "", "",
                        false, 0, "empty", "unknown", reason
                ));
            }

            @Override
            public void onHandshakeRejected(@NonNull TikTokWebSocketTransport.HandshakeDiagnostics diagnostics) {
                if (isStaleTransport(gen, ws)) return;
                int httpStatus = diagnostics.httpStatus;
                String reason = diagnostics.rejectionReason;
                synchronized (mLock) {
                    if (isStaleTransport(gen, ws)) return;
                    applyHandshakeDiagnosticsLocked(diagnostics);
                }
                if (httpStatus == 401 || httpStatus == 403) {
                    handleEulerFallbackUnavailable(gen, reason);
                } else if (httpStatus == 404 || httpStatus == 410) {
                    scheduleWaitingForLiveCheck(gen, mUsername, "EulerStream belum menemukan siaran LIVE aktif.");
                } else if (httpStatus == 429 || httpStatus >= 500 || httpStatus == 0) {
                    scheduleReconnectOrFail(gen, "EULER_WS_REJECTED", reason, true);
                } else {
                    failSessionIfCurrent(gen, "error", "EULER_WS_REJECTED", reason);
                }
            }

            @Override
            public void onClosed(int code, @NonNull String reason, boolean byRemote) {
                if (!byRemote || isStaleTransport(gen, ws)) return;
                if (code == 4404) {
                    scheduleWaitingForLiveCheck(gen, mUsername, "EulerStream melaporkan akun sedang tidak LIVE.");
                    return;
                }
                if (code == 4401 || code == 4403) {
                    handleEulerFallbackUnavailable(gen,
                            "EulerStream menolak autentikasi/izin (kode " + code + ").");
                    return;
                }
                synchronized (mLock) {
                    if (!isStaleTransport(gen, ws) && mTransportConnectedAtMs > 0L
                            && System.currentTimeMillis() - mTransportConnectedAtMs >= 60_000L) {
                        mReconnectAttempt = 0;
                    }
                    mTransportConnectedAtMs = 0L;
                    mDiagLastTransportError = sanitizeDiagnosticReason(
                            "WebSocket EulerStream ditutup (kode " + code + "). " + reason,
                            mEulerApiKey,
                            mEulerJwtKey
                    );
                }
                scheduleReconnectOrFail(gen, "EULER_WS_CLOSED",
                        "WebSocket EulerStream ditutup (kode " + code + "). " + reason, true);
            }

            @Override
            public void onError(@NonNull String reason) {
                if (isStaleTransport(gen, ws)) return;
                synchronized (mLock) {
                    if (!isStaleTransport(gen, ws) && mTransportConnectedAtMs > 0L
                            && System.currentTimeMillis() - mTransportConnectedAtMs >= 60_000L) {
                        mReconnectAttempt = 0;
                    }
                    mTransportConnectedAtMs = 0L;
                    mDiagLastTransportError = sanitizeDiagnosticReason(reason, mEulerApiKey, mEulerJwtKey);
                }
                scheduleReconnectOrFail(gen, "EULER_WS_ERROR", reason, true);
            }
        });
    }

    private void handleEulerJsonFrame(long gen, @NonNull String rawMessage) {
        if (isStaleGeneration(gen)) return;
        try {
            JSONObject root = new JSONObject(rawMessage);
            JSONArray batch = root.optJSONArray("events");
            if (batch == null) batch = root.optJSONArray("messages");
            JSONObject dataObject = root.optJSONObject("data");
            if (batch == null && dataObject != null) {
                batch = dataObject.optJSONArray("events");
                if (batch == null) batch = dataObject.optJSONArray("messages");
            }

            if (batch != null) {
                for (int i = 0; i < batch.length(); i++) {
                    JSONObject item = batch.optJSONObject(i);
                    if (item != null) emitEulerEvent(gen, item);
                }
                return;
            }
            emitEulerEvent(gen, root);
        } catch (Exception e) {
            Log.w(TAG, "Mengabaikan pesan JSON EulerStream yang tidak valid: " + e.getClass().getSimpleName());
        }
    }

    private void emitEulerEvent(long gen, @NonNull JSONObject envelope) {
        if (isStaleGeneration(gen)) return;
        String type = firstNonEmpty(
                envelope.optString("type", ""),
                envelope.optString("event", ""),
                envelope.optString("eventType", "")
        );
        JSONObject data = envelope.optJSONObject("data");
        if (data == null) data = envelope;

        // Some SDK versions wrap event frames one additional level deep.
        if ((type.isEmpty() || "event".equalsIgnoreCase(type)) && data != envelope) {
            type = firstNonEmpty(data.optString("type", ""), data.optString("event", ""));
            JSONObject nested = data.optJSONObject("data");
            if (nested != null) data = nested;
        }
        if (type.isEmpty()) return;

        String normalizedType = type.toLowerCase(Locale.US);
        int separator = normalizedType.lastIndexOf('.');
        if (separator >= 0) normalizedType = normalizedType.substring(separator + 1);
        if (normalizedType.startsWith("webcast")) {
            normalizedType = normalizedType.substring("webcast".length());
        }
        if (normalizedType.startsWith("_")) normalizedType = normalizedType.substring(1);

        if ("roominfo".equals(normalizedType) || "room_info".equals(normalizedType)) {
            String roomId = firstNonEmpty(data.optString("roomId", ""), data.optString("room_id", ""));
            if (!roomId.isEmpty()) {
                synchronized (mLock) {
                    if (!isStaleGeneration(gen)) {
                        mRoomId = roomId;
                        mRoomStatus = "live";
                    }
                }
            }
            return;
        }

        JSONObject event = normalizeEulerEvent(normalizedType, data);
        if (event == null) return;
        List<JSONObject> events = new java.util.ArrayList<>();
        events.add(event);
        TikTokWebcastDecoder.DecodedResponse decoded = new TikTokWebcastDecoder.DecodedResponse(
                0L, "euler_json", "", 0L, "", 0L, false, "",
                java.util.Collections.<String, String>emptyMap(), events, 0
        );
        emitDecodedEvents(gen, decoded);
    }

    @Nullable
    private JSONObject normalizeEulerEvent(@NonNull String type, @NonNull JSONObject data) {
        String method;
        switch (type) {
            case "chat":
            case "comment":
            case "chatmessage":
                method = "WebcastChatMessage";
                break;
            case "gift":
            case "giftmessage":
                method = "WebcastGiftMessage";
                break;
            case "like":
            case "likemessage":
                method = "WebcastLikeMessage";
                break;
            case "follow":
            case "share":
            case "social":
            case "socialmessage":
                method = "WebcastSocialMessage";
                break;
            case "member":
            case "join":
            case "membermessage":
                method = "WebcastMemberMessage";
                break;
            case "roomuser":
            case "room_user":
            case "roomuserseq":
            case "roomuserseqmessage":
            case "roomusersequence":
            case "roomusersequencemessage":
            case "viewercount":
            case "viewers":
                method = "WebcastRoomUserSeqMessage";
                break;
            case "control":
            case "controlmessage":
            case "streamend":
            case "stream_end":
            case "liveended":
            case "live_ended":
            case "streamended":
            case "stream_ended":
                method = "WebcastControlMessage";
                break;
            default:
                return null;
        }

        JSONObject event = new JSONObject();
        JSONObject user = data.optJSONObject("user");
        if (user == null) user = new JSONObject();
        try {
            event.put("method", method);
            event.put("msgId", firstNonEmpty(data.optString("msgId", ""), data.optString("messageId", ""), data.optString("messageUuid", "")));
            event.put("createTime", firstNonEmpty(data.optString("createTime", ""), data.optString("timestamp", "")));
            String userId = firstNonEmpty(user.optString("id", ""), user.optString("userId", ""), data.optString("userId", ""));
            String username = firstNonEmpty(user.optString("uniqueId", ""), user.optString("username", ""), data.optString("username", ""));
            String nickname = firstNonEmpty(user.optString("nickname", ""), user.optString("displayName", ""), data.optString("nickname", ""));
            event.put("userId", userId);
            event.put("username", username);
            event.put("nickname", nickname);
            event.put("avatarUrl", firstNonEmpty(user.optString("avatarUrl", ""), user.optString("profilePictureUrl", ""), data.optString("avatarUrl", "")));

            switch (method) {
                case "WebcastChatMessage": {
                    String content = firstNonEmpty(data.optString("comment", ""), data.optString("content", ""), data.optString("message", ""), data.optString("text", ""));
                    if (content.isEmpty()) return null;
                    event.put("content", content);
                    break;
                }
                case "WebcastGiftMessage": {
                    JSONObject gift = data.optJSONObject("gift");
                    if (gift == null) gift = new JSONObject();
                    String giftId = firstNonEmpty(data.optString("giftId", ""), gift.optString("id", ""), gift.optString("giftId", ""));
                    String giftName = firstNonEmpty(data.optString("giftName", ""), gift.optString("name", ""), gift.optString("giftName", ""));
                    if (giftId.isEmpty() && giftName.isEmpty()) return null;
                    event.put("giftId", giftId);
                    event.put("giftName", giftName);
                    event.put("repeatCount", Math.max(1L, firstLong(data, 1L, "repeatCount", "repeat_count", "count")));
                    event.put("diamondCount", firstLong(data, firstLong(gift, 0L, "diamondCount", "diamond_count", "diamondValue"), "diamondCount", "diamond_count", "diamondValue"));
                    event.put("giftImage", firstNonEmpty(data.optString("giftImage", ""), gift.optString("imageUrl", ""), gift.optString("image", "")));
                    break;
                }
                case "WebcastLikeMessage": {
                    long likeCount = firstLong(data, 0L, "likeCount", "like_count", "count");
                    long totalLikeCount = firstLong(data, 0L, "totalLikes", "totalLikeCount", "total_like_count");
                    if (likeCount <= 0L && totalLikeCount <= 0L) return null;
                    event.put("likeCount", likeCount);
                    event.put("totalLikeCount", totalLikeCount);
                    break;
                }
                case "WebcastSocialMessage": {
                    long action = "share".equals(type) ? 3L : "follow".equals(type) ? 1L : firstLong(data, 0L, "action", "actionType", "action_type");
                    event.put("action", action);
                    event.put("displayKey", firstNonEmpty(data.optString("displayKey", ""), data.optString("displayType", ""), data.optString("label", ""), type));
                    break;
                }
                case "WebcastMemberMessage": {
                    long memberCount = firstLong(data, 0L, "memberCount", "member_count", "count");
                    if (username.isEmpty() && nickname.isEmpty() && memberCount <= 0L) return null;
                    event.put("memberCount", memberCount);
                    event.put("action", firstLong(data, 0L, "action", "actionType", "action_type"));
                    break;
                }
                case "WebcastRoomUserSeqMessage": {
                    long viewerCount = firstLong(data, -1L, "viewerCount", "viewer_count", "totalViewers", "userCount", "viewers");
                    if (viewerCount < 0L) return null;
                    event.put("viewerCount", viewerCount);
                    break;
                }
                case "WebcastControlMessage": {
                    boolean explicitStreamEnd = "streamend".equals(type)
                            || "stream_end".equals(type)
                            || "liveended".equals(type)
                            || "live_ended".equals(type)
                            || "streamended".equals(type)
                            || "stream_ended".equals(type);
                    long controlAction = explicitStreamEnd
                            ? 3L
                            : firstLong(data, 0L, "controlAction", "action", "actionType", "action_type");
                    event.put("controlAction", controlAction);
                    break;
                }
                default:
                    break;
            }
        } catch (Exception ignored) {
            return null;
        }
        return event;
    }

    private static String firstNonEmpty(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.trim().isEmpty() && !"null".equalsIgnoreCase(value.trim())) {
                return value.trim();
            }
        }
        return "";
    }

    private static long firstLong(@NonNull JSONObject source, long fallback, @NonNull String... keys) {
        for (String key : keys) {
            if (source.has(key) && !source.isNull(key)) {
                Object value = source.opt(key);
                try {
                    if (value instanceof Number) return Math.max(0L, ((Number) value).longValue());
                    if (value != null) return Math.max(0L, Long.parseLong(String.valueOf(value)));
                } catch (Exception ignored) {
                }
            }
        }
        return fallback;
    }

    private static String safeErrorMessage(@NonNull Throwable error) {
        String message = error.getMessage();
        return message != null && !message.trim().isEmpty() ? message.trim() : error.getClass().getSimpleName();
    }

    private void handleDecodedWebSocketFrame(
            long gen,
            @NonNull TikTokWebSocketTransport ws,
            @NonNull byte[] payload
    ) {
        TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(payload);
        long frameReceivedAt = System.currentTimeMillis();
        boolean roomAccepted = "im_enter_room_resp".equalsIgnoreCase(decoded.payloadType);
        boolean hasNonEndWebcastData = false;
        for (JSONObject evt : decoded.events) {
            String method = evt.optString("method", "");
            if (!"WebcastControlMessage".equals(method) || evt.optLong("controlAction", 0L) != 3L) {
                hasNonEndWebcastData = true;
                break;
            }
        }
        boolean emitDiagUpdate = false;
        synchronized (mLock) {
            if (isStaleTransport(gen, ws)) return;
            String previousPayloadType = mDiagLastPayloadType;
            mDiagLastFrameReceivedAt = frameReceivedAt;
            if (!decoded.payloadType.isEmpty()) {
                mDiagLastPayloadType = decoded.payloadType;
            }
            if (roomAccepted) {
                if (!mDiagRoomEntryConfirmed) {
                    emitDiagUpdate = true;
                }
                mDiagRoomEntryConfirmed = true;
            } else if (hasNonEndWebcastData && !mDiagRoomEntryConfirmed) {
                mDiagEventReceivedBeforeRoomAck = true;
            }
            if (!decoded.cursor.isEmpty()) mCursor = decoded.cursor;
            if (!decoded.internalExt.isEmpty()) mInternalExt = decoded.internalExt;

            if ((roomAccepted || hasNonEndWebcastData)
                    && "direct".equals(mConnectionMethod)
                    && "connecting_direct".equals(mState)) {
                mRoomStatus = "live";
                mReconnectAttempt = 0;
                mDeterministicRejectCount = 0;
                mUseAlternateDirectWsHost = false;
                mTransportConnectedAtMs = frameReceivedAt;
                mDiagLastTransportError = "";
                mDiagStage = hasNonEndWebcastData ? "receiving_events" : "connected";
                cancelPendingTaskLocked();
                setStateLocked("connected_direct", "direct_ws",
                        "Terhubung langsung ke TikTok LIVE @" + mUsername);
                emitDiagUpdate = false; // setStateLocked already emitted
            } else if (!decoded.payloadType.isEmpty() && !decoded.payloadType.equals(previousPayloadType)
                    && decoded.events.isEmpty()) {
                emitDiagUpdate = true;
            }
        }

        if (decoded.needAck && decoded.logId > 0L) {
            ws.sendBinary(TikTokWebcastDecoder.encodePushFrameAck(decoded.logId, decoded.internalExt));
        }

        if (emitDiagUpdate) {
            emitCurrentState();
        }

        emitDecodedEvents(gen, decoded);
    }

    /** @return true jika menerima WebcastControlMessage yang menandakan LIVE berakhir */
    private boolean emitDecodedEvents(long gen, @NonNull TikTokWebcastDecoder.DecodedResponse decoded) {
        Listener listener = mListener;
        boolean ended = false;
        boolean stateStatsUpdated = false;
        int dispatchedCount = 0;

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
                        stateStatsUpdated = true;
                    }
                }
            } else if ("WebcastControlMessage".equals(method)) {
                long action = evt.optLong("controlAction", 0L);
                if (action == 3L) {
                    ended = true;
                }
            }

            synchronized (mLock) {
                if (!isStaleGeneration(gen)) {
                    mDiagDecodedEventCount++;
                    if (!method.isEmpty()) {
                        mDiagLastDecodedEventMethod = method;
                    }
                    mDiagLastEventReceivedAt = System.currentTimeMillis();
                    if (!ended) {
                        mDiagStage = "receiving_events";
                        mDiagLastTransportError = "";
                    }
                    dispatchedCount++;
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
            long waitGeneration = -1L;
            String username = "";
            synchronized (mLock) {
                if (!isStaleGeneration(gen)) {
                    waitGeneration = mSessionGeneration.incrementAndGet();
                    username = mUsername;
                    cancelPendingTaskLocked();
                    closeActiveWsLocked();
                    mSessionCookies.clear();
                    mRoomStatus = "not_live";
                    mErrorCode = "LIVE_ENDED";
                    mDiagStage = "waiting_for_live";
                    setStateLocked("waiting_for_live", "none", "Siaran LIVE @" + mUsername + " telah berakhir. Memantau siaran berikutnya.");
                }
            }
            if (waitGeneration >= 0L) {
                scheduleWaitingForLiveCheck(waitGeneration, username, "LIVE sebelumnya telah berakhir.");
            }
            return true;
        }

        if (stateStatsUpdated || dispatchedCount > 0) {
            emitCurrentState();
        }
        return false;
    }

    /**
     * An unavailable Euler fallback must not kill a Direct-mode monitoring session.
     * Keep checking TikTok itself while clearly reporting why the fallback was skipped.
     * If the user explicitly selected Euler, authentication/permission failure is terminal.
     */
    private void handleEulerFallbackUnavailable(long gen, @NonNull String reason) {
        final boolean directMode;
        final String roomStatus;
        final String username;
        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            directMode = "direct".equals(mConnectionMethod);
            roomStatus = mRoomStatus;
            username = mUsername;
            if (directMode) {
                mEulerFallbackUnavailable = true;
                if ("live".equals(roomStatus)) {
                    mReconnectAttempt = 0;
                }
            }
        }
        if (directMode) {
            String message = reason + " Fallback EulerStream dilewati; pemantauan Direct TikTok tetap berjalan.";
            if ("unreadable".equals(roomStatus)) {
                // An authentication failure from the optional fallback does not turn an
                // unreadable public room into an offline room. Preserve the truthful state
                // and continue probing the Direct resolver on its normal retry cadence.
                scheduleUnreadableRoomRetry(gen, username, message);
            } else if ("live".equals(roomStatus)) {
                // Direct WS was already targeting an active room when the optional Euler
                // fallback rejected auth. Keep retrying Direct instead of marking not_live.
                scheduleReconnectOrFail(gen, "DIRECT_WS_RETRY", message, false);
            } else {
                scheduleWaitingForLiveCheck(gen, username, message);
            }
        } else {
            failSessionIfCurrent(gen, "error", "EULER_AUTH_ERROR",
                    reason + " Periksa autentikasi atau izin akun EulerStream.");
        }
    }

    private void scheduleDeterministicDirectFailureOrRetry(
            long gen,
            @NonNull String reason,
            boolean hasTtwid,
            boolean imFetchOk
    ) {
        final int attempt;
        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            closeActiveWsLocked();
            cancelPendingTaskLocked();
            mDeterministicRejectCount++;
            attempt = mDeterministicRejectCount;

            if (attempt < MAX_DETERMINISTIC_DIRECT_RETRIES) {
                String retryCode = !hasTtwid ? "DIRECT_TTWID_REQUIRED" : "DIRECT_WS_HANDSHAKE_REJECTED";
                mErrorCode = retryCode;
                mDiagStage = "reconnecting";
                mDiagLastTransportError = sanitizeDiagnosticReason(reason, mEulerApiKey, mEulerJwtKey);
                setStateLocked(
                        "reconnecting",
                        "direct_ws",
                        "Verifikasi ulang Direct (" + attempt + "/" + MAX_DETERMINISTIC_DIRECT_RETRIES + "): " + reason
                );
                mPendingTask = mScheduler.schedule(() -> {
                    if (isStaleGeneration(gen)) return;
                    synchronized (mLock) {
                        if (isStaleGeneration(gen)) return;
                        mPendingTask = null;
                    }
                    mWorker.execute(() -> startDirectWebSocket(gen));
                }, DETERMINISTIC_RETRY_DELAY_MS, TimeUnit.MILLISECONDS);
                return;
            }
        }

        String terminalCode = !hasTtwid ? "DIRECT_TTWID_REQUIRED" : "DIRECT_WS_HANDSHAKE_REJECTED";
        StringBuilder msg = new StringBuilder(reason);
        if (!hasTtwid) {
            msg.append(" TikTok tidak menerbitkan cookie ttwid anonim untuk sesi Direct ini.");
        } else if (!imFetchOk) {
            msg.append(" Server TikTok menolak bootstrap/upgrade WebSocket untuk sesi Direct tanpa tanda tangan.");
        } else {
            msg.append(" Server TikTok menolak upgrade WebSocket Direct.");
        }
        msg.append(" Gunakan EulerStream API Key/JWT jika tersedia, atau coba sambung lagi.");
        failSessionIfCurrent(gen, "error", terminalCode, msg.toString());
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
        final boolean reuseResolvedRoom;

        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            closeActiveWsLocked();
            cancelPendingTaskLocked();

            if (!useEuler && mReconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
                if (canAttemptEulerFallback(mAllowEulerFallback, mEulerFallbackUnavailable, mEulerApiKey, mEulerJwtKey)) {
                    startEulerFallback(gen, "Koneksi langsung gagal setelah beberapa percobaan; beralih ke EulerStream...");
                    return;
                }
                // Fall through outside lock to fail cleanly instead of looping infinitely.
                attemptIdx = mReconnectAttempt;
                delayMs = -1L;
                targetUsername = mUsername;
                reuseResolvedRoom = false;
            } else {
                attemptIdx = mReconnectAttempt;
                mReconnectAttempt++;
                if (useEuler) {
                    int shift = Math.min(attemptIdx, 4);
                    delayMs = Math.min(30_000L, 2_000L * (1L << shift));
                } else {
                    delayMs = RECONNECT_DELAYS_MS[Math.min(attemptIdx, RECONNECT_DELAYS_MS.length - 1)];
                }
                targetUsername = mUsername;
                reuseResolvedRoom = !useEuler
                        && attemptIdx < 2
                        && !mRoomId.isEmpty()
                        && !"WS_CLOSED".equals(errorCode);
                mErrorCode = errorCode;
                mDiagStage = "reconnecting";
                mDiagLastTransportError = sanitizeDiagnosticReason(reason, mEulerApiKey, mEulerJwtKey);
                setStateLocked(
                        "reconnecting",
                        mTransportMode,
                        useEuler
                                ? "Memulihkan koneksi EulerStream (percobaan " + (attemptIdx + 1) + "): " + reason
                                : "Menyambung ulang (" + (attemptIdx + 1) + "/" + MAX_RECONNECT_ATTEMPTS + "): " + reason
                );
            }
        }

        if (delayMs < 0L) {
            failSessionIfCurrent(
                    gen,
                    "error",
                    errorCode,
                    reason + " Batas percobaan penyambungan ulang tercapai."
            );
            return;
        }

        synchronized (mLock) {
            if (isStaleGeneration(gen)) return;
            mPendingTask = mScheduler.schedule(() -> {
                if (isStaleGeneration(gen)) return;
                if (useEuler) {
                    startEulerFallback(gen, "Menyambung ulang via EulerStream...");
                } else if (reuseResolvedRoom) {
                    synchronized (mLock) {
                        if (isStaleGeneration(gen)) return;
                        mPendingTask = null;
                    }
                    mWorker.execute(() -> startDirectWebSocket(gen));
                } else {
                    synchronized (mLock) {
                        if (isStaleGeneration(gen)) return;
                        mPendingTask = null;
                        mDiagStage = "resolving_room";
                        setStateLocked("resolving_room", "none",
                                "Memeriksa ulang room LIVE @" + targetUsername + " sebelum menyambung kembali...");
                    }
                    mWorker.execute(() -> runRoomResolution(gen, targetUsername));
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
            mDiagStage = "error".equals(state) ? "error" : state;
            mDiagLastTransportError = sanitizeDiagnosticReason(message, mEulerApiKey, mEulerJwtKey);
            mEulerApiKey = "";
            mEulerJwtKey = "";
            mSessionCookies.clear();
            mDeviceId = "";
            mResolvedPushServerUrl = "";
            mLastImFetchOk = false;
            mDirectHeartbeatMs = 10_000L;
            mLastImFetchRttMs = 0L;
            mRouteParams.clear();
            mDeterministicRejectCount = 0;
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
