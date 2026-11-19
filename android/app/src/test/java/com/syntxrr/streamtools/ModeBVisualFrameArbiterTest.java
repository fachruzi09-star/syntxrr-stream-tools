package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public final class ModeBVisualFrameArbiterTest {
    @Test
    public void servesCameraAndTwoVideosInRoundRobinOrder() {
        ModeBVisualFrameArbiter arbiter = new ModeBVisualFrameArbiter();
        List<String> order = new ArrayList<>();
        assertTrue(arbiter.offer("camera", () -> order.add("camera-1")));
        assertTrue(arbiter.offer("video-a", () -> order.add("video-a-1")));
        assertTrue(arbiter.offer("video-b", () -> order.add("video-b-1")));

        Runnable camera = arbiter.pollNext();
        assertNotNull(camera);
        camera.run();
        assertTrue(arbiter.offer("camera", () -> order.add("camera-2")));

        Runnable videoA = arbiter.pollNext();
        Runnable videoB = arbiter.pollNext();
        Runnable cameraAgain = arbiter.pollNext();
        assertNotNull(videoA);
        assertNotNull(videoB);
        assertNotNull(cameraAgain);
        videoA.run();
        videoB.run();
        cameraAgain.run();
        assertEquals(4, order.size());
        assertEquals("camera-1", order.get(0));
        assertEquals("video-a-1", order.get(1));
        assertEquals("video-b-1", order.get(2));
        assertEquals("camera-2", order.get(3));
        assertTrue(arbiter.isEmpty());
    }

    @Test
    public void screensaverVideoSharesFairQueueWithCameraAndTwoOverlayVideos() {
        ModeBVisualFrameArbiter arbiter = new ModeBVisualFrameArbiter();
        List<String> order = new ArrayList<>();
        assertTrue(arbiter.offer("camera", () -> order.add("camera")));
        assertTrue(arbiter.offer("video-a", () -> order.add("video-a")));
        assertTrue(arbiter.offer("video-b", () -> order.add("video-b")));
        assertTrue(arbiter.offer("screensaver-video", () -> order.add("screensaver-video")));

        for (int i = 0; i < 4; i++) {
            Runnable next = arbiter.pollNext();
            assertNotNull(next);
            next.run();
        }
        assertEquals(4, order.size());
        assertEquals("camera", order.get(0));
        assertEquals("video-a", order.get(1));
        assertEquals("video-b", order.get(2));
        assertEquals("screensaver-video", order.get(3));
        assertTrue(arbiter.isEmpty());
    }

    @Test
    public void retainsAtMostOneWaitingFramePerSource() {
        ModeBVisualFrameArbiter arbiter = new ModeBVisualFrameArbiter();
        assertTrue(arbiter.offer("video-a", () -> { }));
        assertFalse(arbiter.offer("video-a", () -> { }));
        assertEquals(1, arbiter.pendingCount());
        assertNotNull(arbiter.pollNext());
        assertTrue(arbiter.offer("video-a", () -> { }));
    }

    @Test
    public void removingReleasedSourceDoesNotDisturbOtherSources() {
        ModeBVisualFrameArbiter arbiter = new ModeBVisualFrameArbiter();
        assertTrue(arbiter.offer("camera", () -> { }));
        assertTrue(arbiter.offer("video-a", () -> { }));
        assertTrue(arbiter.remove("camera"));
        assertFalse(arbiter.remove("camera"));
        assertEquals(1, arbiter.pendingCount());
        assertNotNull(arbiter.pollNext());
        assertNull(arbiter.pollNext());
    }

    @Test
    public void rejectsInvalidSourcesAndTasks() {
        ModeBVisualFrameArbiter arbiter = new ModeBVisualFrameArbiter();
        assertFalse(arbiter.offer(null, () -> { }));
        assertFalse(arbiter.offer("  ", () -> { }));
        assertFalse(arbiter.offer("camera", null));
        assertTrue(arbiter.isEmpty());
    }

    @Test
    public void clearDropsAllWaitingFrames() {
        ModeBVisualFrameArbiter arbiter = new ModeBVisualFrameArbiter();
        assertTrue(arbiter.offer("camera", () -> { }));
        assertTrue(arbiter.offer("video-a", () -> { }));
        arbiter.clear();
        assertTrue(arbiter.isEmpty());
        assertNull(arbiter.pollNext());
    }
}
