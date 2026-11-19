package com.syntxrr.streamtools;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;

/**
 * Bounded round-robin queue for visual frame work on the Mode B session worker.
 * At most one not-yet-started frame is retained for each source. A source that
 * finishes a frame and re-enqueues itself goes to the tail behind other ready sources.
 */
final class ModeBVisualFrameArbiter {
    private final ArrayDeque<String> readyOrder = new ArrayDeque<>();
    private final Map<String, Runnable> pendingBySource = new HashMap<>();

    synchronized boolean offer(String sourceId, Runnable frameWork) {
        if (sourceId == null || sourceId.trim().isEmpty() || frameWork == null
                || pendingBySource.containsKey(sourceId)) {
            return false;
        }
        pendingBySource.put(sourceId, frameWork);
        readyOrder.addLast(sourceId);
        return true;
    }

    synchronized Runnable pollNext() {
        while (!readyOrder.isEmpty()) {
            String sourceId = readyOrder.removeFirst();
            Runnable task = pendingBySource.remove(sourceId);
            if (task != null) return task;
        }
        return null;
    }

    synchronized boolean remove(String sourceId) {
        if (sourceId == null) return false;
        Runnable removed = pendingBySource.remove(sourceId);
        if (removed == null) return false;
        readyOrder.remove(sourceId);
        return true;
    }

    synchronized boolean hasPending(String sourceId) {
        return sourceId != null && pendingBySource.containsKey(sourceId);
    }

    synchronized int pendingCount() {
        return pendingBySource.size();
    }

    synchronized boolean isEmpty() {
        return pendingBySource.isEmpty();
    }

    synchronized void clear() {
        readyOrder.clear();
        pendingBySource.clear();
    }
}
