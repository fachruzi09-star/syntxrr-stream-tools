# SYNTXRR STREAM V66 — Screensaver audio resampling continuity and decoder failure reporting

## Scope

V66 hardens the V65 Mode B Screensaver MP4 audio path without changing its AAC source routing, audio-source swap policy, MediaProjection lifecycle, or visual decoder.

## Cumulative PCM resampling

V65 converted each MediaCodec output buffer independently and rounded its output-frame count for that buffer. With 48 kHz input, a 1,024-frame buffer represents 940.8 output frames at 44.1 kHz. Rounding every buffer to 941 creates 0.2 excess output frames per buffer; the error accumulates over long playback.

V66 adds a decoder-session-owned `ModeBScreensaverPcmConverter.ResampleState`. It carries the fractional output-frame remainder across buffers and calculates output counts from the accumulated input duration. The state resets when the decoder output sample rate, channel count, or PCM encoding changes. Each decode session gets a fresh state, so pause/resume and loop restarts do not inherit a previous playback epoch's fractional remainder.

## Asynchronous audio failure visibility

The audio decoder now reports terminal failures (missing audio track, unsupported/invalid decoded format, codec/decode failure, memory failure, or unavailable worker) through a listener. A terminal audio failure stops that decoder generation, flushes stale Screensaver PCM, and wakes consumers. The waiting card can display that video continues without soundtrack rather than silently implying that the audio track is active.

The waiting view latches the audio failure before posting the UI message. This is necessary because the host-wait opacity animator continues to update while the card is visible; without the latch, a later animation tick could immediately restart a decoder that already failed. The latch resets only when a new media asset is selected.

## Validation

- The `ModeBScreensaverPcmConverterTest` class passed 6 JVM test methods using a local JUnit-compatible runner. The two V66 cases cover a 1,000-buffer 48 kHz → 44.1 kHz stream and fractional carry/reset behavior across tiny blocks and output-format changes.
- A separate deterministic converter harness passed 13 assertions. For 1,000 buffers of 1,024 input frames at 48 kHz, it produced exactly 940,800 output frames. Per-buffer rounding to 941 would have produced 941,000 frames (200-frame excess).
- The modified `ModeBScreensaverAudioDecoder`, timeline mapper, and PCM converter compiled with `javac` against minimal Android/RootEncoder API stubs.
- Source review confirms asynchronous decoder failure is latched before the UI post, further opacity ticks cannot restart a failed audio decoder, and selecting a new media asset clears the latch.
- `package.json` and `bun.lock` remain byte-identical to V65. No existing project files were deleted.

## Not verified

No Gradle/Android semantic build or APK build was run. The project Gradle wrapper exists, but running it attempted to download Gradle 8.14.3 and failed with `UnknownHostException: services.gradle.org`; no installed Gradle executable was available as a fallback. No physical-device MediaCodec test, sustained playback drift measurement, audible output check, AAC mux/RTMP viewer test, or network continuity test was performed. The converter tests validate arithmetic and source-slice compilation, not Android codec behavior or end-to-end LIVE audio.
