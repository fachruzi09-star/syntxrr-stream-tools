package com.syntxrr.streamtools;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

public final class ModeBVideoFrameScheduleTest {
    @Test
    public void keepsCadenceWhenDecodeFinishesBeforeNextDeadline() {
        ModeBVideoFrameSchedule schedule = new ModeBVideoFrameSchedule();
        schedule.reset(1_000L);
        assertTrue(85L == schedule.delayUntilNextFrame(1_040L, 125L));
        assertTrue(85L == schedule.delayUntilNextFrame(1_165L, 125L));
    }

    @Test
    public void slowDecodeSkipsMissedDeadlinesWithoutBursting() {
        ModeBVideoFrameSchedule schedule = new ModeBVideoFrameSchedule();
        schedule.reset(1_000L);
        assertTrue(125L == schedule.delayUntilNextFrame(1_300L, 125L));
        assertTrue(125L == schedule.delayUntilNextFrame(1_550L, 125L));
    }

    @Test
    public void rejectsNonPositiveFrameInterval() {
        ModeBVideoFrameSchedule schedule = new ModeBVideoFrameSchedule();
        assertThrows(IllegalArgumentException.class, () -> schedule.delayUntilNextFrame(0L, 0L));
        assertThrows(IllegalArgumentException.class, () -> schedule.delayUntilNextFrame(0L, -1L));
    }
}
