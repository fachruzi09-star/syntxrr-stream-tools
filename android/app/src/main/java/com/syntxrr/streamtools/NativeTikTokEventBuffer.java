package com.syntxrr.streamtools;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

/**
 * NativeTikTokEventBuffer
 *
 * Bounded in-memory replay buffer (kapasitas tetap 256 event) untuk event TikTok LIVE native
 * di Mode A. Setiap event yang diterima dari TikTokLiveConnector diberi nomor urut monotonik
 * lintas proses ("nativeSequence") serta penanda sesi ("nativeSessionId") pada salinan JSON
 * tanpa mengubah objek sumber maupun menyimpannya ke disk.
 */
final class NativeTikTokEventBuffer {

    static final int MAX_CAPACITY = 256;

    private static final class Entry {
        final long sessionId;
        final long sequence;
        @NonNull
        final JSONObject eventCopy;

        Entry(long sessionId, long sequence, @NonNull JSONObject eventCopy) {
            this.sessionId = sessionId;
            this.sequence = sequence;
            this.eventCopy = eventCopy;
        }
    }

    static final class Snapshot {
        final long sessionId;
        @NonNull
        final List<JSONObject> events;
        final long oldestSequence;
        final long latestSequence;
        final boolean overflow;
        final long droppedCount;
        final boolean hasMore;
        final boolean sessionChanged;

        Snapshot(
                long sessionId,
                @NonNull List<JSONObject> events,
                long oldestSequence,
                long latestSequence,
                boolean overflow,
                long droppedCount,
                boolean hasMore,
                boolean sessionChanged
        ) {
            this.sessionId = sessionId;
            this.events = Collections.unmodifiableList(events);
            this.oldestSequence = oldestSequence;
            this.latestSequence = latestSequence;
            this.overflow = overflow;
            this.droppedCount = Math.max(0L, droppedCount);
            this.hasMore = hasMore;
            this.sessionChanged = sessionChanged;
        }

        @NonNull
        JSONObject toJsonObject() {
            JSONObject obj = new JSONObject();
            JSONArray array = new JSONArray();
            for (JSONObject event : events) {
                array.put(copyEventJson(event));
            }
            try {
                obj.put("sessionId", sessionId);
                obj.put("events", array);
                obj.put("oldestSequence", oldestSequence);
                obj.put("latestSequence", latestSequence);
                obj.put("overflow", overflow);
                obj.put("droppedCount", droppedCount);
                obj.put("hasMore", hasMore);
                obj.put("sessionChanged", sessionChanged);
            } catch (Exception ignored) {
            }
            return obj;
        }
    }

    private final Object mLock = new Object();
    private final ArrayDeque<Entry> mEntries = new ArrayDeque<>(MAX_CAPACITY);
    private long mSessionId = 1L;
    private long mNextSequence = 1L;
    private long mSessionFirstSequence = 1L;

    /**
     * Memulai sesi koneksi eksplisit baru: menaikkan sessionId dan mengosongkan entry
     * dari sesi sebelumnya tanpa me-reset counter urutan global yang monotonik.
     */
    long beginSession() {
        synchronized (mLock) {
            mSessionId++;
            mEntries.clear();
            mSessionFirstSequence = mNextSequence;
            return mSessionId;
        }
    }

    long getCurrentSessionId() {
        synchronized (mLock) {
            return mSessionId;
        }
    }

    long getLatestSequence() {
        synchronized (mLock) {
            return mNextSequence - 1L;
        }
    }

    int size() {
        synchronized (mLock) {
            return mEntries.size();
        }
    }

    /**
     * Menyimpan salinan event ke buffer dengan metadata nativeSequence dan nativeSessionId.
     * Tidak memutasi objek JSON sumber dan mengembalikan salinan aman untuk batch delivery.
     */
    @NonNull
    JSONObject record(@NonNull JSONObject sourceEvent) {
        JSONObject storedCopy = copyEventJson(sourceEvent);
        final long assignedSeq;
        final long assignedSessionId;
        synchronized (mLock) {
            assignedSeq = mNextSequence++;
            assignedSessionId = mSessionId;
            try {
                storedCopy.put("nativeSequence", assignedSeq);
                storedCopy.put("nativeSessionId", assignedSessionId);
            } catch (Exception ignored) {
            }
            while (mEntries.size() >= MAX_CAPACITY) {
                mEntries.pollFirst();
            }
            mEntries.addLast(new Entry(assignedSessionId, assignedSeq, storedCopy));
        }
        return copyEventJson(storedCopy);
    }

    @NonNull
    Snapshot getEventsSince(long requestedSessionId, long afterSequence, int requestedLimit) {
        int clampedLimit = clampLimit(requestedLimit);
        synchronized (mLock) {
            boolean sessionChanged = requestedSessionId != mSessionId;
            long effectiveAfterSeq = sessionChanged ? 0L : Math.max(0L, afterSequence);

            if (mEntries.isEmpty()) {
                return new Snapshot(
                        mSessionId,
                        Collections.<JSONObject>emptyList(),
                        0L,
                        0L,
                        false,
                        0L,
                        false,
                        sessionChanged
                );
            }

            long oldestSequence = mEntries.peekFirst().sequence;
            long latestSequence = mEntries.peekLast().sequence;

            long expectedNextSequence = effectiveAfterSeq < mSessionFirstSequence
                    ? mSessionFirstSequence
                    : effectiveAfterSeq + 1L;
            long missingCount = Math.max(0L, oldestSequence - expectedNextSequence);
            boolean overflow = missingCount > 0L;

            List<JSONObject> result = new ArrayList<>(Math.min(clampedLimit, mEntries.size()));
            boolean hasMore = false;

            for (Entry entry : mEntries) {
                if (entry.sequence <= effectiveAfterSeq) {
                    continue;
                }
                if (result.size() < clampedLimit) {
                    result.add(copyEventJson(entry.eventCopy));
                } else {
                    hasMore = true;
                    break;
                }
            }

            return new Snapshot(
                    mSessionId,
                    result,
                    oldestSequence,
                    latestSequence,
                    overflow,
                    missingCount,
                    hasMore,
                    sessionChanged
            );
        }
    }

    static int clampLimit(int requestedLimit) {
        if (requestedLimit <= 0) {
            return 1;
        }
        return Math.min(MAX_CAPACITY, requestedLimit);
    }

    @NonNull
    static JSONObject copyEventJson(@Nullable JSONObject source) {
        if (source == null) {
            return new JSONObject();
        }
        try {
            return new JSONObject(source.toString());
        } catch (Exception ignored) {
            JSONObject fallback = new JSONObject();
            Iterator<String> keys = source.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                try {
                    fallback.put(key, source.opt(key));
                } catch (Exception ignoredPut) {
                }
            }
            return fallback;
        }
    }
}
