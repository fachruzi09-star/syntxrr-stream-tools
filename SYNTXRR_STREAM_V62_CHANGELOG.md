# SYNTXRR STREAM V62 — Safe Internal Playback-Capture Lifecycle

## Problem

A source audit of the RootEncoder 2.8.1 `InternalAudioSource` path found that its `create()` method allocates a microphone `AudioRecord` through `MicrophoneManager.createMicrophone()`, although Internal mode does not read from that recorder. Its `start()` method then creates the actual playback-capture `AudioRecord` through `createInternalMicrophone()`. The base `MicrophoneManager.stop()` also uses a bounded join and does not establish the same strict reader-retired-before-release invariant used by the SYNTXRR safe Mix/microphone-only sources.

This left the explicit Internal route outside the resource-retirement protections established in V56–V61. It also meant Internal → Silence during reshare relied on RootEncoder's generic teardown behavior.

## Changes

- Added `ModeBSafeInternalAudioSource` for playback-capture-only audio. Its `create()` is allocation-free, so `prepareAudio()` no longer creates an unused microphone recorder.
- The source creates exactly one playback-capture `AudioRecord` per admitted start generation and validates the actual recorder initialization and recording states.
- Reused `ModeBSafeMicrophoneManager` so blocking reads are woken, the PCM reader is joined before recorder release, and failed cleanup remains retryable/fail-closed.
- Added explicit `MediaProjection.Callback` thread registration, unregistration, bounded thread join, and cleanup retry handling owned by the source.
- Added preflight for Internal playback capture before `startStream()` opens RTMP. Internal remains strict: a failed preflight reports an error and never silently falls back to microphone.
- Replaced both initial-session and reshare construction sites with `ModeBSafeInternalAudioSource`; updated active-route detection and the permission/policy comment.
- Left Mix, microphone-only, AAC/RTMP encoder ownership, SilenceAudioSource, video capture, presets, Screensaver, package dependencies, and lockfiles unchanged.

## Validation

- Android/RootEncoder stub integration harness passed **17 assertions**: allocation-free prepare; no microphone recorder allocation; one playback-capture recorder per generation; callback registration/unregistration balance; PCM forwarding while active; late PCM rejection after stop; restart after full cleanup; partial creation failure cleanup; invalid recorder state cleanup; and no sink publication on failed startup.
- Changed production source slice compiled with `javac` against minimal Android/RootEncoder stubs.
- Source scan confirms no remaining `InternalAudioSource` imports or instantiations in Mode B production source; initial and reshare paths use `ModeBSafeInternalAudioSource`.
- Service-path review confirms only `mix` is eligible for microphone fallback; explicit `internal` preflight failure remains an error.
- `package.json` and `bun.lock` are byte-identical to V61. No dependency or Gradle configuration changes.
- ZIP integrity/CRC verified.

## Not yet verified

No full Android Gradle build, APK build/install, physical-device playback-capture test, actual RTMP network continuity test, or StreamingIn comparison was performed in this environment. Android SDK/Gradle distribution was not available for a full build. Device tests are still required to validate OEM-specific playback capture and long-running reshare behavior.
