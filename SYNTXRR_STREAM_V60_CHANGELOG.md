# SYNTXRR STREAM V60 — Preserve the Live RTMP Session During Audio Source Swaps

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v59.zip`.
- V60 is a targeted Mode B live-audio replacement guard. It changes only the service-side audio swap admission/verification and the pure-Java swap policy tests.

## Finding
RootEncoder 2.8.1 `StreamBase.changeAudioSource()` replaces the `AudioSource` in place: it stops the previous source, starts the candidate when the previous source was running, rolls back by attempting to restart the previous source if candidate startup fails, then releases the previous source and assigns the candidate. It does not call `stopStream()` or `startStream()`, and it does not replace the `RtmpStream` object. The existing SYNTXRR wrapper checked that the previous audio source was restored after a failed swap, but did not assert that the exact service-owned RTMP stream instance remained active after a successful swap.

## Changes
- Added a `LiveSessionHealth` check to `ModeBAudioSourceSwap`. Live replacements are rejected before touching either source unless the same RTMP session is active.
- After a successful `changeAudioSource()`, the service verifies that the candidate became the stream's active audio source, that it reports running, and that the same `RtmpStream` instance, stream generation, and `isStreaming` state remain active.
- If session identity/activity changes during the replacement, the failure path retires the candidate and marks recovery unsafe unless both the prior source and the same live RTMP session are confirmed healthy. This fails closed rather than silently treating a broken session as a safe audio fallback.
- The service continues to call only `changeAudioSource()` for these swaps. No RTMP stop/start, encoder prepare, transport recreation, or reconnect request was added.
- Added four policy tests for active-session admission, rejection before source mutation when not live, session loss during replacement, and safe rollback while the same session remains active.

## Validation performed
- Six focused audio policy/lifecycle test classes passed **33 test methods** using a lightweight local JUnit-compatible runner: source swap (10), Mix failure classification (2), Mix lifecycle (6), audio preflight (5), AudioRecord cleanup (6), and reader retirement (4).
- The modified `ModeBAudioSourceSwap` policy and its test class compiled with `javac`; the broader six-class audio test slice compiled against minimal Android/RootEncoder API stubs.
- RootEncoder 2.8.1 `StreamBase.changeAudioSource()` was inspected directly and confirms that it replaces only the audio source in place; it does not invoke stream stop/start methods.
- `package.json` and `bun.lock` remain byte-identical to V59.
- ZIP integrity/CRC verified after packaging.

## Not verified
- Full Android Gradle semantic compilation, Android unit-test task on the real Android toolchain, APK build/install, physical-device audio behavior, actual RTMP network continuity, or StreamingIn interoperability.
- The runtime guard verifies the same service-owned `RtmpStream` instance/generation remains `isStreaming`; it is not a substitute for observing RTMP server/network continuity on a real device.
- Screensaver `mediaSound` remains metadata only. MP4 PCM mixing and timestamp synchronization are not implemented.

## Scope
Production changes: `ModeBAudioSourceSwap.java` and `ModeBStreamService.java`. Tests: `ModeBAudioSourceSwapTest.java`. No dependency, build configuration, TypeScript application, AAC encoder, RTMP transport, capture engine, Screensaver, or lockfile changes were made.
