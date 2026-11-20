# Mode B V45 — Live Background Layer Replacement

## Scope

V45 extends the existing V42–V44 staged live-scene replacement transaction so a local preset background can change during an active Mode B RTMP session, but only where the active compositor can preserve the existing capture path and GL ordering.

The operation keeps the current RTMP stream, `MediaProjection`, `VirtualDisplay`, canvas dimensions/orientation, screen-capture geometry, and capture-layer configuration unchanged.

## Background eligibility

- `COMPATIBILITY_OBJECT_LAYER`: a background may be added, replaced, or removed. The new background filter is inserted immediately after an existing background filter (or at filter index 0 when there is no current background), keeping the screen-capture object layer and Studio overlay above it.
- `NONE`: background add/replace/remove is allowed because there is no active opaque direct screen source to cover.
- `DIRECT_SCREEN_SOURCE`: a background change is rejected. A full-canvas GL background filter would be drawn over the direct MediaProjection video source. The user must stop Mode B before changing the background in this path.
- A background that is unchanged is not staged again.

The active background state is validated before a transaction: the background ID, namespace, `StudioBackgroundView`, and GL background filter must either all be present or all be absent. An inconsistent state fails closed and instructs the user to restart Mode B.

## Transaction

1. The TypeScript bridge creates a unique scene namespace and, only when the background ID changes to a non-empty asset, a separate background namespace.
2. The background image is uploaded to that background namespace. The scene image/video assets remain in the scene namespace.
3. Native validates the requested scene, active capture configuration, background policy, and namespace ownership.
4. Native stages and decodes the background and overlay without modifying the active scene. The staged background is prepared before it is attached to GL.
5. If a new background exists, RootEncoder's `addFilter(position, filter)` inserts it below screen capture and overlay. With an existing background it is inserted immediately after the old background so both remain alive during handoff.
6. The staged background and staged overlay each must complete their output-frame readiness fence. The old overlay and (when changed) old background are then removed from GL.
7. Old asset namespaces are retired only after the relevant GL filter release and view/decoder release acknowledgements.
8. The Studio preset selection is committed only when native reports a successful transaction.

## Failure behavior

- Unsupported direct-source background changes are rejected before staging.
- Invalid namespace or inconsistent active background state is rejected fail-closed.
- If background/overlay preparation, frame readiness, or GL attachment fails, the staged scene/background is detached and its assets are released only after the relevant GL release acknowledgement.
- If an old-filter removal result is uncertain, the replacement slot remains locked until session teardown rather than allowing a third scene to overlap uncertain resources.
- MediaProjection and RTMP are not intentionally restarted by this operation.

## Verification performed for V45

- Pure Java background policy compiled with JDK 21.
- Standalone policy harness: 11 assertions passed (direct-source rejection, layered-path eligibility, active background owner consistency, and compatibility-engine retention).
- TypeScript/TSX syntax transpilation: 65 files, 0 syntax diagnostics.
- Java source parse pass for `ModeBStreamService` and `ModeBBackgroundReplacementPolicy` produced no syntax diagnostics; standalone compile still reports unavailable Android/RootEncoder symbols because Android SDK and project dependencies are not provisioned in this environment.
- ZIP CRC/integrity and archive-content validation performed after packaging.

## Not verified

- Full Android/Gradle compilation.
- APK build or installation.
- Live background replacement on a physical Android device.
- Pixel-level GL ordering and alpha behavior on real device GPU drivers.
- Concurrent camera + two-video playback during background replacement.
- RTMP output observed by StreamingIn or another receiver.

V45 is a source checkpoint, not proof of device runtime parity with StreamingIn.
