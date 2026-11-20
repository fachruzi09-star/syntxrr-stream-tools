# Mode B V36 — Shared Visual Worker for Camera YUV and MP4

Basis: `syntxrr-stream-tools-main-fixed-v35.zip`.

## Source finding in V35

- V26 already moved MP4 metadata access, frame extraction, playback scheduling, and retriever cleanup to one session-scoped `ModeBVideoDecodeWorker`.
- `NativeCameraOverlay` still owned a separate Camera2 `HandlerThread` and performed YUV_420_888 conversion, `int[]` allocation, Bitmap creation, and Bitmap rotation directly inside `ImageReader.OnImageAvailableListener`.
- Therefore, MP4 decodes were serialized with each other, but CPU-heavy camera conversion could still compete with MP4 decoding on a separate thread.

## V36 changes

- Renamed the session worker to `ModeBVisualWorker` to reflect that it now serializes both visual workloads.
- `StudioOverlayView` creates one worker for the session and injects the same instance into both MP4 decoders and `NativeCameraOverlay`, regardless of which element is encountered first.
- Camera2 control remains on its dedicated owner `HandlerThread`; camera open/session/repeating-request/display-rotation/teardown operations are not moved to the decoder worker.
- The Camera2 image callback acquires the latest frame, rate-limits to the existing 8 fps cap, and accepts at most one pending/converting camera frame through `ModeBCameraFrameGate`.
- The callback copies only the Y, U, and V plane buffers (maximum combined payload 2 MiB), preserves row/pixel strides and crop metadata, closes the Android `Image` before posting the conversion task.
- YUV-to-ARGB conversion, bounded Bitmap creation, and quarter-turn Bitmap rotation now execute on `ModeBVisualWorker`, in sequence with MP4 frame extraction.
- When the visual worker is busy, incoming camera frames are dropped instead of accumulating stale work. The next camera frame can be submitted after the current conversion releases the gate.
- A failed or shutting-down worker cannot leave the camera gate occupied; teardown releases Camera2 resources first, queues MP4 retriever cleanup, then queues the shared worker shutdown marker.
- A failed camera source marks itself released before closing resources, preventing an already queued conversion from delivering a stale frame after failure.

## Deliberately unchanged

- Direct/compatibility screen capture selection and its single-MediaProjection lifecycle.
- RootEncoder GL layer order, projection SurfaceFilterRender, and RTMP readiness gating.
- Camera2 lens selection, one-lens-per-session behavior, output resolution limits, and 8 fps frame cap.
- MP4 two-asset limit, per-file/cache limits, 8 fps per-clip frame cap, playback clock, and no-video-audio behavior.
- Preset model, Group/Supergroup transforms, background transfer, Mode A behavior, TikTok connector, and RTMP audio routing.
- No GitHub push or APK build was performed.

## Validation performed for this source checkpoint

- Added `ModeBCameraFrameGateTest` for one-outstanding-frame behavior, idempotent release, and concurrent Camera2 callback contention.
- Seven focused Java test methods passed in a standalone JVM runner: three camera-frame-gate tests and four existing YUV converter tests. A separate harness also passed 11 direct assertions covering gate behavior, neutral/red YUV samples, invalid strides, and concurrent acquisition.
- `NativeCameraOverlay`, `ModeBVisualWorker`, `NativeVideoOverlayDecoder`, and their pure policy/schedule helpers passed a Java syntax/type-shape compile against minimal Android API stubs. This is not a compile against the real Android SDK.
- Twelve structural source checks passed: one session worker is injected into camera and MP4 decoders; no YUV conversion/Bitmap rotation remains inside the Camera2 callback; plane copies are bounded; the `Image` closes before posting; only one camera conversion may be pending; and teardown schedules worker shutdown after camera and decoder cleanup scheduling.
- The Android Gradle unit-test task could not start because the wrapper could not download Gradle 8.14.3 (`UnknownHostException: services.gradle.org`). Full Android compilation and device tests are not inferred from standalone JVM/stub checks.

## Not verified

- Full Android/Gradle compilation: not verified.
- APK build: not verified.
- Real-device camera-plus-two-video timing, dropped-frame rate, temperature, and memory: not verified.
- Camera orientation changes during an actual LIVE session: not verified.
- RTMP output alongside StreamingIn: not verified.
