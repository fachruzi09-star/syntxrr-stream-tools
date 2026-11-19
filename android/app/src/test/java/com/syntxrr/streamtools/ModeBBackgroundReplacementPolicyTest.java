package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBBackgroundReplacementPolicyTest {
    @Test public void sameBackgroundDoesNotNeedAFilterHandoff() {
        assertTrue(ModeBBackgroundReplacementPolicy.canReplace(true, false, false));
        assertTrue(ModeBBackgroundReplacementPolicy.canReplace(false, true, true));
    }

    @Test public void directScreenSourceRejectsAddingBackground() {
        assertFalse(ModeBBackgroundReplacementPolicy.canReplace(true, false, true));
    }

    @Test public void compatibilityLayerAllowsAddingAndReplacingBackground() {
        assertTrue(ModeBBackgroundReplacementPolicy.canReplace(false, false, true));
        assertTrue(ModeBBackgroundReplacementPolicy.canReplace(false, true, true));
    }

    @Test public void compatibilityLayerAllowsRemovingBackground() {
        assertTrue(ModeBBackgroundReplacementPolicy.canReplace(false, true, false));
    }

    @Test public void noCaptureEngineAllowsBackgroundChanges() {
        assertTrue(ModeBBackgroundReplacementPolicy.canReplace(false, false, true));
        assertTrue(ModeBBackgroundReplacementPolicy.canReplace(false, true, false));
    }

    @Test public void activeBackgroundStateMustHaveAllFourOwners() {
        assertTrue(ModeBBackgroundReplacementPolicy.hasConsistentActiveState(true, true, true, true));
        assertTrue(ModeBBackgroundReplacementPolicy.hasConsistentActiveState(false, false, false, false));
        assertFalse(ModeBBackgroundReplacementPolicy.hasConsistentActiveState(true, true, true, false));
        assertFalse(ModeBBackgroundReplacementPolicy.hasConsistentActiveState(false, false, true, false));
    }

    @Test public void compatibilityEngineCanRemainWhenBackgroundIsRemoved() {
        assertTrue(ModeBBackgroundReplacementPolicy.canKeepCompatibilityEngine(true, true));
        assertFalse(ModeBBackgroundReplacementPolicy.canKeepCompatibilityEngine(false, true));
        assertFalse(ModeBBackgroundReplacementPolicy.canKeepCompatibilityEngine(true, false));
    }
}
