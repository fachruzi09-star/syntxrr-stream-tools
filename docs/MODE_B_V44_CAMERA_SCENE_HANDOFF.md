# MODE B V44 — Same-owner Camera2 Scene Handoff

## Compatibility contract

A LIVE scene replacement can retain an existing camera only when both the active and target scene contain a visible camera layer with the same `facingMode`, and the current `NativeCameraOverlay` is still active and has not reported failure.

- Existing front camera -> target front camera: transfer the same owner and last frame.
- Existing rear camera -> target rear camera: transfer the same owner and last frame.
- Existing camera -> target without camera: allow; old owner is released after the prior GL filter retires.
- No camera -> target with camera: reject. The service foreground type was selected from the start snapshot; V44 does not perform a foreground-service type promotion.
- Front <-> rear change: reject. V44 does not close the live owner and open a different physical camera during the two-filter handoff.
- A released/failed owner or mixed-facing camera layers: reject.

## Handoff lifecycle

The staged `StudioOverlayView` is created with deferred camera ownership when the same active owner is reusable. Parsing the camera layer records the requested facing but does not call `new NativeCameraOverlay()` or `openCamera()`.

Immediately before the new GL filter is attached, `previousView.transferCameraOwnerTo(stagedView)` moves the existing `NativeCameraOverlay` reference and current camera bitmap while `NativeCameraOverlay` holds its listener lock. Frame and failure callbacks use the same lock, so an in-flight callback cannot write to the retired view after transfer.

If GL attachment fails, or the staged filter later has to roll back, the owner is transferred back to the prior active view before staged cleanup. On successful replacement the prior view no longer owns the camera; its normal `releaseAssets()` therefore releases only its remaining scene resources. The new view releases Camera2 exactly once when it eventually retires.

The rotation listener, CameraDevice, CaptureSession, ImageReader, worker source ID, memory reservation, and current frame remain attached to the same `NativeCameraOverlay` instance throughout the handoff.

## Validation boundary

The Java policy harness validates decision cases and JSON inspection; source invariants validate that the staged defer path avoids constructing a second camera and that rollback transfers the owner back. Java parser and TypeScript transpilation are source checks only. Actual Camera2 callbacks, GL handoff timing, and output continuity still require a real Android device and RTMP stream.
