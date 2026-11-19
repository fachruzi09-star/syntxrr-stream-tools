# SYNTXRR STREAM V35 — Mode B Capture Engine Selection

Basis: `syntxrr-stream-tools-main-fixed-v34.zip`.

## Verified architecture reference

- StreamingIn's static APK analysis identifies two Mode B capture strategies: a constrained GPU/fast route for a single visible full-screen `Share Screen Mode B` element at the bottom of the scene with no rotation, crop, or group; transformed scenes use a compatibility route. This is a static-analysis finding, not a runtime benchmark.
- RootEncoder 2.8.1 exposes `ScreenSource` as a `VideoSource` backed by one `MediaProjection` and one `VirtualDisplay`. Its `getOrientationConfig()` overrides the default encoder orientation using the prepared canvas dimensions.
- RootEncoder's `StreamBase` starts the GL interface before starting the configured `VideoSource`, allowing a direct source to feed the same GL SurfaceTexture that the stream encoder already consumes.

## Changes

- Added an explicit pre-start capture-engine policy:
  - `DIRECT_SCREEN_SOURCE` for one full-canvas, bottom-layer, ungrouped capture at 100% opacity, with no preset background or element transform.
  - `COMPATIBILITY_OBJECT_LAYER` when a background, Group membership, element transform, quarter-turn rotation, or partial opacity requires capture as a movable GL object layer.
  - `NONE` when the capture element is disabled or fully transparent.
- Added `ModeBScreenCaptureVideoSource`, a direct `VideoSource` implementation that connects one MediaProjection VirtualDisplay to the existing RootEncoder GL input SurfaceTexture. It forwards frame notifications to RootEncoder's existing render queue and reports readiness on the first received frame.
- Kept the compatibility path on `NoVideoSource` plus `SurfaceFilterRender`, with the background filter first, capture object second, and aggregate Studio overlay afterward.
- Engine selection happens before `startStream()` creates a VirtualDisplay. The policy does not dynamically switch paths after capture has started, avoiding a second VirtualDisplay creation against the same consent-backed MediaProjection.
- Matched direct-source portrait/landscape orientation configuration to RootEncoder 2.8.1 `ScreenSource` semantics, rather than leaving the custom source on the base class's default orientation.
- Added grouped-state propagation from the applied preset to the native capture-layer spec, so grouped screen-capture elements cannot accidentally select the direct path.
- Kept RootEncoder's MediaProjection callback and the service's first-frame readiness gate. A successful RTMP handshake alone does not publish LIVE while required capture has not produced a frame.

## Validation executed

- Capture engine policy unit coverage for full-frame direct selection, background, Group membership, transform, quarter-turn, partial opacity, and disabled capture.
- Screen-capture layer spec and geometry tests; constructor call sites checked after adding grouped state.
- Native streaming/projection bridge tests: 31 assertions passed.
- Preset model and Group tests: 42 assertions passed.
- TypeScript/TSX syntax transpilation across all 59 source files: zero syntax diagnostics.
- Focused Java tests: 23 policy/geometry/spec/projection-guard tests passed.
- Direct-source smoke checks against RootEncoder 2.8.1 API signatures and Android API stubs: 13 assertions passed, including portrait/landscape orientation, frame forwarding, first-frame readiness, and idempotent stop.
- ZIP integrity, unchanged `bun.lock`, and source-tree comparison against V34.

## Important scope and limitations

- `DIRECT_SCREEN_SOURCE` is a direct RootEncoder `VideoSource` path. It is **not** a claim that SYNTXRR has reproduced StreamingIn's proprietary GPU/GameCapture acceleration or its runtime fallback state machine.
- No automatic runtime switch from direct to compatibility occurs after a MediaProjection VirtualDisplay has started. A start failure ends the session and requires a fresh user consent flow; this avoids unsafe reuse of a one-shot capture grant.
- Compatibility object-layer rendering remains the path for background, transformed, grouped, rotated, or partially transparent capture.
- Crop `cover` and arbitrary-angle capture rotation remain unsupported; current capture crop is `Fit`, with rotation limited to quarter turns.
- Full `tsc --noEmit` could not run because `vite/client` type definitions are absent from this environment. The syntax-only transpilation completed for all 59 TypeScript/TSX files.
- Full Android Gradle compilation, APK build, on-device visual output, camera/video concurrency, orientation during real LIVE, and live operation alongside StreamingIn remain unverified.
- No GitHub push/merge is performed.
