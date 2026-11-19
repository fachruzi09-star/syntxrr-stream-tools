package com.syntxrr.streamtools;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class ModeBProjectionFramePolicyTest {
    @Test public void acceptsFrameFromCurrentAttachedProjection() {
        assertTrue(ModeBProjectionFramePolicy.shouldAcceptFrame(false, true, 7L, 7L));
    }

    @Test public void rejectsFrameAfterSourceStops() {
        assertFalse(ModeBProjectionFramePolicy.shouldAcceptFrame(true, true, 7L, 7L));
    }

    @Test public void rejectsFrameWhileProjectionIsSuspended() {
        assertFalse(ModeBProjectionFramePolicy.shouldAcceptFrame(false, false, 7L, 7L));
    }

    @Test public void rejectsCallbackFromPreviousProjectionGeneration() {
        assertFalse(ModeBProjectionFramePolicy.shouldAcceptFrame(false, true, 7L, 8L));
    }

    @Test public void rejectsOldCallbackThatCompletesAfterProjectionWasDetached() {
        // The callback entered while generation 7 was live, then its frame-forwarding work
        // completed after suspendProjection released the VirtualDisplay.
        assertFalse(ModeBProjectionFramePolicy.shouldAcceptFrame(false, false, 7L, 7L));
    }

    @Test public void rejectsOldCallbackThatCompletesAfterFreshProjectionAttached() {
        // Reshare attached generation 8 before the generation-7 callback returned.
        assertFalse(ModeBProjectionFramePolicy.shouldAcceptFrame(false, true, 7L, 8L));
    }
}
