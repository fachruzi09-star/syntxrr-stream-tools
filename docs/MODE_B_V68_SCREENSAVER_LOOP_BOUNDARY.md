# Mode B V68 — Screensaver Audio Loop Boundary

## Why this patch exists

V67 detected the end of an audio track by saving the video's media-relative position at the time MediaCodec delivered `BUFFER_FLAG_END_OF_STREAM`. It then waited for the modulo video position to become lower than that saved position. This is ambiguous when MediaCodec drains the final output after the video has already crossed its loop boundary. For example, EOS may be observed at 10.12 seconds with a 10-second video; the saved modulo position is then 0.12 seconds, so the comparison can miss the boundary that occurred at 10.00 seconds and wait for another full cycle.

## V68 changes

- `ModeBVideoPlaybackClock.elapsedPlaybackMs(now)` exposes cumulative active-playback time without applying the clip-duration modulo. The value remains frozen while paused and continues across resume.
- `ModeBScreensaverLoopBoundary` calculates the next absolute loop boundary from the same clock snapshot used to obtain the modulo media position. It validates inputs and saturates on overflow.
- `NativeVideoOverlayDecoder.playbackSnapshot()` returns the media seek position and next cumulative loop deadline from the same monotonic-time snapshot. This prevents a race where the video wraps between separate position/deadline reads.
- `ModeBScreensaverAudioDecoder` takes that snapshot at the beginning of each decode epoch and uses the paired media position for `MediaExtractor.seekTo()`. When EOS arrives, it starts the next audio decode as soon as cumulative active playback reaches or has already passed the paired deadline.
- Pause still invalidates the decoder generation and flushes its PCM queue. A resumed epoch calculates a new boundary from the resumed video clock, so stale decoder output cannot leak into the new epoch.

## Targeted validation

The pure-Java JVM harness compiles the actual `ModeBVideoPlaybackClock` and `ModeBScreensaverLoopBoundary` sources and runs 11 tests:

- existing video playback clock behavior;
- cumulative elapsed time across a loop;
- elapsed time frozen while paused and preserved after resume;
- short audio track waiting for the actual video loop boundary;
- late EOS observed after a video wrap being treated as already past the boundary;
- invalid boundary snapshots and overflow saturation.

The Android `MediaCodec`/`MediaExtractor` path, full Gradle build, APK, physical-device playback, and RTMP output have not been run in this environment. The patch changes loop scheduling only; it does not claim to validate actual audio/video sync on hardware.
