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
    public void eulerUrlUsesCurrentAuthenticatedV1Contract() throws Exception {
        String url = EulerStreamTransport.buildWebSocketUrl("@sample_live", "test-api-key");
        Map<String, String> params = parseQuery(url.substring(url.indexOf('?') + 1));

        assertEquals("sample_live", params.get("uniqueId"));
        assertEquals("test-api-key", params.get("apiKey"));
        assertEquals("v1", params.get("schemaVersion"));
        assertEquals("true", params.get("features.bundleEvents"));
        assertEquals("false", params.get("features.rawMessages"));
        assertEquals("true", params.get("features.normalizeUniqueId"));
        assertEquals("true", params.get("features.syntheticPresence"));
        assertFalse(params.containsKey("features.schemaVersion"));
        assertFalse(params.containsKey("features.webcastPlatform"));
    }

    @Test
    public void eulerUrlRejectsMissingAuthentication() throws Exception {
        assertIllegalArgument(() -> EulerStreamTransport.buildWebSocketUrl("sample_live", " "));
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
