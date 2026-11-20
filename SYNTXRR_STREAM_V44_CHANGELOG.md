# SYNTXRR STREAM V44 — Single-owner Camera2 Live Scene Handoff

Basis: `syntxrr-stream-tools-main-fixed-v43.zip` (868,643 bytes).

## Read-only audit findings

- V43 explicitly listed same-owner Camera2 continuity as the next engineering priority. `StudioOverlayView.parseElements()` created a new `NativeCameraOverlay` for every view that contained a camera layer, so simply permitting `camera` in the live-scene allowlist would attempt to open a second physical Camera2 owner while the old scene was still active.
- `NativeCameraOverlay` held a final listener bound to the original `StudioOverlayView`, preventing an owner/frame handoff without closing and reopening Camera2.
- The V43 `attachStagedLiveSceneFilter()` add-filter exception path referenced `resultCallback`, which is outside that method's scope; the method's callback parameter must be used there.
- The current service foreground type is chosen from the initial scene. Adding a camera to a session that started without one would require a separate foreground-service type promotion and permission audit; V44 does not attempt that.
- Camera `facingMode` is the physical source configuration. Per-element position, size, mirror, and fit remain view-layer properties and do not require a second camera source.

## Changes

- Added `ModeBCameraScenePolicy` to classify same-facing owner reuse, safe camera removal, no-camera replacement, and fail-closed cases.
- Added a transfer-safe listener handoff in `NativeCameraOverlay`. Frame/failure callbacks and the owner-transfer action serialize through one listener lock so an in-flight callback cannot write into the retired view after ownership moves.
- Corrected the add-filter rollback branch to deliver through its in-scope callback parameter, removing the unresolved `resultCallback` reference.
- `StudioOverlayView` can prepare a camera layer without opening Camera2, then adopt the current view's `NativeCameraOverlay` and last frame when the staged scene has the same facing mode. The service also verifies the staged view actually prepared the deferred camera layer before continuing.
- The old view relinquishes the camera reference and frame before `releaseAssets()`, so retiring the old GL filter cannot close the camera now owned by the new scene.
- The service rejects adding a camera when the current live session started without one, rejects front/back changes, and rejects same-facing reuse if the active owner is unavailable. Removing a camera is allowed; old owner release follows old-filter retirement.
- On pre-attach failure the camera remains with the old view. On add-filter failure or post-attach rollback, ownership is transferred back before the staged view is retired.
- Updated the TypeScript bridge allowlist and tests. Native service remains the authoritative compatibility gate.

## Supported boundary after V44

- Scene-to-scene camera continuity is allowed only when both active and next scenes contain a visible camera layer using the same facing mode and the active Camera2 owner is still usable.
- Existing camera frame source, ImageReader, CameraDevice, CaptureSession, rotation listener, and worker source ID are preserved; no second `openCamera()` occurs during replacement.
- A scene may remove its camera; the old owner is closed only after the previous filter is released.
- Adding a camera to a session that started without camera, switching front/back, or replacing a camera whose owner has failed is rejected with a clear message. Stop/start is required for those cases.
- Camera overlay layout properties can differ per scene because they are rendered by the respective `StudioOverlayView`; physical lens configuration cannot.

## Validation performed

- TypeScript/TSX syntax transpilation: 65 files, zero syntax diagnostics.
- TypeScript live-scene allowlist test: 10 assertions passed.
- Java source parser: 6 changed Java files parsed with zero parse errors.
- `ModeBCameraScenePolicyTest`: 9 test methods passed with a standalone lightweight JSON/JUnit stub harness.
- Standalone Java camera scene policy harness: 10 checks passed, including same-facing owner reuse, lens change/addition rejection, removal, hidden layer handling, and conflicting facing detection.
- Source invariant checks: 11 passed for owner transfer, no duplicate camera creation, rollback, and fail-closed compatibility.
- `package.json` and `bun.lock` hashes match V43; dependency manifests were not changed.
- ZIP integrity checked after packaging.

## Not verified

- Full Android/Gradle compilation and APK build.
- Camera2 owner transfer, callbacks, rotation, and frame continuity during an actual RTMP live scene swap on a physical Android device.
- Front/back switching (intentionally rejected during LIVE), camera + two videos, long-session memory/thermal behavior, and StreamingIn interoperability.
- No GitHub push was performed.

## Next engineering priority

Audit and implement safe live background replacement as a dedicated compositor layer operation, preserving the existing background namespace until the old background filter is retired. Do not change canvas size/orientation, screen-capture configuration, or MediaProjection during a live background swap. Preset transitions and screensaver runtime remain separate later work.
