# SYNTXRR STREAM V56 — Mix Audio Recorder Allocation and Lifecycle Fix

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v55.zip`.
- V56 is a targeted Mode B Mix audio-source correction. It does not change Internal-only or microphone-only routes, RTMP transport/recovery, Direct/Compatibility capture lifecycle, Screensaver rendering, visual worker/frame arbiter, bitmap budgets, `package.json`, or `bun.lock`.

## Finding
RootEncoder 2.8.1 `MixAudioSource.create()` allocates a microphone `AudioRecord` during `AudioSource.init()`. `MixAudioSource.start()` then calls `MicrophoneManager.createMixMicrophone()`, which calls `createMicrophone()` again and overwrites the previous `audioRecord` reference without releasing the first instance. `MicrophoneManager.stop()` can release only the currently referenced recorder. The same pattern applies on initial `prepareAudio()`, the current Mix preflight, and `changeAudioSource()` during reshare.

## Changes
- Added `ModeBSafeMixAudioSource`, an app-owned `AudioSource` that continues to use RootEncoder `MicrophoneManager` and the existing AAC/RTMP pipeline.
- `create()` is now allocation-free. The source calls `createMixMicrophone()` exactly once from `start()`, so both mic and playback-capture recorders stay reachable by `MicrophoneManager.stop()`.
- The source builds `AudioPlaybackCaptureConfiguration` from its own `MediaProjection` instance and manages its own callback HandlerThread rather than relying on RootEncoder's process-global `MediaProjectionHandler`.
- PCM frames are forwarded to RootEncoder's `GetMicrophoneData` sink. Existing mic effects, sample rate, stereo configuration, Mix fallback messaging, and route semantics are retained.
- Added `ModeBMixAudioCaptureLifecycle` to record partial acquisition before attempting recorder creation. Duplicate start does not allocate again; a failed start remains cleanup-eligible; restart is blocked until cleanup succeeds; and cleanup may be retried after failure.
- Replaced RootEncoder `MixAudioSource` instantiation for initial Mode B start and reshare. Internal and microphone-only sources are unchanged.

## Validation performed
- `ModeBMixAudioCaptureLifecycle` standalone harness: 11 assertions passed.
- `ModeBSafeMixAudioSource` deterministic integration harness compiled against minimal Android/RootEncoder API stubs: 14 assertions passed for allocation-free prepare, one recorder-pair creation per start, duplicate start, stop idempotence, clean preflight restart, partial create failure cleanup, and microphone start failure cleanup.
- New native source and lifecycle helper compiled against the stub API surface.
- `package.json` and `bun.lock` verified byte-identical to V55.
- ZIP integrity/CRC verified after packaging.

## Not verified
- Full Android Gradle semantic compilation, Android unit-test task, APK build/install, or physical-device execution. The workspace has no configured Android SDK, and the Gradle wrapper distribution was not available offline.
- Actual AudioRecord/AudioPlaybackCapture behavior, audio route recovery under repeated physical-device reshare, sustained RTMP audio continuity, and StreamingIn interoperability.
- The RootEncoder dependency remains pinned at 2.8.1; it was not upgraded or vendored.
- `mediaSound` remains metadata only. No Screensaver MP4 PCM mixing or synchronization was added.
