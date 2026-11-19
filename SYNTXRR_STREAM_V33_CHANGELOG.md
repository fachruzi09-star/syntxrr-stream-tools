# SYNTXRR STREAM V33 — MediaProjection as a Studio Compositor Layer

## Changed

- Replaced the active full-frame `ScreenSource` path with a `NoVideoSource` GL base and a dedicated `SurfaceFilterRender` object layer backed by exactly one `VirtualDisplay` from the current MediaProjection consent token.
- Added a bounded `screenCaptureLayer` payload resolved from the Studio `screen_capture` element: visibility, x/y, width/height, rotation, opacity and Fit geometry.
- Excluded `screen_capture` from the aggregated Studio overlay snapshot so it is not duplicated as an ordinary overlay element.
- Added a local preset-background `StudioBackgroundView` as the first GL view filter, followed by the MediaProjection object filter and then the Studio overlay view.
- Added pre-live transfer of a local preset background image into the native cache. The image cap remains eight Studio overlay images plus one preset background, with the existing 12 MB total image limit.
- Added a session lock/guard so duplicate or late `SurfaceReadyCallback` invocations cannot create a second VirtualDisplay or race service teardown.
- Added an explicit 15-second first-projection-frame timeout; the UI remains `connecting` until RTMP is connected and the required MediaProjection SurfaceTexture receives a real frame.
- Added retry gating so stale bitrate callbacks from a failed RTMP attempt cannot set the status back to `live` while reconnecting.
- Updated the Studio/Dashboard explanation and added `docs/MODE_B_V33_PROJECTION_COMPOSITOR_LAYER.md`.

## Validation run in this environment

- `modeBComposition.ts` + focused native bridge test compiled with TypeScript 5.8.3.
- Focused native streaming/projection test: **24 assertions passed**.
- Projection lifecycle/readiness JVM smoke test: **12 checks passed**.
- Java syntax parser: **9 changed Android source/test files passed** (syntax only; no Android type-check).
- TypeScript/TSX syntax transpilation: **59 files, 0 syntax diagnostics**.
- Static compositor source invariants: **9/9 passed**.
- `bun.lock` was not changed from V32.

## Not verified

- Full project type-check/Vite build (workspace does not contain the project's dependencies and `vite/client` type declarations).
- Android Gradle compilation/unit tests (wrapper attempted to fetch Gradle 8.14.3 but DNS/network access was unavailable).
- APK generation/installation.
- Physical Android tests for SurfaceFilterRender callback timing, VirtualDisplay buffers, alpha/rotation, screen-capture fit, background visibility, camera plus multiple videos, frame rate, thermal/memory behavior, or RTMP output.
- Real LIVE alongside StreamingIn, and camera orientation during LIVE on a real phone.
- GitHub push/merge (not performed).
