# Mode B capture engine selection — V35

## Intent

Mode B needs two capture paths with one shared MediaProjection consent and no duplicate VirtualDisplay:

1. **Direct VideoSource** for the simplest full-canvas screen-capture scene.
2. **Compatibility object layer** when the capture is transformed or must sit between other scene elements.

This is a SYNTXRR design inspired by the capture-route constraints found in the static StreamingIn APK analysis. It is not a reproduction claim for StreamingIn's private GPU implementation.

## Selection matrix

| Scene condition | Selected engine |
|---|---|
| Capture disabled or opacity is zero | `NONE` |
| One full-frame capture, ungrouped, no background, 100% opacity, zero rotation | `DIRECT_SCREEN_SOURCE` |
| Preset background exists | `COMPATIBILITY_OBJECT_LAYER` |
| Capture belongs to a Group | `COMPATIBILITY_OBJECT_LAYER` |
| Capture x/y/width/height differs from full canvas | `COMPATIBILITY_OBJECT_LAYER` |
| Capture rotation is 90/180/270 | `COMPATIBILITY_OBJECT_LAYER` |
| Capture opacity is below 100% | `COMPATIBILITY_OBJECT_LAYER` |

TypeScript validates that the screen-capture element is the bottom scene layer before native startup. The native policy repeats geometry/visibility checks and receives the applied Group state.

## Direct source lifecycle

`ModeBScreenCaptureVideoSource` receives the already-created `MediaProjection` and is passed to `RtmpStream` as its `VideoSource`. RootEncoder starts the GL renderer before starting the VideoSource. The source then creates one producer `Surface`, one `VirtualDisplay`, and installs a forwarding listener on the exact GL input `SurfaceTexture`. Each producer callback is forwarded to `GlStreamInterface.onFrameAvailable()`, leaving RootEncoder's existing GL executor as the only render queue.

The first callback is the capture-readiness signal. RTMP connection success alone is not sufficient to mark the session LIVE.

The custom source mirrors RootEncoder 2.8.1 `ScreenSource.getOrientationConfig()` semantics, deriving portrait state from the prepared canvas dimensions. `create()` accepts the current zero-rotation source configuration only; element rotation is handled by the compatibility object-layer path.

## Compatibility object-layer lifecycle

The stream uses `NoVideoSource`. A background `ViewFilterRender` is added first when present. `SurfaceFilterRender` owns the screen-capture `SurfaceTexture`/`Surface`; its ready callback creates the one VirtualDisplay. The aggregate Studio overlay is added afterward.

The captured screen is therefore a GL object that can be positioned, scaled, rotated in supported quarter turns, and alpha-blended within the canvas rather than becoming an unconditional full-frame overlay.

## Failure and teardown

- The engine is chosen before stream start. No live engine switch is attempted after a VirtualDisplay has been created.
- A failed direct-source/compatibility start ends the session and requests fresh MediaProjection consent rather than attempting a second VirtualDisplay on the same grant.
- Stop is idempotent. The service stops the stream, releases the active VirtualDisplay/source, lets RootEncoder release its GL resources, then stops the MediaProjection.
- The service publishes LIVE only after RTMP connection succeeds, the required screen-capture source has delivered its first frame, and no retry/stop is pending.

## Not yet verified

Android Gradle compilation, APK generation, direct-vs-compatibility visual parity, real-device orientation changes, frame pacing under simultaneous camera/video layers, and end-to-end RTMP output still require device/build validation.
