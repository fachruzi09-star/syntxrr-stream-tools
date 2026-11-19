# Mode B V9 — Mix-audio preflight lifecycle fix

## Defect found in V8

`MixAudioSource` was started with `AUDIO_PREFLIGHT_SINK` to verify Android playback-capture capability. The source remained running after the check.

RootEncoder 2.8.1 `StreamBase.startSources()` only invokes `audioSource.start(getMicrophoneData)` when `audioSource.isRunning()` is false. Because the preflight had left `MixAudioSource` running, RootEncoder skipped that call and the temporary discard sink remained installed. The device could therefore send a valid RTMP video stream while silently discarding audio frames.

## Fix

- Added `ModeBAudioPreflight.verifyAndRelease()`.
- A successful preflight source is stopped immediately after the capability check.
- A partially acquired source is also stopped when `start()` throws after acquiring resources.
- A source that never became active is not stopped unnecessarily.
- The next `GenericStream.startStream()` can now start the selected audio source with RootEncoder's real encoder callback.
- Existing fallback policy remains narrow: only known playback-capture failures in Mix mode may fall back to microphone. Internal-only selection is never silently changed.

## Regression tests

`ModeBAudioPreflightTest` covers:

1. successful preflight releases the temporary discard capture;
2. partially started capture is released when start throws;
3. failed start without acquired resources does not call stop.

All three behavior tests pass in the local Java harness. The changed Mode B service and helper compile against the Android/Capacitor/RootEncoder smoke stubs.

## Validation boundary

- 53 TypeScript/TSX files pass syntax transpilation (syntax only, not full type-check).
- AndroidManifest parses as valid XML.
- Native Mode B service/helper smoke compilation passes.
- Three audio-preflight lifecycle regression tests pass.
- `package.json` and `bun.lock` are unchanged from V8.
- A full Gradle/APK build and physical-device audio/RTMP test are still outstanding; this checkpoint must not be described as a device-verified streaming build.
