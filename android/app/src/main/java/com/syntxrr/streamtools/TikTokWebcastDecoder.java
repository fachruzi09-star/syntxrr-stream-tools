package com.syntxrr.streamtools;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPInputStream;

/**
 * TikTokWebcastDecoder
 *
 * Dekoder biner Protobuf wire-format dan GZIP murni Java (tanpa dependensi eksternal)
 * untuk frame Webcast TikTok LIVE dan frame WebSocket EulerStream ketika mode raw protobuf aktif.
 *
 * Catatan protokol:
 * - Mendukung outer PushFrame (seqId, logId, headers, payloadEncoding, payloadType, payload).
 * - Mendukung dekompresi GZIP otomatis berdasarkan header, payloadEncoding, maupun magic bytes 0x1f 0x8b.
 * - Mendukung inner Response (messagesList, cursor, fetchInterval, internalExt, routeParams,
 *   heartbeatDuration, needAck, pushServer).
 * - Mendukung encoding frame ACK & Heartbeat PushFrame untuk transport WebSocket.
 * - Payload pesan yang tidak dikenal atau tidak lengkap diabaikan dengan aman tanpa membuat event palsu.
 */
public final class TikTokWebcastDecoder {

    private static final int MAX_DECOMPRESSED_BYTES = 4 * 1024 * 1024;
    private static final int MAX_TEXT_LEN = 320;
    private static final int MAX_NAME_LEN = 80;

    private TikTokWebcastDecoder() {}

    public static final class DecodedResponse {
        public final long logId;
        @NonNull
        public final String payloadType;
        @NonNull
        public final String cursor;
        public final long fetchIntervalMs;
        @NonNull
        public final String internalExt;
        public final long heartbeatDurationMs;
        public final boolean needAck;
        @NonNull
        public final String pushServer;
        @NonNull
        public final Map<String, String> routeParams;
        @NonNull
        public final List<JSONObject> events;
        public final int ignoredCount;

        public DecodedResponse(
                long logId,
                @NonNull String payloadType,
                @NonNull String cursor,
                long fetchIntervalMs,
                @NonNull String internalExt,
                long heartbeatDurationMs,
                boolean needAck,
                @NonNull String pushServer,
                @NonNull Map<String, String> routeParams,
                @NonNull List<JSONObject> events,
                int ignoredCount
        ) {
            this.logId = logId;
            this.payloadType = payloadType;
            this.cursor = cursor;
            this.fetchIntervalMs = fetchIntervalMs;
            this.internalExt = internalExt;
            this.heartbeatDurationMs = heartbeatDurationMs;
            this.needAck = needAck;
            this.pushServer = pushServer;
            this.routeParams = Collections.unmodifiableMap(routeParams);
            this.events = Collections.unmodifiableList(events);
            this.ignoredCount = ignoredCount;
        }
    }

    private static final class UserInfo {
        @NonNull
        String userId = "";
        @NonNull
        String username = "";
        @NonNull
        String nickname = "";
        @NonNull
        String avatarUrl = "";
    }

    // =========================================================================
    // PUBLIC DECODING ENTRY POINTS
    // =========================================================================

    @NonNull
    public static DecodedResponse decodeWebSocketBinaryFrame(@Nullable byte[] rawBytes) {
        if (rawBytes == null || rawBytes.length == 0) {
            return emptyResponse(0L, "");
        }

        // Parse PushFrame outer wrapper
        long logId = 0L;
        String payloadEncoding = "";
        String payloadType = "";
        String compressHeader = "";
        byte[] payload = null;

        ProtoReader reader = new ProtoReader(rawBytes);
        while (reader.hasNext()) {
            int tag = reader.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            switch (field) {
                case 2: // logId
                    if (wire == 0) logId = reader.readVarint();
                    else reader.skipField(wire);
                    break;
                case 5: // headers repeated HeadersList { 1: key, 2: value }
                    if (wire == 2) {
                        byte[] hBytes = reader.readBytes();
                        String[] kv = parseKeyValuePair(hBytes);
                        if ("compress_type".equalsIgnoreCase(kv[0])) {
                            compressHeader = kv[1];
                        }
                    } else {
                        reader.skipField(wire);
                    }
                    break;
                case 6: // payloadEncoding
                    if (wire == 2) payloadEncoding = reader.readString();
                    else reader.skipField(wire);
                    break;
                case 7: // payloadType
                    if (wire == 2) payloadType = reader.readString();
                    else reader.skipField(wire);
                    break;
                case 8: // payload
                    if (wire == 2) payload = reader.readBytes();
                    else reader.skipField(wire);
                    break;
                default:
                    reader.skipField(wire);
                    break;
            }
        }

        if ("hb".equalsIgnoreCase(payloadType)
                || "ack".equalsIgnoreCase(payloadType)
                || "close".equalsIgnoreCase(payloadType)) {
            return emptyResponse(logId, payloadType);
        }

        if (payload == null || payload.length == 0) {
            return emptyResponse(logId, payloadType);
        }

        boolean shouldGunzip = "gzip".equalsIgnoreCase(compressHeader)
                || "gzip".equalsIgnoreCase(payloadEncoding)
                || isGzipMagic(payload);
        byte[] decodedPayload = shouldGunzip ? gunzipBounded(payload) : payload;
        if (decodedPayload == null || decodedPayload.length == 0) {
            return emptyResponse(logId, payloadType);
        }

        return decodeResponseBytes(decodedPayload, logId, payloadType);
    }

    @NonNull
    /** Legacy raw-body decoder retained for compatibility with archived captures. */
    public static DecodedResponse decodeEulerFetchBody(@Nullable byte[] rawBytes) {
        if (rawBytes == null || rawBytes.length == 0) {
            return emptyResponse(0L, "fetch");
        }
        byte[] data = isGzipMagic(rawBytes) ? gunzipBounded(rawBytes) : rawBytes;
        if (data == null || data.length == 0) {
            return emptyResponse(0L, "fetch");
        }
        // Periksa jika Euler mengembalikan JSON alih-alih Protobuf biner
        int firstNonWs = 0;
        while (firstNonWs < data.length && (data[firstNonWs] == ' ' || data[firstNonWs] == '\n'
                || data[firstNonWs] == '\r' || data[firstNonWs] == '\t')) {
            firstNonWs++;
        }
        if (firstNonWs < data.length && data[firstNonWs] == '{') {
            return decodeEulerJsonResponse(new String(data, StandardCharsets.UTF_8));
        }
        return decodeResponseBytes(data, 0L, "fetch");
    }

    @NonNull
    public static DecodedResponse decodeResponseBytes(
            @NonNull byte[] responseBytes,
            long logId,
            @NonNull String payloadType
    ) {
        String cursor = "";
        long fetchIntervalMs = 0L;
        String internalExt = "";
        long heartbeatDurationMs = 0L;
        boolean needAck = false;
        String pushServer = "";
        Map<String, String> routeParams = new LinkedHashMap<>();
        List<JSONObject> events = new ArrayList<>();
        int ignoredCount = 0;

        ProtoReader reader = new ProtoReader(responseBytes);
        while (reader.hasNext()) {
            int tag = reader.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            switch (field) {
                case 1: // messagesList repeated Message
                    if (wire == 2) {
                        byte[] msgBytes = reader.readBytes();
                        JSONObject decoded = decodeEnvelopeMessage(msgBytes);
                        if (decoded != null) {
                            events.add(decoded);
                        } else {
                            ignoredCount++;
                        }
                    } else {
                        reader.skipField(wire);
                    }
                    break;
                case 2: // cursor
                    if (wire == 2) cursor = reader.readString();
                    else reader.skipField(wire);
                    break;
                case 3: // fetchInterval
                    if (wire == 0) fetchIntervalMs = reader.readVarint();
                    else reader.skipField(wire);
                    break;
                case 5: // internalExt
                    if (wire == 2) internalExt = reader.readString();
                    else reader.skipField(wire);
                    break;
                case 7: // routeParams map<string,string>
                    if (wire == 2) {
                        String[] kv = parseKeyValuePair(reader.readBytes());
                        if (!kv[0].isEmpty()) {
                            routeParams.put(kv[0], kv[1]);
                        }
                    } else {
                        reader.skipField(wire);
                    }
                    break;
                case 8: // heartbeatDuration
                    if (wire == 0) heartbeatDurationMs = reader.readVarint();
                    else reader.skipField(wire);
                    break;
                case 9: // needAck
                    if (wire == 0) needAck = reader.readVarint() != 0L;
                    else reader.skipField(wire);
                    break;
                case 10: // pushServer
                    if (wire == 2) pushServer = reader.readString();
                    else reader.skipField(wire);
                    break;
                default:
                    reader.skipField(wire);
                    break;
            }
        }

        return new DecodedResponse(
                logId,
                payloadType,
                cursor,
                fetchIntervalMs,
                internalExt,
                heartbeatDurationMs,
                needAck,
                pushServer,
                routeParams,
                events,
                ignoredCount
        );
    }

    @NonNull
    private static DecodedResponse decodeEulerJsonResponse(@NonNull String jsonStr) {
        try {
            JSONObject root = new JSONObject(jsonStr);
            JSONObject dataObj = root.optJSONObject("data");
            JSONObject scope = dataObj != null ? dataObj : root;

            String cursor = scope.optString("cursor", "");
            String internalExt = scope.optString("internalExt", scope.optString("internal_ext", ""));
            long fetchInterval = scope.optLong("fetchInterval", scope.optLong("fetch_interval", 0L));
            long heartbeat = scope.optLong("heartbeatDuration", scope.optLong("heartbeat_duration", 0L));
            boolean needAck = scope.optBoolean("needAck", scope.optBoolean("need_ack", false));
            String pushServer = scope.optString("pushServer", scope.optString("wsUrl", scope.optString("websocketUrl", "")));

            Map<String, String> routeParams = new LinkedHashMap<>();
            JSONObject rp = scope.optJSONObject("routeParams");
            if (rp == null) rp = scope.optJSONObject("route_params");
            if (rp != null) {
                java.util.Iterator<String> keys = rp.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    String v = rp.optString(k, "");
                    if (!k.isEmpty()) routeParams.put(k, v);
                }
            }

            List<JSONObject> events = new ArrayList<>();
            JSONArray messages = scope.optJSONArray("messages");
            if (messages == null) messages = scope.optJSONArray("messagesList");
            if (messages != null) {
                for (int i = 0; i < messages.length(); i++) {
                    JSONObject item = messages.optJSONObject(i);
                    if (item != null && !item.optString("method", "").isEmpty()) {
                        events.add(item);
                    }
                }
            }

            return new DecodedResponse(
                    0L,
                    "fetch_json",
                    cursor,
                    fetchInterval,
                    internalExt,
                    heartbeat,
                    needAck,
                    pushServer,
                    routeParams,
                    events,
                    0
            );
        } catch (Exception ignored) {
            return emptyResponse(0L, "fetch_json_error");
        }
    }

    // =========================================================================
    // OUTBOUND PUSHFRAME ENCODERS (ACK & HEARTBEAT)
    // =========================================================================

    @NonNull
    public static byte[] encodePushFrameAck(long logId, @Nullable String internalExt) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (logId > 0L) {
            writeTag(out, 2, 0);
            writeVarint(out, logId);
        }
        writeStringField(out, 6, "pb");
        writeStringField(out, 7, "ack");
        byte[] payloadBytes = internalExt != null
                ? internalExt.getBytes(StandardCharsets.UTF_8)
                : new byte[0];
        writeBytesField(out, 8, payloadBytes);
        return out.toByteArray();
    }

    /**
     * Build the client-to-server room-entry message. Opening a WebSocket is not enough:
     * TikTok expects an im_enter_room PushFrame carrying WebcastImEnterRoomMessage.
     */
    @NonNull
    public static byte[] encodePushFrameEnterRoom(@NonNull String rawRoomId, long enterUniqueId) {
        final long roomId;
        try {
            roomId = Long.parseLong(rawRoomId.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("TikTok room_id bukan angka yang valid.", e);
        }
        if (roomId <= 0L || enterUniqueId <= 0L) {
            throw new IllegalArgumentException("room_id dan enterUniqueId harus lebih besar dari nol.");
        }

        ByteArrayOutputStream enterPayload = new ByteArrayOutputStream();
        writeTag(enterPayload, 1, 0); // room_id
        writeVarint(enterPayload, roomId);
        writeTag(enterPayload, 4, 0); // live_id = 12 (TikTok LIVE audience)
        writeVarint(enterPayload, 12L);
        writeStringField(enterPayload, 5, "audience"); // identity
        writeTag(enterPayload, 8, 0); // enter_unique_id
        writeVarint(enterPayload, enterUniqueId);
        writeStringField(enterPayload, 9, "0"); // filter_welcome_msg

        ByteArrayOutputStream pushFrame = new ByteArrayOutputStream();
        writeStringField(pushFrame, 6, "pb");
        writeStringField(pushFrame, 7, "im_enter_room");
        writeBytesField(pushFrame, 8, enterPayload.toByteArray());
        return pushFrame.toByteArray();
    }

    /**
     * Build the application-level TikTok Webcast heartbeat. The heartbeat payload
     * is a HeartBeatMessage containing the active room_id and a monotonically
     * increasing send_packet_seq_id; an empty `hb` PushFrame is not sufficient.
     */
    @NonNull
    public static byte[] encodePushFrameHeartbeat(@NonNull String rawRoomId, long sequenceId) {
        final long roomId;
        try {
            roomId = Long.parseLong(rawRoomId.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("TikTok heartbeat room_id bukan angka yang valid.", e);
        }
        if (roomId <= 0L || sequenceId <= 0L) {
            throw new IllegalArgumentException("room_id dan heartbeat sequenceId harus lebih besar dari nol.");
        }

        ByteArrayOutputStream heartbeatPayload = new ByteArrayOutputStream();
        writeTag(heartbeatPayload, 1, 0); // room_id
        writeVarint(heartbeatPayload, roomId);
        writeTag(heartbeatPayload, 2, 0); // send_packet_seq_id
        writeVarint(heartbeatPayload, sequenceId);

        ByteArrayOutputStream pushFrame = new ByteArrayOutputStream();
        writeStringField(pushFrame, 6, "pb");
        writeStringField(pushFrame, 7, "hb");
        writeBytesField(pushFrame, 8, heartbeatPayload.toByteArray());
        return pushFrame.toByteArray();
    }

    // =========================================================================
    // MESSAGE ENVELOPE & SPECIFIC WEBCAST MESSAGE DECODERS
    // =========================================================================

    @Nullable
    private static JSONObject decodeEnvelopeMessage(@NonNull byte[] msgBytes) {
        String method = "";
        byte[] payload = null;
        long msgId = 0L;

        ProtoReader reader = new ProtoReader(msgBytes);
        while (reader.hasNext()) {
            int tag = reader.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            switch (field) {
                case 1: // method
                    if (wire == 2) method = reader.readString();
                    else reader.skipField(wire);
                    break;
                case 2: // payload
                    if (wire == 2) payload = reader.readBytes();
                    else reader.skipField(wire);
                    break;
                case 3: // msgId
                    if (wire == 0) msgId = reader.readVarint();
                    else reader.skipField(wire);
                    break;
                default:
                    reader.skipField(wire);
                    break;
            }
        }

        if (method.isEmpty() || payload == null || payload.length == 0) {
            return null;
        }
        return decodeWebcastPayload(method, payload, msgId);
    }

    @Nullable
    public static JSONObject decodeWebcastPayload(
            @NonNull String method,
            @NonNull byte[] payload,
            long envelopeMsgId
    ) {
        try {
            switch (method) {
                case "WebcastChatMessage":
                    return decodeChatMessage(method, payload, envelopeMsgId);
                case "WebcastEmoteChatMessage":
                    return decodeEmoteChatMessage(method, payload, envelopeMsgId);
                case "WebcastGiftMessage":
                    return decodeGiftMessage(method, payload, envelopeMsgId);
                case "WebcastLikeMessage":
                    return decodeLikeMessage(method, payload, envelopeMsgId);
                case "WebcastSocialMessage":
                    return decodeSocialMessage(method, payload, envelopeMsgId);
                case "WebcastMemberMessage":
                    return decodeMemberMessage(method, payload, envelopeMsgId);
                case "WebcastRoomUserSeqMessage":
                    return decodeRoomUserSeqMessage(method, payload, envelopeMsgId);
                case "WebcastControlMessage":
                    return decodeControlMessage(method, payload, envelopeMsgId);
                default:
                    return null;
            }
        } catch (Exception ignored) {
            return null;
        }
    }

    @Nullable
    private static JSONObject decodeChatMessage(String method, byte[] payload, long envelopeMsgId) throws Exception {
        long msgId = envelopeMsgId;
        long createTime = 0L;
        UserInfo user = new UserInfo();
        String content = "";

        ProtoReader r = new ProtoReader(payload);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == 1 && wire == 2) {
                long[] common = parseCommonIds(r.readBytes());
                if (common[0] > 0L) msgId = common[0];
                if (common[1] > 0L) createTime = common[1];
            } else if (field == 2 && wire == 2) {
                user = parseUser(r.readBytes());
            } else if (field == 3 && wire == 2) {
                content = r.readString();
            } else {
                r.skipField(wire);
            }
        }

        content = clampString(content, MAX_TEXT_LEN);
        if (content.isEmpty()) return null;

        JSONObject obj = baseJson(method, msgId, createTime, user);
        obj.put("content", content);
        return obj;
    }

    @Nullable
    private static JSONObject decodeEmoteChatMessage(String method, byte[] payload, long envelopeMsgId) throws Exception {
        long msgId = envelopeMsgId;
        long createTime = 0L;
        UserInfo user = new UserInfo();
        String emoteId = "";

        ProtoReader r = new ProtoReader(payload);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == 1 && wire == 2) {
                long[] common = parseCommonIds(r.readBytes());
                if (common[0] > 0L) msgId = common[0];
                if (common[1] > 0L) createTime = common[1];
            } else if (field == 2 && wire == 2) {
                user = parseUser(r.readBytes());
            } else if (field == 3 && wire == 2) {
                String parsedId = parseFirstStringField(r.readBytes(), 1);
                if (!parsedId.isEmpty()) emoteId = parsedId;
            } else {
                r.skipField(wire);
            }
        }

        if (user.username.isEmpty() && user.nickname.isEmpty() && emoteId.isEmpty()) return null;

        JSONObject obj = baseJson(method, msgId, createTime, user);
        obj.put("content", emoteId.isEmpty() ? "[Emote]" : "[Emote:" + clampString(emoteId, 48) + "]");
        return obj;
    }

    @Nullable
    private static JSONObject decodeGiftMessage(String method, byte[] payload, long envelopeMsgId) throws Exception {
        long msgId = envelopeMsgId;
        long createTime = 0L;
        long giftId = 0L;
        long repeatCount = 1L;
        long groupCount = 1L;
        long repeatEnd = 0L;
        long diamondCount = 0L;
        String giftName = "";
        String giftImage = "";
        UserInfo user = new UserInfo();

        ProtoReader r = new ProtoReader(payload);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            switch (field) {
                case 1:
                    if (wire == 2) {
                        long[] common = parseCommonIds(r.readBytes());
                        if (common[0] > 0L) msgId = common[0];
                        if (common[1] > 0L) createTime = common[1];
                    } else r.skipField(wire);
                    break;
                case 2:
                    if (wire == 0) giftId = r.readVarint();
                    else r.skipField(wire);
                    break;
                case 5:
                    if (wire == 0) repeatCount = Math.max(1L, r.readVarint());
                    else r.skipField(wire);
                    break;
                case 6:
                    if (wire == 0) groupCount = Math.max(1L, r.readVarint());
                    else r.skipField(wire);
                    break;
                case 7:
                    if (wire == 2) user = parseUser(r.readBytes());
                    else r.skipField(wire);
                    break;
                case 9:
                    if (wire == 0) repeatEnd = r.readVarint();
                    else r.skipField(wire);
                    break;
                case 15:
                    if (wire == 2) {
                        ProtoReader gr = new ProtoReader(r.readBytes());
                        while (gr.hasNext()) {
                            int gtag = gr.readTag();
                            if (gtag == 0) break;
                            int gf = gtag >>> 3;
                            int gw = gtag & 0x07;
                            if (gf == 1 && gw == 2) {
                                giftImage = parseImageUrl(gr.readBytes());
                            } else if (gf == 2 && gw == 2 && giftName.isEmpty()) {
                                giftName = gr.readString();
                            } else if (gf == 5 && gw == 0 && giftId == 0L) {
                                giftId = gr.readVarint();
                            } else if (gf == 12 && gw == 0) {
                                diamondCount = gr.readVarint();
                            } else if (gf == 16 && gw == 2) {
                                giftName = gr.readString();
                            } else {
                                gr.skipField(gw);
                            }
                        }
                    } else r.skipField(wire);
                    break;
                default:
                    r.skipField(wire);
                    break;
            }
        }

        if (giftId == 0L && giftName.isEmpty()) return null;

        JSONObject obj = baseJson(method, msgId, createTime, user);
        obj.put("giftId", String.valueOf(giftId));
        obj.put("giftName", clampString(giftName.isEmpty() ? ("Gift #" + giftId) : giftName, MAX_NAME_LEN));
        obj.put("repeatCount", repeatCount);
        obj.put("groupCount", groupCount);
        obj.put("repeatEnd", repeatEnd);
        obj.put("diamondCount", diamondCount);
        if (!giftImage.isEmpty()) obj.put("giftImage", giftImage);
        return obj;
    }

    @Nullable
    private static JSONObject decodeLikeMessage(String method, byte[] payload, long envelopeMsgId) throws Exception {
        long msgId = envelopeMsgId;
        long createTime = 0L;
        long likeCount = 0L;
        long totalLikeCount = 0L;
        UserInfo user = new UserInfo();

        ProtoReader r = new ProtoReader(payload);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == 1 && wire == 2) {
                long[] common = parseCommonIds(r.readBytes());
                if (common[0] > 0L) msgId = common[0];
                if (common[1] > 0L) createTime = common[1];
            } else if (field == 2 && wire == 0) {
                likeCount = r.readVarint();
            } else if (field == 3 && wire == 0) {
                totalLikeCount = r.readVarint();
            } else if (field == 5 && wire == 2) {
                user = parseUser(r.readBytes());
            } else {
                r.skipField(wire);
            }
        }

        if (likeCount <= 0L && totalLikeCount <= 0L) return null;

        JSONObject obj = baseJson(method, msgId, createTime, user);
        obj.put("likeCount", likeCount);
        obj.put("totalLikeCount", totalLikeCount);
        return obj;
    }

    @Nullable
    private static JSONObject decodeSocialMessage(String method, byte[] payload, long envelopeMsgId) throws Exception {
        long msgId = envelopeMsgId;
        long createTime = 0L;
        long action = 0L;
        long followCount = 0L;
        String displayKey = "";
        UserInfo user = new UserInfo();

        ProtoReader r = new ProtoReader(payload);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == 1 && wire == 2) {
                byte[] commonBytes = r.readBytes();
                long[] common = parseCommonIds(commonBytes);
                if (common[0] > 0L) msgId = common[0];
                if (common[1] > 0L) createTime = common[1];
                displayKey = parseCommonDisplayKey(commonBytes);
            } else if (field == 2 && wire == 2) {
                user = parseUser(r.readBytes());
            } else if (field == 3 && wire == 0) {
                action = r.readVarint();
            } else if (field == 6 && wire == 0) {
                followCount = r.readVarint();
            } else {
                r.skipField(wire);
            }
        }

        JSONObject obj = baseJson(method, msgId, createTime, user);
        obj.put("action", action);
        obj.put("followCount", followCount);
        if (!displayKey.isEmpty()) obj.put("displayKey", clampString(displayKey, MAX_NAME_LEN));
        return obj;
    }

    @Nullable
    private static JSONObject decodeMemberMessage(String method, byte[] payload, long envelopeMsgId) throws Exception {
        long msgId = envelopeMsgId;
        long createTime = 0L;
        long memberCount = 0L;
        long action = 0L;
        UserInfo user = new UserInfo();

        ProtoReader r = new ProtoReader(payload);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == 1 && wire == 2) {
                long[] common = parseCommonIds(r.readBytes());
                if (common[0] > 0L) msgId = common[0];
                if (common[1] > 0L) createTime = common[1];
            } else if (field == 2 && wire == 2) {
                user = parseUser(r.readBytes());
            } else if (field == 3 && wire == 0) {
                memberCount = r.readVarint();
            } else if (field == 10 && wire == 0) {
                action = r.readVarint();
            } else {
                r.skipField(wire);
            }
        }

        if (user.username.isEmpty() && user.nickname.isEmpty() && memberCount <= 0L) return null;

        JSONObject obj = baseJson(method, msgId, createTime, user);
        obj.put("memberCount", memberCount);
        obj.put("action", action);
        return obj;
    }

    @Nullable
    private static JSONObject decodeRoomUserSeqMessage(String method, byte[] payload, long envelopeMsgId) throws Exception {
        long msgId = envelopeMsgId;
        long createTime = 0L;
        long totalViewers = -1L;

        ProtoReader r = new ProtoReader(payload);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == 1 && wire == 2) {
                long[] common = parseCommonIds(r.readBytes());
                if (common[0] > 0L) msgId = common[0];
                if (common[1] > 0L) createTime = common[1];
            } else if (field == 3 && wire == 0) {
                totalViewers = r.readVarint();
            } else {
                r.skipField(wire);
            }
        }

        if (totalViewers < 0L) return null;

        JSONObject obj = baseJson(method, msgId, createTime, new UserInfo());
        obj.put("viewerCount", totalViewers);
        return obj;
    }

    @Nullable
    private static JSONObject decodeControlMessage(String method, byte[] payload, long envelopeMsgId) throws Exception {
        long msgId = envelopeMsgId;
        long createTime = 0L;
        long controlAction = 0L;

        ProtoReader r = new ProtoReader(payload);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == 1 && wire == 2) {
                long[] common = parseCommonIds(r.readBytes());
                if (common[0] > 0L) msgId = common[0];
                if (common[1] > 0L) createTime = common[1];
            } else if (field == 2 && wire == 0) {
                controlAction = r.readVarint();
            } else {
                r.skipField(wire);
            }
        }

        JSONObject obj = baseJson(method, msgId, createTime, new UserInfo());
        obj.put("controlAction", controlAction);
        return obj;
    }

    // =========================================================================
    // SUBMESSAGE HELPERS (Common, User, Image, Key/Value)
    // =========================================================================

    @NonNull
    private static long[] parseCommonIds(@NonNull byte[] commonBytes) {
        long msgId = 0L;
        long createTime = 0L;
        ProtoReader r = new ProtoReader(commonBytes);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == 2 && wire == 0) {
                msgId = r.readVarint();
            } else if (field == 4 && wire == 0) {
                createTime = r.readVarint();
            } else {
                r.skipField(wire);
            }
        }
        return new long[]{msgId, createTime};
    }

    @NonNull
    private static String parseCommonDisplayKey(@NonNull byte[] commonBytes) {
        ProtoReader r = new ProtoReader(commonBytes);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == 8 && wire == 2) {
                return parseFirstStringField(r.readBytes(), 1);
            } else {
                r.skipField(wire);
            }
        }
        return "";
    }

    @NonNull
    private static UserInfo parseUser(@NonNull byte[] userBytes) {
        UserInfo u = new UserInfo();
        ProtoReader r = new ProtoReader(userBytes);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == 1 && wire == 0) {
                u.userId = String.valueOf(r.readVarint());
            } else if (field == 3 && wire == 2) {
                u.nickname = clampString(r.readString(), MAX_NAME_LEN);
            } else if (field == 9 && wire == 2 && u.avatarUrl.isEmpty()) {
                u.avatarUrl = parseImageUrl(r.readBytes());
            } else if (field == 38 && wire == 2) {
                u.username = clampString(r.readString(), MAX_NAME_LEN);
            } else {
                r.skipField(wire);
            }
        }
        return u;
    }

    @NonNull
    private static String parseImageUrl(@NonNull byte[] imageBytes) {
        ProtoReader r = new ProtoReader(imageBytes);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == 1 && wire == 2) {
                String url = r.readString();
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return url;
                }
            } else {
                r.skipField(wire);
            }
        }
        return "";
    }

    @NonNull
    private static String parseFirstStringField(@NonNull byte[] bytes, int targetField) {
        ProtoReader r = new ProtoReader(bytes);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == targetField && wire == 2) {
                return r.readString();
            } else {
                r.skipField(wire);
            }
        }
        return "";
    }

    @NonNull
    private static String[] parseKeyValuePair(@NonNull byte[] bytes) {
        String key = "";
        String val = "";
        ProtoReader r = new ProtoReader(bytes);
        while (r.hasNext()) {
            int tag = r.readTag();
            if (tag == 0) break;
            int field = tag >>> 3;
            int wire = tag & 0x07;
            if (field == 1 && wire == 2) key = r.readString();
            else if (field == 2 && wire == 2) val = r.readString();
            else r.skipField(wire);
        }
        return new String[]{key, val};
    }

    @NonNull
    private static JSONObject baseJson(
            @NonNull String method,
            long msgId,
            long createTime,
            @NonNull UserInfo user
    ) throws Exception {
        JSONObject obj = new JSONObject();
        obj.put("method", method);
        if (msgId > 0L) obj.put("msgId", String.valueOf(msgId));
        if (createTime > 0L) obj.put("createTime", createTime);
        if (!user.userId.isEmpty()) obj.put("userId", user.userId);
        if (!user.username.isEmpty()) obj.put("username", user.username);
        if (!user.nickname.isEmpty()) obj.put("nickname", user.nickname);
        if (!user.avatarUrl.isEmpty()) obj.put("avatarUrl", user.avatarUrl);
        return obj;
    }

    // =========================================================================
    // GZIP & WIRE UTILITIES
    // =========================================================================

    public static boolean isGzipMagic(@Nullable byte[] bytes) {
        return bytes != null && bytes.length >= 2
                && (bytes[0] & 0xFF) == 0x1F
                && (bytes[1] & 0xFF) == 0x8B;
    }

    @Nullable
    public static byte[] gunzipBounded(@NonNull byte[] compressed) {
        try (ByteArrayInputStream bais = new ByteArrayInputStream(compressed);
             GZIPInputStream gis = new GZIPInputStream(bais);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int total = 0;
            int read;
            while ((read = gis.read(buf)) != -1) {
                int allowed = Math.min(read, MAX_DECOMPRESSED_BYTES - total);
                if (allowed > 0) {
                    out.write(buf, 0, allowed);
                    total += allowed;
                }
                if (total >= MAX_DECOMPRESSED_BYTES) break;
            }
            return out.toByteArray();
        } catch (IOException ignored) {
            return null;
        }
    }

    @NonNull
    private static DecodedResponse emptyResponse(long logId, @NonNull String payloadType) {
        return new DecodedResponse(
                logId,
                payloadType,
                "",
                0L,
                "",
                0L,
                false,
                "",
                Collections.emptyMap(),
                Collections.emptyList(),
                0
        );
    }

    @NonNull
    private static String clampString(@Nullable String s, int maxLen) {
        if (s == null) return "";
        String trimmed = s.trim();
        if (trimmed.length() <= maxLen) return trimmed;
        return trimmed.substring(0, maxLen);
    }

    private static void writeTag(@NonNull ByteArrayOutputStream out, int field, int wireType) {
        writeVarint(out, ((long) field << 3) | (wireType & 0x07));
    }

    private static void writeVarint(@NonNull ByteArrayOutputStream out, long value) {
        long v = value;
        while ((v & ~0x7FL) != 0L) {
            out.write((int) ((v & 0x7FL) | 0x80L));
            v >>>= 7;
        }
        out.write((int) v);
    }

    private static void writeStringField(@NonNull ByteArrayOutputStream out, int field, @NonNull String value) {
        writeBytesField(out, field, value.getBytes(StandardCharsets.UTF_8));
    }

    private static void writeBytesField(@NonNull ByteArrayOutputStream out, int field, @NonNull byte[] bytes) {
        writeTag(out, field, 2);
        writeVarint(out, bytes.length);
        out.write(bytes, 0, bytes.length);
    }

    /** Pembaca Protobuf wire-format ringan dengan pemeriksaan batas buffer ketat. */
    private static final class ProtoReader {
        private final byte[] buf;
        private int pos;
        private boolean corrupt = false;

        ProtoReader(byte[] buf) {
            this.buf = buf;
            this.pos = 0;
        }

        boolean hasNext() {
            return !corrupt && pos < buf.length;
        }

        int readTag() {
            if (!hasNext()) return 0;
            long v = readVarint();
            if (corrupt || v <= 0L || v > Integer.MAX_VALUE) {
                corrupt = true;
                return 0;
            }
            return (int) v;
        }

        long readVarint() {
            long result = 0L;
            int shift = 0;
            while (pos < buf.length && shift < 64) {
                byte b = buf[pos++];
                result |= (long) (b & 0x7F) << shift;
                if ((b & 0x80) == 0) {
                    return result;
                }
                shift += 7;
            }
            corrupt = true;
            return 0L;
        }

        @NonNull
        byte[] readBytes() {
            long lenLong = readVarint();
            if (corrupt || lenLong < 0L || lenLong > (buf.length - pos)) {
                corrupt = true;
                return new byte[0];
            }
            int len = (int) lenLong;
            byte[] slice = new byte[len];
            System.arraycopy(buf, pos, slice, 0, len);
            pos += len;
            return slice;
        }

        @NonNull
        String readString() {
            byte[] bytes = readBytes();
            return bytes.length == 0 ? "" : new String(bytes, StandardCharsets.UTF_8);
        }

        void skipField(int wireType) {
            switch (wireType) {
                case 0: // varint
                    readVarint();
                    break;
                case 1: // 64-bit
                    if (pos + 8 > buf.length) {
                        corrupt = true;
                    } else {
                        pos += 8;
                    }
                    break;
                case 2: // length-delimited
                    readBytes();
                    break;
                case 5: // 32-bit
                    if (pos + 4 > buf.length) {
                        corrupt = true;
                    } else {
                        pos += 4;
                    }
                    break;
                default:
                    corrupt = true;
                    break;
            }
        }
    }
}
