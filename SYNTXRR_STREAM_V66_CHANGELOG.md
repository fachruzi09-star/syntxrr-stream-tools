# SYNTXRR STREAM V66 changelog

## Mode B — Screensaver audio stability

- Added `ModeBScreensaverPcmConverter.ResampleState` to carry fractional output-frame remainder across MediaCodec buffers instead of independently rounding every decoded buffer. The state resets if sample rate, channel count, or PCM encoding changes, and each decoder playback epoch owns a fresh state.
- Routed `ModeBScreensaverAudioDecoder` output through the stateful converter so 48 kHz → 44.1 kHz resampling does not accumulate a per-buffer rounding error during long playback.
- Added asynchronous decoder failure reporting for missing audio tracks, unsupported/invalid PCM output, MediaCodec/decode errors, memory exhaustion, and unavailable worker startup.
- A terminal decoder failure now ends that generation, flushes stale Screensaver PCM, and wakes queue consumers; the video remains available.
- Added an audio-failure latch to `ModeBReshareWaitingView`. It is set before posting the UI notice so the still-running opacity animator cannot restart a failed decoder repeatedly. Selecting a new media asset clears the latch.
- Added two converter regression tests for cumulative resampling and fractional carry/reset across tiny blocks and format changes.
- Added `docs/MODE_B_V66_SCREENSAVER_AUDIO_RESAMPLING_AND_FAILURES.md` and updated this master interface audit.

## Validation

- `ModeBScreensaverPcmConverterTest`: 6 JVM test methods passed with a local JUnit-compatible runner (the existing four plus two V66 cases).
- A deterministic converter harness passed 13 assertions. 1,000 blocks × 1,024 input frames at 48 kHz produce exactly 940,800 output frames at 44.1 kHz; independent per-buffer rounding would have produced 941,000.
- `ModeBScreensaverAudioDecoder`, `ModeBScreensaverAudioTimeline`, and the modified converter compiled with `javac` against minimal Android/RootEncoder stubs.
- Source review confirms the audio failure latch blocks animator-driven retry until a different media asset is selected.
- `package.json` and `bun.lock` are byte-identical to V65; no existing files were deleted.

## Not verified

No Gradle/Android build or APK was produced. The project wrapper attempted to download Gradle 8.14.3 but failed with `UnknownHostException: services.gradle.org`; no installed Gradle executable was available. No physical-device MediaCodec playback, audible output, A/V sync drift measurement, AAC mux/RTMP viewer playback, or transport continuity test was performed. Do not describe V66 as device-validated or viewer-confirmed.
