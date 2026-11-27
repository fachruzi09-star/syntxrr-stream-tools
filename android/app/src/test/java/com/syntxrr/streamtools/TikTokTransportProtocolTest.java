package com.syntxrr.streamtools;

import org.junit.Test;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** Regression tests for outbound TikTok room-entry and Euler WebSocket handshake formats. */
public class TikTokTransportProtocolTest {

    @Test
    public void roomEntryFrameContainsExpectedPushFrameAndMessageFields() {
        long expectedRoomId = 987654321L;
        long expectedEnterId = 1234567890123L;
        byte[] encoded = TikTokWebcastDecoder.encodePushFrameEnterRoom(
                String.valueOf(expectedRoomId), expectedEnterId);

        Map<Integer, Field> pushFrame = parseFields(encoded);
        assertEquals("pb", readString(pushFrame.get(6)));
        assertEquals("im_enter_room", readString(pushFrame.get(7)));
        assertTrue(pushFrame.containsKey(8));

        Map<Integer, Field> enter = parseFields((byte[]) pushFrame.get(8).value);
        assertEquals(expectedRoomId, readVarint(enter.get(1)));
        assertEquals(12L, readVarint(enter.get(4)));
        assertEquals("audience", readString(enter.get(5)));
        assertEquals(expectedEnterId, readVarint(enter.get(8)));
        assertEquals("0", readString(enter.get(9)));
    }

    @Test
    public void roomEntryRejectsNonNumericOrZeroRoomIds() {
        assertIllegalArgument(() -> TikTokWebcastDecoder.encodePushFrameEnterRoom("not-a-room", 1L));
        assertIllegalArgument(() -> TikTokWebcastDecoder.encodePushFrameEnterRoom("0", 1L));
        assertIllegalArgument(() -> TikTokWebcastDecoder.encodePushFrameEnterRoom("123", 0L));
    }

    @Test
    public void heartbeatFrameContainsRoomIdAndIncrementingSequencePayload() {
        long expectedRoomId = 987654321L;
        long expectedSequenceId = 42L;
        byte[] encoded = TikTokWebcastDecoder.encodePushFrameHeartbeat(
                String.valueOf(expectedRoomId), expectedSequenceId);

        Map<Integer, Field> pushFrame = parseFields(encoded);
        assertEquals("pb", readString(pushFrame.get(6)));
        assertEquals("hb", readString(pushFrame.get(7)));
        assertTrue(pushFrame.containsKey(8));

        Map<Integer, Field> heartbeat = parseFields((byte[]) pushFrame.get(8).value);
        assertEquals(expectedRoomId, readVarint(heartbeat.get(1)));
        assertEquals(expectedSequenceId, readVarint(heartbeat.get(2)));
    }

    @Test
    public void heartbeatRejectsInvalidRoomAndSequence() {
        assertIllegalArgument(() -> TikTokWebcastDecoder.encodePushFrameHeartbeat("bad-room", 1L));
        assertIllegalArgument(() -> TikTokWebcastDecoder.encodePushFrameHeartbeat("123", 0L));
        assertIllegalArgument(() -> TikTokWebcastDecoder.encodePushFrameHeartbeat("0", 1L));
    }

    @Test
    public void ackFrameEncodesPositiveLogIdHeadersAndInternalExtPayload() {
        byte[] encoded = TikTokWebcastDecoder.encodePushFrameAck(987654321L, "ext-token-1");

        Map<Integer, Field> pushFrame = parseFields(encoded);
        assertEquals(987654321L, readVarint(pushFrame.get(2)));
        assertEquals("pb", readString(pushFrame.get(6)));
        assertEquals("ack", readString(pushFrame.get(7)));
        assertEquals("ext-token-1", readString(pushFrame.get(8)));
    }

    @Test
    public void ackFrameOmitsZeroLogIdAndUsesEmptyPayloadWhenInternalExtIsNull() {
        byte[] encoded = TikTokWebcastDecoder.encodePushFrameAck(0L, null);

        Map<Integer, Field> pushFrame = parseFields(encoded);
        assertFalse(pushFrame.containsKey(2));
        assertEquals("pb", readString(pushFrame.get(6)));
        assertEquals("ack", readString(pushFrame.get(7)));
        assertTrue(pushFrame.containsKey(8));
        assertEquals(0, ((byte[]) pushFrame.get(8).value).length);
    }

    @Test
    public void webSocketUrlIncludesStandardRouteAndEncodedQueryParameters() throws Exception {
        Map<String, String> routeParams = new HashMap<>();
        routeParams.put("imprp", "a b+c");
        routeParams.put("wrss", "x=1&y=2");

        String url = TikTokWebSocketTransport.buildWebSocketUrl(
                TikTokWebSocketTransport.DIRECT_WS_BASE_URL,
                "741234567890",
                true,
                12_000L,
                true,
                45L,
                "cur+1/2",
                "ext=a&b",
                routeParams
        );

        assertTrue(url.startsWith(TikTokWebSocketTransport.DIRECT_WS_BASE_URL));
        String rawQuery = url.substring(url.indexOf('?') + 1);
        assertTrue(rawQuery.contains("cursor=cur%2B1%2F2"));
        assertTrue(rawQuery.contains("internal_ext=ext%3Da%26b"));
        assertTrue(rawQuery.contains("wrss=x%3D1%26y%3D2"));

        Map<String, String> params = parseQuery(rawQuery);
        assertEquals("741234567890", params.get("room_id"));
        assertEquals("1", params.get("ws_direct"));
        assertEquals("protobuf", params.get("resp_content_type"));
        assertEquals("12000", params.get("heartbeat_duration"));
        assertEquals("1", params.get("client_enter"));
        assertEquals("45", params.get("last_rtt"));
        assertEquals("cur+1/2", params.get("cursor"));
        assertEquals("ext=a&b", params.get("internal_ext"));
        assertEquals("a b+c", params.get("imprp"));
        assertEquals("x=1&y=2", params.get("wrss"));
        assertEquals("1988", params.get("aid"));
        assertEquals("tiktok_web", params.get("app_name"));
        assertEquals("gzip", params.get("compress"));
    }

    @Test
    public void webSocketUrlClampsHeartbeatDurationToMinimumFiveSeconds() throws Exception {
        String url = TikTokWebSocketTransport.buildWebSocketUrl(
                TikTokWebSocketTransport.DIRECT_WS_BASE_URL,
                "123456",
                false,
                1_500L,
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
        assertFalse(params.containsKey("cursor"));
        assertFalse(params.containsKey("internal_ext"));
    }

    @Test
    public void webSocketUrlPreservesSignedBaseParametersAndBlocksRouteOverride() throws Exception {
        Map<String, String> routeParams = new HashMap<>();
        routeParams.put("signature", "tampered-sig");
        routeParams.put("aid", "0000");
        routeParams.put("extra_route", "safe-val");

        String url = TikTokWebSocketTransport.buildWebSocketUrl(
                "wss://webcast-ws.tiktok.com/ws/?room_id=999&signature=signed-sig&aid=9999",
                "123456",
                true,
                10_000L,
                true,
                0L,
                null,
                null,
                routeParams
        );

        String rawQuery = url.substring(url.indexOf('?') + 1);
        Map<String, String> params = parseQuery(rawQuery);
        assertEquals("999", params.get("room_id"));
        assertEquals("signed-sig", params.get("signature"));
        assertEquals("9999", params.get("aid"));
        assertEquals("safe-val", params.get("extra_route"));
        assertEquals(1, countQueryKey(rawQuery, "room_id"));
        assertEquals(1, countQueryKey(rawQuery, "signature"));
        assertEquals(1, countQueryKey(rawQuery, "aid"));
    }

    @Test
    public void eulerUrlUsesCurrentAuthenticatedV1Contract() throws Exception {
        String url = EulerStreamTransport.buildWebSocketUrl("@sample_live", "test-api-key");
        String rawQuery = url.substring(url.indexOf('?') + 1);
        Map<String, String> params = parseQuery(rawQuery);

        assertTrue(url.startsWith(EulerStreamTransport.EULER_WS_ENDPOINT));
        assertTrue(rawQuery.contains("features.bundleEvents=true"));
        assertEquals("sample_live", params.get("uniqueId"));
        assertEquals("test-api-key", params.get("apiKey"));
        assertFalse(params.containsKey("jwtKey"));
        assertEquals("v1", params.get("schemaVersion"));
        assertEquals("true", params.get("features.bundleEvents"));
        assertEquals("false", params.get("features.rawMessages"));
        assertEquals("true", params.get("features.normalizeUniqueId"));
        assertEquals("true", params.get("features.syntheticPresence"));
        assertFalse(params.containsKey("features.schemaVersion"));
        assertFalse(params.containsKey("features.webcastPlatform"));
    }

    @Test
    public void eulerUrlSupportsJwtAuthenticationAndEncodesParameters() throws Exception {
        String url = EulerStreamTransport.buildWebSocketUrl(" @sample+user ", null, "jwt.token+value");
        String rawQuery = url.substring(url.indexOf('?') + 1);
        Map<String, String> params = parseQuery(rawQuery);

        assertTrue(rawQuery.contains("uniqueId=sample%2Buser"));
        assertTrue(rawQuery.contains("jwtKey=jwt.token%2Bvalue"));
        assertEquals("sample+user", params.get("uniqueId"));
        assertEquals("jwt.token+value", params.get("jwtKey"));
        assertFalse(params.containsKey("apiKey"));
        assertEquals("v1", params.get("schemaVersion"));
        assertEquals("true", params.get("features.bundleEvents"));
        assertEquals("false", params.get("features.rawMessages"));
        assertEquals("true", params.get("features.normalizeUniqueId"));
        assertEquals("true", params.get("features.syntheticPresence"));
    }

    @Test
    public void eulerUrlRejectsMissingAuthentication() throws Exception {
        assertIllegalArgument(() -> EulerStreamTransport.buildWebSocketUrl("sample_live", " "));
        assertIllegalArgument(() -> EulerStreamTransport.buildWebSocketUrl("sample_live", null, " "));
    }

    @Test
    public void eulerUrlRejectsSimultaneousApiKeyAndJwtKey() throws Exception {
        assertIllegalArgument(() -> EulerStreamTransport.buildWebSocketUrl(
                "sample_live", "api-key", "jwt-token"));
    }

    @Test
    public void connectorRecognizesApiKeyOrJwtForEulerFallback() {
        assertFalse(TikTokLiveConnector.canAttemptEulerFallback(true, false, "", ""));
        assertFalse(TikTokLiveConnector.canAttemptEulerFallback(false, false, "api-key", ""));
        assertFalse(TikTokLiveConnector.canAttemptEulerFallback(true, true, "", "jwt.token"));
        assertTrue(TikTokLiveConnector.canAttemptEulerFallback(true, false, "api-key", ""));
        assertTrue(TikTokLiveConnector.canAttemptEulerFallback(true, false, "", "jwt.token"));
    }

    @Test
    public void connectorValidatesExclusiveEulerCredentialsAndAllowsDirectZeroKey() {
        assertEquals(null, TikTokLiveConnector.validateEulerCredentialErrorCode("direct", "", ""));
        assertEquals(null, TikTokLiveConnector.validateEulerCredentialErrorCode("euler", "api-key", ""));
        assertEquals(null, TikTokLiveConnector.validateEulerCredentialErrorCode("euler", "", "jwt.token"));
        assertEquals("EULER_API_KEY_REQUIRED",
                TikTokLiveConnector.validateEulerCredentialErrorCode("euler", " ", ""));
        assertEquals("EULER_CONFLICTING_CREDENTIALS",
                TikTokLiveConnector.validateEulerCredentialErrorCode("euler", "api-key", "jwt.token"));
        assertEquals("EULER_CONFLICTING_CREDENTIALS",
                TikTokLiveConnector.validateEulerCredentialErrorCode("direct", "api-key", "jwt.token"));
    }

    @Test
    public void connectorDetectsSessionConfigChangesIncludingJwtAndFallback() {
        assertTrue(TikTokLiveConnector.hasSameSessionConfiguration(
                true, "connected_direct", "sample_live", "SAMPLE_LIVE",
                "direct", "direct", true, true, "", "", "jwt-1", " jwt-1 "));
        assertFalse(TikTokLiveConnector.hasSameSessionConfiguration(
                true, "connected_euler", "sample_live", "sample_live",
                "euler", "euler", true, true, "", "", "jwt-1", "jwt-2"));
        assertFalse(TikTokLiveConnector.hasSameSessionConfiguration(
                true, "connected_euler", "sample_live", "sample_live",
                "euler", "euler", true, true, "api-1", "", "", "jwt-1"));
        assertFalse(TikTokLiveConnector.hasSameSessionConfiguration(
                true, "connected_direct", "sample_live", "sample_live",
                "direct", "direct", true, false, "", "", "jwt-1", "jwt-1"));
        assertFalse(TikTokLiveConnector.hasSameSessionConfiguration(
                true, "connected_direct", "sample_live", "sample_live",
                "direct", "direct", true, true, "", "", "jwt-1", ""));
    }

    @Test
    public void webSocketUrlWithDeviceIdUnifiesBrowserFingerprintAndDoesNotOverrideSignedParams() throws Exception {
        String url = TikTokWebSocketTransport.buildWebSocketUrl(
                TikTokWebSocketTransport.DIRECT_WS_BASE_URL,
                "7712777833754118933",
                true,
                10_000L,
                true,
                12L,
                null,
                null,
                null,
                "7345678901234567890"
        );

        Map<String, String> params = parseQuery(url.substring(url.indexOf('?') + 1));
        assertEquals("7345678901234567890", params.get("device_id"));
        assertEquals("7345678901234567890", params.get("did"));
        assertEquals("en-US", params.get("browser_language"));
        assertEquals(TikTokRoomResolver.CLIENT_BROWSER_VERSION, params.get("browser_version"));
        assertEquals("android", params.get("os"));
        assertEquals("800", params.get("screen_height"));
        assertEquals("360", params.get("screen_width"));
        assertEquals("en", params.get("webcast_language"));

        String signedUrl = TikTokWebSocketTransport.buildWebSocketUrl(
                "wss://webcast-ws.tiktok.com/ws/?device_id=signed_dev&did=signed_did",
                "7712777833754118933",
                true,
                10_000L,
                true,
                0L,
                null,
                null,
                null,
                "7345678901234567890"
        );
        Map<String, String> signedParams = parseQuery(signedUrl.substring(signedUrl.indexOf('?') + 1));
        assertEquals("signed_dev", signedParams.get("device_id"));
        assertEquals("signed_did", signedParams.get("did"));
    }

    @Test
    public void classifiesDeterministicVsTransientDirectHandshakeRejectionsAndSanitizesPushServer() {
        assertTrue(TikTokLiveConnector.isDeterministicDirectHandshakeRejection(200, "upgrade_missing"));
        assertTrue(TikTokLiveConnector.isDeterministicDirectHandshakeRejection(200, "edge_html"));
        assertTrue(TikTokLiveConnector.isDeterministicDirectHandshakeRejection(200, "api_json"));
        assertTrue(TikTokLiveConnector.isDeterministicDirectHandshakeRejection(403, "protocol_rejected"));
        assertTrue(TikTokLiveConnector.isDeterministicDirectHandshakeRejection(401, "protocol_rejected"));
        assertTrue(TikTokLiveConnector.isDeterministicDirectHandshakeRejection(302, "redirect"));

        assertFalse(TikTokLiveConnector.isDeterministicDirectHandshakeRejection(0, "unknown"));
        assertFalse(TikTokLiveConnector.isDeterministicDirectHandshakeRejection(429, "protocol_rejected"));
        assertFalse(TikTokLiveConnector.isDeterministicDirectHandshakeRejection(503, "protocol_rejected"));

        assertEquals(
                "wss://webcast16-ws-sg.tiktok.com/webcast/im/ws_proxy/ws_reuse_supplement/",
                TikTokLiveConnector.sanitizeDirectPushServerUrl(
                        "https://webcast16-ws-sg.tiktok.com/webcast/im/ws_proxy/ws_reuse_supplement/?ignored=1"
                )
        );
        assertEquals("", TikTokLiveConnector.sanitizeDirectPushServerUrl("ws://webcast-ws.tiktok.com/ws/"));
        assertEquals("", TikTokLiveConnector.sanitizeDirectPushServerUrl("wss://evil.example.com/ws/"));
        assertEquals("", TikTokLiveConnector.sanitizeDirectPushServerUrl("wss://user:pass@webcast-ws.tiktok.com/ws/"));
    }

    private static void assertIllegalArgument(ThrowingRunnable action) {
        try {
            action.run();
            fail("Expected IllegalArgumentException");
        } catch (IllegalArgumentException expected) {
            // Expected.
        } catch (Exception other) {
            throw new AssertionError(other);
        }
    }

    private static int countQueryKey(String rawQuery, String targetKey) throws Exception {
        int count = 0;
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            String key = eq >= 0
                    ? URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8.name())
                    : URLDecoder.decode(pair, StandardCharsets.UTF_8.name());
            if (targetKey.equals(key)) {
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

    private interface ThrowingRunnable {
        void run() throws Exception;
    }
}
