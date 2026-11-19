package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public final class ModeBWorkerReleaseBarrierTest {
    @Test public void acknowledgementRunsAfterPreviouslyQueuedFileRead() {
        ArrayDeque<Runnable> queue = new ArrayDeque<>();
        List<String> order = new ArrayList<>();
        queue.add(() -> order.add("old-file-read"));
        boolean queued = ModeBWorkerReleaseBarrier.enqueue(task -> { queue.add(task); return true; },
                () -> order.add("delete-old-namespace"));
        assertTrue(queued);
        while (!queue.isEmpty()) queue.removeFirst().run();
        assertEquals(2, order.size());
        assertEquals("old-file-read", order.get(0));
        assertEquals("delete-old-namespace", order.get(1));
    }

    @Test public void rejectedBarrierDoesNotAcknowledgeDeletion() {
        final boolean[] deleted = { false };
        boolean queued = ModeBWorkerReleaseBarrier.enqueue(task -> false, () -> deleted[0] = true);
        assertFalse(queued);
        assertFalse(deleted[0]);
    }

    @Test public void nullAcknowledgementDoesNotRequireQueue() {
        assertTrue(ModeBWorkerReleaseBarrier.enqueue(null, null));
    }
}
