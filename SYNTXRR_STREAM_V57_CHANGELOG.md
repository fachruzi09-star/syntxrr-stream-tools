# SYNTXRR STREAM V57 — Mix Playback-Capture Failure Classification

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v56.zip`.
- V57 is a targeted Mode B Mix audio startup correction. It does not change the Internal-only or microphone-only route behavior, RTMP transport/recovery, Direct/Compatibility capture, Screensaver rendering/audio metadata, visual workers, bitmap budgets, `package.json`, or `bun.lock`.

## Finding
RootEncoder 2.8.1 `MicrophoneManager.createMixMicrophone()` first creates the microphone recorder and then creates the playback-capture recorder. Both creation methods reuse the same `created` field. If microphone creation succeeds and playback-capture creation fails, the latter can return the earlier `created=true` value even though `audioRecordDevice` is absent or uninitialized. `ModeBSafeMixAudioSource` previously trusted this boolean; the subsequent `MicrophoneManager.start()` could fail with a generic missing-recorder message that did not match Mode B's narrow playback-capture fallback classifier. This could prevent the existing Mix-to-Microphone fallback from running.

## Changes
- Added `ModeBSafeMicrophoneManager`, a narrow adapter over RootEncoder's existing manager. It validates the actual microphone and playback-capture `AudioRecord` states after `createMixMicrophone()` instead of trusting the shared `created` flag.
- If a partially created recorder is uninitialized, the adapter attempts `AudioRecord.release()` and clears the field only when release succeeds. If release fails, the reference is retained so the normal cleanup path can retry and fail closed.
- Added `ModeBMixAudioFailurePolicy` to distinguish microphone-leg failure from playback-capture-leg failure at create and start time.
- `ModeBSafeMixAudioSource` now maps a playback-capture-only failure to a message recognized by the existing Mix fallback policy. Microphone startup failures remain distinct and do not incorrectly trigger a playback-capture fallback.
- Tightened `ModeBStreamPolicy.isAudioStartFailure()` so the old generic `Failed to create microphone audio source` message no longer triggers the Mix playback-capture fallback. Only playback-capture-specific failures continue to match.
- The AAC encoder, RTMP route, configured sample rate/channel count, effects, and existing user-facing fallback policy are unchanged.

## Validation performed
- Relevant JVM tests: 26 tests passed (Mix lifecycle, new failure classification, audio source swap, and audio preflight).
- RootEncoder manager stub integration harness: 5 assertions passed, reproducing a stale `created=true` result while the playback-capture recorder is absent; the adapter rejects the false success and the microphone peer is cleaned.
- Safe Mix source deterministic Android/RootEncoder stub harness: 16 assertions passed across normal Mix start, duplicate start, missing playback recorder, uninitialized playback recorder, microphone start failure, playback-capture start failure, cleanup, and projection callback retirement.
- New adapter, failure policy, and Safe Mix source compiled against the minimal Android/RootEncoder stub API surface.
- Existing `package.json` and `bun.lock` were verified byte-identical to V56.
- ZIP integrity/CRC verified after packaging.

## Not verified
- Full Android Gradle semantic compilation, Android unit-test task, APK build/install, physical AudioRecord behavior, actual playback capture on Android devices, repeated reshare during sustained RTMP, or StreamingIn interoperability.
- The build environment does not have a configured Android SDK and the Gradle wrapper distribution is unavailable offline.
- `mediaSound` remains metadata only; Screensaver MP4 PCM mixing and timestamp synchronization are not implemented.

## Scope
Existing runtime changes are limited to `ModeBSafeMixAudioSource.java` and the narrowly scoped `ModeBStreamPolicy.java` fallback matcher. V57 adds `ModeBSafeMicrophoneManager.java`, `ModeBMixAudioFailurePolicy.java`, one failure-policy unit test, updates `ModeBStreamPolicyTest.java`, and adds this changelog plus the corresponding audit note.
