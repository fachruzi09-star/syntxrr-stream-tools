# SYNTXRR STREAM V39 — Camera ARGB Buffer Reuse & Teardown Cleanup

Basis: `syntxrr-stream-tools-main-fixed-v38.zip` (SHA-256 verified before extraction).

## Read-only audit findings

- `NativeCameraOverlay.convertAndDeliver()` called `ModeBCameraYuvConverter.toArgb()` for every accepted camera frame. The converter allocated a fresh `int[]` sized to the output frame on every call, even though V38 serializes conversion on one shared worker and permits only one queued/in-flight camera frame.
- The normal `release()` path removed a pending camera frame from the visual arbiter, but the camera `fail()` path did not. A frame queued immediately before a camera failure could therefore retain its copied YUV plane arrays until the shared worker eventually dequeued it.
- Camera conversion scratch state needs to be released on the visual worker, after any in-flight conversion, because that worker owns the reusable array.

## Changes

- Added a reusable-buffer overload to `ModeBCameraYuvConverter.toArgb()`. It reuses a caller-owned ARGB array when its capacity is sufficient and allocates only when the required pixel count grows.
- Kept the original converter signature for existing callers and tests.
- Added a guard against output pixel counts that exceed Java array indexing capacity, even if a caller supplies an excessively large `maxOutputPixels` value.
- `NativeCameraOverlay` now retains one ARGB scratch array on the shared visual worker. Camera conversion is already single-flight, so the array is never concurrently written by two camera frames.
- Added one idempotent visual-frame cleanup path for camera failure and normal release. It removes a pending camera task, releases the single-frame gate, and posts scratch-buffer release onto the worker after any active conversion.
- Kept Bitmap creation and rotation behavior unchanged. This patch reduces repeated ARGB working-array allocation; it does not eliminate per-frame Bitmap allocation or prove a device-level FPS/temperature improvement.

## Validation

- 17 focused JVM test methods passed in a standalone harness: YUV conversion/reuse/overflow (7), camera frame gate (3), visual frame arbiter (5), and aggregate frame budget (2).
- `NativeCameraOverlay` and `ModeBCameraYuvConverter` compiled against minimal Android API stubs. This verifies Java syntax and the edited type shape, not compilation against the real Android SDK.
- Source inspection confirms both camera failure and normal teardown route through worker-owned frame-state cleanup.
- `package.json` and `bun.lock` are unchanged from V38.
- Full Android compilation, APK build, physical-device camera/video stress, orientation during LIVE, and LIVE interoperability with StreamingIn remain unverified by design. The requested build gate has not been reached.

## Not changed

- Direct/Compatibility screen-capture engine selection and MediaProjection lifecycle.
- GL layer order, crop/rotation transforms, Group/Supergroup, preset transfer, or audio routing.
- MP4 decoder policy, shared frame arbiter, 42 ms aggregate dispatch spacing, or per-source 8 FPS cadence.
- Mode A, TikTok connector, cloud presets, or marketplace behavior.
- GitHub branch, commits, or remote repository state.
