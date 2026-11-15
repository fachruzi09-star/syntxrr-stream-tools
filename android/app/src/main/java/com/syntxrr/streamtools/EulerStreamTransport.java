package com.syntxrr.streamtools;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * EulerStreamTransport
 *
 * Transport fallback ke EulerStream ("https://tiktok.eulerstream.com/webcast/fetch")
 * apabila koneksi langsung TikTok ditolak dan fallback diizinkan pengguna.
 *
 * Prinsip keamanan & kejujuran:
 * - Tidak menanam API key di dalam source code; memakai apiKey milik pengguna jika diberikan.
 * - Tidak pernah mencetak apiKey, cookie, atau token ke log Android.
 * - Tidak mengarang response body atau cursor.
 * - Membedakan rate limit (429), signing/auth error (401/403), missing cursor/bad request (400),
 *   timeout, dan error jaringan.
 */
public final class EulerStreamTransport {

    public static final String EULER_FETCH_ENDPOINT = "https://tiktok.eulerstream.com/webcast/fetch";
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 15_000;
    private static final int MAX_BODY_BYTES = 4 * 1024 * 1024;

    public enum FetchStatus {
        OK,
        AUTH_OR_SIGNING_ERROR,
        RATE_LIMITED,
        MISSING_CURSOR_OR_BAD_REQUEST,
        NOT_FOUND,
        TIMEOUT,
        NETWORK_ERROR,
        UNREADABLE_RESPONSE
    }

    public static final class FetchResult {
        @NonNull
        public final FetchStatus status;
        public final int httpStatus;
        @NonNull
        public final String message;
        @Nullable
        public final TikTokWebcastDecoder.DecodedResponse decoded;

        public FetchResult(
                @NonNull FetchStatus status,
                int httpStatus,
                @NonNull String message,
                @Nullable TikTokWebcastDecoder.DecodedResponse decoded
        ) {
            this.status = status;
            this.httpStatus = httpStatus;
            this.message = message;
            this.decoded = decoded;
        }
    }

    private EulerStreamTransport() {}

    @NonNull
    public static String buildFetchUrl(
            @NonNull String roomId,
            @Nullable String cursor,
            @Nullable String internalExt
    ) throws IOException {
        return buildFetchUrl(roomId, null, cursor, internalExt);
    }

    @NonNull
    public static String buildFetchUrl(
            @Nullable String roomId,
            @Nullable String uniqueId,
            @Nullable String cursor,
            @Nullable String internalExt
    ) throws IOException {
        String cleanRoomId = roomId != null ? roomId.trim() : "";
        String cleanUniqueId = uniqueId != null ? uniqueId.trim() : "";
        StringBuilder sb = new StringBuilder(EULER_FETCH_ENDPOINT);
        sb.append("?client=syntxrr");
        if (!cleanRoomId.isEmpty()) {
            sb.append("&room_id=").append(URLEncoder.encode(cleanRoomId, StandardCharsets.UTF_8.name()));
        } else if (!cleanUniqueId.isEmpty()) {
            sb.append("&unique_id=").append(URLEncoder.encode(cleanUniqueId, StandardCharsets.UTF_8.name()));
        }
        if (cursor != null && !cursor.isEmpty()) {
            sb.append("&cursor=").append(URLEncoder.encode(cursor, StandardCharsets.UTF_8.name()));
        }
        if (internalExt != null && !internalExt.isEmpty()) {
            sb.append("&internal_ext=").append(URLEncoder.encode(internalExt, StandardCharsets.UTF_8.name()));
        }
        return sb.toString();
    }

    @NonNull
    public static FetchResult fetch(
            @NonNull String roomId,
            @Nullable String cursor,
            @Nullable String internalExt,
            @Nullable String userApiKey
    ) {
        return fetch(roomId, null, cursor, internalExt, userApiKey);
    }

    @NonNull
    public static FetchResult fetch(
            @Nullable String roomId,
            @Nullable String uniqueId,
            @Nullable String cursor,
            @Nullable String internalExt,
            @Nullable String userApiKey
    ) {
        String cleanRoomId = roomId != null ? roomId.trim() : "";
        String cleanUniqueId = uniqueId != null ? uniqueId.trim() : "";
        if (cleanRoomId.isEmpty() && cleanUniqueId.isEmpty()) {
            return new FetchResult(
                    FetchStatus.MISSING_CURSOR_OR_BAD_REQUEST,
                    400,
                    "room_id dan unique_id kosong saat memanggil EulerStream fetch.",
                    null
            );
        }

        HttpURLConnection conn = null;
        try {
            String urlStr = buildFetchUrl(cleanRoomId, cleanUniqueId, cursor, internalExt);
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setRequestProperty("Accept", "application/x-protobuf, application/octet-stream, application/json");
            conn.setRequestProperty("User-Agent", TikTokRoomResolver.MOBILE_USER_AGENT);

            // Gunakan hanya API key milik pengguna sendiri via header; jangan pernah di-log.
            if (userApiKey != null && !userApiKey.trim().isEmpty()) {
                conn.setRequestProperty("x-api-key", userApiKey.trim());
            }

            int httpCode = conn.getResponseCode();
            InputStream stream = httpCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
            byte[] body = stream != null ? readBoundedBytes(stream, MAX_BODY_BYTES) : new byte[0];

            if (httpCode == 401 || httpCode == 403) {
                return new FetchResult(
                        FetchStatus.AUTH_OR_SIGNING_ERROR,
                        httpCode,
                        "EulerStream menolak autentikasi/signing (HTTP " + httpCode + "). Periksa EulerStream API key Anda.",
                        null
                );
            }
            if (httpCode == 429) {
                return new FetchResult(
                        FetchStatus.RATE_LIMITED,
                        httpCode,
                        "Batas permintaan EulerStream tercapai (HTTP 429). Coba beberapa saat lagi atau gunakan API key.",
                        null
                );
            }
            if (httpCode == 400) {
                return new FetchResult(
                        FetchStatus.MISSING_CURSOR_OR_BAD_REQUEST,
                        httpCode,
                        "Permintaan EulerStream ditolak karena parameter atau cursor tidak valid (HTTP 400).",
                        null
                );
            }
            if (httpCode == 404) {
                return new FetchResult(
                        FetchStatus.NOT_FOUND,
                        httpCode,
                        "Room tidak ditemukan di EulerStream (HTTP 404).",
                        null
                );
            }
            if (httpCode < 200 || httpCode >= 300) {
                return new FetchResult(
                        FetchStatus.NETWORK_ERROR,
                        httpCode,
                        "EulerStream mengembalikan HTTP " + httpCode + ".",
                        null
                );
            }

            if (body.length == 0) {
                return new FetchResult(
                        FetchStatus.UNREADABLE_RESPONSE,
                        httpCode,
                        "EulerStream mengembalikan body kosong.",
                        null
                );
            }

            TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeEulerFetchBody(body);
            boolean hasUsableData = !decoded.pushServer.isEmpty()
                    || !decoded.cursor.isEmpty()
                    || !decoded.events.isEmpty();
            if (!hasUsableData) {
                return new FetchResult(
                        FetchStatus.UNREADABLE_RESPONSE,
                        httpCode,
                        "Respons EulerStream tidak berisi pushServer, cursor, maupun event Webcast.",
                        null
                );
            }

            return new FetchResult(
                    FetchStatus.OK,
                    httpCode,
                    "EulerStream fetch berhasil.",
                    decoded
            );
        } catch (SocketTimeoutException e) {
            return new FetchResult(
                    FetchStatus.TIMEOUT,
                    0,
                    "Timeout saat menghubungi EulerStream.",
                    null
            );
        } catch (IOException e) {
            return new FetchResult(
                    FetchStatus.NETWORK_ERROR,
                    0,
                    "Gangguan jaringan ke EulerStream: " + safeErrorMessage(e),
                    null
            );
        } catch (Exception e) {
            return new FetchResult(
                    FetchStatus.UNREADABLE_RESPONSE,
                    0,
                    "Gagal memproses respons EulerStream: " + safeErrorMessage(e),
                    null
            );
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    @NonNull
    private static byte[] readBoundedBytes(@NonNull InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int total = 0;
        int read;
        while ((read = in.read(buf)) != -1) {
            int allowed = Math.min(read, maxBytes - total);
            if (allowed > 0) {
                out.write(buf, 0, allowed);
                total += allowed;
            }
            if (total >= maxBytes) break;
        }
        return out.toByteArray();
    }

    @NonNull
    private static String safeErrorMessage(@NonNull Throwable t) {
        String msg = t.getMessage();
        return (msg != null && !msg.trim().isEmpty()) ? msg.trim() : t.getClass().getSimpleName();
    }
}
