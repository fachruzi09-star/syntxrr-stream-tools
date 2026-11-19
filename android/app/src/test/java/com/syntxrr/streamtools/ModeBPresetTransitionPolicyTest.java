package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBPresetTransitionPolicyTest {
    @Test public void acceptsCutAndFade() {
        assertEquals(0, ModeBPresetTransitionPolicy.resolveDuration("cut", 0));
        assertEquals(0, ModeBPresetTransitionPolicy.resolveDuration("none", 0));
        assertEquals(350, ModeBPresetTransitionPolicy.resolveDuration("fade", 350));
        assertEquals(300, ModeBPresetTransitionPolicy.resolveDuration("fade", 300));
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsSlideUntilVerified() { ModeBPresetTransitionPolicy.resolveDuration("slide", 250); }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsTooShortDuration() { ModeBPresetTransitionPolicy.resolveDuration("fade", 99); }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsTooLongDuration() { ModeBPresetTransitionPolicy.resolveDuration("fade", 1201); }

    @Test public void transitionPresenceIsBounded() {
        assertFalse(ModeBPresetTransitionPolicy.hasTransition(0, 0));
        assertTrue(ModeBPresetTransitionPolicy.hasTransition(250, 0));
        assertTrue(ModeBPresetTransitionPolicy.hasTransition(0, 350));
        assertTrue(ModeBPresetTransitionPolicy.isDurationValid(1200));
        assertFalse(ModeBPresetTransitionPolicy.isDurationValid(1201));
    }
}
