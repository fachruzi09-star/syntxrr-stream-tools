# SYNTXRR STREAM V53 — Direct Capture Callback Retirement

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v52.zip`.
- V53 is a narrow native lifecycle hardening. It does not change capture-engine selection, MediaProjection token handling, Compatibility Object Layer rendering, audio routing, the 48 MiB visual budget, Screensaver playback, scene replacement, or the RTMP session policy.

## Finding
`ModeBScreenCaptureVideoSource` forwards direct-capture `SurfaceTexture` callbacks to RootEncoder's GL interface from a dedicated `HandlerThread`. Before V53, `stop()` cleared the listener and called `quitSafely()`, but returned without waiting for an already-running callback to finish. The Mode B owner can subsequently release the RTMP/GL stream. That left a narrow teardown race in which a frame callback already past its `stopping` check could still target the retiring GL interface.

The Compatibility Object Layer uses the main Looper for its projection/frame-readiness callbacks and retains its existing one-`VirtualDisplay` guard; this patch does not alter that path.

## Changes
- `ModeBScreenCaptureVideoSource.stop()` now detaches/releases its projection resources while holding its state lock, then calls `quitSafely()` and waits up to 200 ms for the direct callback thread to retire before returning.
- The join happens **outside** the source lock so a queued `VirtualDisplay.Callback` can acquire the lock, observe the stopped state, and exit instead of deadlocking teardown.
- A timeout is logged rather than blocking the Android main/service thread indefinitely.
- Added `ModeBThreadJoinPolicy` for bounded, interrupt-preserving thread joins and five JVM unit cases: null/already-retired thread, timely completion, timeout, self-join avoidance, and interrupt restoration.

## Validation performed
- Standalone Java harness: 9 assertions passed across null/already-retired, timely completion, bounded timeout, self-join avoidance, and interrupt restoration.
- `ModeBScreenCaptureVideoSource` and its helper passed a Java syntax/type check against minimal Android/RootEncoder API stubs. This is not an Android SDK or Gradle semantic build.
- Source inspection confirms the Direct callback thread's retirement wait completes before `stop()` returns to RootEncoder/service teardown.
- Compatibility Object Layer code, `ModeBCaptureEnginePolicy`, `ModeBProjectionLayerGuard`, `ModeBScreenCaptureGeometry`, and all existing rendering behavior are unchanged.
- `package.json` and `bun.lock` are unchanged.

## Not verified
- Full Android semantic compilation / Gradle unit-test task / APK build.
- Whether every device retires the callback thread within the 200 ms bound; a warning is emitted if it does not.
- Physical-device Direct and Compatibility capture, projection loss/reshare, long-running RTMP, and StreamingIn interoperability.
- `mediaSound` remains metadata only. No Screensaver MP4 audio is mixed into outgoing RTMP PCM.
