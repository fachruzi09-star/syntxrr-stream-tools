package com.syntxrr.streamtools;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * TikTokRoomResolver
 *
 * Melakukan resolusi username TikTok -> LIVE room ID melalui endpoint
 * "https://www.tiktok.com/api-live/user/room/" sebagaimana temuan DEX StreamingIn.
 *
 * Memisahkan secara jujur:
 * - input tidak valid
 * - akun tidak ditemukan
 * - akun tidak sedang LIVE
 * - room tidak dapat dibaca (mis. tantangan HTML/captcha, HTTP 403/429, status tak dikenal)
 * - gangguan jaringan
 *
 * Tidak pernah mengambil cookie sesi dari aplikasi TikTok lain dan tidak pernah mencetak
 * cookie ke log.
 */
public final class TikTokRoomResolver {

    public static final String ROOM_LOOKUP_ENDPOINT = "https://www.tiktok.com/api-live/user/room/";
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 12_000;
    private static final int MAX_BODY_BYTES = 2 * 1024 * 1024;
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[A-Za-z0-9._]{1,64}$");

    public enum Status {
        INVALID_INPUT,
        RESOLVED_LIVE,
        NOT_LIVE,
        ACCOUNT_NOT_FOUND,
        ROOM_UNREADABLE,
        NETWORK_ERROR
    }

    public static final class Result {
        @NonNull
        public final Status status;
        @NonNull
        public final String normalizedUsername;
        @NonNull
        public final String roomId;
        @NonNull
        public final String roomTitle;
        @Nullable
        public final Integer liveRoomStatus;
        public final int httpStatus;
        @NonNull
        public final String message;
        @NonNull
        public final Map<String, String> sessionCookies;

        public Result(
                @NonNull Status status,
                @NonNull String normalizedUsername,
                @NonNull String roomId,
                @NonNull String roomTitle,
                @Nullable Integer liveRoomStatus,
                int httpStatus,
                @NonNull String message,
                @Nullable Map<String, String> sessionCookies
        ) {
            this.status = status;
            this.normalizedUsername = normalizedUsername;
            this.roomId = roomId;
            this.roomTitle = roomTitle;
            this.liveRoomStatus = liveRoomStatus;
            this.httpStatus = httpStatus;
            this.message = message;
            this.sessionCookies = sessionCookies != null
                    ? Collections.unmodifiableMap(new LinkedHashMap<>(sessionCookies))
                    : Collections.emptyMap();
        }
    }

    private TikTokRoomResolver() {}

    /**
     * Normalisasi username dengan atau tanpa awalan "@".
     * Mengembalikan string kosong jika format tidak valid.
     */
    @NonNull
    public static String normalizeUsername(@Nullable String rawUsername) {
        if (rawUsername == null) return "";
        String cleaned = rawUsername.trim();
        while (cleaned.startsWith("@")) {
            cleaned = cleaned.substring(1).trim();
        }
        if (cleaned.isEmpty() || !USERNAME_PATTERN.matcher(cleaned).matches()) {
            return "";
        }
        return cleaned;
    }

    /**
     * Parsing atribut Set-Cookie dari respons HTTP ke map name -> value (per-sesi di memori saja).
     */
    @NonNull
    public static Map<String, String> parseSetCookieHeaders(@Nullable Map<String, List<String>> headers) {
        Map<String, String> cookies = new LinkedHashMap<>();
        if (headers == null || headers.isEmpty()) {
            return cookies;
        }
        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            String key = entry.getKey();
            if (key == null || !"set-cookie".equalsIgnoreCase(key)) continue;
            List<String> values = entry.getValue();
            if (values == null) continue;
            for (String rawCookie : values) {
                parseSingleSetCookie(rawCookie, cookies);
            }
        }
        return cookies;
    }

    public static void parseSingleSetCookie(@Nullable String headerValue, @NonNull Map<String, String> out) {
        if (headerValue == null || headerValue.isEmpty()) return;
        int semiIdx = headerValue.indexOf(';');
        String pair = semiIdx >= 0 ? headerValue.substring(0, semiIdx) : headerValue;
        int eqIdx = pair.indexOf('=');
        if (eqIdx <= 0) return;
        String name = pair.substring(0, eqIdx).trim();
        String value = pair.substring(eqIdx + 1).trim();
        if (!name.isEmpty() && !value.isEmpty()) {
            out.put(name, value);
        }
    }

    @NonNull
    public static String formatCookieHeader(@Nullable Map<String, String> cookies) {
        if (cookies == null || cookies.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : cookies.entrySet()) {
            if (entry.getKey() == null || entry.getValue() == null) continue;
            if (sb.length() > 0) sb.append("; ");
            sb.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return sb.toString();
    }

    @NonNull
    public static Result resolve(@Nullable String rawUsername) {
        String normalized = normalizeUsername(rawUsername);
        if (normalized.isEmpty()) {
            return new Result(
                    Status.INVALID_INPUT,
                    "",
                    "",
                    "",
                    null,
                    0,
                    "Username TikTok tidak valid atau kosong.",
                    null
            );
        }

        HttpURLConnection conn = null;
        try {
            String encodedUser = URLEncoder.encode(normalized, StandardCharsets.UTF_8.name());
            String urlStr = ROOM_LOOKUP_ENDPOINT + "?uniqueId=" + encodedUser + "&sourceType=54";
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("Accept", "application/json, text/plain, */*");
            conn.setRequestProperty("User-Agent", "SYNTXRR-Companion/1.0 (Android)");

            int httpCode = conn.getResponseCode();
            Map<String, String> cookies = parseSetCookieHeaders(conn.getHeaderFields());
            InputStream stream = httpCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String body = stream != null ? readBoundedUtf8(stream, MAX_BODY_BYTES) : "";

            if (httpCode == 404) {
                return new Result(
                        Status.ACCOUNT_NOT_FOUND,
                        normalized,
                        "",
                        "",
                        null,
                        httpCode,
                        "Akun @" + normalized + " tidak ditemukan di TikTok (HTTP 404).",
                        cookies
                );
            }

            if (httpCode == 401 || httpCode == 403 || httpCode == 429) {
                String reason = httpCode == 429
                        ? "Permintaan lookup room dibatasi sementara oleh TikTok (HTTP 429)."
                        : "TikTok menolak lookup room langsung (HTTP " + httpCode + ").";
                return new Result(
                        Status.ROOM_UNREADABLE,
                        normalized,
                        "",
                        "",
                        null,
                        httpCode,
                        reason,
                        cookies
                );
            }

            if (httpCode < 200 || httpCode >= 300) {
                return new Result(
                        Status.NETWORK_ERROR,
                        normalized,
                        "",
                        "",
                        null,
                        httpCode,
                        "Gagal menghubungi API room TikTok (HTTP " + httpCode + ").",
                        cookies
                );
            }

            String trimmed = body != null ? body.trim() : "";
            if (trimmed.isEmpty() || !trimmed.startsWith("{")) {
                return new Result(
                        Status.ROOM_UNREADABLE,
                        normalized,
                        "",
                        "",
                        null,
                        httpCode,
                        "Respons lookup room TikTok bukan JSON valid (kemungkinan tantangan verifikasi).",
                        cookies
                );
            }

            JSONObject root = new JSONObject(trimmed);
            int apiStatus = root.has("statusCode")
                    ? root.optInt("statusCode", 0)
                    : root.optInt("status_code", 0);
            JSONObject data = root.optJSONObject("data");
            JSONObject user = data != null ? data.optJSONObject("user") : null;
            JSONObject liveRoom = data != null ? data.optJSONObject("liveRoom") : null;

            if (data == null || (user == null && liveRoom == null)) {
                String msgLower = root.optString("message", "").toLowerCase(Locale.US);
                if (apiStatus == 10202 || msgLower.contains("not found") || msgLower.contains("doesn't exist")) {
                    return new Result(
                            Status.ACCOUNT_NOT_FOUND,
                            normalized,
                            "",
                            "",
                            null,
                            httpCode,
                            "Akun @" + normalized + " tidak ditemukan.",
                            cookies
                    );
                }
                return new Result(
                        Status.ROOM_UNREADABLE,
                        normalized,
                        "",
                        "",
                        null,
                        httpCode,
                        "Data room untuk @" + normalized + " tidak dapat dibaca (statusCode=" + apiStatus + ").",
                        cookies
                );
            }

            String roomId = firstNonEmptyRoomId(
                    liveRoom != null ? liveRoom.optString("roomId", "") : "",
                    user != null ? user.optString("roomId", "") : "",
                    data.optString("roomId", ""),
                    data.optString("room_id", "")
            );

            Integer liveRoomStatus = (liveRoom != null && liveRoom.has("status") && !liveRoom.isNull("status"))
                    ? liveRoom.optInt("status")
                    : null;
            String roomTitle = liveRoom != null ? liveRoom.optString("title", "") : "";

            if (roomId.isEmpty() || "0".equals(roomId)) {
                return new Result(
                        Status.NOT_LIVE,
                        normalized,
                        "",
                        roomTitle,
                        liveRoomStatus,
                        httpCode,
                        "@" + normalized + " saat ini tidak sedang LIVE.",
                        cookies
                );
            }

            if (liveRoomStatus != null && liveRoomStatus == 4) {
                return new Result(
                        Status.NOT_LIVE,
                        normalized,
                        roomId,
                        roomTitle,
                        liveRoomStatus,
                        httpCode,
                        "@" + normalized + " saat ini tidak sedang LIVE (status=4).",
                        cookies
                );
            }

            // Jangan menebak arti status room lain yang belum terverifikasi (hanya 2 = aktif atau tidak disediakan).
            if (liveRoomStatus != null && liveRoomStatus != 2) {
                return new Result(
                        Status.ROOM_UNREADABLE,
                        normalized,
                        roomId,
                        roomTitle,
                        liveRoomStatus,
                        httpCode,
                        "Status room TikTok tidak terverifikasi (status=" + liveRoomStatus + ").",
                        cookies
                );
            }

            return new Result(
                    Status.RESOLVED_LIVE,
                    normalized,
                    roomId,
                    roomTitle,
                    liveRoomStatus,
                    httpCode,
                    "Room LIVE ditemukan untuk @" + normalized + " (room_id=" + roomId + ").",
                    cookies
            );
        } catch (IOException e) {
            return new Result(
                    Status.NETWORK_ERROR,
                    normalized,
                    "",
                    "",
                    null,
                    0,
                    "Gangguan jaringan saat resolve room TikTok: " + safeErrorMessage(e),
                    null
            );
        } catch (Exception e) {
            return new Result(
                    Status.ROOM_UNREADABLE,
                    normalized,
                    "",
                    "",
                    null,
                    0,
                    "Gagal membaca respons room TikTok: " + safeErrorMessage(e),
                    null
            );
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    @NonNull
    private static String firstNonEmptyRoomId(String... candidates) {
        if (candidates == null) return "";
        for (String c : candidates) {
            if (c == null) continue;
            String t = c.trim();
            if (t.isEmpty() || "null".equalsIgnoreCase(t) || "0".equals(t)) continue;
            return t;
        }
        return "";
    }

    @NonNull
    private static String readBoundedUtf8(@NonNull InputStream in, int maxBytes) throws IOException {
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
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    @NonNull
    private static String safeErrorMessage(@NonNull Throwable t) {
        String msg = t.getMessage();
        return (msg != null && !msg.trim().isEmpty()) ? msg.trim() : t.getClass().getSimpleName();
    }
}
