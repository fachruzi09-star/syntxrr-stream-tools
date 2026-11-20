# SYNTXRR STREAM V64 changelog

## Mode B — Screensaver MP4 audio foundation

- Added a tested PTS-to-live-time mapping policy tied to the current Screensaver video position and Android elapsed-realtime clock.
- Looping media maps samples across the nearest loop boundary; paused, invalid, out-of-range, or stale samples are dropped.
- Added an allocation-free PCM16 little-endian two-input mixer with separate gains and signed-16 saturation.
- Exposed the video decoder's shared audio timestamp mapping without changing its existing video decode or playback behavior.
- Added `docs/MODE_B_V64_SCREENSAVER_AUDIO_FOUNDATION.md` and updated the master interface audit / functional gap tracker.

## Validation

- 14 focused JVM tests passed: 8 timeline cases and 6 PCM mixer cases.
- Production helper classes compiled with `javac` using the JDK; `NativeVideoOverlayDecoder` also compiled against minimal Android/bitmap/worker/budget/metadata-retriever stubs.
- `package.json` and `bun.lock` remain byte-identical to V63.
- No existing files were deleted.

V64 is a timing/mixing foundation only. It does not yet decode Screensaver MP4 audio, wire the mixer into Mode B's selected audio route, or send Screensaver PCM into AAC. No Android Gradle build, APK, physical-device test, or RTMP audio continuity test was performed.
