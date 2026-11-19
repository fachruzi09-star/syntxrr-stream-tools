# Mode B V20 — Ordered Camera2 teardown

## Problem

`NativeCameraOverlay.release()` previously posted Camera2 closure and returned immediately.
`ModeBStreamService.cleanupResources()` then stopped `MediaProjection` in the same call stack.
That allowed projection shutdown to race with a still-open CameraCaptureSession/ImageReader or
an `onImageAvailable` callback.

## Change

- Mark the overlay released before scheduling teardown so no new frame is accepted.
- Serialize `CameraCaptureSession`, `CameraDevice`, and `ImageReader` closure on the camera's
  HandlerThread, the same handler used for Camera2 callbacks.
- Wait up to 1.8 seconds for the queued disposer before returning to service cleanup.
- Preserve idempotence and avoid waiting when release is invoked on the camera handler itself.
- Keep the wait bounded so a vendor camera implementation cannot block service teardown forever.

## Verification boundary

Source-level checks verify the release ordering and idempotence. This does not replace testing on
physical camera hardware across Android vendors; `CameraDevice.close()` completion is asynchronous
at the framework level even after the close request is issued.
