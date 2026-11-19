# SYNTXRR STREAM V59 — Unblock Mix PCM Reader Before Join

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v58.zip`.
- V59 is a targeted Mode B Mix audio teardown-order correction. It does not alter AAC/RTMP transport, route selection/fallback policy, Internal-only or microphone-only source behavior, Direct/Compatibility capture, Screensaver rendering/audio metadata, visual workers/frame arbiter, bitmap budgets, `package.json`, or `bun.lock`.

## Finding
V58 set `MicrophoneManager.running=false`, called `HandlerThread.quitSafely()`, and waited up to 200 ms for the reader before stopping its two `AudioRecord` instances. RootEncoder 2.8.1's reader Runnable performs blocking `AudioRecord.read()` calls inside its loop. Quitting a HandlerThread does not itself cancel a currently executing Runnable. If either capture leg is still blocked in `read()`, the bounded join can expire while the recorder remains active. V58 then correctly fails closed and retains the recorder references, but a later cleanup retry repeats the same join-before-stop order and can remain stuck.

Android's AudioRecord API distinguishes blocking reads, which wait for requested audio data, from non-blocking reads that return immediately with available data. The current RootEncoder Mix manager uses the byte-array read overload in its reader loop. See the Android API reference: https://developer.android.com/reference/android/media/AudioRecord.

## Changes
- Added `ModeBAudioReaderRetirement` to make teardown ordering explicit and independently testable.
- Cleanup now requests HandlerThread retirement, stops only initialized recorder legs currently in `RECORDSTATE_RECORDING` to wake any blocking reads, then performs the bounded reader join.
- `AudioRecord.release()` remains after successful reader-thread retirement. If the thread does not exit, cleanup fails closed and retains both recorder references; the new ordering allows a subsequent retry to re-attempt stop and join rather than waiting on an active recorder first.
- Existing `ModeBAudioRecordCleanup.release()` remains responsible for clearing position listeners, retrying stop if necessary, and always attempting release after the join.
- Added four policy tests covering exact quit/stop/join ordering, non-active/uninitialized recorders, join timeout with suppressed stop-failure context, and cleanup when no reader thread exists.

## Validation performed
- Focused JVM tests: **12 test methods passed** (8 AudioRecord cleanup tests + 4 reader-retirement ordering tests) using a lightweight local JUnit-compatible runner.
- Deterministic Android/RootEncoder stub integration: **1 blocking-read scenario passed**. The fake reader blocks inside `AudioRecord.read()` until both recorder legs are stopped; cleanup then joins the reader and releases both recorder objects exactly once, with an explicit assertion that neither recorder is released while the reader thread remains alive.
- Changed production source slice compiled with `javac` against minimal Android/RootEncoder stubs.
- `package.json` and `bun.lock` remain byte-identical to V58.
- ZIP integrity/CRC verified after packaging.

## Not verified
- Full Android Gradle semantic compilation, Android unit-test task on the real Android toolchain, APK build/install, physical-device AudioRecord behavior, actual Mix playback capture after repeated reshare, sustained RTMP audio continuity, or StreamingIn interoperability.
- The build environment has no configured Android SDK and the Gradle 8.14.3 wrapper distribution could not be downloaded while offline.
- Screensaver `mediaSound` remains metadata only; MP4 PCM mixing and timestamp synchronization are not implemented.

## Scope
Runtime source changes are limited to `ModeBSafeMicrophoneManager.java` and the new `ModeBAudioReaderRetirement.java`, plus the `ModeBAudioRecordCleanup.java` helper extension. Tests add `ModeBAudioReaderRetirementTest.java` and extend `ModeBAudioRecordCleanupTest.java`. No dependency, build configuration, TypeScript application, or lockfile changes were made.
