# SYNTXRR STREAM V55 — Direct Capture Queued Callback Drain

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v54.zip`.
- V55 is a targeted Direct Screen Source reshare-lifecycle correction. It does not alter Compatibility Object Layer rendering, RTMP transport/recovery, audio routing, Screensaver playback, visual frame arbitration, bitmap budgets, `package.json`, or `bun.lock`.

## Finding
V54 bound the projection generation when a `SurfaceTexture.OnFrameAvailableListener` callback entered. However, Direct kept one reusable listener installed across suspend/reattach. A frame-available message already queued on the source `HandlerThread` could be dispatched after the new projection was attached; because the reusable listener read the current generation at callback entry in V54, an old queued event could be misattributed to the new projection. The old in-flight callback was covered by V54's post-forwarding generation check, but this queued-before-entry case was not.

## Changes
- Direct now installs a listener closure that captures the projection generation at listener-install time.
- `suspendProjection()` detaches the `SurfaceTexture` listener before releasing the old `VirtualDisplay` and clearing the projection.
- Before reattach, Direct posts a FIFO barrier to the same callback `HandlerThread` and waits up to 200 ms outside the source lock. This drains messages queued before the new listener is installed; a timeout/rejected barrier fails the reattach closed.
- After the barrier, Direct revalidates the source state, installs a new listener bound to the new generation, and only then creates the new `VirtualDisplay`.
- Added `ModeBHandlerDrainPolicy` and five JVM unit tests covering FIFO completion, bounded timeout, unavailable/rejected workers, self-wait avoidance, and interrupt restoration.

## Validation performed
- `ModeBHandlerDrainPolicyTest`: 5 tests passed using a standalone JVM/JUnit-compatible runner.
- Deterministic Direct-source integration harness compiled `ModeBScreenCaptureVideoSource` and the relevant helpers against minimal Android/RootEncoder stubs. It passed three interleaving checks: an old in-flight callback cannot satisfy fresh readiness; a callback already queued before reshare is drained while the listener is detached; and the new-generation listener delivers readiness exactly once.
- Direct source and all related policy helpers passed `javac` syntax/type compilation against the stub API surface.
- ZIP integrity/CRC checked; `package.json` and `bun.lock` byte-identical to V54.

## Not verified
- Full Android Gradle semantic compilation, Android unit-test task, APK build, or physical-device execution; no Android SDK is configured in this workspace.
- Real SurfaceTexture callback scheduling on every Android 13/14+ device, repeated Direct/Compatibility reshare during sustained RTMP, and StreamingIn interoperability.
- `mediaSound` remains metadata only; no Screensaver MP4 audio is mixed into outgoing RTMP PCM.

## Scope
Only the Direct Screen Source lifecycle, one pure-Java FIFO barrier helper and its unit test, plus checkpoint documentation changed from V54.
