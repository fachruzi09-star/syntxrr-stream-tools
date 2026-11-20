# SYNTXRR STREAM — V33 MediaProjection Compositor Layer

Basis: `syntxrr-stream-tools-main-fixed-v32.zip`.

## V32 problem retained as a hard constraint

V32 removed the synthetic preset-background image from the native overlay snapshot because the then-current `ScreenSource` was the opaque full-frame video source. A `ViewFilterRender` appended after that source would cover the captured display; Studio element z-index values cannot place an item behind the video source itself.

## V33 source architecture

V33 replaces the active `ScreenSource` base with `NoVideoSource` and keeps RootEncoder's forced render cadence. The captured display is represented by an independent `SurfaceFilterRender` object:

1. Optional local preset background is uploaded through the existing private overlay-asset cache and drawn by `StudioBackgroundView` in the first `ViewFilterRender`.
2. A `SurfaceFilterRender` is appended next. Its main-thread `SurfaceReadyCallback` reuses the exact `Surface` owned by that filter to create one Android `VirtualDisplay` from the existing one-shot `MediaProjection` token.
3. The aggregated `StudioOverlayView` is appended after the projection object filter. Its supported camera/video/image/text/event layers therefore draw above the screen layer.

The screen capture geometry comes from the visible `screen_capture` Studio element. A preset without an explicit screen-capture element retains the prior full-frame screen-capture default. Two visible screen-capture elements are rejected because one Mode B session owns one projection token and one VirtualDisplay. The aggregated overlay must be above the screen element; configurations that cannot be represented faithfully by the current aggregate view are rejected before asking for screen-share consent.

## Fit and bounds policy

- V33 supports the `fit` crop mode for the screen-capture layer. It preserves the projection frame aspect ratio inside the Studio element rectangle.
- Unsupported crop modes are rejected rather than silently stretched.
- Screen position and dimensions are bounded to the normalized 0–100 canvas range; rotation is normalized to 0–359 degrees and opacity to 0–100 percent.
- The background asset must be a local `studio-media://` image. It is included in the pre-live native cache transfer and shares the existing 12 MB total image budget; the cap remains eight overlay images plus one preset background.
- The background bitmap is decoded with a 4-million-pixel ceiling and released after the GL stream has stopped.

## Projection lifecycle

- The existing MediaProjection callback is registered before any VirtualDisplay creation.
- A session-scoped guard permits one VirtualDisplay creation only and prevents a late GL callback from creating a display after teardown has begun.
- The VirtualDisplay is released before RootEncoder releases `SurfaceFilterRender` and its owned Surface/SurfaceTexture.
- The display callback reports unexpected stop as `capture_lost`; the app still requires fresh consent for a new session. This is not seamless reshare.
- The service does not report `live` until both the RTMP publish handshake and the first actual MediaProjection frame have arrived through the filter SurfaceTexture. A 15-second first-frame timeout ends a session whose projection path does not deliver a frame.
- A failed RTMP attempt clears the connection-ready flag before retry. Late bitrate callbacks cannot restore the `live` label while a retry is pending.
- Internal audio preflight remains before creation of the session's one VirtualDisplay.

## Evidence and constraints

RootEncoder 2.8.1 documents `SurfaceFilterRender` as an object filter with a `SurfaceTexture`/`Surface`, and its callback is posted to the main looper. Its `GlInterface.addFilter()` appends to the ordered filter list. `NoVideoSource` is the library's no-frame source, and the official sample pairs it with forced rendering for MediaProjection. See:

- https://pedrosg94.github.io/RootEncoder/encoder/com.pedro.encoder.input.gl.render.filters.object/-surface-filter-render/index.html
- https://raw.githubusercontent.com/pedroSG94/RootEncoder/cca548a/encoder/src/main/java/com/pedro/encoder/input/gl/render/filters/object/SurfaceFilterRender.kt
- https://pedrosg94.github.io/RootEncoder/library/com.pedro.library.view/-gl-interface/index.html
- https://raw.githubusercontent.com/pedroSG94/RootEncoder/cca548a/encoder/src/main/java/com/pedro/encoder/input/sources/video/NoVideoSource.kt

This is a targeted implementation based on the public RootEncoder 2.8.1 API and the existing SYNTXRR service, not a completed Android build or physical-device test. `ViewFilterRender` order, alpha blending, rotated screen placement, buffer lifecycle, performance, and actual RTMP picture must still be checked on devices. The current Studio overlay is aggregated as one view, so the screen-capture layer must remain below all Studio overlay elements; arbitrary interleaving of screen and overlay children is not yet supported. The readiness signal proves that the SurfaceTexture received a first projection buffer, not that a complete encoded RTMP frame was decoded and viewed by an external client. Crop `fit` is supported; crop `cover`, exact source fit modes beyond this mapping, group-specific source transforms, and GPU direct/compatibility fallback are not claimed as parity with StreamingIn.

## Validation status

- TypeScript focused projection/composition tests: 24 assertions passed.
- Projection lifecycle/readiness JVM smoke test: 12 checks passed (single-display guard, stop races, RTMP/first-frame readiness, retry gating and timeout policy).
- Static compositor source invariants: 9/9 passed (source/filter order, one VirtualDisplay call, first-frame gate, retry guard and release order).
- Java parser syntax check: 9 changed Android source/test files parsed without syntax diagnostics; this is not Java type-checking or Android compilation.
- TypeScript/TSX syntax transpilation: 59 source files, 0 syntax diagnostics.
- Full TypeScript project type-check: not completed; dependencies/type declarations are absent in this workspace (`vite/client` missing).
- Android Gradle unit tests/compilation: not run; wrapper attempted to fetch Gradle 8.14.3 but DNS resolution for `services.gradle.org` failed.
- APK build, physical-device preview, capture orientation, concurrent camera/video, RTMP output and use alongside StreamingIn: not verified.
- GitHub push/merge: not performed.
