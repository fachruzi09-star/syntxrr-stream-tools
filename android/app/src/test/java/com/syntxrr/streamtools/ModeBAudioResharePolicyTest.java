package com.syntxrr.streamtools;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class ModeBAudioResharePolicyTest {
    @Test public void internalAudioIsSilencedAndRestoredAfterProjectionReshare() {
        assertTrue(ModeBAudioResharePolicy.requiresProjectionAudio("internal"));
        assertTrue(ModeBAudioResharePolicy.shouldSilenceForProjectionLoss("internal", false));
        assertTrue(ModeBAudioResharePolicy.shouldRestoreAfterReshare("internal", true));
        assertFalse(ModeBAudioResharePolicy.allowsMicrophoneFallback("internal"));
    }

    @Test public void mixAudioIsSilencedAndRestoredAfterProjectionReshare() {
        assertTrue(ModeBAudioResharePolicy.requiresProjectionAudio("mix"));
        assertTrue(ModeBAudioResharePolicy.shouldSilenceForProjectionLoss("mix", false));
        assertTrue(ModeBAudioResharePolicy.shouldRestoreAfterReshare("mix", true));
        assertTrue(ModeBAudioResharePolicy.allowsMicrophoneFallback("mix"));
    }

    @Test public void microphoneRemainsActiveWhenProjectionIsLost() {
        assertFalse(ModeBAudioResharePolicy.requiresProjectionAudio("microphone"));
        assertFalse(ModeBAudioResharePolicy.shouldSilenceForProjectionLoss("microphone", false));
        assertFalse(ModeBAudioResharePolicy.shouldRestoreAfterReshare("microphone", true));
        assertFalse(ModeBAudioResharePolicy.allowsMicrophoneFallback("microphone"));
    }

    @Test public void repeatedProjectionLossDoesNotInsertDuplicateSilenceSource() {
        assertFalse(ModeBAudioResharePolicy.shouldSilenceForProjectionLoss("internal", true));
        assertFalse(ModeBAudioResharePolicy.shouldSilenceForProjectionLoss("mix", true));
    }

    @Test public void repeatedInternalProjectionLossAndRecoveryAlternatesWithoutDuplicateSwaps() {
        boolean silenced = false;
        for (int attempt = 0; attempt < 4; attempt++) {
            assertTrue(ModeBAudioResharePolicy.shouldSilenceForProjectionLoss("internal", silenced));
            silenced = true;
            assertFalse(ModeBAudioResharePolicy.shouldSilenceForProjectionLoss("internal", silenced));
            assertTrue(ModeBAudioResharePolicy.shouldRestoreAfterReshare("internal", silenced));
            silenced = false;
            assertFalse(ModeBAudioResharePolicy.shouldRestoreAfterReshare("internal", silenced));
        }
        assertFalse(silenced);
    }

    @Test public void repeatedMixProjectionLossAndRecoveryKeepsFallbackPermissionScopedToMix() {
        boolean silenced = false;
        for (int attempt = 0; attempt < 4; attempt++) {
            assertTrue(ModeBAudioResharePolicy.shouldSilenceForProjectionLoss("mix", silenced));
            silenced = true;
            assertTrue(ModeBAudioResharePolicy.shouldRestoreAfterReshare("mix", silenced));
            assertTrue(ModeBAudioResharePolicy.allowsMicrophoneFallback("mix"));
            silenced = false;
        }
        assertFalse(ModeBAudioResharePolicy.shouldRestoreAfterReshare("mix", silenced));
        assertFalse(ModeBAudioResharePolicy.allowsMicrophoneFallback("internal"));
        assertFalse(ModeBAudioResharePolicy.allowsMicrophoneFallback("microphone"));
    }

    @Test public void microphoneIsNeverTreatedAsProjectionDependentFallback() {
        assertFalse(ModeBAudioResharePolicy.requiresProjectionAudio(null));
        assertFalse(ModeBAudioResharePolicy.requiresProjectionAudio("unknown"));
        assertFalse(ModeBAudioResharePolicy.shouldRestoreAfterReshare("unknown", true));
    }
}
