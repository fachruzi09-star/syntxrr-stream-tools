# SYNTXRR STREAM V52 — Audio Source Failure Cleanup

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v51.zip` (960,871 bytes).
- V52 does not change the selected Mode B audio route, the 48 MiB visual budget, the shared visual worker/frame arbiter, Screensaver media playback, RTMP lifecycle, or MediaProjection policy.

## Finding
RootEncoder 2.8.1 `StreamBase.changeAudioSource()` restores the previous source when the replacement source fails to start, but it does not stop/release the failed replacement candidate. `InternalAudioSource` and `MixAudioSource` start a `HandlerThread` and register a `MediaProjection.Callback` before `MicrophoneManager` can report a running capture. A failed `createInternalMicrophone` / `createMixMicrophone` can therefore leave candidate resources behind even though `isRunning()` is false.

The initial Mix preflight had the same blind spot: it only called `stop()` when start succeeded or `isRunning()` was true. That condition does not cover a HandlerThread/callback allocated before the AudioRecord begins running.

## Changes
- `ModeBAudioPreflight.verifyAndRelease()` now invokes `stop()` after every attempted start, including a failed start before `isRunning()` becomes true. Cleanup exceptions are suppressed onto the original start exception instead of hiding the actual audio-capture failure.
- Mix-to-Microphone fallback is allowed only when failed-Mix cleanup completed without suppressed cleanup errors. If candidate cleanup or rollback recovery is uncertain, the reshare ends the RTMP session instead of stacking another capture source or retaining an orphaned AudioRecord.
- If a failed reshare cannot replace a projection-dependent audio source with silence, the session is ended rather than leaving an encoder potentially attached to a revoked projection.
- Added `ModeBAudioSourceSwap` to wrap live RootEncoder source changes. When a candidate fails, it is explicitly stopped and released after RootEncoder has attempted to restore the previous source. Candidate-cleanup failures are attached as suppressed exceptions and do not replace the primary failure.
- Routed Mode B projection-loss silence, fresh-projection Internal/Mix restoration, Mix-to-Microphone fallback, and failed-resume silence through the safe replacement helper. The requested `internal` route is never silently changed to microphone; only `mix` retains its documented microphone fallback.
- Updated regression tests to cover a failed preflight where the recorder never enters running state, cleanup exception suppression, successful swaps, failed-candidate cleanup, and cleanup failure after a replacement error.

## Validation performed
- Standalone Java/JVM harness: 10 focused test scenarios passed across preflight cleanup, failed-start-before-running cleanup, primary exception preservation, safe audio-source replacement, candidate cleanup, suppressed cleanup errors, fallback eligibility, and previous-source rollback health.
- Mix fallback is suppressed when the prior candidate cleanup is uncertain; failed-resume audio is fail-closed if silence cannot be installed.
- Source reference check: all Mode B audio source replacements use the safe helper.
- TypeScript source unchanged from V51; `package.json` and `bun.lock` unchanged.
- ZIP integrity and CRC checked after packaging.

## Not verified
- Full Android semantic compilation / Gradle build / APK build.
- Physical-device mic/internal/mixed audio after reshare and repeated permission denial.
- Audio continuity/latency and actual RTMP audio output.
- `mediaSound` remains metadata only; MP4 Screensaver is still silent.
- LIVE interoperability with StreamingIn.
