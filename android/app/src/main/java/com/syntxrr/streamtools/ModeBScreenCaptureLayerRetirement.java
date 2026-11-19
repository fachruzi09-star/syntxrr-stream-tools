package com.syntxrr.streamtools;

/** Retires a MediaProjection producer before RootEncoder releases its destination Surface. */
final class ModeBScreenCaptureLayerRetirement {
    private ModeBScreenCaptureLayerRetirement() { }

    /**
     * Detaches frame delivery first, then releases the VirtualDisplay. A failure in either
     * independent action does not skip the other; the returned failure must be included in
     * session teardown status. Null actions represent a layer that was not created.
     */
    static RuntimeException releaseBeforeRenderer(Runnable detachFrameListener, Runnable releaseVirtualDisplay) {
        RuntimeException firstFailure = attempt(detachFrameListener, null);
        return attempt(releaseVirtualDisplay, firstFailure);
    }

    private static RuntimeException attempt(Runnable operation, RuntimeException firstFailure) {
        if (operation == null) return firstFailure;
        try {
            operation.run();
            return firstFailure;
        } catch (RuntimeException failure) {
            if (firstFailure == null) return failure;
            if (firstFailure != failure) firstFailure.addSuppressed(failure);
            return firstFailure;
        }
    }
}
