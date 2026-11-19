package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBHostWaitVisibilityPolicyTest {
    @Test public void showsHostWaitWhenSingleAppTargetRemainsHiddenAfterReshare() {
        assertTrue(ModeBHostWaitVisibilityPolicy.shouldShowAfterReshare(
                true, true, false, false, false, false));
    }

    @Test public void doesNotShowHostWaitWhenTargetIsVisible() {
        assertFalse(ModeBHostWaitVisibilityPolicy.shouldShowAfterReshare(
                true, true, true, false, false, false));
    }

    @Test public void doesNotShowHostWaitWhenScreensaverIsDisabled() {
        assertFalse(ModeBHostWaitVisibilityPolicy.shouldShowAfterReshare(
                false, true, false, false, false, false));
    }

    @Test public void doesNotApplyToSessionsWithoutScreenCapture() {
        assertFalse(ModeBHostWaitVisibilityPolicy.shouldShowAfterReshare(
                true, false, false, false, false, false));
    }

    @Test public void doesNotRaceAnIncompleteReshare() {
        assertFalse(ModeBHostWaitVisibilityPolicy.shouldShowAfterReshare(
                true, true, false, false, true, false));
    }

    @Test public void doesNotRunWhenWaitingOrStopping() {
        assertFalse(ModeBHostWaitVisibilityPolicy.shouldShowAfterReshare(
                true, true, false, true, false, false));
        assertFalse(ModeBHostWaitVisibilityPolicy.shouldShowAfterReshare(
                true, true, false, false, false, true));
    }
}
