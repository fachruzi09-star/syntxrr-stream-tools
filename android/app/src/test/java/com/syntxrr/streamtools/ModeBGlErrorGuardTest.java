package com.syntxrr.streamtools;

import org.junit.Test;
import static org.junit.Assert.*;

public final class ModeBGlErrorGuardTest {
    @Test public void acceptsAnEmptyGlesErrorQueue() {
        ErrorQueue queue = new ErrorQueue();
        ModeBGlErrorGuard.requireNoError("draw", queue);
        assertEquals(1, queue.readCount);
    }

    @Test public void reportsTheOperationAndHexCodeForOneGlError() {
        IllegalStateException failure = expectFailure("bind texture", new ErrorQueue(0x0502));
        assertTrue(failure.getMessage().contains("bind texture"));
        assertTrue(failure.getMessage().contains("0x502"));
    }

    @Test public void aggregatesMultipleQueuedErrorsAndReadsUntilNoError() {
        ErrorQueue queue = new ErrorQueue(0x0500, 0x0501, 0x0505, 0);
        IllegalStateException failure = expectFailure("scene filter draw", queue);
        assertTrue(failure.getMessage().contains("0x500"));
        assertTrue(failure.getMessage().contains("0x501"));
        assertTrue(failure.getMessage().contains("0x505"));
        assertEquals(4, queue.readCount);
    }

    @Test public void boundsErrorQueueReadsWhenDriverKeepsReturningErrors() {
        ErrorQueue queue = new ErrorQueue(0x0502);
        queue.repeatLast = true;
        IllegalStateException failure = expectFailure("stuck driver", queue);
        assertEquals(ModeBGlErrorGuard.MAX_ERROR_CODES_PER_CHECK, queue.readCount);
        assertTrue(failure.getMessage().contains("dibatasi"));
    }

    @Test public void rejectsBlankOperationOrMissingErrorSource() {
        expectIllegalArgument(() -> ModeBGlErrorGuard.requireNoError(" ", new ErrorQueue()));
        expectIllegalArgument(() -> ModeBGlErrorGuard.requireNoError("draw", null));
    }

    private static IllegalStateException expectFailure(String operation, ErrorQueue queue) {
        try {
            ModeBGlErrorGuard.requireNoError(operation, queue);
        } catch (IllegalStateException expected) {
            return expected;
        }
        throw new AssertionError("Expected GL error failure.");
    }

    private static void expectIllegalArgument(Runnable action) {
        try {
            action.run();
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError("Expected IllegalArgumentException.");
    }

    private static final class ErrorQueue implements ModeBGlErrorGuard.ErrorSource {
        private final int[] values;
        private int index;
        private int readCount;
        private boolean repeatLast;

        ErrorQueue(int... values) { this.values = values; }

        @Override public int getError() {
            readCount++;
            if (index < values.length) return values[index++];
            if (repeatLast && values.length > 0) return values[values.length - 1];
            return ModeBGlErrorGuard.GL_NO_ERROR;
        }
    }
}
