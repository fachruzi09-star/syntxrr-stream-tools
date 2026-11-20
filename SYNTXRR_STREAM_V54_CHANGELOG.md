# SYNTXRR STREAM V54 — Direct Projection Frame-Generation Gate

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v53.zip`.
- V54 is a targeted Direct Screen Source reshare-readiness correction. It does not alter the Compatibility Object Layer, RTMP transport/recovery policy, audio route, Screensaver renderer, visual worker/frame arbiter, memory budgets, `package.json`, or `bun.lock`.

## Finding
The Direct source's `SurfaceTexture.OnFrameAvailableListener` used a reusable `Runnable` first-frame callback without carrying the projection generation. A callback could enter while generation N was attached, be suspended while its frame-forwarding work was in progress, and complete after the source had detached or reattached generation N+1. Because `firstFrameDelivered` is reset during suspension, that old callback could win the reset compare-and-set and signal the service that the new projection was ready. The Compatibility listener already checks its captured projection generation; Direct did not.

## Changes
- Added `ModeBProjectionFramePolicy` to accept frames only while a projection/VirtualDisplay is attached, the source is not stopping, and the callback generation still matches the source generation.
- Direct frame callbacks snapshot their projection generation before forwarding and re-check attachment/generation after forwarding before setting first-frame readiness.
- Replaced the first-frame `Runnable` with a generation-carrying callback.
- The service revalidates the callback generation and active `MediaProjection` on the main Looper before setting `screenCaptureFirstFrameReady` or publishing readiness.
- Added six JVM policy test cases covering current generation, stopped source, detached projection, stale generation, callback completion after detach, and callback completion after a new generation attaches.

## Validation performed
- Six projection-generation policy test methods passed through a standalone JVM runner.
- Deterministic source integration harness compiled the Direct source against minimal Android/RootEncoder stubs and passed interleaving checks: an old callback completing after suspend + reattach does not mark the fresh projection ready; the new generation is accepted exactly once; callbacks while detached are ignored; first-frame delivery is re-armed for the next generation.
- The Direct source, generation policy, and thread-join helper passed `javac` syntax/type compilation against the minimal stub API surface.
- Source diff is limited to the Direct source, its service callback, one pure-Java policy helper, its unit test, and checkpoint documentation.

## Not verified
- Full Android Gradle semantic compilation, unit-test task, APK build, and physical-device execution; this workspace has no configured Android SDK.
- Real MediaProjection callback timing on Android 13/14+, reshare under sustained RTMP, Direct/Compatibility parity, and StreamingIn interoperability.
- Screensaver `mediaSound` remains metadata only; no outgoing RTMP PCM mixing was introduced.
