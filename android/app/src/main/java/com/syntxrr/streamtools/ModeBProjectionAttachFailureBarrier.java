package com.syntxrr.streamtools;

/**
 * Rolls back a partially installed projection producer before a failed attach is reported.
 * The detach action runs first, the callback gate is then drained, and producer retirement
 * runs last so no admitted frame can still touch the encoder's GL input.
 */
final class ModeBProjectionAttachFailureBarrier {
    private ModeBProjectionAttachFailureBarrier() { }

    static RuntimeException rollback(ModeBScreenCaptureCallbackGate gate,
                                    Runnable detachListener,
                                    Runnable retireProducer,
                                    RuntimeException originalFailure) {
        if (gate == null || detachListener == null || retireProducer == null || originalFailure == null) {
            throw new IllegalArgumentException("Data rollback projection attach wajib tersedia.");
        }
        try {
            detachListener.run();
        } catch (RuntimeException detachFailure) {
            if (detachFailure != originalFailure) originalFailure.addSuppressed(detachFailure);
        }

        // Must run outside the source lock: an admitted callback can need that lock to
        // observe the invalidated projection and exit its lease.
        gate.pauseAndAwait();

        try {
            retireProducer.run();
        } catch (RuntimeException retirementFailure) {
            if (retirementFailure != originalFailure) originalFailure.addSuppressed(retirementFailure);
        }
        return originalFailure;
    }
}
