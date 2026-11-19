package com.syntxrr.streamtools;

/** Generation gate for Direct Screen Source frame callbacks and first-frame readiness. */
final class ModeBProjectionFramePolicy {
    private ModeBProjectionFramePolicy() { }

    static boolean shouldAcceptFrame(boolean stopping, boolean projectionAttached,
            long callbackGeneration, long currentGeneration) {
        return !stopping && projectionAttached && callbackGeneration == currentGeneration;
    }
}
