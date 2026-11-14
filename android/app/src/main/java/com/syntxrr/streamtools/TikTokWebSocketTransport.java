package com.syntxrr.streamtools;

import android.util.Base64;

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
 * - Pengiriman frame binary bermask (ACK & heartbeat PushFrame), Ping/Pong, dan pengukuran last_rtt.
 * - Penutupan koneksi bersih tanpa kebocoran thread atau socket.
 */
public final class TikTokWebSocketTransport {

    public static final String DIRECT_WS_BASE_URL =
            "wss://webcast-ws.tiktok.com/webcast/im/ws_proxy/ws_reuse_supplement/";

    private static final String WS_MAGIC_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private static final int CONNECT_TIMEOUT_MS = 12_000;
    private static final int READ_TIMEOUT_MS = 35_000;
    private static final int MAX_HEADER_BYTES = 32 * 1024;
    private static final int MAX_FRAME_BYTES = 4 * 1024 * 1024;

    public interface Listener {
        void onConnected(int httpStatus);
        void onBinaryFrame(@NonNull byte[] payload);
        void onTextFrame(@NonNull String text);
        void onHandshakeRejected(int httpStatus, @NonNull String reason);
        void onClosed(int code, @NonNull String reason, boolean byRemote);
        void onError(@NonNull String reason);
    }

    private final SecureRandom mRandom = new SecureRandom();
    private final AtomicBoolean mClosed = new AtomicBoolean(false);
    private final AtomicBoolean mOpen = new AtomicBoolean(false);
    private final AtomicLong mLastPingSentMs = new AtomicLong(0L);
    private final AtomicLong mLastRttMs = new AtomicLong(0L);
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
            char sep = baseUrl.indexOf('?') >= 0 ? '&' : '?';

            Map<String, String> params = new LinkedHashMap<>();
            if (routeParams != null) {
                for (Map.Entry<String, String> e : routeParams.entrySet()) {
                    if (e.getKey() != null && !e.getKey().isEmpty() && e.getValue() != null) {
                        params.put(e.getKey(), e.getValue());
                    }
                }
            }
            params.put("room_id", roomId);
            params.put("ws_direct", wsDirect ? "1" : "0");
            params.put("resp_content_type", "protobuf");
            params.put("heartbeat_duration", String.valueOf(Math.max(5_000L, heartbeatDurationMs)));
            if (clientEnter) {
                params.put("client_enter", "1");
            }
            if (lastRttMs > 0L) {
                params.put("last_rtt", String.valueOf(lastRttMs));
            }
            if (cursor != null && !cursor.isEmpty()) {
                params.put("cursor", cursor);
            }
            if (internalExt != null && !internalExt.isEmpty()) {
                params.put("internal_ext", internalExt);
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
        if (mClosed.get()) return;

        Thread connectThread = new Thread(() -> {
            SSLSocket socket = null;
            try {
                URI uri = URI.create(wsUrl);
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.US) : "";
                if (!"wss".equals(scheme) && !"https".equals(scheme)) {
                    listener.onHandshakeRejected(0, "Skema URL WebSocket tidak didukung: " + scheme);
                    return;
                }
                String host = uri.getHost();
                if (host == null || host.isEmpty()) {
                    listener.onHandshakeRejected(0, "Host URL WebSocket kosong.");
                    return;
                }
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
                String secWebSocketKey = Base64.encodeToString(keyBytes, Base64.NO_WRAP);

                OutputStream out = socket.getOutputStream();
                BufferedInputStream in = new BufferedInputStream(socket.getInputStream(), 16 * 1024);

                StringBuilder req = new StringBuilder();
                req.append("GET ").append(pathAndQuery).append(" HTTP/1.1\r\n");
                req.append("Host: ").append(host).append(port != 443 ? ":" + port : "").append("\r\n");
                req.append("Upgrade: websocket\r\n");
                req.append("Connection: Upgrade\r\n");
                req.append("Sec-WebSocket-Key: ").append(secWebSocketKey).append("\r\n");
                req.append("Sec-WebSocket-Version: 13\r\n");
                req.append("User-Agent: SYNTXRR-Companion/1.0 (Android)\r\n");
                String cookieHeader = TikTokRoomResolver.formatCookieHeader(sessionCookies);
                if (!cookieHeader.isEmpty()) {
                    req.append("Cookie: ").append(cookieHeader).append("\r\n");
                }
                req.append("\r\n");

                out.write(req.toString().getBytes(StandardCharsets.US_ASCII));
                out.flush();

                HandshakeResponse hs = readHandshakeResponse(in);
                if (hs.statusCode != 101) {
                    closeQuietly(socket);
                    listener.onHandshakeRejected(
                            hs.statusCode,
                            "Handshake WebSocket ditolak server (HTTP " + hs.statusCode + ")."
                    );
                    return;
                }

                String upgradeHdr = hs.getHeader("upgrade");
                String connHdr = hs.getHeader("connection");
                String acceptHdr = hs.getHeader("sec-websocket-accept");

                if (upgradeHdr == null || !upgradeHdr.toLowerCase(Locale.US).contains("websocket")) {
                    closeQuietly(socket);
                    listener.onHandshakeRejected(hs.statusCode, "Header Upgrade WebSocket tidak valid.");
                    return;
                }
                if (connHdr == null || !connHdr.toLowerCase(Locale.US).contains("upgrade")) {
                    closeQuietly(socket);
                    listener.onHandshakeRejected(hs.statusCode, "Header Connection Upgrade tidak valid.");
                    return;
                }
                String expectedAccept = computeAcceptKey(secWebSocketKey);
                if (acceptHdr == null || !expectedAccept.equals(acceptHdr.trim())) {
                    closeQuietly(socket);
                    listener.onHandshakeRejected(hs.statusCode, "Sec-WebSocket-Accept tidak cocok.");
                    return;
                }

                synchronized (mWriteLock) {
                    mOutput = out;
                }
                mOpen.set(true);
                startHeartbeat(heartbeatDurationMs);
                listener.onConnected(hs.statusCode);

                readFrameLoop(in, listener);
            } catch (Exception e) {
                if (!mClosed.get()) {
                    String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                    if (!mOpen.get()) {
                        listener.onHandshakeRejected(0, "Gagal terhubung WebSocket: " + msg);
                    } else {
                        listener.onError("Koneksi WebSocket terputus: " + msg);
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

    private void startHeartbeat(long heartbeatDurationMs) {
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
                writeFrame(0x2, TikTokWebcastDecoder.encodePushFrameHeartbeat());
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
            if (out == null || mClosed.get()) return false;
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

    private static final class HandshakeResponse {
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
    private static HandshakeResponse readHandshakeResponse(@NonNull InputStream in) throws IOException {
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
            String val = lines[i].substring(colon + 1).trim();
            headers.put(name, val);
        }
        return new HandshakeResponse(statusCode, headers);
    }

    @NonNull
    private static String computeAcceptKey(@NonNull String key) throws Exception {
        MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
        byte[] hash = sha1.digest((key + WS_MAGIC_GUID).getBytes(StandardCharsets.US_ASCII));
        return Base64.encodeToString(hash, Base64.NO_WRAP);
    }

    private static void closeQuietly(@Nullable SSLSocket socket) {
        if (socket == null) return;
        try {
            socket.close();
        } catch (IOException ignored) {
        }
    }
}
