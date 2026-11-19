package com.syntxrr.streamtools;

import org.junit.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class ModeBSceneLayerOpacityStateTest {
    @Test
    public void defaultsToFullyVisible() {
        assertOpacity(1f, new ModeBSceneLayerOpacityState().snapshot());
    }

    @Test
    public void clampsOpacityToSupportedRange() {
        ModeBSceneLayerOpacityState state = new ModeBSceneLayerOpacityState(-0.5f);
        assertOpacity(0f, state.snapshot());
        state.set(1.5f);
        assertOpacity(1f, state.snapshot());
        state.set(0.375f);
        assertOpacity(0.375f, state.snapshot());
    }

    @Test
    public void ignoresNonFiniteAnimatorValues() {
        ModeBSceneLayerOpacityState state = new ModeBSceneLayerOpacityState(0.4f);
        state.set(Float.NaN);
        assertOpacity(0.4f, state.snapshot());
        state.set(Float.POSITIVE_INFINITY);
        assertOpacity(0.4f, state.snapshot());
        state.set(Float.NEGATIVE_INFINITY);
        assertOpacity(0.4f, state.snapshot());
    }

    @Test
    public void frameSnapshotDoesNotChangeWhenAnimatorAdvances() {
        ModeBSceneLayerOpacityState shared = new ModeBSceneLayerOpacityState(0.2f);
        float overlayFrameSnapshot = shared.snapshot();
        shared.set(0.8f);
        float backgroundFrameSnapshot = shared.snapshot();

        assertOpacity(0.2f, overlayFrameSnapshot);
        assertOpacity(0.8f, backgroundFrameSnapshot);
        assertOpacity(0.8f, shared.snapshot());
    }

    @Test
    public void backgroundAndOverlayUseOneOpacitySnapshotForTheSameOutputPass() {
        ModeBSceneLayerOpacityState state = new ModeBSceneLayerOpacityState(0.25f);
        float backgroundOpacity = state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_BACKGROUND);
        state.set(0.75f); // Animator advances between the two GL filter draws.
        float overlayOpacity = state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_OVERLAY);

        assertOpacity(0.25f, backgroundOpacity);
        assertOpacity(0.25f, overlayOpacity);
        assertOpacity(0.75f, state.snapshot());
    }

    @Test
    public void nextOutputPassCapturesTheLatestAnimatorOpacity() {
        ModeBSceneLayerOpacityState state = new ModeBSceneLayerOpacityState(0.2f);
        assertOpacity(0.2f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_BACKGROUND));
        assertOpacity(0.2f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_OVERLAY));
        state.set(0.9f);
        assertOpacity(0.9f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_BACKGROUND));
        assertOpacity(0.9f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_OVERLAY));
    }

    @Test
    public void nextBackgroundDrawReplacesSnapshotWhenPriorOverlayWasSkipped() {
        ModeBSceneLayerOpacityState state = new ModeBSceneLayerOpacityState(0.3f);
        assertOpacity(0.3f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_BACKGROUND));
        state.set(0.6f);
        // Simulates an aborted GL pass that never reached the overlay filter.
        assertOpacity(0.6f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_BACKGROUND));
        assertOpacity(0.6f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_OVERLAY));
    }

    @Test
    public void singleLayerReadsCurrentOpacityWithoutPairCache() {
        ModeBSceneLayerOpacityState state = new ModeBSceneLayerOpacityState(0.1f);
        assertOpacity(0.1f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_SINGLE));
        state.set(0.8f);
        assertOpacity(0.8f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_SINGLE));
    }

    @Test
    public void overlayWithoutBackgroundPartnerUsesCurrentOpacity() {
        ModeBSceneLayerOpacityState state = new ModeBSceneLayerOpacityState(0.4f);
        assertOpacity(0.4f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_OVERLAY));
        state.set(0.7f);
        assertOpacity(0.7f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_OVERLAY));
    }

    @Test
    public void animatorUpdateIsVisibleToOtherLayerWorker() throws Exception {
        ModeBSceneLayerOpacityState shared = new ModeBSceneLayerOpacityState(1f);
        CountDownLatch written = new CountDownLatch(1);
        Thread animator = new Thread(() -> {
            shared.set(0.625f);
            written.countDown();
        }, "scene-opacity-animator-test");
        animator.start();

        if (!written.await(2, TimeUnit.SECONDS)) {
            throw new AssertionError("Animator opacity update was not published");
        }
        animator.join(2_000L);
        if (animator.isAlive()) throw new AssertionError("Animator test thread did not retire");
        assertOpacity(0.625f, shared.snapshot());
    }

    @Test
    public void oldAndStagedScenePairsKeepIndependentPassSnapshots() {
        ModeBSceneLayerOpacityState oldScene = new ModeBSceneLayerOpacityState(0.8f);
        ModeBSceneLayerOpacityState stagedScene = new ModeBSceneLayerOpacityState(0.2f);

        float oldBackground = oldScene.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_BACKGROUND);
        float stagedBackground = stagedScene.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_BACKGROUND);
        oldScene.set(0.4f);
        stagedScene.set(0.9f);

        float stagedOverlay = stagedScene.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_OVERLAY);
        float oldOverlay = oldScene.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_OVERLAY);
        assertOpacity(0.8f, oldBackground);
        assertOpacity(0.2f, stagedBackground);
        assertOpacity(0.8f, oldOverlay);
        assertOpacity(0.2f, stagedOverlay);
    }

    @Test
    public void encoderAndPreviewPassesCaptureTheirOwnOpacitySnapshots() {
        ModeBSceneLayerOpacityState state = new ModeBSceneLayerOpacityState(0.3f);

        // Encoder output pass: background then overlay.
        assertOpacity(0.3f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_BACKGROUND));
        assertOpacity(0.3f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_OVERLAY));

        // Animator update between RootEncoder's output and preview passes.
        state.set(0.7f);
        assertOpacity(0.7f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_BACKGROUND));
        assertOpacity(0.7f,
                state.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_OVERLAY));
    }

    @Test
    public void overlayConsumesOnlyItsOwnPendingBackgroundSnapshot() {
        ModeBSceneLayerOpacityState firstPair = new ModeBSceneLayerOpacityState(0.2f);
        ModeBSceneLayerOpacityState secondPair = new ModeBSceneLayerOpacityState(0.8f);
        firstPair.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_BACKGROUND);
        secondPair.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_BACKGROUND);
        firstPair.set(0.4f);
        secondPair.set(0.6f);

        assertOpacity(0.2f,
                firstPair.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_OVERLAY));
        assertOpacity(0.8f,
                secondPair.snapshotForOutputLayer(ModeBSceneLayerOpacityState.ROLE_OVERLAY));
        assertOpacity(0.4f, firstPair.snapshot());
        assertOpacity(0.6f, secondPair.snapshot());
    }

    private static void assertOpacity(float expected, float actual) {
        if (Float.compare(expected, actual) != 0) {
            throw new AssertionError("Expected opacity " + expected + " but was " + actual);
        }
    }
}
