# SYNTXRR STREAM V58 — Safe AudioRecord Release Retry

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v57.zip`.
- V58 is a targeted Mode B Mix audio cleanup correction. It does not change the Internal-only or microphone-only route behavior, AAC/RTMP transport, Direct/Compatibility screen capture, Screensaver rendering/audio metadata, visual workers, bitmap budgets, `package.json`, or `bun.lock`.

## Finding
V57 retained an `AudioRecord` field when `AudioRecord.release()` failed, intending to let the next cleanup retry it. However, the inherited RootEncoder 2.8.1 `MicrophoneManager.stop()` calls `AudioRecord.stop()` before `release()` for every non-null recorder. For a recorder that never reached `RECORDSTATE_RECORDING` (or is uninitialized), `stop()` can fail before `release()` is attempted. A retained recorder could therefore hit the same failure on every retry and keep `ModeBMixAudioCaptureLifecycle.resourcesMayExist` permanently set.

A second ordering issue existed in `ModeBSafeMixAudioSource.start()`: it published the incoming PCM sink before lifecycle admission. If a prior cleanup was still pending, a rejected start could nevertheless replace the sink reference used by a late callback from a retiring source generation.

## Changes
- Added `ModeBAudioRecordCleanup`, which clears the position listener, calls `stop()` only for an initialized recorder currently in `RECORDSTATE_RECORDING`, and always attempts `release()` even when the stop attempt fails.
- `ModeBSafeMicrophoneManager.stop()` now sets the reader loop to stopped, retires and bounded-joins the RootEncoder reader thread before touching its recorders, and independently attempts release for both microphone and playback-capture records.
- Recorder references are cleared only after `release()` succeeds. Any failed release remains referenced and causes cleanup to fail closed, allowing a later `stop()` call to retry the release without first repeating an invalid `stop()` operation.
- Once both recorders are released, the method delegates to `MicrophoneManager.stop()` so RootEncoder can release its private post-process effects and reset its internal `created` flag.
- `ModeBSafeMixAudioSource.start()` now publishes the new PCM sink only after the lifecycle guard admits the start and capture startup completes. A rejected or failed start cannot redirect callbacks to a new sink.
- Added cleanup policy tests for active, stopped, and uninitialized recorders; stop failure followed by successful release; retryable release failure; and suppressed failure context.

## Validation performed
- Relevant JVM tests: **31 test methods passed** across Mix capture lifecycle, Mix failure classification, audio source swap, audio preflight, stream fallback policy, and the new AudioRecord cleanup policy.
- Deterministic Android/RootEncoder stub integration harness: **56 assertions passed**. It exercised preflight stop followed by actual stream start, four repeated Mix → Silence → Mix reshare generations with fresh projection/source pairs, balanced MediaProjection callback registration, exact-once release of retired recorder pairs, uninitialized-record release retry, cleanup after microphone-start/playback-start partial failure, release failure retry, start rejection while cleanup remains uncertain, and PCM sink publication only after successful start.
- The changed production source slice compiled with `javac` against the minimal Android/RootEncoder stub API surface.
- `package.json` and `bun.lock` were verified byte-identical to V57.
- ZIP integrity/CRC was verified after packaging.

## Not verified
- Full Android Gradle semantic compilation, Android unit-test task on the real Android toolchain, APK build/install, physical-device `AudioRecord` behavior, actual playback capture after repeated reshare, sustained RTMP audio continuity, or StreamingIn interoperability.
- The build environment does not have a configured Android SDK and the Gradle wrapper distribution is unavailable offline.
- Screensaver `mediaSound` remains metadata only; MP4 PCM mixing and timestamp synchronization are not implemented.

## Scope
Runtime source changes are limited to `ModeBSafeMicrophoneManager.java` and `ModeBSafeMixAudioSource.java`; V58 adds `ModeBAudioRecordCleanup.java`, `ModeBAudioRecordCleanupTest.java`, this changelog, and the corresponding master-audit addendum. No dependency or lockfile changes were made.
