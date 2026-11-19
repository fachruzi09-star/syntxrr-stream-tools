package com.syntxrr.streamtools;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public final class ModeBVisualFrameBudgetTest {
    @Test
    public void allowsImmediateFirstFrameAndCapsAggregateDispatchRate() {
        assertEquals(0L, ModeBVisualFrameBudget.delayUntilNextStart(1_000L, -1L));
        assertEquals(32L, ModeBVisualFrameBudget.delayUntilNextStart(1_010L, 1_000L));
        assertEquals(0L, ModeBVisualFrameBudget.delayUntilNextStart(1_042L, 1_000L));
    }

    @Test
    public void doesNotCreateCatchUpBurstWhenClockMovesBackwards() {
        assertEquals(42L, ModeBVisualFrameBudget.delayUntilNextStart(900L, 1_000L));
        assertEquals(0L, ModeBVisualFrameBudget.delayUntilNextStart(1_100L, 1_000L));
    }
}
