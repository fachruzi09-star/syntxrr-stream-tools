package com.syntxrr.streamtools;

import org.json.JSONObject;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPOutputStream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * Schema-derived binary Protobuf decoder & ProtoReader unit tests for TikTokWebcastDecoder.
 *
 * Note: Binary fixtures here are constructed from community-verified Webcast Protobuf
 * schemas (jwdeveloper/TikTokLiveJava and TikTokLiveRust) and verify wire-format parsing
 * across decodeWebSocketBinaryFrame() -> decodeResponseBytes() -> decodeEnvelopeMessage() ->
 * individual message decoders. They are synthetic schema-derived fixtures, not live captures.
 */
public class TikTokWebcastDecoderTest {

    // =========================================================================
    // TASK 3: ProtoReader tag validation, unsigned 32-bit tags & bounds safety
    // =========================================================================

    @Test
    public void protoReaderReadsStandardTagsCleanly() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeVarint(out, (1L << 3) | 0L); // field 1, wire 0 (varint)
        writeVarint(out, 42L);
        writeVarint(out, (3L << 3) | 2L); // field 3, wire 2 (length-delimited)
        byte[] text = "halo".getBytes(StandardCharsets.UTF_8);
        writeVarint(out, text.length);
        out.write(text, 0, text.length);

        TikTokWebcastDecoder.ProtoReader reader = new TikTokWebcastDecoder.ProtoReader(out.toByteArray());
        assertTrue(reader.hasNext());

        int tag1 = reader.readTag();
        assertEquals(1, tag1 >>> 3);
        assertEquals(0, tag1 & 0x07);
        assertEquals(42L, reader.readVarint());

        int tag2 = reader.readTag();
        assertEquals(3, tag2 >>> 3);
        assertEquals(2, tag2 & 0x07);
        assertEquals("halo", reader.readString());

        assertFalse(reader.hasNext());
        assertFalse(reader.isCorrupt());
    }

    @Test
    public void protoReaderSupportsValidUnsignedTagsAboveIntegerMaxValue() {
        // field 300_000_000 (wire 0) => tag = 2_400_000_000L (> Integer.MAX_VALUE)
        long highFieldA = 300_000_000L;
        long highTagA = (highFieldA << 3) | 0L;
        // max protobuf field 536_870_911 (wire 2) => tag = 0xFFFFFFFAL
        long highFieldB = TikTokWebcastDecoder.ProtoReader.MAX_FIELD_NUMBER;
        long highTagB = (highFieldB << 3) | 2L;

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeVarint(out, highTagA);
        writeVarint(out, 777L);
        writeVarint(out, highTagB);
        writeVarint(out, 2L);
        out.write('o');
        out.write('k');

        TikTokWebcastDecoder.ProtoReader reader = new TikTokWebcastDecoder.ProtoReader(out.toByteArray());
        int t1 = reader.readTag();
        assertTrue(t1 != 0);
        assertEquals(300_000_000, t1 >>> 3);
        assertEquals(0, t1 & 0x07);
        assertEquals(777L, reader.readVarint());

        int t2 = reader.readTag();
        assertTrue(t2 != 0);
        assertEquals(TikTokWebcastDecoder.ProtoReader.MAX_FIELD_NUMBER, t2 >>> 3);
        assertEquals(2, t2 & 0x07);
        assertEquals("ok", reader.readString());

        assertFalse(reader.isCorrupt());
        assertFalse(reader.hasNext());
    }

    @Test
    public void frameWithUnknownHighUnsignedTagSkipsSafelyAndDecodesFollowingMessage() throws Exception {
        byte[] chatPayload = encodeChatPayload(1001L, 1731571200L, 11L, "budi", "Budi", "", "Halo LIVE");
        byte[] envelope = encodeEnvelope("WebcastChatMessage", chatPayload, 1001L);

        // Build a Response with an unknown high-tag varint field (> Integer.MAX_VALUE) BEFORE field 1 (messagesList)
        ByteArrayOutputStream resp = new ByteArrayOutputStream();
        writeVarint(resp, (300_000_001L << 3) | 0L);
        writeVarint(resp, 999L);
        writeBytesField(resp, 1, envelope);

        byte[] pushFrame = encodePushFrame(50L, "pb", "msg", resp.toByteArray(), false);
        TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(pushFrame);
        assertEquals(1, decoded.events.size());
        assertEquals("WebcastChatMessage", decoded.events.get(0).getString("method"));
        assertEquals("Halo LIVE", decoded.events.get(0).getString("content"));
    }

    @Test
    public void protoReaderRejectsZeroAndOverflowFieldNumbers() {
        // Field number 0 with wire 0 (tag = 0)
        TikTokWebcastDecoder.ProtoReader r0 = new TikTokWebcastDecoder.ProtoReader(new byte[]{0x00});
        assertEquals(0, r0.readTag());
        assertTrue(r0.isCorrupt());

        // Field number 0 with wire 2 (tag = 2)
        TikTokWebcastDecoder.ProtoReader rWireOnly = new TikTokWebcastDecoder.ProtoReader(new byte[]{0x02, 0x00});
        assertEquals(0, rWireOnly.readTag());
        assertTrue(rWireOnly.isCorrupt());

        // Field number > MAX_FIELD_NUMBER (536_870_912 << 3 = 0x1_0000_0000L)
        ByteArrayOutputStream over = new ByteArrayOutputStream();
        writeVarint(over, (1L << 32));
        TikTokWebcastDecoder.ProtoReader rOver = new TikTokWebcastDecoder.ProtoReader(over.toByteArray());
        assertEquals(0, rOver.readTag());
        assertTrue(rOver.isCorrupt());
    }

    @Test
    public void protoReaderRejectsUnsupportedWireTypes() {
        int[] unsupportedWires = {3, 4, 6, 7};
        for (int wire : unsupportedWires) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            writeVarint(out, (1L << 3) | wire);
            TikTokWebcastDecoder.ProtoReader reader = new TikTokWebcastDecoder.ProtoReader(out.toByteArray());
            assertEquals("Wire type " + wire + " must be rejected", 0, reader.readTag());
            assertTrue("Wire type " + wire + " must mark corrupt", reader.isCorrupt());
        }
    }

    @Test
    public void protoReaderRejectsTruncatedAndOverlongVarintsWithoutInfiniteLoop() {
        // Truncated varint tag
        TikTokWebcastDecoder.ProtoReader rTruncTag = new TikTokWebcastDecoder.ProtoReader(new byte[]{(byte) 0x80});
        assertEquals(0, rTruncTag.readTag());
        assertTrue(rTruncTag.isCorrupt());

        // Valid tag followed by truncated varint value
        TikTokWebcastDecoder.ProtoReader rTruncVal = new TikTokWebcastDecoder.ProtoReader(new byte[]{0x08, (byte) 0x81});
        int tag = rTruncVal.readTag();
        assertEquals(1, tag >>> 3);
        assertEquals(0L, rTruncVal.readVarint());
        assertTrue(rTruncVal.isCorrupt());

        // Overlong 11-byte varint (must terminate loop cleanly)
        byte[] overlong = new byte[]{0x08, (byte) 0x80, (byte) 0x80, (byte) 0x80, (byte) 0x80,
                (byte) 0x80, (byte) 0x80, (byte) 0x80, (byte) 0x80, (byte) 0x80, (byte) 0x80, 0x01};
        TikTokWebcastDecoder.ProtoReader rOverlong = new TikTokWebcastDecoder.ProtoReader(overlong);
        rOverlong.readTag();
        rOverlong.readVarint();
        assertTrue(rOverlong.isCorrupt());
        assertFalse(rOverlong.hasNext());
    }

    @Test
    public void protoReaderRejectsLengthDelimitedPayloadExceedingBuffer() {
        // Field 1, wire 2, declared length 50, only 3 bytes available
        byte[] truncatedBytesField = new byte[]{0x0A, 50, 'a', 'b', 'c'};
        TikTokWebcastDecoder.ProtoReader reader = new TikTokWebcastDecoder.ProtoReader(truncatedBytesField);
        int tag = reader.readTag();
        assertEquals(1, tag >>> 3);
        assertEquals(2, tag & 0x07);
        byte[] slice = reader.readBytes();
        assertEquals(0, slice.length);
        assertTrue(reader.isCorrupt());
        assertFalse(reader.hasNext());
    }

    // =========================================================================
    // TASK 5 + TASK 1 + TASK 2 + TASK 4: End-to-end 8 message binary fixtures
    // =========================================================================

    @Test
    public void decodesChatMessageThroughFullPushFramePipelineIncludingGzip() throws Exception {
        byte[] chatPayload = encodeChatPayload(
                50001L, 1731571205L, 7001L, "budi_live", "Budi",
                "https://cdn.example.com/avatar.jpg", "!play Neon Horizon");
        byte[] envelope = encodeEnvelope("WebcastChatMessage", chatPayload, 50001L);

        // Verify direct decodeEnvelopeMessage layer
        JSONObject directMsg = TikTokWebcastDecoder.decodeEnvelopeMessage(envelope);
        assertNotNull(directMsg);
        assertEquals("WebcastChatMessage", directMsg.getString("method"));

        // Verify decodeResponseBytes layer
        byte[] responseBytes = encodeResponse(
                "cursor_1", 1200L, "ext_abc", 10000L, true, "wss://webcast-ws.tiktok.com/ws/", envelope);
        TikTokWebcastDecoder.DecodedResponse respDirect =
                TikTokWebcastDecoder.decodeResponseBytes(responseBytes, 91L, "msg");
        assertEquals(1, respDirect.events.size());
        assertEquals("cursor_1", respDirect.cursor);
        assertEquals("ext_abc", respDirect.internalExt);
        assertTrue(respDirect.needAck);

        // Verify full gzipped PushFrame -> decodeWebSocketBinaryFrame()
        byte[] gzipPushFrame = encodePushFrame(91L, "pb", "msg", responseBytes, true);
        TikTokWebcastDecoder.DecodedResponse full = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(gzipPushFrame);
        assertEquals(91L, full.logId);
        assertEquals("msg", full.payloadType);
        assertEquals(10000L, full.heartbeatDurationMs);
        assertEquals("wss://webcast-ws.tiktok.com/ws/", full.pushServer);
        assertEquals(1, full.events.size());

        JSONObject evt = full.events.get(0);
        assertEquals("WebcastChatMessage", evt.getString("method"));
        assertEquals("50001", evt.getString("msgId"));
        assertEquals("7001", evt.getString("userId"));
        assertEquals("budi_live", evt.getString("username"));
        assertEquals("Budi", evt.getString("nickname"));
        assertEquals("https://cdn.example.com/avatar.jpg", evt.getString("avatarUrl"));
        assertEquals("!play Neon Horizon", evt.getString("content"));
    }

    @Test
    public void decodesEmoteChatMessageThroughFullPipeline() throws Exception {
        ByteArrayOutputStream emoteMsg = new ByteArrayOutputStream();
        writeBytesField(emoteMsg, 1, encodeCommon(50002L, 1731571210L, ""));
        writeBytesField(emoteMsg, 2, encodeUser(7002L, "emote_fan", "EmoteFan", ""));
        ByteArrayOutputStream emote = new ByteArrayOutputStream();
        writeStringField(emote, 1, "emote_fire_77");
        writeBytesField(emoteMsg, 3, emote.toByteArray());

        byte[] envelope = encodeEnvelope("WebcastEmoteChatMessage", emoteMsg.toByteArray(), 50002L);
        byte[] pushFrame = encodePushFrame(92L, "pb", "msg", encodeResponse("", 0L, "", 0L, false, "", envelope), false);

        TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(pushFrame);
        assertEquals(1, decoded.events.size());
        JSONObject evt = decoded.events.get(0);
        assertEquals("WebcastEmoteChatMessage", evt.getString("method"));
        assertEquals("50002", evt.getString("msgId"));
        assertEquals("emote_fan", evt.getString("username"));
        assertEquals("[Emote:emote_fire_77]", evt.getString("content"));
    }

    @Test
    public void decodesGiftMessageDistinguishingGroupCountComboCountRepeatEndAndGiftName() throws Exception {
        // GiftStruct: field 1 image, field 2 describe, field 5 id, field 12 diamondCount, field 16 name
        ByteArrayOutputStream giftStruct = new ByteArrayOutputStream();
        writeBytesField(giftStruct, 1, encodeImage("https://cdn.example.com/galaxy.png"));
        writeStringField(giftStruct, 2, "sent a Galaxy to host");
        writeVarintField(giftStruct, 5, 5879L);
        writeVarintField(giftStruct, 12, 1000L);
        writeStringField(giftStruct, 16, "Galaxy");

        ByteArrayOutputStream giftPayload = new ByteArrayOutputStream();
        writeBytesField(giftPayload, 1, encodeCommon(50003L, 1731571220L, ""));
        writeVarintField(giftPayload, 2, 5879L); // giftId
        writeVarintField(giftPayload, 4, 2L);    // groupCount (field 4)
        writeVarintField(giftPayload, 5, 3L);    // repeatCount (field 5)
        writeVarintField(giftPayload, 6, 9L);    // comboCount (field 6, must NOT overwrite groupCount)
        writeBytesField(giftPayload, 7, encodeUser(7003L, "sultan_id", "Sultan", ""));
        writeVarintField(giftPayload, 9, 1L);    // repeatEnd (field 9 != 0)
        writeBytesField(giftPayload, 15, giftStruct.toByteArray());

        byte[] envelope = encodeEnvelope("WebcastGiftMessage", giftPayload.toByteArray(), 50003L);
        byte[] pushFrame = encodePushFrame(93L, "pb", "msg", encodeResponse("", 0L, "", 0L, false, "", envelope), false);

        TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(pushFrame);
        assertEquals(1, decoded.events.size());
        JSONObject evt = decoded.events.get(0);
        assertEquals("WebcastGiftMessage", evt.getString("method"));
        assertEquals("50003", evt.getString("msgId"));
        assertEquals("sultan_id", evt.getString("username"));
        assertEquals("5879", evt.getString("giftId"));
        assertEquals("Galaxy", evt.getString("giftName"));
        assertEquals("sent a Galaxy to host", evt.getString("giftDescribe"));
        assertEquals(2L, evt.getLong("groupCount"));
        assertEquals(3L, evt.getLong("repeatCount"));
        assertEquals(9L, evt.getLong("comboCount"));
        assertEquals(1L, evt.getLong("repeatEnd"));
        assertEquals(1000L, evt.getLong("diamondCount"));
        assertEquals("https://cdn.example.com/galaxy.png", evt.getString("giftImage"));
    }

    @Test
    public void giftMessageDoesNotTreatDescribeAsGiftNameWhenNameFieldMissing() throws Exception {
        ByteArrayOutputStream giftStruct = new ByteArrayOutputStream();
        writeStringField(giftStruct, 2, "sent a gift description text");
        writeVarintField(giftStruct, 5, 5655L);
        writeVarintField(giftStruct, 12, 1L);
        // field 16 (name) intentionally omitted

        ByteArrayOutputStream giftPayload = new ByteArrayOutputStream();
        writeBytesField(giftPayload, 1, encodeCommon(50004L, 1731571225L, ""));
        writeVarintField(giftPayload, 2, 5655L);
        writeVarintField(giftPayload, 5, 1L);
        writeVarintField(giftPayload, 9, 0L); // repeatEnd = 0
        writeBytesField(giftPayload, 7, encodeUser(7004L, "gifter2", "Gifter2", ""));
        writeBytesField(giftPayload, 15, giftStruct.toByteArray());

        byte[] envelope = encodeEnvelope("WebcastGiftMessage", giftPayload.toByteArray(), 50004L);
        byte[] pushFrame = encodePushFrame(94L, "pb", "msg", encodeResponse("", 0L, "", 0L, false, "", envelope), false);

        TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(pushFrame);
        assertEquals(1, decoded.events.size());
        JSONObject evt = decoded.events.get(0);
        assertEquals("Gift #5655", evt.getString("giftName"));
        assertFalse("describe must never become giftName", evt.getString("giftName").contains("description"));
        assertEquals(0L, evt.getLong("repeatEnd"));
    }

    @Test
    public void decodesLikeMessageThroughFullPipeline() throws Exception {
        ByteArrayOutputStream likePayload = new ByteArrayOutputStream();
        writeBytesField(likePayload, 1, encodeCommon(50005L, 1731571230L, ""));
        writeVarintField(likePayload, 2, 15L);   // likeCount
        writeVarintField(likePayload, 3, 2450L); // totalLikeCount
        writeBytesField(likePayload, 5, encodeUser(7005L, "tapper_1", "Tapper", ""));

        byte[] envelope = encodeEnvelope("WebcastLikeMessage", likePayload.toByteArray(), 50005L);
        byte[] pushFrame = encodePushFrame(95L, "pb", "msg", encodeResponse("", 0L, "", 0L, false, "", envelope), false);

        TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(pushFrame);
        assertEquals(1, decoded.events.size());
        JSONObject evt = decoded.events.get(0);
        assertEquals("WebcastLikeMessage", evt.getString("method"));
        assertEquals("50005", evt.getString("msgId"));
        assertEquals("tapper_1", evt.getString("username"));
        assertEquals(15L, evt.getLong("likeCount"));
        assertEquals(2450L, evt.getLong("totalLikeCount"));
    }

    @Test
    public void decodesSocialMessageUsingField4ActionNotField3ShareType() throws Exception {
        // Case A: shareType=3 (field 3) while action=1 (field 4) -> must preserve action=1 and shareType=3 separately
        ByteArrayOutputStream followPayload = new ByteArrayOutputStream();
        writeBytesField(followPayload, 1, encodeCommon(50006L, 1731571240L, "pm_main_follow_message_viewer_2"));
        writeBytesField(followPayload, 2, encodeUser(7006L, "follower_1", "Follower1", ""));
        writeVarintField(followPayload, 3, 3L);   // shareType = 3
        writeVarintField(followPayload, 4, 1L);   // action = 1 (follow)
        writeVarintField(followPayload, 6, 888L); // followCount = 888

        // Case B: shareType=2 (field 3), action=3 (field 4) -> share
        ByteArrayOutputStream sharePayload = new ByteArrayOutputStream();
        writeBytesField(sharePayload, 1, encodeCommon(50007L, 1731571241L, "pm_mt_guidance_share"));
        writeBytesField(sharePayload, 2, encodeUser(7007L, "sharer_1", "Sharer1", ""));
        writeVarintField(sharePayload, 3, 2L);   // shareType = 2
        writeVarintField(sharePayload, 4, 3L);   // action = 3 (share)
        writeVarintField(sharePayload, 6, 889L);

        byte[] envFollow = encodeEnvelope("WebcastSocialMessage", followPayload.toByteArray(), 50006L);
        byte[] envShare = encodeEnvelope("WebcastSocialMessage", sharePayload.toByteArray(), 50007L);
        byte[] pushFrame = encodePushFrame(96L, "pb", "msg", encodeResponse("", 0L, "", 0L, false, "", envFollow, envShare), false);

        TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(pushFrame);
        assertEquals(2, decoded.events.size());

        JSONObject followEvt = decoded.events.get(0);
        assertEquals("WebcastSocialMessage", followEvt.getString("method"));
        assertEquals("50006", followEvt.getString("msgId"));
        assertEquals("follower_1", followEvt.getString("username"));
        assertEquals(1L, followEvt.getLong("action"));
        assertEquals(3L, followEvt.getLong("shareType"));
        assertEquals(888L, followEvt.getLong("followCount"));
        assertEquals("pm_main_follow_message_viewer_2", followEvt.getString("displayKey"));

        JSONObject shareEvt = decoded.events.get(1);
        assertEquals("WebcastSocialMessage", shareEvt.getString("method"));
        assertEquals("50007", shareEvt.getString("msgId"));
        assertEquals("sharer_1", shareEvt.getString("username"));
        assertEquals(3L, shareEvt.getLong("action"));
        assertEquals(2L, shareEvt.getLong("shareType"));
        assertEquals(889L, shareEvt.getLong("followCount"));
    }

    @Test
    public void decodesMemberMessageWithJoinedAndSubscribedActions() throws Exception {
        ByteArrayOutputStream joinedPayload = new ByteArrayOutputStream();
        writeBytesField(joinedPayload, 1, encodeCommon(50008L, 1731571250L, ""));
        writeBytesField(joinedPayload, 2, encodeUser(7008L, "new_viewer", "NewViewer", ""));
        writeVarintField(joinedPayload, 3, 120L); // memberCount
        writeVarintField(joinedPayload, 10, 1L);  // JOINED = 1

        ByteArrayOutputStream subPayload = new ByteArrayOutputStream();
        writeBytesField(subPayload, 1, encodeCommon(50009L, 1731571251L, ""));
        writeBytesField(subPayload, 2, encodeUser(7009L, "subscriber_u", "SubUser", ""));
        writeVarintField(subPayload, 3, 121L);
        writeVarintField(subPayload, 10, 3L);     // SUBSCRIBED = 3

        byte[] envJoin = encodeEnvelope("WebcastMemberMessage", joinedPayload.toByteArray(), 50008L);
        byte[] envSub = encodeEnvelope("WebcastMemberMessage", subPayload.toByteArray(), 50009L);
        byte[] pushFrame = encodePushFrame(97L, "pb", "msg", encodeResponse("", 0L, "", 0L, false, "", envJoin, envSub), false);

        TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(pushFrame);
        assertEquals(2, decoded.events.size());

        JSONObject joinEvt = decoded.events.get(0);
        assertEquals("WebcastMemberMessage", joinEvt.getString("method"));
        assertEquals("50008", joinEvt.getString("msgId"));
        assertEquals("new_viewer", joinEvt.getString("username"));
        assertEquals(120L, joinEvt.getLong("memberCount"));
        assertEquals(1L, joinEvt.getLong("action"));

        JSONObject subEvt = decoded.events.get(1);
        assertEquals("WebcastMemberMessage", subEvt.getString("method"));
        assertEquals("50009", subEvt.getString("msgId"));
        assertEquals("subscriber_u", subEvt.getString("username"));
        assertEquals(121L, subEvt.getLong("memberCount"));
        assertEquals(3L, subEvt.getLong("action"));
    }

    @Test
    public void decodesRoomUserSeqMessageThroughFullPipeline() throws Exception {
        ByteArrayOutputStream seqPayload = new ByteArrayOutputStream();
        writeBytesField(seqPayload, 1, encodeCommon(50010L, 1731571260L, ""));
        writeVarintField(seqPayload, 3, 642L); // total viewers

        byte[] envelope = encodeEnvelope("WebcastRoomUserSeqMessage", seqPayload.toByteArray(), 50010L);
        byte[] pushFrame = encodePushFrame(98L, "pb", "msg", encodeResponse("", 0L, "", 0L, false, "", envelope), false);

        TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(pushFrame);
        assertEquals(1, decoded.events.size());
        JSONObject evt = decoded.events.get(0);
        assertEquals("WebcastRoomUserSeqMessage", evt.getString("method"));
        assertEquals("50010", evt.getString("msgId"));
        assertEquals(642L, evt.getLong("viewerCount"));
    }

    @Test
    public void decodesControlMessageThroughFullPipeline() throws Exception {
        ByteArrayOutputStream ctrlPayload = new ByteArrayOutputStream();
        writeBytesField(ctrlPayload, 1, encodeCommon(50011L, 1731571270L, ""));
        writeVarintField(ctrlPayload, 2, 3L); // STREAM_ENDED = 3

        byte[] envelope = encodeEnvelope("WebcastControlMessage", ctrlPayload.toByteArray(), 50011L);
        byte[] pushFrame = encodePushFrame(99L, "pb", "msg", encodeResponse("", 0L, "", 0L, false, "", envelope), false);

        TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(pushFrame);
        assertEquals(1, decoded.events.size());
        JSONObject evt = decoded.events.get(0);
        assertEquals("WebcastControlMessage", evt.getString("method"));
        assertEquals("50011", evt.getString("msgId"));
        assertEquals(3L, evt.getLong("controlAction"));
    }

    @Test
    public void imEnterRoomRespAckFramePreservesPayloadTypeWithoutFakeEvents() {
        byte[] ackFrame = encodePushFrame(100L, "pb", "im_enter_room_resp", new byte[0], false);
        TikTokWebcastDecoder.DecodedResponse decoded = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(ackFrame);
        assertEquals(100L, decoded.logId);
        assertEquals("im_enter_room_resp", decoded.payloadType);
        assertTrue(decoded.events.isEmpty());
    }

    @Test
    public void malformedPayloadsNeverEmitFakeEvents() {
        // Corrupt PushFrame with unsupported wire type
        byte[] corruptPushFrame = new byte[]{0x0B, 0x01}; // field 1, wire 3
        TikTokWebcastDecoder.DecodedResponse r1 = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(corruptPushFrame);
        assertTrue(r1.events.isEmpty());

        // Truncated gzip payload inside PushFrame
        byte[] badGzipFrame = encodePushFrame(101L, "pb", "msg", new byte[]{0x1F, (byte) 0x8B, 0x08, 0x00}, false);
        TikTokWebcastDecoder.DecodedResponse r2 = TikTokWebcastDecoder.decodeWebSocketBinaryFrame(badGzipFrame);
        assertTrue(r2.events.isEmpty());

        // Corrupt ChatMessage payload (length > buffer)
        byte[] corruptChat = new byte[]{0x1A, 50, 'h', 'i'}; // field 3, wire 2, len 50
        assertNull(TikTokWebcastDecoder.decodeWebcastPayload("WebcastChatMessage", corruptChat, 999L));

        // Corrupt Envelope message
        byte[] corruptEnvelope = new byte[]{0x0A, 18, 'W', 'e', 'b', 'c', 'a', 's', 't'}; // truncated string
        assertNull(TikTokWebcastDecoder.decodeEnvelopeMessage(corruptEnvelope));

        // Corrupt Response bytes with malformed outer tag
        byte[] corruptResponse = new byte[]{0x0B, 0x01};
        TikTokWebcastDecoder.DecodedResponse r3 = TikTokWebcastDecoder.decodeResponseBytes(corruptResponse, 1L, "msg");
        assertTrue(r3.events.isEmpty());
    }

    // =========================================================================
    // SCHEMA-DERIVED PROTOBUF TEST ENCODING HELPERS
    // =========================================================================

    private static byte[] encodePushFrame(
            long logId,
            String payloadEncoding,
            String payloadType,
            byte[] payload,
            boolean gzip
    ) {
        try {
            byte[] finalPayload = gzip ? gzip(payload) : payload;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (logId > 0L) writeVarintField(out, 2, logId);
            if (gzip) {
                ByteArrayOutputStream kv = new ByteArrayOutputStream();
                writeStringField(kv, 1, "compress_type");
                writeStringField(kv, 2, "gzip");
                writeBytesField(out, 5, kv.toByteArray());
            }
            if (payloadEncoding != null && !payloadEncoding.isEmpty()) {
                writeStringField(out, 6, payloadEncoding);
            }
            if (payloadType != null && !payloadType.isEmpty()) {
                writeStringField(out, 7, payloadType);
            }
            if (finalPayload != null) {
                writeBytesField(out, 8, finalPayload);
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new AssertionError(e);
        }
    }

    private static byte[] encodeResponse(
            String cursor,
            long fetchInterval,
            String internalExt,
            long heartbeatDuration,
            boolean needAck,
            String pushServer,
            byte[]... envelopes
    ) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] env : envelopes) {
            writeBytesField(out, 1, env);
        }
        if (cursor != null && !cursor.isEmpty()) writeStringField(out, 2, cursor);
        if (fetchInterval > 0L) writeVarintField(out, 3, fetchInterval);
        if (internalExt != null && !internalExt.isEmpty()) writeStringField(out, 5, internalExt);
        if (heartbeatDuration > 0L) writeVarintField(out, 8, heartbeatDuration);
        if (needAck) writeVarintField(out, 9, 1L);
        if (pushServer != null && !pushServer.isEmpty()) writeStringField(out, 10, pushServer);
        return out.toByteArray();
    }

    private static byte[] encodeEnvelope(String method, byte[] payload, long msgId) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeStringField(out, 1, method);
        writeBytesField(out, 2, payload);
        writeVarintField(out, 3, msgId);
        return out.toByteArray();
    }

    private static byte[] encodeChatPayload(
            long msgId,
            long createTime,
            long userId,
            String username,
            String nickname,
            String avatarUrl,
            String content
    ) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeBytesField(out, 1, encodeCommon(msgId, createTime, ""));
        writeBytesField(out, 2, encodeUser(userId, username, nickname, avatarUrl));
        writeStringField(out, 3, content);
        return out.toByteArray();
    }

    private static byte[] encodeCommon(long msgId, long createTime, String displayKey) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (msgId > 0L) writeVarintField(out, 2, msgId);
        if (createTime > 0L) writeVarintField(out, 4, createTime);
        if (displayKey != null && !displayKey.isEmpty()) {
            ByteArrayOutputStream text = new ByteArrayOutputStream();
            writeStringField(text, 1, displayKey);
            writeBytesField(out, 8, text.toByteArray());
        }
        return out.toByteArray();
    }

    private static byte[] encodeUser(long userId, String username, String nickname, String avatarUrl) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (userId > 0L) writeVarintField(out, 1, userId);
        if (nickname != null && !nickname.isEmpty()) writeStringField(out, 3, nickname);
        if (avatarUrl != null && !avatarUrl.isEmpty()) writeBytesField(out, 9, encodeImage(avatarUrl));
        if (username != null && !username.isEmpty()) writeStringField(out, 38, username);
        return out.toByteArray();
    }

    private static byte[] encodeImage(String url) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeStringField(out, 1, url);
        return out.toByteArray();
    }

    private static void writeVarintField(ByteArrayOutputStream out, int field, long value) {
        writeVarint(out, ((long) field << 3));
        writeVarint(out, value);
    }

    private static void writeStringField(ByteArrayOutputStream out, int field, String value) {
        writeBytesField(out, field, value.getBytes(StandardCharsets.UTF_8));
    }

    private static void writeBytesField(ByteArrayOutputStream out, int field, byte[] value) {
        writeVarint(out, ((long) field << 3) | 2L);
        writeVarint(out, value.length);
        out.write(value, 0, value.length);
    }

    private static void writeVarint(ByteArrayOutputStream out, long value) {
        long v = value;
        while ((v & ~0x7FL) != 0L) {
            out.write((int) ((v & 0x7FL) | 0x80L));
            v >>>= 7;
        }
        out.write((int) v);
    }

    private static byte[] gzip(byte[] raw) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (GZIPOutputStream gos = new GZIPOutputStream(baos)) {
            gos.write(raw);
        }
        return baos.toByteArray();
    }
}
