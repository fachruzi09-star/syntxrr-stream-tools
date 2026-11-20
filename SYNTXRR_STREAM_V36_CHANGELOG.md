# SYNTXRR STREAM V36 — Shared Visual Worker

Basis: `syntxrr-stream-tools-main-fixed-v35.zip`.

## Finding

V35 already shared one worker between MP4 decoders, but Camera2's `ImageReader` callback still performed the expensive YUV-to-ARGB conversion, Bitmap allocation, and rotation on the camera-control handler. Camera and MP4 visual processing could therefore compete on separate threads.

## Changes

- Introduced `ModeBVisualWorker`, a session-scoped worker shared by all local MP4 decoders and the camera YUV conversion stage.
- Camera2 control remains on its owning handler thread. Only CPU-heavy visual conversion is moved.
- Added a one-frame pending gate so camera frames are dropped under worker pressure rather than queued into stale latency.
- Bounded combined YUV plane copies to 2 MiB, preserved crop/stride metadata, and close each Image before asynchronous conversion.
- Moved YUV conversion, Bitmap creation, and orientation rotation onto the shared visual worker.
- Made camera failure idempotent and ensured worker shutdown is queued after camera teardown and MP4 cleanup tasks.

## Validation

- Seven focused Java test methods passed in a standalone JVM runner (camera frame gate + existing YUV converter tests); a separate harness passed 11 direct assertions including concurrent gate contention.
- `NativeCameraOverlay`, `ModeBVisualWorker`, `NativeVideoOverlayDecoder`, and helper sources passed Java syntax/type-shape compilation against minimal Android API stubs (not the real Android SDK).
- Twelve structural source checks passed for worker ownership, one pending camera conversion, 2 MiB plane bounds, Image closure before posting, and ordered teardown.
- The Gradle unit-test task could not start because Gradle 8.14.3 was unavailable from `services.gradle.org` due to DNS failure. Full Android compilation, APK build, and device/live testing remain unverified.

## Not changed

- Screen capture Direct/Compatibility engine selection.
- MediaProjection/VirtualDisplay lifetime and GL filter order.
- Existing camera/MP4 frame-rate caps and file/memory limits.
- Presets, Group/Supergroup, Mode A, TikTok connection, and RTMP audio routing.
