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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * TikTokRoomResolver
 *
 * Melakukan resolusi username TikTok -> LIVE room ID melalui endpoint publik
 * "https://www.tiktok.com/api-live/user/room/" dengan cadangan halaman publik
 * "https://www.tiktok.com/@<username>/live". Direct WebSocket memakai cookie perangkat
 * anonim yang diambil secara opportunistic; jalur utama masuk room melalui im_enter_room
 * tanpa bergantung pada endpoint /webcast/im/fetch yang ditandatangani runtime browser.
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
    public static final String LIVE_PAGE_BASE_URL = "https://www.tiktok.com/@";
    public static final String WEBCAST_IM_FETCH_ENDPOINT = "https://webcast.tiktok.com/webcast/im/fetch/";
    public static final String MOBILE_USER_AGENT =
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 12_000;
    private static final int MAX_BODY_BYTES = 2 * 1024 * 1024;
    private static final int MAX_HTML_BYTES = 3 * 1024 * 1024;
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[A-Za-z0-9._]{1,64}$");
    private static final Pattern SIGI_STATE_PATTERN = Pattern.compile(
            "<script[^>]*id=[\"']SIGI_STATE[\"'][^>]*>(.*?)</script>",
            Pattern.DOTALL | Pattern.CASE_INSENSITIVE
    );
    private static final Pattern UNIVERSAL_DATA_PATTERN = Pattern.compile(
            "<script[^>]*id=[\"']__UNIVERSAL_DATA_FOR_REHYDRATION__[\"'][^>]*>(.*?)</script>",
            Pattern.DOTALL | Pattern.CASE_INSENSITIVE
    );
    private static final Pattern ROOM_ID_PATTERN = Pattern.compile("\"roomId\"\\s*:\\s*\"?(\\d+)\"?");

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

    public static final class InitialFetchResult {
        public final boolean ok;
        public final int httpStatus;
        @NonNull
        public final String message;
        @Nullable
        public final TikTokWebcastDecoder.DecodedResponse decoded;
        @NonNull
        public final Map<String, String> mergedCookies;
        public final long rttMs;

        public InitialFetchResult(
                boolean ok,
                int httpStatus,
                @NonNull String message,
                @Nullable TikTokWebcastDecoder.DecodedResponse decoded,
                @Nullable Map<String, String> mergedCookies,
                long rttMs
        ) {
            this.ok = ok;
            this.httpStatus = httpStatus;
            this.message = message;
            this.decoded = decoded;
            this.mergedCookies = mergedCookies != null
                    ? Collections.unmodifiableMap(new LinkedHashMap<>(mergedCookies))
                    : Collections.emptyMap();
            this.rttMs = rttMs;
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

    private static void applyBrowserHeaders(
            @NonNull HttpURLConnection conn,
            @NonNull String acceptHeader,
            @Nullable Map<String, String> cookies
    ) {
        conn.setRequestProperty("Accept", acceptHeader);
        conn.setRequestProperty("Accept-Language", "en-US,en;q=0.9,id;q=0.8");
        conn.setRequestProperty("User-Agent", MOBILE_USER_AGENT);
        conn.setRequestProperty("Origin", "https://www.tiktok.com");
        conn.setRequestProperty("Referer", "https://www.tiktok.com/");
        String cookieHeader = formatCookieHeader(cookies);
        if (!cookieHeader.isEmpty()) {
            conn.setRequestProperty("Cookie", cookieHeader);
        }
    }

    /**
     * TikTok issues an anonymous device cookie (commonly ttwid) from the public homepage.
     * The cookie is used only in memory for this connection attempt; no TikTok-app session
     * cookies are read or persisted.
     */
    @NonNull
    private static Map<String, String> fetchAnonymousDeviceCookies() {
        Map<String, String> cookies = new LinkedHashMap<>();
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL("https://www.tiktok.com/").openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setInstanceFollowRedirects(true);
            applyBrowserHeaders(conn, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", null);
            int httpCode = conn.getResponseCode();
            cookies.putAll(parseSetCookieHeaders(conn.getHeaderFields()));
            InputStream stream = httpCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (stream != null) {
                readBoundedUtf8(stream, 64 * 1024);
                stream.close();
            }
        } catch (Exception ignored) {
            // Cookie warm-up is opportunistic; room resolution still proceeds without it.
        } finally {
            if (conn != null) conn.disconnect();
        }
        return cookies;
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

        Map<String, String> cookies = new LinkedHashMap<>(fetchAnonymousDeviceCookies());
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
            applyBrowserHeaders(conn, "application/json, text/plain, */*", cookies);

            int httpCode = conn.getResponseCode();
            cookies.putAll(parseSetCookieHeaders(conn.getHeaderFields()));
            InputStream stream = httpCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String body = stream != null ? readBoundedUtf8(stream, MAX_BODY_BYTES) : "";

            if (httpCode == 404) {
                // Do not classify from the API route alone: TikTok edge routes can be
                // unavailable independently of the public profile/LIVE page.
                Result htmlFallback = resolveViaLiveHtmlPage(normalized, cookies);
                if (htmlFallback != null) return htmlFallback;
                return new Result(
                        Status.ROOM_UNREADABLE,
                        normalized,
                        "",
                        "",
                        null,
                        httpCode,
                        "Endpoint lookup TikTok mengembalikan HTTP 404 dan halaman LIVE publik belum dapat diverifikasi.",
                        cookies
                );
            }

            if (httpCode == 401 || httpCode == 403 || httpCode == 429) {
                Result htmlFallback = resolveViaLiveHtmlPage(normalized, cookies);
                if (htmlFallback != null) {
                    return htmlFallback;
                }
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
                Result htmlFallback = resolveViaLiveHtmlPage(normalized, cookies);
                if (htmlFallback != null) {
                    return htmlFallback;
                }
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
                Result htmlFallback = resolveViaLiveHtmlPage(normalized, cookies);
                if (htmlFallback != null) {
                    return htmlFallback;
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
                // api-live can return a valid user object while its liveRoom payload is stale or
                // incomplete. Check the public LIVE page before deciding the room state.
                Result htmlFallback = resolveViaLiveHtmlPage(normalized, cookies);
                if (htmlFallback != null && htmlFallback.status == Status.RESOLVED_LIVE) {
                    return htmlFallback;
                }
                if (liveRoomStatus != null && liveRoomStatus == 4) {
                    return new Result(
                            Status.NOT_LIVE,
                            normalized,
                            "",
                            roomTitle,
                            liveRoomStatus,
                            httpCode,
                            "@" + normalized + " saat ini tidak sedang LIVE (status=4; halaman publik tidak menunjukkan room aktif).",
                            cookies
                    );
                }
                return new Result(
                        Status.ROOM_UNREADABLE,
                        normalized,
                        "",
                        roomTitle,
                        liveRoomStatus,
                        httpCode,
                        "TikTok mengembalikan profil tanpa roomId yang dapat diverifikasi; status OFFLINE belum dapat dipastikan.",
                        cookies
                );
            }

            if (liveRoomStatus != null && liveRoomStatus == 4) {
                Result htmlFallback = resolveViaLiveHtmlPage(normalized, cookies);
                if (htmlFallback != null && htmlFallback.status == Status.RESOLVED_LIVE) {
                    return htmlFallback;
                }
                return new Result(
                        Status.NOT_LIVE,
                        normalized,
                        roomId,
                        roomTitle,
                        liveRoomStatus,
                        httpCode,
                        "@" + normalized + " saat ini tidak sedang LIVE (status=4 dan halaman LIVE publik tidak menunjukkan room aktif).",
                        cookies
                );
            }

            // Status yang tidak dikenal tidak boleh disamakan dengan OFFLINE. Coba bukti
            // independen dari halaman LIVE publik; jika tetap tidak jelas, laporkan unreadable.
            if (liveRoomStatus != null && liveRoomStatus != 2) {
                Result htmlFallback = resolveViaLiveHtmlPage(normalized, cookies);
                if (htmlFallback != null && htmlFallback.status == Status.RESOLVED_LIVE) {
                    return htmlFallback;
                }
                return new Result(
                        Status.ROOM_UNREADABLE,
                        normalized,
                        roomId,
                        roomTitle,
                        liveRoomStatus,
                        httpCode,
                        "Status room TikTok tidak terverifikasi (status=" + liveRoomStatus + "); halaman LIVE publik tidak mengonfirmasi room aktif.",
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
                    cookies
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
                    cookies
            );
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    /**
     * Cadangan resolusi halaman publik https://www.tiktok.com/@<username>/live apabila
     * endpoint JSON api-live/user/room/ dibatasi (401/403/429) atau mengembalikan respons non-JSON.
     */
    @Nullable
    private static Result resolveViaLiveHtmlPage(
            @NonNull String normalized,
            @NonNull Map<String, String> cookies
    ) {
        HttpURLConnection conn = null;
        try {
            String encodedUser = URLEncoder.encode(normalized, StandardCharsets.UTF_8.name());
            URL url = new URL(LIVE_PAGE_BASE_URL + encodedUser + "/live");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setInstanceFollowRedirects(true);
            applyBrowserHeaders(conn, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", cookies);

            int httpCode = conn.getResponseCode();
            cookies.putAll(parseSetCookieHeaders(conn.getHeaderFields()));
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
            if (httpCode < 200 || httpCode >= 300) {
                return null;
            }

            InputStream stream = conn.getInputStream();
            String html = stream != null ? readBoundedUtf8(stream, MAX_HTML_BYTES) : "";
            if (html.isEmpty()) {
                return null;
            }

            // 1. Coba parse SIGI_STATE JSON
            Matcher sigiMatcher = SIGI_STATE_PATTERN.matcher(html);
            if (sigiMatcher.find()) {
                String jsonRaw = sigiMatcher.group(1);
                if (jsonRaw != null && !jsonRaw.trim().isEmpty()) {
                    Result parsed = parseSigiOrUniversalJson(normalized, jsonRaw.trim(), httpCode, cookies);
                    if (parsed != null && parsed.status != Status.ROOM_UNREADABLE) {
                        return parsed;
                    }
                }
            }

            // 2. Coba parse __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON
            Matcher univMatcher = UNIVERSAL_DATA_PATTERN.matcher(html);
            if (univMatcher.find()) {
                String jsonRaw = univMatcher.group(1);
                if (jsonRaw != null && !jsonRaw.trim().isEmpty()) {
                    Result parsed = parseSigiOrUniversalJson(normalized, jsonRaw.trim(), httpCode, cookies);
                    if (parsed != null && parsed.status != Status.ROOM_UNREADABLE) {
                        return parsed;
                    }
                }
            }

            // 3. Cari roomId di dalam blok liveRoomUserInfo / liveRoom
            int liveAnchor = html.indexOf("liveRoomUserInfo");
            if (liveAnchor < 0) liveAnchor = html.indexOf("liveRoom");
            if (liveAnchor >= 0) {
                int end = Math.min(html.length(), liveAnchor + 4096);
                String slice = html.substring(liveAnchor, end);
                Matcher rm = ROOM_ID_PATTERN.matcher(slice);
                if (rm.find()) {
                    String foundRoomId = firstNonEmptyRoomId(rm.group(1));
                    if (!foundRoomId.isEmpty()) {
                        return new Result(
                                Status.RESOLVED_LIVE,
                                normalized,
                                foundRoomId,
                                "",
                                null,
                                httpCode,
                                "Room LIVE ditemukan via halaman publik @" + normalized + " (room_id=" + foundRoomId + ").",
                                cookies
                        );
                    }
                }
            }

            return null;
        } catch (Exception ignored) {
            return null;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    @Nullable
    private static Result parseSigiOrUniversalJson(
            @NonNull String normalized,
            @NonNull String jsonStr,
            int httpCode,
            @NonNull Map<String, String> cookies
    ) {
        try {
            JSONObject root = new JSONObject(jsonStr);
            JSONObject liveRoomObj = null;
            JSONObject userObj = null;

            JSONObject liveRoomSection = root.optJSONObject("LiveRoom");
            if (liveRoomSection != null) {
                JSONObject info = liveRoomSection.optJSONObject("liveRoomUserInfo");
                if (info != null) {
                    userObj = info.optJSONObject("user");
                    liveRoomObj = info.optJSONObject("liveRoom");
                }
            }

            if (liveRoomObj == null) {
                JSONObject defaultScope = root.optJSONObject("__DEFAULT_SCOPE__");
                if (defaultScope != null) {
                    JSONObject liveDetail = defaultScope.optJSONObject("webapp.live-detail");
                    if (liveDetail != null) {
                        JSONObject roomInfo = liveDetail.optJSONObject("roomInfo");
                        if (roomInfo != null) {
                            liveRoomObj = roomInfo;
                            userObj = roomInfo.optJSONObject("anchor");
                        }
                    }
                    if (liveRoomObj == null) {
                        JSONObject userDetail = defaultScope.optJSONObject("webapp.user-detail");
                        JSONObject userInfo = userDetail != null ? userDetail.optJSONObject("userInfo") : null;
                        if (userInfo != null) {
                            userObj = userInfo.optJSONObject("user");
                        }
                    }
                }
            }

            if (liveRoomObj == null && userObj == null) {
                return null;
            }

            String roomId = firstNonEmptyRoomId(
                    liveRoomObj != null ? liveRoomObj.optString("roomId", "") : "",
                    liveRoomObj != null ? liveRoomObj.optString("id", "") : "",
                    userObj != null ? userObj.optString("roomId", "") : ""
            );
            Integer liveStatus = (liveRoomObj != null && liveRoomObj.has("status") && !liveRoomObj.isNull("status"))
                    ? liveRoomObj.optInt("status")
                    : null;
            String title = liveRoomObj != null ? liveRoomObj.optString("title", "") : "";

            if (roomId.isEmpty()) {
                // A user profile without a roomId is not proof that the streamer is offline.
                // Keep the result unreadable so the independent connector fallback can verify it.
                return new Result(
                        Status.ROOM_UNREADABLE,
                        normalized,
                        "",
                        title,
                        liveStatus,
                        httpCode,
                        "Halaman LIVE TikTok tidak memberikan roomId yang dapat diverifikasi.",
                        cookies
                );
            }
            if (liveStatus != null && liveStatus == 4) {
                return new Result(
                        Status.NOT_LIVE,
                        normalized,
                        roomId,
                        title,
                        liveStatus,
                        httpCode,
                        "@" + normalized + " saat ini tidak sedang LIVE (status=4).",
                        cookies
                );
            }
            if (liveStatus != null && liveStatus != 2) {
                return new Result(
                        Status.ROOM_UNREADABLE,
                        normalized,
                        roomId,
                        title,
                        liveStatus,
                        httpCode,
                        "Status room TikTok tidak terverifikasi (status=" + liveStatus + ").",
                        cookies
                );
            }

            return new Result(
                    Status.RESOLVED_LIVE,
                    normalized,
                    roomId,
                    title,
                    liveStatus,
                    httpCode,
                    "Room LIVE ditemukan untuk @" + normalized + " (room_id=" + roomId + ").",
                    cookies
            );
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * Melakukan panggilan awal https://webcast.tiktok.com/webcast/im/fetch/ untuk memperoleh
     * cursor, internalExt, routeParams (imprp/wrss), pushServer, heartbeatDurationMs, dan
     * cookie sesi (seperti ttwid) sebelum membuka koneksi Direct WebSocket.
     */
    @NonNull
    public static InitialFetchResult fetchInitialWebcastResponse(
            @NonNull String roomId,
            @Nullable Map<String, String> existingCookies
    ) {
        String cleanRoomId = roomId.trim();
        Map<String, String> mergedCookies = existingCookies != null
                ? new LinkedHashMap<>(existingCookies)
                : new LinkedHashMap<>();
        if (cleanRoomId.isEmpty()) {
            return new InitialFetchResult(
                    false,
                    0,
                    "room_id kosong saat memanggil webcast/im/fetch.",
                    null,
                    mergedCookies,
                    0L
            );
        }

        HttpURLConnection conn = null;
        long startMs = System.currentTimeMillis();
        try {
            String encodedRoom = URLEncoder.encode(cleanRoomId, StandardCharsets.UTF_8.name());
            StringBuilder urlSb = new StringBuilder(WEBCAST_IM_FETCH_ENDPOINT);
            urlSb.append("?aid=1988");
            urlSb.append("&app_language=en");
            urlSb.append("&app_name=tiktok_web");
            urlSb.append("&browser_language=en");
            urlSb.append("&browser_name=Mozilla");
            urlSb.append("&browser_platform=Linux%20aarch64");
            urlSb.append("&browser_version=5.0");
            urlSb.append("&cookie_enabled=true");
            urlSb.append("&cursor=");
            urlSb.append("&device_platform=web_mobile");
            urlSb.append("&did_rule=3");
            urlSb.append("&fetch_rule=1");
            urlSb.append("&identity=audience");
            urlSb.append("&internal_ext=");
            urlSb.append("&last_rtt=0");
            urlSb.append("&live_id=12");
            urlSb.append("&resp_content_type=protobuf");
            urlSb.append("&room_id=").append(encodedRoom);
            urlSb.append("&screen_height=800");
            urlSb.append("&screen_width=360");
            urlSb.append("&tz_name=UTC");
            urlSb.append("&version_code=180800");

            URL url = new URL(urlSb.toString());
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setInstanceFollowRedirects(true);
            applyBrowserHeaders(
                    conn,
                    "application/x-protobuf, application/octet-stream, */*",
                    mergedCookies
            );

            int httpCode = conn.getResponseCode();
            long rttMs = Math.max(1L, System.currentTimeMillis() - startMs);
            mergedCookies.putAll(parseSetCookieHeaders(conn.getHeaderFields()));

            InputStream stream = httpCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
            byte[] body = stream != null ? readBoundedBytes(stream, MAX_BODY_BYTES) : new byte[0];

            if (httpCode < 200 || httpCode >= 300) {
                return new InitialFetchResult(
                        false,
                        httpCode,
                        "TikTok webcast/im/fetch ditolak server (HTTP " + httpCode + ").",
                        null,
                        mergedCookies,
                        rttMs
                );
            }

            if (body.length == 0) {
                return new InitialFetchResult(
                        false,
                        httpCode,
                        "TikTok webcast/im/fetch mengembalikan respons kosong.",
                        null,
                        mergedCookies,
                        rttMs
                );
            }

            TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeEulerFetchBody(body);
            boolean hasHandshakeParams = !decoded.cursor.isEmpty()
                    || !decoded.internalExt.isEmpty()
                    || !decoded.pushServer.isEmpty()
                    || !decoded.events.isEmpty();

            if (!hasHandshakeParams) {
                return new InitialFetchResult(
                        false,
                        httpCode,
                        "Respons webcast/im/fetch tidak memuat cursor maupun parameter pushServer.",
                        decoded,
                        mergedCookies,
                        rttMs
                );
            }

            return new InitialFetchResult(
                    true,
                    httpCode,
                    "Bootstrap webcast/im/fetch berhasil.",
                    decoded,
                    mergedCookies,
                    rttMs
            );
        } catch (IOException e) {
            return new InitialFetchResult(
                    false,
                    0,
                    "Gangguan jaringan pada webcast/im/fetch: " + safeErrorMessage(e),
                    null,
                    mergedCookies,
                    Math.max(1L, System.currentTimeMillis() - startMs)
            );
        } catch (Exception e) {
            return new InitialFetchResult(
                    false,
                    0,
                    "Gagal memproses respons webcast/im/fetch: " + safeErrorMessage(e),
                    null,
                    mergedCookies,
                    Math.max(1L, System.currentTimeMillis() - startMs)
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
    private static String readBoundedUtf8(@NonNull InputStream in, int maxBytes) throws IOException {
        return new String(readBoundedBytes(in, maxBytes), StandardCharsets.UTF_8);
    }

    @NonNull
    private static String safeErrorMessage(@NonNull Throwable t) {
        String msg = t.getMessage();
        return (msg != null && !msg.trim().isEmpty()) ? msg.trim() : t.getClass().getSimpleName();
    }
}
