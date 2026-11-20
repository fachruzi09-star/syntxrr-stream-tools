# SYNTXRR STREAM V68

## Focus
Fix the Screensaver MP4 audio loop restart edge case when MediaCodec reports end-of-stream after the video clock has already crossed its loop boundary.

## Changes
- Added cumulative active-playback time to `ModeBVideoPlaybackClock`; loop modulo no longer hides previously crossed boundaries.
- Added `ModeBScreensaverLoopBoundary` to compute the next absolute loop boundary from one playback-clock snapshot.
- Added `NativeVideoOverlayDecoder.playbackSnapshot()` to pair the media seek position and next loop boundary from one monotonic-time snapshot.
- Changed `ModeBScreensaverAudioDecoder` to use that paired snapshot for `MediaExtractor.seekTo()` and loop scheduling, then resume decoding immediately when the deadline has passed.
- Preserved generation invalidation and queue flushing on pause; a resumed playback epoch snapshots a new deadline.
- Added `ModeBScreensaverLoopBoundaryTest` and expanded `ModeBVideoPlaybackClockTest`.
- Updated `SYNTXRR_STREAM_MASTER_INTERFACE_AUDIT.md` and added `docs/MODE_B_V68_SCREENSAVER_LOOP_BOUNDARY.md`.

## Validation
- 11/11 targeted JVM tests passed using the actual pure-Java clock and loop-boundary source files.
- Structural integration checks verify that audio decode no longer uses the previous modulo-position comparison and that the deadline is captured once per decode epoch.
- No file deletions. `package.json` and `bun.lock` are byte-identical to V67.
- Full Gradle build/APK, physical-device MediaCodec tests, audio/video synchronization on hardware and RTMP output were not run. Gradle 8.14.3 remains unavailable because `services.gradle.org` DNS resolution failed in the current environment.
