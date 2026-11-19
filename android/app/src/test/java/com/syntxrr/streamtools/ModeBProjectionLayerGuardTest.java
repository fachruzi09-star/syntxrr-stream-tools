package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public class ModeBProjectionLayerGuardTest {
    @Test public void allowsOnlyOneVirtualDisplayCreation() {
        ModeBProjectionLayerGuard guard = new ModeBProjectionLayerGuard();
        assertTrue(guard.tryBeginCreation());
        assertFalse(guard.tryBeginCreation());
        assertFalse(guard.isClosed());
    }

    @Test public void closeBeforeSurfaceCallbackBlocksCreation() {
        ModeBProjectionLayerGuard guard = new ModeBProjectionLayerGuard();
        guard.close();
        assertTrue(guard.isClosed());
        assertFalse(guard.tryBeginCreation());
    }

    @Test public void closeAfterCreationPreventsSecondCreation() {
        ModeBProjectionLayerGuard guard = new ModeBProjectionLayerGuard();
        assertTrue(guard.tryBeginCreation());
        guard.close();
        assertFalse(guard.tryBeginCreation());
        assertTrue(guard.isClosed());
    }
}
