# SYNTXRR STREAM V65 — Screensaver MP4 audio decode and AAC source integration

## Scope

V65 advances the V64 timing/mixing foundation into a Mode B Screensaver audio path. The MP4's first audio track is decoded with a dedicated `MediaExtractor`/`MediaCodec` worker that is separate from the shared video-frame worker. Decoded PCM is normalized to 44.1 kHz stereo PCM16, mapped from MP4 presentation timestamps onto the existing video playback clock, and handed to a bounded session-owned queue.

The queue is shared with the current safe audio source. While microphone, Internal, or Mix is active, timestamp-overlapping Screensaver samples are mixed into the live PCM frame before RootEncoder's AAC encoder callback. While projection-dependent Internal/Mix is silenced after screen-sharing loss, the service may replace that source with `ModeBScreensaverAudioSource` so the Screensaver soundtrack can continue without retaining the revoked playback-capture recorder. Microphone-only mode remains active and receives the soundtrack as an additive PCM layer.

## PCM and AAC input safety

RootEncoder 2.8.1's `AudioEncoder` configures `KEY_MAX_INPUT_SIZE` to 8,192 bytes and truncates any larger `Frame` to the available MediaCodec input buffer. V65 therefore splits Screensaver-only PCM chunks and oversized live AudioRecord frames into aligned frames no larger than that capacity. Each piece keeps an offset-adjusted timestamp so the encoder does not silently lose a PCM tail or receive the wrong next-frame time.

The queue is bounded to 96 chunks, two seconds of buffered audio, and 64 KiB per decoded chunk. Decoder generations invalidate late output after pause/resume. Decode output is held to a bounded lead relative to the video clock; stale and future samples are rejected. The audio decoder waits for the video clock to become ready and playing before consuming the track. Release acknowledgements are deferred until the decoder worker has retired its codec/extractor, including when release is requested more than once. On media replacement, the view retains references to both old decoders until their worker acknowledgements arrive, allowing concurrent service teardown to wait on the exact retired readers before deleting the asset namespace.

## Format support and fallback

The converter currently accepts decoder output in signed PCM16 or float PCM, with one or two channels, and resamples to the fixed 44.1 kHz stereo Mode B AAC input. The first audio track is selected. If the MP4 has no audio track or the decoder/format is unsupported, the video can continue and the Screensaver soundtrack is simply absent; this path does not introduce a microphone fallback for Internal mode.

## Validation

- 29 focused JVM test methods passed across PCM conversion, PCM mixing, audio PTS mapping, bounded queue lifecycle, AAC-size chunk splitting, and live-frame forwarding.
- `ModeBScreensaverAudioDecoder`, `ModeBScreensaverAudioSource`, the PCM converter/mixer/queue, timeline mapper, and frame forwarder compiled with `javac` against minimal Android/RootEncoder stubs. The safe Microphone/Internal/Mix sources also compiled against a Kotlin `AudioSource` API model exposing RootEncoder’s actual Java getter signatures. A separate decoder release harness verified both queued release acknowledgements are delivered after worker retirement.
- Static service/view audit confirms initial and reshare audio sources receive the session queue, the video and audio decoders share the same video clock, and decoder release callbacks remain part of media/asset retirement.
- `package.json` and `bun.lock` remain byte-identical to V64. No existing project files were deleted.

## Not verified

No Android Gradle build, APK, physical-device MediaCodec playback, actual audio/video sync measurement, AAC mux/RTMP playback, or network continuity test was performed. The stubs verify source-slice Java syntax and the focused JVM policies, not device codec behavior. Real-device validation is still required before claiming that viewers hear synchronized Screensaver MP4 audio during LIVE.
