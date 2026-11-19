package com.syntxrr.streamtools;

/** Tracks the Camera2 preview rotation as the Android display changes during a live session. */
final class ModeBCameraRotationState {
    private final int sensorOrientationDegrees;
    private final boolean frontFacing;
    private volatile int currentRotationDegrees;

    ModeBCameraRotationState(int sensorOrientationDegrees, boolean frontFacing, int initialDisplayRotationDegrees) {
        this.sensorOrientationDegrees = ModeBCameraFramePolicy.normalizeRotation(sensorOrientationDegrees);
        this.frontFacing = frontFacing;
        updateDisplayRotation(initialDisplayRotationDegrees);
    }

    int updateDisplayRotation(int displayRotationDegrees) {
        currentRotationDegrees = ModeBCameraFramePolicy.calculatePreviewRotation(
                sensorOrientationDegrees, displayRotationDegrees, frontFacing);
        return currentRotationDegrees;
    }

    int getRotationDegrees() {
        return currentRotationDegrees;
    }
}
