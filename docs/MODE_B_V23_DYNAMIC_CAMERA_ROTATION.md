# Mode B V23 — Dynamic Camera Rotation

## Change

Camera2 YUV frames are now reoriented when the Android default display changes rotation during an active Mode B session. `NativeCameraOverlay` registers a `DisplayManager.DisplayListener` on its camera handler, recomputes the relative sensor/display rotation, and applies the new value to subsequent frames without closing or reopening the camera.

The rotation calculation is centralized in `ModeBCameraRotationState` and `ModeBCameraFramePolicy`, allowing front/back lens and quarter-turn combinations to be tested without an Android device.

## Lifecycle

The display listener is unregistered on camera failure and release. Display change callbacks are posted to the same handler that owns Camera2 state; callbacks arriving after release are ignored. If the display service is unavailable or listener registration fails, the camera continues with the rotation computed when it opened.

## Validation boundary

Unit-policy tests cover front and back cameras while the display rotates through 0°, 90°, 180°, and 270°. This source check does not replace validation on physical devices, where rotation, sensor orientation, and preview framing must still be observed during an actual RTMP stream.
