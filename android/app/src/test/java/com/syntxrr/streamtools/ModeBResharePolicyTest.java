package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBResharePolicyTest {
    @Test public void keepsConnectedLiveSessionWhenProjectionIsLost() {
        assertTrue(ModeBResharePolicy.shouldKeepRtmpAlive(true, true, true, false, false));
    }
    @Test public void doesNotKeepSessionWhenNoProjectionDependencyExists() {
        assertFalse(ModeBResharePolicy.shouldKeepRtmpAlive(false, true, true, false, false));
    }
    @Test public void doesNotKeepSessionBeforeConfirmedLive() {
        assertFalse(ModeBResharePolicy.shouldKeepRtmpAlive(true, true, false, false, false));
    }
    @Test public void doesNotKeepSessionWhenStoppingOrCleaning() {
        assertFalse(ModeBResharePolicy.shouldKeepRtmpAlive(true, true, true, true, false));
        assertFalse(ModeBResharePolicy.shouldKeepRtmpAlive(true, true, true, false, true));
    }
    @Test public void acceptsOnlyFreshConsentWhileWaiting() {
        assertTrue(ModeBResharePolicy.canAcceptReshare(true, false, false, false, -1, true, true));
        assertFalse(ModeBResharePolicy.canAcceptReshare(false, false, false, false, -1, true, true));
        assertFalse(ModeBResharePolicy.canAcceptReshare(true, true, false, false, -1, true, true));
        assertFalse(ModeBResharePolicy.canAcceptReshare(true, false, true, false, -1, true, true));
        assertFalse(ModeBResharePolicy.canAcceptReshare(true, false, false, false, 0, true, true));
        assertFalse(ModeBResharePolicy.canAcceptReshare(true, false, false, false, -1, false, true));
        assertFalse(ModeBResharePolicy.canAcceptReshare(true, false, false, false, -1, true, false));
    }
    @Test public void timeoutReturnsToWaitOnlyForAttachedProjectionWithoutFrame() {
        assertTrue(ModeBResharePolicy.shouldReturnToWaiting(false, false, false, true));
        assertFalse(ModeBResharePolicy.shouldReturnToWaiting(false, false, true, true));
        assertFalse(ModeBResharePolicy.shouldReturnToWaiting(true, false, false, true));
        assertFalse(ModeBResharePolicy.shouldReturnToWaiting(false, true, false, true));
        assertFalse(ModeBResharePolicy.shouldReturnToWaiting(false, false, false, false));
    }
}
