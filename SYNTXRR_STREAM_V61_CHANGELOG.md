# SYNTXRR STREAM V61 — Safe Microphone-Only Capture and Preflight

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v60.zip`.
- V61 is a targeted Mode B microphone-only source fix. It preserves the V60 live RTMP audio-swap guard and all existing Mix, Internal, Silence, video-capture, and encoder routes.

## Finding
RootEncoder 2.8.1 `MicrophoneSource.create()` calls `MicrophoneManager.createMicrophone()` during `AudioSource.init()`/`prepareAudio()`. Its `MicrophoneSource.start()` calls `createMicrophone()` again on the same manager. `MicrophoneManager.createMicrophone()` assigns a new `AudioRecord` to its field without releasing an already referenced recorder. The first recorder is therefore overwritten before `MicrophoneManager.stop()` can release it. This affects the initial Microphone-only selection and the Mix-to-Microphone fallback paths, even though V56–V60 had already replaced the Mix implementation with an app-owned safe source.

## Changes
- Added `ModeBSafeMicrophoneSource`, an app-owned microphone-only `AudioSource`.
- Its `create()` is allocation-free; a real `AudioRecord` is created only once during each admitted `start()` generation.
- It uses `ModeBSafeMicrophoneManager` for actual recorder-state validation, blocking-reader wakeup/join, release retry, and base manager cleanup.
- Its PCM sink is published only after microphone startup succeeds and cleared before cleanup. A rejected restart cannot redirect a retiring capture thread to a new encoder sink.
- Replaced all Mode B service uses of RootEncoder `MicrophoneSource` with `ModeBSafeMicrophoneSource`, including initial microphone mode, Android-version fallback, initial Mix failure fallback, and reshare Mix failure fallback.
- Added a microphone-only preflight using the existing discard sink before `startStream()`. A missing/denied microphone is now reported before the RTMP start path opens the session; a Mix fallback still remains microphone-only and does not change Internal mode semantics.
- Made `ModeBSafeMicrophoneManager` subclassable for deterministic source lifecycle tests; runtime manager behavior is unchanged by this test seam.

## Validation performed
- Seven focused JVM audio test classes passed **38 test methods**: Mix lifecycle, AudioRecord cleanup, reader retirement, safe microphone source lifecycle, audio preflight, source swap, and Mix failure classification.
- A deterministic Android/RootEncoder-stub integration harness passed **9 assertions** covering allocation-free prepare, exactly one recorder for microphone preflight, cleanup before the real stream start, exactly one new recorder for the real start, duplicate-start idempotence, PCM forwarding while active, and late-PCM drop after stop.
- The changed safe-microphone source/manager slice compiled with `javac` against a minimal Android/RootEncoder API stub surface.
- A source scan confirms no `new MicrophoneSource()` call or RootEncoder `MicrophoneSource` import remains in Android app production source.
- `package.json` and `bun.lock` remain byte-identical to V60.
- ZIP integrity/CRC verified after packaging.

## Not verified
- Full Android Gradle semantic compilation, Android unit-test task on the real Android toolchain, APK build/install, device AudioRecord behavior, physical-device reshare, actual RTMP network continuity, or StreamingIn interoperability.
- The integration harness verifies application-source lifecycle and recorder allocation counts against deterministic stubs. It does not prove OEM AudioRecord behavior or network continuity.
- Screensaver `mediaSound` remains metadata only. MP4 PCM mixing and timestamp synchronization are not implemented.

## Scope
Production changes: `ModeBSafeMicrophoneSource.java`, `ModeBSafeMicrophoneManager.java` (test-seam visibility only), and `ModeBStreamService.java`. Test: `ModeBSafeMicrophoneSourceTest.java`. New documentation: `docs/MODE_B_V61_SAFE_MICROPHONE_SOURCE.md`. No dependency, build configuration, TypeScript application, AAC encoder, RTMP transport, Direct/Compatibility capture engine, Screensaver, or lockfile changes were made.
