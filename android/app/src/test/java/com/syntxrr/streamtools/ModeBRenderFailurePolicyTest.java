package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBRenderFailurePolicyTest {
    @Test public void currentRendererFailureEndsActiveSession() {
        assertTrue(ModeBRenderFailurePolicy.shouldEndSession(7L, 7L, false, false));
    }

    @Test public void staleRendererFailureCannotEndNewSession() {
        assertFalse(ModeBRenderFailurePolicy.shouldEndSession(6L, 7L, false, false));
    }

    @Test public void rendererFailureAfterStopIsIgnored() {
        assertFalse(ModeBRenderFailurePolicy.shouldEndSession(7L, 7L, true, false));
    }

    @Test public void rendererFailureAfterCleanupIsIgnored() {
        assertFalse(ModeBRenderFailurePolicy.shouldEndSession(7L, 7L, false, true));
    }
}
