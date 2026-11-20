# SYNTXRR STREAM V65 changelog

## Mode B — Screensaver MP4 audio decode and AAC source integration

- Added a dedicated `MediaExtractor`/`MediaCodec` worker for the first audio track in the Screensaver MP4. It waits for the existing video playback clock to be ready and running, so audio start does not race video initialization.
- Converts PCM16 or float mono/stereo decoder output to 44.1 kHz stereo PCM16 and maps decoded PTS onto the video decoder's monotonic playback timeline.
- Added a session-scoped bounded PCM queue with generation invalidation, pause/resume flushing, late/future-sample rejection, and limits on chunk size, chunk count, and buffered duration.
- Injected the queue into safe Microphone, Internal, and Mix sources so matching Screensaver samples are mixed into PCM before RootEncoder's AAC input.
- Added `ModeBScreensaverAudioSource` for the projection-loss waiting state, allowing the Screensaver soundtrack to replace only the silenced Internal/Mix route without introducing a microphone fallback.
- Added `ModeBAudioPcmFrameForwarder` and split Screensaver-only frames to RootEncoder 2.8.1's 8,192-byte AAC input capacity. Oversized AudioRecord frames are also split with per-piece timestamps so RootEncoder does not truncate their PCM tails.
- Hardened decoder release acknowledgements so repeated release requests wait for MediaCodec/MediaExtractor worker retirement. During Screensaver media replacement, the waiting view now retains references to both retiring decoders until both workers acknowledge completion, so concurrent service cleanup can still await their file reads.
- Updated the master interface audit and added `docs/MODE_B_V65_SCREENSAVER_AUDIO_INTEGRATION.md`.

## Validation

- 29 focused JVM test methods passed: 4 PCM converter, 6 PCM mixer, 8 PTS timeline, 8 bounded queue, and 3 AAC frame-forwarder tests.
- `ModeBScreensaverAudioDecoder`, `ModeBScreensaverAudioSource`, `ModeBAudioPcmFrameForwarder`, converter, mixer, queue, timeline, and the safe Microphone/Internal/Mix source slice compiled with `javac` against minimal Android/RootEncoder stubs. The safe-source compile used a Kotlin `AudioSource` API model with the actual Java getter signatures (`getSampleRate()`, `isStereo()`, `getEchoCanceler()`, `getNoiseSuppressor()`). A separate decoder release harness confirmed that two queued release acknowledgements are both delivered only after worker retirement.
- `package.json` and `bun.lock` are byte-identical to V64. No existing files were deleted.
- No full Android Gradle build, APK build, physical-device MediaCodec test, actual A/V sync measurement, AAC mux/RTMP viewer playback, or network continuity test was performed.

V65 provides the source-level MP4 audio-to-AAC path, but device codec behavior and real RTMP viewer audio remain unverified.
