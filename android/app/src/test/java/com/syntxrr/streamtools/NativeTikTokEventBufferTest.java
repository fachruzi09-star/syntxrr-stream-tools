package com.syntxrr.streamtools;

import org.json.JSONObject;
import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** Offline deterministic unit tests for NativeTikTokEventBuffer. */
public class NativeTikTokEventBufferTest {

    @Test
    public void sequencesIncreaseMonotonicallyAndAttachMetadataWithoutMutatingSource() throws Exception {
        NativeTikTokEventBuffer buffer = new NativeTikTokEventBuffer();
        long initialSession = buffer.getCurrentSessionId();

        JSONObject source1 = new JSONObject()
                .put("method", "WebcastChatMessage")
                .put("msgId", "m1")
                .put("content", "halo");
        JSONObject source2 = new JSONObject()
                .put("method", "WebcastGiftMessage")
                .put("msgId", "m2")
                .put("giftId", "5655");

        JSONObject rec1 = buffer.record(source1);
        JSONObject rec2 = buffer.record(source2);

        // Source objects must remain untouched.
        assertFalse(source1.has("nativeSequence"));
        assertFalse(source1.has("nativeSessionId"));
        assertFalse(source2.has("nativeSequence"));
        assertFalse(source2.has("nativeSessionId"));

        assertEquals(1L, rec1.getLong("nativeSequence"));
        assertEquals(2L, rec2.getLong("nativeSequence"));
        assertEquals(initialSession, rec1.getLong("nativeSessionId"));
        assertEquals(initialSession, rec2.getLong("nativeSessionId"));
        assertEquals("halo", rec1.getString("content"));
        assertEquals("5655", rec2.getString("giftId"));
        assertEquals(2, buffer.size());
    }

    @Test
    public void capacityStaysBoundedAt256AndEvictsOldestChronologically() throws Exception {
        NativeTikTokEventBuffer buffer = new NativeTikTokEventBuffer();
        long sessionId = buffer.getCurrentSessionId();

        for (int i = 1; i <= 300; i++) {
            JSONObject evt = new JSONObject()
                    .put("method", "WebcastChatMessage")
                    .put("msgId", "msg-" + i);
            buffer.record(evt);
        }

        assertEquals(NativeTikTokEventBuffer.MAX_CAPACITY, buffer.size());

        NativeTikTokEventBuffer.Snapshot snap = buffer.getEventsSince(sessionId, 0L, 500);
        assertEquals(sessionId, snap.sessionId);
        assertEquals(256, snap.events.size());
        assertEquals(45L, snap.oldestSequence);
        assertEquals(300L, snap.latestSequence);
        assertTrue(snap.overflow);
        assertEquals(44L, snap.droppedCount);
        assertFalse(snap.hasMore);
        assertFalse(snap.sessionChanged);

        // Verify chronological order across retained entries.
        List<JSONObject> events = snap.events;
        assertEquals(45L, events.get(0).getLong("nativeSequence"));
        assertEquals("msg-45", events.get(0).getString("msgId"));
        assertEquals(300L, events.get(255).getLong("nativeSequence"));
        assertEquals("msg-300", events.get(255).getString("msgId"));
    }

    @Test
    public void afterSequenceAndLimitFilterAndClampCorrectlyWithoutMutatingBuffer() throws Exception {
        NativeTikTokEventBuffer buffer = new NativeTikTokEventBuffer();
        long sessionId = buffer.getCurrentSessionId();

        for (int i = 1; i <= 10; i++) {
            buffer.record(new JSONObject().put("method", "WebcastChatMessage").put("msgId", "m" + i));
        }

        NativeTikTokEventBuffer.Snapshot page1 = buffer.getEventsSince(sessionId, 3L, 4);
        assertFalse(page1.overflow);
        assertEquals(0L, page1.droppedCount);
        assertTrue(page1.hasMore);
        assertFalse(page1.sessionChanged);
        assertEquals(1L, page1.oldestSequence);
        assertEquals(10L, page1.latestSequence);
        assertEquals(4, page1.events.size());
        assertEquals(4L, page1.events.get(0).getLong("nativeSequence"));
        assertEquals(7L, page1.events.get(3).getLong("nativeSequence"));

        // Mutating snapshot output must not affect subsequent reads.
        page1.events.get(0).put("msgId", "tampered");

        NativeTikTokEventBuffer.Snapshot page2 = buffer.getEventsSince(sessionId, 7L, 100);
        assertFalse(page2.overflow);
        assertEquals(0L, page2.droppedCount);
        assertFalse(page2.hasMore);
        assertEquals(3, page2.events.size());
        assertEquals(8L, page2.events.get(0).getLong("nativeSequence"));
        assertEquals(10L, page2.events.get(2).getLong("nativeSequence"));

        NativeTikTokEventBuffer.Snapshot rereadFirst = buffer.getEventsSince(sessionId, 3L, 1);
        assertEquals("m4", rereadFirst.events.get(0).getString("msgId"));
        assertTrue(rereadFirst.hasMore);
        assertEquals(10, buffer.size());

        // Invalid non-positive limit clamps safely to 1; excessive limit clamps to 256.
        assertEquals(1, NativeTikTokEventBuffer.clampLimit(0));
        assertEquals(1, NativeTikTokEventBuffer.clampLimit(-50));
        assertEquals(256, NativeTikTokEventBuffer.clampLimit(1000));
    }

    @Test
    public void sameSessionEvictionReportsExactMissingCountAboveAfterSequence() throws Exception {
        NativeTikTokEventBuffer buffer = new NativeTikTokEventBuffer();
        long sessionId = buffer.getCurrentSessionId();

        for (int i = 1; i <= 280; i++) {
            buffer.record(new JSONObject().put("method", "WebcastLikeMessage").put("likeCount", i));
        }
        // Retained sequences: 25..280 (oldest=25).
        // Caller saw up to 10 => missing sequences 11..24 => 14 dropped.
        NativeTikTokEventBuffer.Snapshot missedSnap = buffer.getEventsSince(sessionId, 10L, 256);
        assertTrue(missedSnap.overflow);
        assertEquals(14L, missedSnap.droppedCount);
        assertEquals(25L, missedSnap.oldestSequence);
        assertEquals(280L, missedSnap.latestSequence);

        // Caller already caught up to 24 => no gap before oldest=25 => overflow=false.
        NativeTikTokEventBuffer.Snapshot caughtUpSnap = buffer.getEventsSince(sessionId, 24L, 256);
        assertFalse(caughtUpSnap.overflow);
        assertEquals(0L, caughtUpSnap.droppedCount);
        assertEquals(256, caughtUpSnap.events.size());
    }

    @Test
    public void beginSessionClearsPreviousEntriesIncrementsSessionAndPreservesSequenceCounter() throws Exception {
        NativeTikTokEventBuffer buffer = new NativeTikTokEventBuffer();
        long s1 = buffer.getCurrentSessionId();
        buffer.record(new JSONObject().put("method", "WebcastChatMessage").put("msgId", "old1"));
        buffer.record(new JSONObject().put("method", "WebcastChatMessage").put("msgId", "old2"));

        long s2 = buffer.beginSession();
        assertEquals(s1 + 1L, s2);
        assertEquals(0, buffer.size());

        // Empty new session queried with stale sessionId reports sessionChanged=true cleanly.
        NativeTikTokEventBuffer.Snapshot emptyNewSession = buffer.getEventsSince(s1, 1L, 256);
        assertTrue(emptyNewSession.sessionChanged);
        assertEquals(s2, emptyNewSession.sessionId);
        assertEquals(0, emptyNewSession.events.size());
        assertFalse(emptyNewSession.overflow);
        assertEquals(0L, emptyNewSession.droppedCount);

        JSONObject s2Event1 = buffer.record(new JSONObject().put("method", "WebcastChatMessage").put("msgId", "new1"));
        JSONObject s2Event2 = buffer.record(new JSONObject().put("method", "WebcastChatMessage").put("msgId", "new2"));

        // Sequences continue monotonically from 3 and 4, NOT restarted at 1.
        assertEquals(3L, s2Event1.getLong("nativeSequence"));
        assertEquals(4L, s2Event2.getLong("nativeSequence"));
        assertEquals(s2, s2Event1.getLong("nativeSessionId"));
        assertEquals(2, buffer.size());

        // Stale session query returns all session 2 entries from its beginning with sessionChanged=true,
        // even when caller passed an afterSequence from the previous session.
        NativeTikTokEventBuffer.Snapshot staleQuery = buffer.getEventsSince(s1, 3L, 256);
        assertTrue(staleQuery.sessionChanged);
        assertFalse(staleQuery.overflow);
        assertEquals(0L, staleQuery.droppedCount);
        assertEquals(s2, staleQuery.sessionId);
        assertEquals(2, staleQuery.events.size());
        assertEquals(3L, staleQuery.events.get(0).getLong("nativeSequence"));
        assertEquals("new1", staleQuery.events.get(0).getString("msgId"));
        assertEquals(4L, staleQuery.events.get(1).getLong("nativeSequence"));
        assertEquals("new2", staleQuery.events.get(1).getString("msgId"));
    }
}
