package com.syntxrr.streamtools;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLPeerUnverifiedException;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * TikTokWebSocketTransport
 *
 * Klien WebSocket RFC 6455 murni Java di atas TLS SSLSocket (tanpa dependensi eksternal).
 * Digunakan untuk jalur langsung TikTok Webcast WebSocket maupun WebSocket tertandatangani
 * yang dikembalikan oleh EulerStream.
 *
 * Fitur:
 * - Pembentukan URL & encoding query parameter ("room_id", "ws_direct", "resp_content_type",
 *   "heartbeat_duration", "client_enter", "last_rtt", plus cursor/internal_ext/routeParams).
 * - Validasi ketat HTTP 101 Switching Protocols, Upgrade, Connection, dan Sec-WebSocket-Accept.
 * - Diagnostik aman saat handshake ditolak (status, host, Content-Type, Location tersanitasi,
 *   Server, Upgrade/Connection, keberadaan Sec-WebSocket-Accept, ukuran & klasifikasi body <= 4 KB).
 * - Pengiriman frame binary bermask (ACK & heartbeat PushFrame), Ping/Pong, dan pengukuran last_rtt.
 * - Penutupan koneksi bersih tanpa kebocoran thread atau socket.
 */
public final class TikTokWebSocketTransport {

    public static final String DIRECT_WS_BASE_URL =
            "wss://webcast-ws.tiktok.com/webcast/im/ws_proxy/ws_reuse_supplement/";
    public static final String DIRECT_WS_FALLBACK_BASE_URL =
            "wss://webcast-ws.us.tiktok.com/webcast/im/ws_proxy/ws_reuse_supplement/";

    public static final int MAX_DIAGNOSTIC_BODY_BYTES = 4 * 1024;

    private static final String WS_MAGIC_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private static final int CONNECT_TIMEOUT_MS = 12_000;
    private static final int READ_TIMEOUT_MS = 35_000;
    private static final int MAX_HEADER_BYTES = 32 * 1024;
    private static final int MAX_FRAME_BYTES = 4 * 1024 * 1024;
    private static final Pattern SENSITIVE_TEXT_PATTERN = Pattern.compile(
            "(?i)(apiKey|jwtKey|token|access_token|refresh_token|ttwid|sessionid|cookie|authorization|sec-websocket-key)\\s*[:=]\\s*[^&\\s;\\r\\n]+"
    );
    private static final Pattern BEARER_PATTERN = Pattern.compile("(?i)Bearer\\s+[A-Za-z0-9._-]+");
    private static final Pattern JWT_LIKE_PATTERN = Pattern.compile(
            "eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*"
    );

    public static final class HandshakeDiagnostics {
        public final int httpStatus;
        @NonNull
        public final String attemptedHost;
        @NonNull
        public final String contentType;
        @NonNull
        public final String redirectLocation;
        @NonNull
        public final String serverHeader;
        @NonNull
        public final String upgradeHeader;
        @NonNull
        public final String connectionHeader;
        public final boolean hasSecWebSocketAccept;
        public final int bodyBytes;
        @NonNull
        public final String bodyKind;
        @NonNull
        public final String responseClass;
        @NonNull
        public final String rejectionReason;

        public HandshakeDiagnostics(
                int httpStatus,
                @NonNull String attemptedHost,
                @NonNull String contentType,
                @NonNull String redirectLocation,
                @NonNull String serverHeader,
                @NonNull String upgradeHeader,
                @NonNull String connectionHeader,
                boolean hasSecWebSocketAccept,
                int bodyBytes,
                @NonNull String bodyKind,
                @NonNull String responseClass,
                @NonNull String rejectionReason
        ) {
            this.httpStatus = httpStatus;
            this.attemptedHost = attemptedHost;
            this.contentType = contentType;
            this.redirectLocation = redirectLocation;
            this.serverHeader = serverHeader;
            this.upgradeHeader = upgradeHeader;
            this.connectionHeader = connectionHeader;
            this.hasSecWebSocketAccept = hasSecWebSocketAccept;
            this.bodyBytes = Math.max(0, bodyBytes);
            this.bodyKind = bodyKind;
            this.responseClass = responseClass;
            this.rejectionReason = rejectionReason;
        }
    }

    static final class HandshakeEvaluation {
        final boolean accepted;
        @NonNull
        final HandshakeDiagnostics diagnostics;

        HandshakeEvaluation(boolean accepted, @NonNull HandshakeDiagnostics diagnostics) {
            this.accepted = accepted;
            this.diagnostics = diagnostics;
        }
    }

    public interface Listener {
        void onConnected(int httpStatus);
        void onBinaryFrame(@NonNull byte[] payload);
        void onTextFrame(@NonNull String text);
        void onHandshakeRejected(int httpStatus, @NonNull String reason);
        default void onHandshakeRejected(@NonNull HandshakeDiagnostics diagnostics) {
            onHandshakeRejected(diagnostics.httpStatus, diagnostics.rejectionReason);
        }
        void onClosed(int code, @NonNull String reason, boolean byRemote);
        void onError(@NonNull String reason);
    }

    private final SecureRandom mRandom = new SecureRandom();
    private final AtomicBoolean mClosed = new AtomicBoolean(false);
    private final AtomicBoolean mOpen = new AtomicBoolean(false);
    private final AtomicLong mLastPingSentMs = new AtomicLong(0L);
    private final AtomicLong mLastRttMs = new AtomicLong(0L);
    private final AtomicLong mTikTokHeartbeatSequence = new AtomicLong(1L);
    @Nullable
    private volatile String mTikTokRoomId;
    private final Object mWriteLock = new Object();

    @Nullable
    private volatile SSLSocket mSocket;
    @Nullable
    private volatile OutputStream mOutput;
    @Nullable
    private Thread mReaderThread;
    @Nullable
    private ScheduledExecutorService mHeartbeatExecutor;

    @NonNull
    public static String buildWebSocketUrl(
            @NonNull String baseUrl,
            @NonNull String roomId,
            boolean wsDirect,
            long heartbeatDurationMs,
            boolean clientEnter,
            long lastRttMs,
            @Nullable String cursor,
            @Nullable String internalExt,
            @Nullable Map<String, String> routeParams
    ) {
        try {
            StringBuilder sb = new StringBuilder(baseUrl);
            int queryStart = baseUrl.indexOf('?');
            char sep = queryStart >= 0 ? '&' : '?';

            java.util.Set<String> existingKeys = new java.util.HashSet<>();
            if (queryStart >= 0 && queryStart + 1 < baseUrl.length()) {
                String existingQuery = baseUrl.substring(queryStart + 1);
                for (String pair : existingQuery.split("&")) {
                    int eq = pair.indexOf('=');
                    String rawKey = eq > 0 ? pair.substring(0, eq) : pair;
                    if (!rawKey.isEmpty()) {
                        existingKeys.add(rawKey);
                    }
                }
            }

            Map<String, String> params = new LinkedHashMap<>();
            // Parameter standar TikTok Webcast WebSocket (tidak menimpa parameter URL yang sudah ditandatangani).
            putIfMissing(params, existingKeys, "aid", "1988");
            putIfMissing(params, existingKeys, "app_language", "en");
            putIfMissing(params, existingKeys, "app_name", "tiktok_web");
            putIfMissing(params, existingKeys, "browser_language", "en");
            putIfMissing(params, existingKeys, "browser_name", "Mozilla");
            putIfMissing(params, existingKeys, "browser_platform", "Linux aarch64");
            putIfMissing(params, existingKeys, "browser_version", "5.0");
            putIfMissing(params, existingKeys, "compress", "gzip");
            putIfMissing(params, existingKeys, "device_platform", "web_mobile");
            putIfMissing(params, existingKeys, "did_rule", "3");
            putIfMissing(params, existingKeys, "fetch_rule", "1");
            putIfMissing(params, existingKeys, "identity", "audience");
            putIfMissing(params, existingKeys, "live_id", "12");
            putIfMissing(params, existingKeys, "tz_name", "UTC");
            putIfMissing(params, existingKeys, "update_version_code", "1.3.0");
            putIfMissing(params, existingKeys, "version_code", "180800");
            putIfMissing(params, existingKeys, "webcast_sdk_version", "1.3.0");

            if (routeParams != null) {
                for (Map.Entry<String, String> e : routeParams.entrySet()) {
                    if (e.getKey() != null && !e.getKey().isEmpty() && e.getValue() != null
                            && !existingKeys.contains(e.getKey())) {
                        params.put(e.getKey(), e.getValue());
                    }
                }
            }
            putIfMissing(params, existingKeys, "room_id", roomId);
            putIfMissing(params, existingKeys, "ws_direct", wsDirect ? "1" : "0");
            putIfMissing(params, existingKeys, "resp_content_type", "protobuf");
            putIfMissing(params, existingKeys, "heartbeat_duration",
                    String.valueOf(Math.max(5_000L, heartbeatDurationMs)));
            if (clientEnter) {
                putIfMissing(params, existingKeys, "client_enter", "1");
            }
            if (lastRttMs > 0L) {
                putIfMissing(params, existingKeys, "last_rtt", String.valueOf(lastRttMs));
            }
            if (cursor != null && !cursor.isEmpty()) {
                putIfMissing(params, existingKeys, "cursor", cursor);
            }
            if (internalExt != null && !internalExt.isEmpty()) {
                putIfMissing(params, existingKeys, "internal_ext", internalExt);
            }

            for (Map.Entry<String, String> e : params.entrySet()) {
                sb.append(sep);
                sep = '&';
                sb.append(URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8.name()))
                        .append('=')
                        .append(URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8.name()));
            }
            return sb.toString();
        } catch (Exception e) {
            return baseUrl;
        }
    }

    private static void putIfMissing(
            @NonNull Map<String, String> target,
            @NonNull java.util.Set<String> existingKeys,
            @NonNull String key,
            @NonNull String value
    ) {
        if (!existingKeys.contains(key)) {
            target.put(key, value);
        }
    }

    public long getLastRttMs() {
        return mLastRttMs.get();
    }

    public boolean isOpen() {
        return mOpen.get() && !mClosed.get();
    }

    public void connect(
            @NonNull String wsUrl,
            @Nullable Map<String, String> sessionCookies,
            long heartbeatDurationMs,
            @NonNull Listener listener
    ) {
        connect(wsUrl, sessionCookies, heartbeatDurationMs,
                "https://www.tiktok.com", true, null, listener);
    }

    /** Backward-compatible provider-specific connection overload. */
    public void connect(
            @NonNull String wsUrl,
            @Nullable Map<String, String> sessionCookies,
            long heartbeatDurationMs,
            @NonNull String origin,
            boolean sendTikTokHeartbeat,
            @NonNull Listener listener
    ) {
        connect(wsUrl, sessionCookies, heartbeatDurationMs,
                origin, sendTikTokHeartbeat, null, listener);
    }

    /** Connect with an explicit room id for protocol-correct TikTok application heartbeats. */
    public void connect(
            @NonNull String wsUrl,
            @Nullable Map<String, String> sessionCookies,
            long heartbeatDurationMs,
            @NonNull String origin,
            boolean sendTikTokHeartbeat,
            @Nullable String tikTokRoomId,
            @NonNull Listener listener
    ) {
        if (mClosed.get()) return;
        mTikTokRoomId = tikTokRoomId != null ? tikTokRoomId.trim() : null;
        mTikTokHeartbeatSequence.set(1L);

        Thread connectThread = new Thread(() -> {
            SSLSocket socket = null;
            String attemptedHostForDiag = "";
            String secKeyForDiag = "";
            try {
                URI uri = URI.create(wsUrl);
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.US) : "";
                if (!"wss".equals(scheme) && !"https".equals(scheme)) {
                    listener.onHandshakeRejected(new HandshakeDiagnostics(
                            0, "", "", "", "", "", "", false, 0, "empty", "unknown",
                            "Skema URL WebSocket tidak didukung: " + sanitizeHeaderValue(scheme)
                    ));
                    return;
                }
                String host = uri.getHost();
                if (host == null || host.isEmpty()) {
                    listener.onHandshakeRejected(new HandshakeDiagnostics(
                            0, "", "", "", "", "", "", false, 0, "empty", "unknown",
                            "Host URL WebSocket kosong."
                    ));
                    return;
                }
                attemptedHostForDiag = host;
                int port = uri.getPort() > 0 ? uri.getPort() : 443;
                String rawPath = uri.getRawPath();
                if (rawPath == null || rawPath.isEmpty()) rawPath = "/";
                String rawQuery = uri.getRawQuery();
                String pathAndQuery = (rawQuery != null && !rawQuery.isEmpty())
                        ? rawPath + "?" + rawQuery
                        : rawPath;

                SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
                socket = (SSLSocket) factory.createSocket();
                mSocket = socket;
                socket.setSoTimeout(READ_TIMEOUT_MS);

                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                    SSLParameters sslParams = socket.getSSLParameters();
                    sslParams.setServerNames(Collections.singletonList(new SNIHostName(host)));
                    socket.setSSLParameters(sslParams);
                }

                socket.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MS);
                socket.startHandshake();

                HostnameVerifier verifier = HttpsURLConnection.getDefaultHostnameVerifier();
                if (!verifier.verify(host, socket.getSession())) {
                    throw new SSLPeerUnverifiedException("Hostname sertifikat TLS tidak cocok untuk " + host);
                }

                if (mClosed.get()) {
                    closeQuietly(socket);
                    return;
                }

                byte[] keyBytes = new byte[16];
                mRandom.nextBytes(keyBytes);
                String secWebSocketKey = encodeBase64(keyBytes);
                secKeyForDiag = secWebSocketKey;

                OutputStream out = socket.getOutputStream();
                BufferedInputStream in = new BufferedInputStream(socket.getInputStream(), 16 * 1024);

                StringBuilder req = new StringBuilder();
                req.append("GET ").append(pathAndQuery).append(" HTTP/1.1\r\n");
                req.append("Host: ").append(host).append(port != 443 ? ":" + port : "").append("\r\n");
                req.append("Upgrade: websocket\r\n");
                req.append("Connection: Upgrade\r\n");
                req.append("Sec-WebSocket-Key: ").append(secWebSocketKey).append("\r\n");
                req.append("Sec-WebSocket-Version: 13\r\n");
                req.append("Origin: ").append(origin).append("\r\n");
                req.append("Accept-Language: en-US,en;q=0.9,id;q=0.8\r\n");
                req.append("User-Agent: ").append(TikTokRoomResolver.MOBILE_USER_AGENT).append("\r\n");
                String cookieHeader = TikTokRoomResolver.formatCookieHeader(sessionCookies);
                if (!cookieHeader.isEmpty()) {
                    req.append("Cookie: ").append(cookieHeader).append("\r\n");
                }
                req.append("\r\n");

                out.write(req.toString().getBytes(StandardCharsets.US_ASCII));
                out.flush();

                HandshakeEvaluation evaluation = readAndEvaluateHandshake(host, in, secWebSocketKey);
                if (!evaluation.accepted) {
                    closeQuietly(socket);
                    listener.onHandshakeRejected(evaluation.diagnostics);
                    return;
                }

                synchronized (mWriteLock) {
                    mOutput = out;
                }
                mOpen.set(true);
                // Let the provider send its first application frame before starting keepalive.
                // For Direct TikTok this is im_enter_room; its heartbeat must follow room entry.
                listener.onConnected(evaluation.diagnostics.httpStatus);
                if (isOpen()) {
                    // Keep every WebSocket alive with RFC 6455 Ping. Direct TikTok also
                    // requires its application-level protobuf heartbeat; Euler does not.
                    startHeartbeat(heartbeatDurationMs, sendTikTokHeartbeat);
                }

                readFrameLoop(in, listener);
            } catch (Exception e) {
                if (!mClosed.get()) {
                    String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                    String safeMsg = sanitizeDiagnosticText("Gagal terhubung WebSocket: " + msg, secKeyForDiag, 220);
                    if (!mOpen.get()) {
                        listener.onHandshakeRejected(new HandshakeDiagnostics(
                                0, attemptedHostForDiag, "", "", "", "", "", false, 0, "empty", "unknown", safeMsg
                        ));
                    } else {
                        listener.onError(sanitizeDiagnosticText("Koneksi WebSocket terputus: " + msg, secKeyForDiag, 220));
                    }
                }
            } finally {
                mOpen.set(false);
                stopHeartbeat();
                closeQuietly(socket);
            }
        }, "TikTokWsTransport");
        mReaderThread = connectThread;
        connectThread.start();
    }

    public boolean sendBinary(@NonNull byte[] payload) {
        if (!isOpen()) return false;
        return writeFrame(0x2, payload);
    }

    public void close() {
        if (!mClosed.compareAndSet(false, true)) {
            return;
        }
        mOpen.set(false);
        stopHeartbeat();
        try {
            writeFrame(0x8, new byte[]{0x03, (byte) 0xE8}); // Close 1000
        } catch (Exception ignored) {
        }
        closeQuietly(mSocket);
        mSocket = null;
        synchronized (mWriteLock) {
            mOutput = null;
        }
        Thread t = mReaderThread;
        if (t != null && t != Thread.currentThread()) {
            t.interrupt();
        }
    }

    private void startHeartbeat(long heartbeatDurationMs, boolean sendTikTokHeartbeat) {
        long intervalMs = Math.max(8_000L, Math.min(30_000L, heartbeatDurationMs > 0 ? heartbeatDurationMs : 10_000L));
        ScheduledExecutorService exec = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "TikTokWsHeartbeat");
            t.setDaemon(true);
            return t;
        });
        mHeartbeatExecutor = exec;
        exec.scheduleAtFixedRate(() -> {
            if (!isOpen()) return;
            try {
                mLastPingSentMs.set(System.currentTimeMillis());
                writeFrame(0x9, new byte[0]); // RFC 6455 Ping
                if (sendTikTokHeartbeat) {
                    String roomId = mTikTokRoomId;
                    if (roomId != null && !roomId.isEmpty()) {
                        long sequenceId = mTikTokHeartbeatSequence.getAndIncrement();
                        writeFrame(0x2,
                                TikTokWebcastDecoder.encodePushFrameHeartbeat(roomId, sequenceId));
                    }
                }
            } catch (Exception ignored) {
            }
        }, intervalMs, intervalMs, TimeUnit.MILLISECONDS);
    }

    private void stopHeartbeat() {
        ScheduledExecutorService exec = mHeartbeatExecutor;
        mHeartbeatExecutor = null;
        if (exec != null) {
            exec.shutdownNow();
        }
    }

    private boolean writeFrame(int opcode, @NonNull byte[] payload) {
        synchronized (mWriteLock) {
            OutputStream out = mOutput;
            // close() marks the transport closed before emitting the RFC 6455 close
            // frame; allow only that control frame through during shutdown.
            if (out == null || (mClosed.get() && opcode != 0x8)) return false;
            try {
                ByteArrayOutputStream frame = new ByteArrayOutputStream(payload.length + 14);
                frame.write(0x80 | (opcode & 0x0F)); // FIN=1

                int len = payload.length;
                if (len <= 125) {
                    frame.write(0x80 | len); // MASK=1
                } else if (len <= 65_535) {
                    frame.write(0x80 | 126);
                    frame.write((len >>> 8) & 0xFF);
                    frame.write(len & 0xFF);
                } else {
                    frame.write(0x80 | 127);
                    for (int i = 7; i >= 0; i--) {
                        frame.write((int) (((long) len >>> (8 * i)) & 0xFF));
                    }
                }

                byte[] mask = new byte[4];
                mRandom.nextBytes(mask);
                frame.write(mask, 0, 4);

                byte[] maskedPayload = new byte[len];
                for (int i = 0; i < len; i++) {
                    maskedPayload[i] = (byte) (payload[i] ^ mask[i & 3]);
                }
                frame.write(maskedPayload, 0, len);

                out.write(frame.toByteArray());
                out.flush();
                return true;
            } catch (IOException e) {
                return false;
            }
        }
    }

    private void readFrameLoop(@NonNull InputStream in, @NonNull Listener listener) throws IOException {
        ByteArrayOutputStream fragmented = new ByteArrayOutputStream();
        int fragmentedOpcode = -1;

        while (!mClosed.get()) {
            int b1 = in.read();
            if (b1 == -1) {
                listener.onClosed(1006, "Stream WebSocket berakhir.", true);
                return;
            }
            int b2 = in.read();
            if (b2 == -1) {
                listener.onClosed(1006, "Header frame WebSocket terpotong.", true);
                return;
            }

            boolean fin = (b1 & 0x80) != 0;
            int opcode = b1 & 0x0F;
            boolean masked = (b2 & 0x80) != 0;
            long payloadLen = b2 & 0x7F;

            if (payloadLen == 126) {
                int h = readRequiredByte(in);
                int l = readRequiredByte(in);
                payloadLen = ((h & 0xFF) << 8) | (l & 0xFF);
            } else if (payloadLen == 127) {
                payloadLen = 0L;
                for (int i = 0; i < 8; i++) {
                    payloadLen = (payloadLen << 8) | (readRequiredByte(in) & 0xFFL);
                }
            }

            if (payloadLen < 0L || payloadLen > MAX_FRAME_BYTES) {
                throw new IOException("Ukuran frame WebSocket melebihi batas: " + payloadLen);
            }

            byte[] mask = null;
            if (masked) {
                mask = readExactBytes(in, 4);
            }

            byte[] payload = readExactBytes(in, (int) payloadLen);
            if (masked && mask != null) {
                for (int i = 0; i < payload.length; i++) {
                    payload[i] = (byte) (payload[i] ^ mask[i & 3]);
                }
            }

            if (opcode == 0x8) { // Close
                int code = 1000;
                String reason = "";
                if (payload.length >= 2) {
                    code = ((payload[0] & 0xFF) << 8) | (payload[1] & 0xFF);
                    if (payload.length > 2) {
                        reason = new String(payload, 2, payload.length - 2, StandardCharsets.UTF_8);
                    }
                }
                listener.onClosed(code, reason, true);
                return;
            } else if (opcode == 0x9) { // Ping -> Pong
                writeFrame(0xA, payload);
                continue;
            } else if (opcode == 0xA) { // Pong
                long sent = mLastPingSentMs.get();
                if (sent > 0L) {
                    mLastRttMs.set(Math.max(1L, System.currentTimeMillis() - sent));
                }
                continue;
            }

            if (opcode == 0x0) { // Continuation
                if (fragmentedOpcode == -1) continue;
                if (fragmented.size() + payload.length > MAX_FRAME_BYTES) {
                    throw new IOException("Ukuran pesan terfragmentasi melebihi batas.");
                }
                fragmented.write(payload, 0, payload.length);
                if (fin) {
                    byte[] complete = fragmented.toByteArray();
                    int resolvedOp = fragmentedOpcode;
                    fragmented.reset();
                    fragmentedOpcode = -1;
                    dispatchDataFrame(resolvedOp, complete, listener);
                }
            } else if (opcode == 0x1 || opcode == 0x2) {
                if (fin) {
                    dispatchDataFrame(opcode, payload, listener);
                } else {
                    fragmented.reset();
                    fragmented.write(payload, 0, payload.length);
                    fragmentedOpcode = opcode;
                }
            }
        }
    }

    private void dispatchDataFrame(int opcode, @NonNull byte[] payload, @NonNull Listener listener) {
        if (opcode == 0x2) {
            listener.onBinaryFrame(payload);
        } else if (opcode == 0x1) {
            listener.onTextFrame(new String(payload, StandardCharsets.UTF_8));
        }
    }

    private static int readRequiredByte(@NonNull InputStream in) throws IOException {
        int b = in.read();
        if (b == -1) throw new EOFException("EOF saat membaca frame WebSocket");
        return b;
    }

    @NonNull
    private static byte[] readExactBytes(@NonNull InputStream in, int len) throws IOException {
        byte[] out = new byte[len];
        int offset = 0;
        while (offset < len) {
            int r = in.read(out, offset, len - offset);
            if (r == -1) throw new EOFException("EOF sebelum seluruh payload WebSocket terbaca");
            offset += r;
        }
        return out;
    }

    static final class HandshakeResponse {
        final int statusCode;
        final Map<String, String> headers;

        HandshakeResponse(int statusCode, Map<String, String> headers) {
            this.statusCode = statusCode;
            this.headers = headers;
        }

        @Nullable
        String getHeader(@NonNull String name) {
            return headers.get(name.toLowerCase(Locale.US));
        }
    }

    @NonNull
    static HandshakeEvaluation readAndEvaluateHandshake(
            @NonNull String attemptedHost,
            @NonNull InputStream in,
            @NonNull String secWebSocketKey
    ) throws Exception {
        HandshakeResponse hs = readHandshakeResponse(in);
        String expectedAccept = computeAcceptKey(secWebSocketKey);
        if (isValidSwitchingProtocols(hs, expectedAccept)) {
            HandshakeDiagnostics okDiag = buildRejectedOrOkDiagnostics(
                    attemptedHost, hs, new byte[0], expectedAccept, secWebSocketKey, true
            );
            return new HandshakeEvaluation(true, okDiag);
        }
        byte[] bodySample = readBoundedDiagnosticBody(in, hs, MAX_DIAGNOSTIC_BODY_BYTES);
        HandshakeDiagnostics rejectedDiag = buildRejectedOrOkDiagnostics(
                attemptedHost, hs, bodySample, expectedAccept, secWebSocketKey, false
        );
        return new HandshakeEvaluation(false, rejectedDiag);
    }

    private static boolean isValidSwitchingProtocols(
            @NonNull HandshakeResponse hs,
            @NonNull String expectedAccept
    ) {
        if (hs.statusCode != 101) return false;
        String upgradeHdr = hs.getHeader("upgrade");
        String connHdr = hs.getHeader("connection");
        String acceptHdr = hs.getHeader("sec-websocket-accept");
        return upgradeHdr != null && upgradeHdr.toLowerCase(Locale.US).contains("websocket")
                && connHdr != null && connHdr.toLowerCase(Locale.US).contains("upgrade")
                && acceptHdr != null && expectedAccept.equals(acceptHdr.trim());
    }

    @NonNull
    private static HandshakeDiagnostics buildRejectedOrOkDiagnostics(
            @NonNull String attemptedHost,
            @NonNull HandshakeResponse hs,
            @NonNull byte[] bodySample,
            @NonNull String expectedAccept,
            @NonNull String secWebSocketKey,
            boolean accepted
    ) {
        String safeHost = sanitizeHeaderValue(attemptedHost);
        String contentType = sanitizeHeaderValue(hs.getHeader("content-type"));
        String redirectLocation = sanitizeRedirectLocation(hs.getHeader("location"));
        String serverHeader = sanitizeHeaderValue(hs.getHeader("server"));
        String upgradeHdr = sanitizeHeaderValue(hs.getHeader("upgrade"));
        String connHdr = sanitizeHeaderValue(hs.getHeader("connection"));
        String acceptRaw = hs.getHeader("sec-websocket-accept");
        boolean hasAccept = acceptRaw != null && !acceptRaw.trim().isEmpty();

        if (accepted) {
            return new HandshakeDiagnostics(
                    hs.statusCode,
                    safeHost,
                    contentType,
                    redirectLocation,
                    serverHeader,
                    upgradeHdr,
                    connHdr,
                    hasAccept,
                    0,
                    "empty",
                    "unknown",
                    ""
            );
        }

        String bodyKind = classifyBody(bodySample, contentType);
        String responseClass = classifyHandshakeResponse(
                hs.statusCode, upgradeHdr, connHdr, acceptRaw, expectedAccept, bodyKind
        );
        String reason = buildSafeRejectionReason(
                hs.statusCode, responseClass, bodyKind, redirectLocation,
                upgradeHdr, connHdr, hasAccept, secWebSocketKey
        );

        return new HandshakeDiagnostics(
                hs.statusCode,
                safeHost,
                contentType,
                redirectLocation,
                serverHeader,
                upgradeHdr,
                connHdr,
                hasAccept,
                bodySample.length,
                bodyKind,
                responseClass,
                reason
        );
    }

    @NonNull
    static String sanitizeRedirectLocation(@Nullable String rawLocation) {
        if (rawLocation == null) return "";
        String cleaned = stripControlChars(rawLocation).trim();
        if (cleaned.isEmpty()) return "";

        int hashIdx = cleaned.indexOf('#');
        if (hashIdx >= 0) cleaned = cleaned.substring(0, hashIdx);
        int queryIdx = cleaned.indexOf('?');
        if (queryIdx >= 0) cleaned = cleaned.substring(0, queryIdx);
        cleaned = cleaned.trim();
        if (cleaned.isEmpty()) return "";

        try {
            URI uri = new URI(cleaned);
            String scheme = uri.getScheme();
            if (scheme != null) {
                String lowerScheme = scheme.toLowerCase(Locale.US);
                if (!"http".equals(lowerScheme) && !"https".equals(lowerScheme)
                        && !"ws".equals(lowerScheme) && !"wss".equals(lowerScheme)) {
                    return "";
                }
            }
            String host = uri.getHost();
            String path = uri.getRawPath();
            String safePath = (path != null && !path.isEmpty()) ? path : "/";
            if (host != null && !host.isEmpty()) {
                return capLength(host.toLowerCase(Locale.US) + safePath, 200);
            }
            if (cleaned.startsWith("/")) {
                return capLength(safePath, 200);
            }
            return "";
        } catch (Exception ignored) {
            if (cleaned.startsWith("/")) {
                return capLength(cleaned, 200);
            }
            return "";
        }
    }

    @NonNull
    static String sanitizeHeaderValue(@Nullable String rawValue) {
        if (rawValue == null) return "";
        String cleaned = stripControlChars(rawValue).trim();
        if (cleaned.isEmpty()) return "";
        return sanitizeDiagnosticText(cleaned, "", 128);
    }

    @NonNull
    private static String sanitizeDiagnosticText(
            @Nullable String raw,
            @Nullable String secWebSocketKey,
            int maxLen
    ) {
        if (raw == null) return "";
        String cleaned = stripControlChars(raw).trim();
        if (cleaned.isEmpty()) return "";
        if (secWebSocketKey != null && !secWebSocketKey.isEmpty()) {
            cleaned = cleaned.replace(secWebSocketKey, "[REDACTED]");
        }
        cleaned = SENSITIVE_TEXT_PATTERN.matcher(cleaned).replaceAll("$1=[REDACTED]");
        cleaned = BEARER_PATTERN.matcher(cleaned).replaceAll("Bearer [REDACTED]");
        cleaned = JWT_LIKE_PATTERN.matcher(cleaned).replaceAll("[REDACTED]");
        return capLength(cleaned, maxLen);
    }

    @NonNull
    private static String stripControlChars(@NonNull String value) {
        StringBuilder sb = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c >= 0x20 && c != 0x7F) {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    @NonNull
    private static String capLength(@NonNull String value, int maxLen) {
        if (value.length() <= maxLen) return value;
        return value.substring(0, Math.max(0, maxLen - 3)) + "...";
    }

    @NonNull
    static String classifyBody(@Nullable byte[] bodyBytes, @Nullable String contentType) {
        if (bodyBytes == null || bodyBytes.length == 0) {
            return "empty";
        }
        String ctLower = contentType != null ? contentType.toLowerCase(Locale.US) : "";
        String text = new String(bodyBytes, StandardCharsets.UTF_8);
        String trimmed = text.trim();
        String lowerPrefix = trimmed.toLowerCase(Locale.US);

        if (ctLower.contains("text/html")
                || ctLower.contains("application/xhtml+xml")
                || lowerPrefix.startsWith("<!doctype html")
                || lowerPrefix.startsWith("<html")
                || lowerPrefix.startsWith("<head")
                || lowerPrefix.startsWith("<body")
                || lowerPrefix.startsWith("<script")) {
            return "html";
        }

        if (ctLower.contains("application/json")
                || ctLower.contains("+json")
                || ((trimmed.startsWith("{") && trimmed.contains(":"))
                || (trimmed.startsWith("[") && (trimmed.contains("{") || trimmed.endsWith("]"))))) {
            return "json";
        }

        if (ctLower.startsWith("text/") || isMostlyPrintableText(bodyBytes)) {
            return "plain_text";
        }

        return "unknown";
    }

    private static boolean isMostlyPrintableText(@NonNull byte[] bytes) {
        if (bytes.length == 0) return false;
        int printable = 0;
        for (byte b : bytes) {
            int unsigned = b & 0xFF;
            if (unsigned == 0) return false;
            if ((unsigned >= 0x20 && unsigned <= 0x7E)
                    || unsigned == '\r' || unsigned == '\n' || unsigned == '\t'
                    || unsigned >= 0x80) {
                printable++;
            }
        }
        return (printable * 100) / bytes.length >= 85;
    }

    @NonNull
    static String classifyHandshakeResponse(
            int statusCode,
            @Nullable String upgradeHeader,
            @Nullable String connectionHeader,
            @Nullable String acceptHeader,
            @NonNull String expectedAcceptKey,
            @NonNull String bodyKind
    ) {
        if (statusCode == 301 || statusCode == 302 || statusCode == 303
                || statusCode == 307 || statusCode == 308) {
            return "redirect";
        }

        boolean validUpgrade = upgradeHeader != null
                && upgradeHeader.toLowerCase(Locale.US).contains("websocket");
        boolean validConn = connectionHeader != null
                && connectionHeader.toLowerCase(Locale.US).contains("upgrade");

        if (statusCode == 101) {
            if (!validUpgrade || !validConn) {
                return "upgrade_missing";
            }
            if (acceptHeader == null || !expectedAcceptKey.equals(acceptHeader.trim())) {
                return "protocol_rejected";
            }
            return "unknown";
        }

        if (statusCode >= 200 && statusCode < 300) {
            if ("html".equals(bodyKind)) {
                return "edge_html";
            }
            if ("json".equals(bodyKind)) {
                return "api_json";
            }
            if (!validUpgrade || !validConn) {
                return "upgrade_missing";
            }
            return "unknown";
        }

        if (statusCode >= 400 && statusCode < 600) {
            return "protocol_rejected";
        }

        return "unknown";
    }

    @NonNull
    private static String buildSafeRejectionReason(
            int statusCode,
            @NonNull String responseClass,
            @NonNull String bodyKind,
            @NonNull String redirectLocation,
            @NonNull String upgradeHdr,
            @NonNull String connHdr,
            boolean hasAccept,
            @NonNull String secWebSocketKey
    ) {
        String raw;
        if (statusCode == 101) {
            if (!upgradeHdr.toLowerCase(Locale.US).contains("websocket")) {
                raw = "Header Upgrade WebSocket tidak valid atau tidak tersedia.";
            } else if (!connHdr.toLowerCase(Locale.US).contains("upgrade")) {
                raw = "Header Connection Upgrade tidak valid atau tidak tersedia.";
            } else if (!hasAccept) {
                raw = "Header Sec-WebSocket-Accept tidak tersedia.";
            } else {
                raw = "Sec-WebSocket-Accept tidak cocok.";
            }
        } else if ("redirect".equals(responseClass)) {
            raw = redirectLocation.isEmpty()
                    ? "Handshake WebSocket dialihkan server (HTTP " + statusCode + ")."
                    : "Handshake WebSocket dialihkan (HTTP " + statusCode + ") ke " + redirectLocation + ".";
        } else if ("edge_html".equals(responseClass)) {
            raw = "Handshake WebSocket ditolak server (HTTP " + statusCode + "; respons HTML edge/HTTP biasa).";
        } else if ("api_json".equals(responseClass)) {
            raw = "Handshake WebSocket ditolak server (HTTP " + statusCode + "; respons JSON API).";
        } else if ("upgrade_missing".equals(responseClass)) {
            raw = "Handshake WebSocket ditolak server (HTTP " + statusCode + "; header Upgrade/Connection tidak ada, body=" + bodyKind + ").";
        } else if ("protocol_rejected".equals(responseClass)) {
            raw = "Handshake WebSocket ditolak server (HTTP " + statusCode + ").";
        } else {
            raw = "Handshake WebSocket ditolak server (HTTP " + statusCode + ").";
        }
        return sanitizeDiagnosticText(raw, secWebSocketKey, 220);
    }

    @NonNull
    static byte[] readBoundedDiagnosticBody(
            @NonNull InputStream in,
            @NonNull HandshakeResponse hs,
            int maxBytes
    ) {
        if (maxBytes <= 0 || hs.statusCode <= 0 || hs.statusCode == 101
                || hs.statusCode == 204 || hs.statusCode == 304) {
            return new byte[0];
        }

        String transferEncoding = hs.getHeader("transfer-encoding");
        if (transferEncoding != null && transferEncoding.toLowerCase(Locale.US).contains("chunked")) {
            return readBoundedChunkedBody(in, maxBytes);
        }

        String contentLengthRaw = hs.getHeader("content-length");
        if (contentLengthRaw != null && !contentLengthRaw.trim().isEmpty()) {
            try {
                long contentLength = Long.parseLong(contentLengthRaw.trim());
                if (contentLength <= 0L) {
                    return new byte[0];
                }
                int limit = (int) Math.min(contentLength, (long) maxBytes);
                return readUpToBytes(in, limit);
            } catch (NumberFormatException ignored) {
                // Fall back to bounded stream read below.
            }
        }

        return readUpToBytes(in, maxBytes);
    }

    @NonNull
    private static byte[] readUpToBytes(@NonNull InputStream in, int maxBytes) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[Math.min(1024, maxBytes)];
        int total = 0;
        try {
            while (total < maxBytes) {
                int toRead = Math.min(buf.length, maxBytes - total);
                int r = in.read(buf, 0, toRead);
                if (r == -1) break;
                if (r > 0) {
                    out.write(buf, 0, r);
                    total += r;
                }
            }
        } catch (IOException ignored) {
            // Return whatever bounded prefix was read safely before timeout/close.
        }
        return out.toByteArray();
    }

    @NonNull
    private static byte[] readBoundedChunkedBody(@NonNull InputStream in, int maxBytes) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            while (out.size() < maxBytes) {
                String sizeLine = readAsciiLine(in, 256);
                if (sizeLine == null) break;
                int semi = sizeLine.indexOf(';');
                String hex = (semi >= 0 ? sizeLine.substring(0, semi) : sizeLine).trim();
                if (hex.isEmpty()) break;
                int chunkSize;
                try {
                    chunkSize = Integer.parseInt(hex, 16);
                } catch (NumberFormatException e) {
                    break;
                }
                if (chunkSize <= 0) break;

                int remainingChunk = chunkSize;
                byte[] buf = new byte[Math.min(1024, maxBytes)];
                while (remainingChunk > 0 && out.size() < maxBytes) {
                    int want = Math.min(buf.length, Math.min(remainingChunk, maxBytes - out.size()));
                    int r = in.read(buf, 0, want);
                    if (r == -1) {
                        return out.toByteArray();
                    }
                    out.write(buf, 0, r);
                    remainingChunk -= r;
                }
                if (out.size() >= maxBytes) break;

                // Consume trailing CRLF after chunk payload before reading next chunk header.
                int cr = in.read();
                if (cr == '\r') {
                    in.read();
                } else if (cr == -1) {
                    break;
                }
            }
        } catch (IOException ignored) {
            // Keep safely sampled bytes.
        }
        return out.toByteArray();
    }

    @Nullable
    private static String readAsciiLine(@NonNull InputStream in, int maxLineBytes) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        while (line.size() < maxLineBytes) {
            int b = in.read();
            if (b == -1) {
                return line.size() == 0 ? null : new String(line.toByteArray(), StandardCharsets.ISO_8859_1);
            }
            if (b == '\n') break;
            if (b != '\r') line.write(b);
        }
        return new String(line.toByteArray(), StandardCharsets.ISO_8859_1);
    }

    @NonNull
    static HandshakeResponse readHandshakeResponse(@NonNull InputStream in) throws IOException {
        ByteArrayOutputStream headerBytes = new ByteArrayOutputStream();
        int matchState = 0;
        while (headerBytes.size() < MAX_HEADER_BYTES) {
            int b = in.read();
            if (b == -1) break;
            headerBytes.write(b);
            if (matchState == 0 && b == '\r') matchState = 1;
            else if (matchState == 1 && b == '\n') matchState = 2;
            else if (matchState == 2 && b == '\r') matchState = 3;
            else if (matchState == 3 && b == '\n') break;
            else matchState = (b == '\r') ? 1 : 0;
        }

        String raw = new String(headerBytes.toByteArray(), StandardCharsets.ISO_8859_1);
        String[] lines = raw.split("\r\n");
        int statusCode = 0;
        if (lines.length > 0) {
            String[] parts = lines[0].split(" ");
            if (parts.length >= 2) {
                try {
                    statusCode = Integer.parseInt(parts[1].trim());
                } catch (NumberFormatException ignored) {
                }
            }
        }

        Map<String, String> headers = new LinkedHashMap<>();
        for (int i = 1; i < lines.length; i++) {
            int colon = lines[i].indexOf(':');
            if (colon <= 0) continue;
            String name = lines[i].substring(0, colon).trim().toLowerCase(Locale.US);
            if ("set-cookie".equals(name) || "cookie".equals(name) || "authorization".equals(name)) {
                continue;
            }
            String val = lines[i].substring(colon + 1).trim();
            if (("connection".equals(name) || "upgrade".equals(name)) && headers.containsKey(name)) {
                String existing = headers.get(name);
                headers.put(name, existing + ", " + val);
            } else {
                headers.put(name, val);
            }
        }
        return new HandshakeResponse(statusCode, headers);
    }

    @NonNull
    static String computeAcceptKey(@NonNull String key) throws Exception {
        MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
        byte[] hash = sha1.digest((key + WS_MAGIC_GUID).getBytes(StandardCharsets.US_ASCII));
        return encodeBase64(hash);
    }

    private static final char[] BASE64_ALPHABET =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".toCharArray();

    @NonNull
    static String encodeBase64(@NonNull byte[] data) {
        if (data.length == 0) return "";
        StringBuilder out = new StringBuilder(((data.length + 2) / 3) * 4);
        for (int i = 0; i < data.length; i += 3) {
            int b0 = data[i] & 0xFF;
            int b1 = (i + 1 < data.length) ? (data[i + 1] & 0xFF) : 0;
            int b2 = (i + 2 < data.length) ? (data[i + 2] & 0xFF) : 0;
            int triple = (b0 << 16) | (b1 << 8) | b2;
            out.append(BASE64_ALPHABET[(triple >>> 18) & 0x3F]);
            out.append(BASE64_ALPHABET[(triple >>> 12) & 0x3F]);
            out.append(i + 1 < data.length ? BASE64_ALPHABET[(triple >>> 6) & 0x3F] : '=');
            out.append(i + 2 < data.length ? BASE64_ALPHABET[triple & 0x3F] : '=');
        }
        return out.toString();
    }

    private static void closeQuietly(@Nullable SSLSocket socket) {
        if (socket == null) return;
        try {
            socket.close();
        } catch (IOException ignored) {
        }
    }
}
