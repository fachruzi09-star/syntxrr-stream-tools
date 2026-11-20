# Mode B V19 — deterministic Studio overlay teardown

## Problem

`ViewFilterRender` owns an IO coroutine that repeatedly calls `View.draw()`. The previous service teardown released Studio bitmaps, MP4 decoders, and camera frames after stream shutdown, but did not explicitly detach the View from the filter first. A render pass already in progress could therefore overlap asset recycling during stop/reconnect or service destruction.

## Change

- Detach the Studio View from `ViewFilterRender` before stopping/releasing the RootEncoder stream. RootEncoder's GL pipeline then releases the filter in its normal GL teardown path.
- Add `ModeBOverlayRenderGuard` around complete `StudioOverlayView.onDraw()` passes.
- `releaseAssets()` marks the view released and waits on the same guard before releasing Camera2, MP4 decoder, and image bitmap resources.
- Late live events are rejected after overlay teardown.
- Asset disposal is idempotent, and future draw passes are rejected.

## Verification

- Added JVM tests for idempotent release, no draw after release, null callbacks, and waiting for an in-flight draw before disposal.
- Standalone Java concurrency harness passes against the production guard class.
- Android Gradle build and real-device stop/restart testing are still required; no APK build is claimed in this checkpoint.
