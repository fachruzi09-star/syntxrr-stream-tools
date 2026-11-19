package com.syntxrr.streamtools;

import org.junit.Test;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * Unit tests verifying the outbound transport contracts available in active production code
 * ({@link TikTokWebcastDecoder}, {@link TikTokWebSocketTransport}, and {@link EulerStreamTransport}).
 */
public class TikTokTransportProtocolTest {

    @Test
    public void heartbeatFrameEncodesOnlyPbHeaderAndHbPayloadType() {
        byte[] encoded = TikTokWebcastDecoder.encodePushFrameHeartbeat();

        Map<Integer, Field> pushFrame = parseFields(encoded);
        assertEquals(2, pushFrame.size());
        assertEquals("pb", readString(pushFrame.get(6)));
        assertEquals("hb", readString(pushFrame.get(7)));
        assertFalse(pushFrame.containsKey(2));
        assertFalse(pushFrame.containsKey(8));
    }

    @Test
    public void ackFrameEncodesPositiveLogIdHeadersAndInternalExtPayload() {
        long expectedLogId = 9876543210123L;
        String expectedInternalExt = "ack_ext_value_123";
        byte[] encoded = TikTokWebcastDecoder.encodePushFrameAck(expectedLogId, expectedInternalExt);

        Map<Integer, Field> pushFrame = parseFields(encoded);
        assertEquals(4, pushFrame.size());
        assertEquals(expectedLogId, readVarint(pushFrame.get(2)));
        assertEquals("pb", readString(pushFrame.get(6)));
        assertEquals("ack", readString(pushFrame.get(7)));
        assertEquals(expectedInternalExt, readString(pushFrame.get(8)));
    }

    @Test
    public void ackFrameOmitsZeroLogIdAndUsesEmptyPayloadWhenInternalExtIsNull() {
        byte[] encoded = TikTokWebcastDecoder.encodePushFrameAck(0L, null);

        Map<Integer, Field> pushFrame = parseFields(encoded);
        assertEquals(3, pushFrame.size());
        assertFalse(pushFrame.containsKey(2));
        assertEquals("pb", readString(pushFrame.get(6)));
        assertEquals("ack", readString(pushFrame.get(7)));
        assertTrue(pushFrame.containsKey(8));
        assertEquals(0, ((byte[]) pushFrame.get(8).value).length);
    }

    @Test
    public void webSocketUrlIncludesStandardRouteAndEncodedQueryParameters() throws Exception {
        Map<String, String> routeParams = Collections.singletonMap("route_token", "node a+b=c");
        String url = TikTokWebSocketTransport.buildWebSocketUrl(
                "wss://example.test/webcast/im/fetch/",
                "987654321",
                true,
                10_000L,
                true,
                42L,
                "cursor +/=",
                "ext&= value",
                routeParams
        );

        assertTrue(url.startsWith("wss://example.test/webcast/im/fetch/?"));
        String rawQuery = url.substring(url.indexOf('?') + 1);
        assertTrue(rawQuery.contains("cursor=cursor+%2B%2F%3D"));
        assertTrue(rawQuery.contains("internal_ext=ext%26%3D+value"));

        Map<String, String> params = parseQuery(rawQuery);
        assertEquals("987654321", params.get("room_id"));
        assertEquals("1", params.get("ws_direct"));
        assertEquals("protobuf", params.get("resp_content_type"));
        assertEquals("10000", params.get("heartbeat_duration"));
        assertEquals("1", params.get("client_enter"));
        assertEquals("42", params.get("last_rtt"));
        assertEquals("cursor +/=", params.get("cursor"));
        assertEquals("ext&= value", params.get("internal_ext"));
        assertEquals("node a+b=c", params.get("route_token"));
        assertEquals("1988", params.get("aid"));
        assertEquals("tiktok_web", params.get("app_name"));
    }

    @Test
    public void webSocketUrlClampsHeartbeatDurationToMinimumFiveSeconds() throws Exception {
        String url = TikTokWebSocketTransport.buildWebSocketUrl(
                "wss://example.test/webcast/im/fetch/",
                "987654321",
                false,
                1_200L,
                false,
                0L,
                null,
                null,
                null
        );

        Map<String, String> params = parseQuery(url.substring(url.indexOf('?') + 1));
        assertEquals("5000", params.get("heartbeat_duration"));
        assertEquals("0", params.get("ws_direct"));
        assertFalse(params.containsKey("client_enter"));
        assertFalse(params.containsKey("last_rtt"));
    }

    @Test
    public void webSocketUrlPreservesSignedBaseParametersAndBlocksRouteOverride() throws Exception {
        String signedBaseUrl =
                "wss://signed.example.test/webcast/im/fetch/?signature=signed_sig_value&room_id=111222333&aid=7777";
        Map<String, String> routeParams = new LinkedHashMap<>();
        routeParams.put("signature", "tampered_sig");
        routeParams.put("room_id", "000000");
        routeParams.put("aid", "9999");
        routeParams.put("custom_route", "apac");

        String url = TikTokWebSocketTransport.buildWebSocketUrl(
                signedBaseUrl,
                "987654321",
                true,
                10_000L,
                true,
                15L,
                null,
                null,
                routeParams
        );

        assertTrue(url.startsWith(signedBaseUrl + "&"));
        String rawQuery = url.substring(url.indexOf('?') + 1);
        assertEquals(1, countQueryKey(rawQuery, "signature"));
        assertEquals(1, countQueryKey(rawQuery, "room_id"));
        assertEquals(1, countQueryKey(rawQuery, "aid"));

        Map<String, String> params = parseQuery(rawQuery);
        assertEquals("signed_sig_value", params.get("signature"));
        assertEquals("111222333", params.get("room_id"));
        assertEquals("7777", params.get("aid"));
        assertEquals("apac", params.get("custom_route"));
        assertEquals("tiktok_web", params.get("app_name"));
    }

    @Test
    public void eulerFetchUrlPrioritizesRoomIdAndEncodesParametersWithoutApiKeyQuery() throws Exception {
        String url = EulerStreamTransport.buildFetchUrl(
                "987654321",
                "@sample_live",
                "cursor +/=",
                "ext&= value"
        );

        assertTrue(url.startsWith(EulerStreamTransport.EULER_FETCH_ENDPOINT + "?"));
        String rawQuery = url.substring(url.indexOf('?') + 1);
        assertTrue(rawQuery.contains("cursor=cursor+%2B%2F%3D"));
        assertTrue(rawQuery.contains("internal_ext=ext%26%3D+value"));
        assertFalse(url.contains("apiKey"));

        Map<String, String> params = parseQuery(rawQuery);
        assertEquals("syntxrr", params.get("client"));
        assertEquals("987654321", params.get("room_id"));
        assertEquals("cursor +/=", params.get("cursor"));
        assertEquals("ext&= value", params.get("internal_ext"));
        assertFalse(params.containsKey("unique_id"));
        assertFalse(params.containsKey("apiKey"));
    }

    @Test
    public void eulerFetchUrlFallsBackToEncodedUniqueIdAndOmitsNullOptionals() throws Exception {
        String url = EulerStreamTransport.buildFetchUrl(
                "   ",
                "@sample_live",
                null,
                null
        );

        assertTrue(url.startsWith(EulerStreamTransport.EULER_FETCH_ENDPOINT + "?"));
        String rawQuery = url.substring(url.indexOf('?') + 1);
        assertTrue(rawQuery.contains("unique_id=%40sample_live"));
        assertFalse(url.contains("apiKey"));

        Map<String, String> params = parseQuery(rawQuery);
        assertEquals("syntxrr", params.get("client"));
        assertEquals("@sample_live", params.get("unique_id"));
        assertFalse(params.containsKey("room_id"));
        assertFalse(params.containsKey("cursor"));
        assertFalse(params.containsKey("internal_ext"));
        assertFalse(params.containsKey("apiKey"));
    }

    private static int countQueryKey(String rawQuery, String targetKey) throws Exception {
        int count = 0;
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            String rawKey = eq >= 0 ? pair.substring(0, eq) : pair;
            String decodedKey = URLDecoder.decode(rawKey, StandardCharsets.UTF_8.name());
            if (targetKey.equals(decodedKey)) {
                count++;
            }
        }
        return count;
    }

    private static Map<String, String> parseQuery(String rawQuery) throws Exception {
        Map<String, String> result = new HashMap<>();
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            String key = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8.name());
            String value = URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8.name());
            result.put(key, value);
        }
        return result;
    }

    private static String readString(Field field) {
        if (field == null || field.wire != 2) throw new AssertionError("Expected length-delimited field");
        return new String((byte[]) field.value, StandardCharsets.UTF_8);
    }

    private static long readVarint(Field field) {
        if (field == null || field.wire != 0) throw new AssertionError("Expected varint field");
        return (Long) field.value;
    }

    private static Map<Integer, Field> parseFields(byte[] bytes) {
        Map<Integer, Field> fields = new HashMap<>();
        int[] pos = {0};
        while (pos[0] < bytes.length) {
            long tag = readUnsignedVarint(bytes, pos);
            int field = (int) (tag >>> 3);
            int wire = (int) (tag & 7L);
            if (field == 0) throw new AssertionError("Invalid protobuf field number 0");
            if (wire == 0) {
                fields.put(field, new Field(wire, readUnsignedVarint(bytes, pos)));
            } else if (wire == 2) {
                int length = Math.toIntExact(readUnsignedVarint(bytes, pos));
                if (length < 0 || pos[0] + length > bytes.length) throw new AssertionError("Invalid length");
                byte[] value = new byte[length];
                System.arraycopy(bytes, pos[0], value, 0, length);
                pos[0] += length;
                fields.put(field, new Field(wire, value));
            } else {
                throw new AssertionError("Unsupported wire type " + wire);
            }
        }
        return fields;
    }

    private static long readUnsignedVarint(byte[] bytes, int[] pos) {
        long value = 0L;
        int shift = 0;
        while (pos[0] < bytes.length && shift < 64) {
            int b = bytes[pos[0]++] & 0xff;
            value |= (long) (b & 0x7f) << shift;
            if ((b & 0x80) == 0) return value;
            shift += 7;
        }
        throw new AssertionError("Malformed protobuf varint");
    }

    private static final class Field {
        final int wire;
        final Object value;
        Field(int wire, Object value) {
            this.wire = wire;
            this.value = value;
        }
    }
}
