package com.syntxrr.streamtools;

import org.junit.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class ModeBSceneReplacementFenceTest {
    @Test public void firesOnlyAfterTwoCompletedOutputFrames() {
        ModeBSceneReplacementFence fence = new ModeBSceneReplacementFence();
        AtomicInteger calls = new AtomicInteger();
        fence.arm(calls::incrementAndGet);
        long first = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(first, true);
        assertEquals(0, calls.get());
        long second = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(second, true);
        assertEquals(1, calls.get());
        fence.onOutputFrameDrawn(second, true);
        assertEquals(1, calls.get());
    }

    @Test public void disarmCancelsPendingNotificationAndInvalidatesInflightDraw() {
        ModeBSceneReplacementFence fence = new ModeBSceneReplacementFence();
        AtomicInteger calls = new AtomicInteger();
        fence.arm(calls::incrementAndGet);
        long oldFrame = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(oldFrame, true);
        long inflightAtDisarm = fence.beginOutputFrame();
        fence.disarm();
        fence.onOutputFrameDrawn(inflightAtDisarm, true);
        assertEquals(0, calls.get());
    }

    @Test public void rearmStartsANewFrameWindowAndRejectsOldGenerationDraws() {
        ModeBSceneReplacementFence fence = new ModeBSceneReplacementFence();
        AtomicInteger calls = new AtomicInteger();
        fence.arm(calls::incrementAndGet);
        long oldGenerationFrame = fence.beginOutputFrame();
        fence.arm(calls::incrementAndGet);
        fence.onOutputFrameDrawn(oldGenerationFrame, true);
        assertEquals(0, calls.get());
        long firstNew = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(firstNew, true);
        assertEquals(0, calls.get());
        long secondNew = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(secondNew, true);
        assertEquals(1, calls.get());
    }

    @Test public void drawThatStartedBeforeFirstArmCannotSatisfyNewFence() {
        ModeBSceneReplacementFence fence = new ModeBSceneReplacementFence();
        long unarmedFrame = fence.beginOutputFrame();
        AtomicInteger calls = new AtomicInteger();
        fence.arm(calls::incrementAndGet);
        fence.onOutputFrameDrawn(unarmedFrame, true);
        assertEquals(0, calls.get());
        long first = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(first, true);
        assertEquals(0, calls.get());
    }

    @Test public void staleCompletionAfterConcurrentRearmCannotConsumeNewFenceFrame() throws Exception {
        ModeBSceneReplacementFence fence = new ModeBSceneReplacementFence();
        CountDownLatch frameStarted = new CountDownLatch(1);
        CountDownLatch finishOldFrame = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        fence.arm(() -> { });
        long oldGeneration = fence.beginOutputFrame();
        Thread delayedCompletion = new Thread(() -> {
            frameStarted.countDown();
            try {
                if (!finishOldFrame.await(2, TimeUnit.SECONDS)) throw new AssertionError("Timed out waiting to finish old frame");
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError(exception);
            }
            fence.onOutputFrameDrawn(oldGeneration, true);
        }, "stale-scene-fence-frame");
        delayedCompletion.start();
        assertTrue(frameStarted.await(2, TimeUnit.SECONDS));
        fence.arm(calls::incrementAndGet);
        finishOldFrame.countDown();
        delayedCompletion.join(2_000L);
        assertFalse("Delayed GL completion thread must finish", delayedCompletion.isAlive());
        assertEquals(0, calls.get());
        long firstNew = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(firstNew, true);
        assertEquals(0, calls.get());
        long secondNew = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(secondNew, true);
        assertEquals(1, calls.get());
    }

    @Test public void concurrentCompletionsFireListenerOnlyOnce() throws Exception {
        ModeBSceneReplacementFence fence = new ModeBSceneReplacementFence();
        AtomicInteger calls = new AtomicInteger();
        fence.arm(calls::incrementAndGet);
        long frameGeneration = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(frameGeneration, true);
        Thread a = new Thread(() -> fence.onOutputFrameDrawn(frameGeneration, true));
        Thread b = new Thread(() -> fence.onOutputFrameDrawn(frameGeneration, true));
        a.start();
        b.start();
        a.join(2_000L);
        b.join(2_000L);
        assertFalse(a.isAlive());
        assertFalse(b.isAlive());
        assertEquals(1, calls.get());
    }
    @Test public void repeatedGlDrawsWithoutFreshSurfaceTextureFramesDoNotSatisfyReadiness() {
        ModeBSceneReplacementFence fence = new ModeBSceneReplacementFence();
        AtomicInteger calls = new AtomicInteger();
        fence.arm(calls::incrementAndGet);
        long first = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(first, false);
        long second = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(second, false);
        long third = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(third, false);
        assertEquals(0, calls.get());
        long firstFresh = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(firstFresh, true);
        assertEquals(0, calls.get());
        long secondFresh = fence.beginOutputFrame();
        fence.onOutputFrameDrawn(secondFresh, true);
        assertEquals(1, calls.get());
    }

    @Test public void onlyFreshSourceFramesAdvanceTheFenceCounter() {
        ModeBSceneReplacementFence fence = new ModeBSceneReplacementFence();
        AtomicInteger calls = new AtomicInteger();
        fence.arm(calls::incrementAndGet);
        fence.onOutputFrameDrawn(fence.beginOutputFrame(), true);
        fence.onOutputFrameDrawn(fence.beginOutputFrame(), false);
        fence.onOutputFrameDrawn(fence.beginOutputFrame(), false);
        assertEquals(0, calls.get());
        fence.onOutputFrameDrawn(fence.beginOutputFrame(), true);
        assertEquals(1, calls.get());
    }

    @Test public void staleTextureDrawsFromOldGenerationCannotCompleteRearmedFence() {
        ModeBSceneReplacementFence fence = new ModeBSceneReplacementFence();
        AtomicInteger calls = new AtomicInteger();
        fence.arm(calls::incrementAndGet);
        long oldGeneration = fence.beginOutputFrame();
        fence.arm(calls::incrementAndGet);
        fence.onOutputFrameDrawn(oldGeneration, true);
        fence.onOutputFrameDrawn(fence.beginOutputFrame(), false);
        assertEquals(0, calls.get());
        fence.onOutputFrameDrawn(fence.beginOutputFrame(), true);
        assertEquals(0, calls.get());
        fence.onOutputFrameDrawn(fence.beginOutputFrame(), true);
        assertEquals(1, calls.get());
    }

}
