package com.syntxrr.streamtools;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Native URL builder for the current EulerStream WebSocket API.
 *
 * EulerStream's current endpoint is wss://ws.eulerstream.com. It streams typed JSON
 * event envelopes by default; raw protobuf mode is intentionally disabled because
 * the app consumes normalized event objects in TikTokLiveConnector.
 *
 * The current Euler WebSocket endpoint requires exactly one authentication credential
 * (API key or JWT). Credentials are never logged.
 */
public final class EulerStreamTransport {

    public static final String EULER_WS_ENDPOINT = "wss://ws.eulerstream.com/";

    private EulerStreamTransport() {}

    @NonNull
    public static String buildWebSocketUrl(
            @NonNull String rawUniqueId,
            @Nullable String userApiKey
    ) throws Exception {
        return buildWebSocketUrl(rawUniqueId, userApiKey, null);
    }

    @NonNull
    public static String buildWebSocketUrl(
            @NonNull String rawUniqueId,
            @Nullable String userApiKey,
            @Nullable String userJwtKey
    ) throws Exception {
        String uniqueId = rawUniqueId.trim();
        while (uniqueId.startsWith("@")) {
            uniqueId = uniqueId.substring(1).trim();
        }
        if (uniqueId.isEmpty()) {
            throw new IllegalArgumentException("Username TikTok kosong untuk koneksi EulerStream.");
        }
        String apiKey = userApiKey != null ? userApiKey.trim() : "";
        String jwtKey = userJwtKey != null ? userJwtKey.trim() : "";
        if (apiKey.isEmpty() && jwtKey.isEmpty()) {
            throw new IllegalArgumentException("EulerStream membutuhkan API key atau JWT; koneksi tanpa autentikasi tidak didukung.");
        }
        if (!apiKey.isEmpty() && !jwtKey.isEmpty()) {
            throw new IllegalArgumentException("EulerStream memerlukan tepat satu kredensial: apiKey atau jwtKey, bukan keduanya.");
        }

        StringBuilder url = new StringBuilder(EULER_WS_ENDPOINT);
        url.append("?uniqueId=")
                .append(URLEncoder.encode(uniqueId, StandardCharsets.UTF_8.name()));
        if (!apiKey.isEmpty()) {
            url.append("&apiKey=")
                    .append(URLEncoder.encode(apiKey, StandardCharsets.UTF_8.name()));
        } else {
            url.append("&jwtKey=")
                    .append(URLEncoder.encode(jwtKey, StandardCharsets.UTF_8.name()));
        }
        url.append("&schemaVersion=v1");

        // Match the official SDK's WebSocketOptions feature-flattening contract.
        appendFlag(url, "features.bundleEvents", "true");
        appendFlag(url, "features.rawMessages", "false");
        appendFlag(url, "features.normalizeUniqueId", "true");
        appendFlag(url, "features.syntheticPresence", "true");
        return url.toString();
    }

    private static void appendFlag(@NonNull StringBuilder url, @NonNull String key, @NonNull String value)
            throws Exception {
        url.append('&')
                .append(URLEncoder.encode(key, StandardCharsets.UTF_8.name()))
                .append('=')
                .append(URLEncoder.encode(value, StandardCharsets.UTF_8.name()));
    }
}
