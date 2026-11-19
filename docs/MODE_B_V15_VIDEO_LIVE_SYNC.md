# Mode B V15 — Synchronize local MP4 overlays with RTMP publish

## Problem

The V14 local MP4 renderer began its playback clock as soon as `MediaMetadataRetriever` finished opening the file. Screen capture, Studio overlay setup, and the RTMP publish handshake happen afterward. On a slow network or server, a clip could therefore start halfway through—or even finish—before the stream was actually live. During a reconnect, the clip also continued advancing while the server was not receiving the stream.

## Changes

- Added `ModeBVideoPlaybackClock`, a monotonic clock with explicit start, pause, resume, loop, and final-frame behavior.
- MP4 decoder initialization no longer starts playback. The first frame timeline begins only from `ConnectChecker.onConnectionSuccess()`, after the RTMP publish handshake succeeds.
- The Studio video timeline pauses on `onConnectionStarted()` and `onConnectionFailed()`, then resumes from the same position after a successful reconnect.
- A non-looping clip freezes on its final frame and cannot accidentally restart during a reconnect.
- Decoder initialization or frame-decode failures close the retriever and quit the decoder HandlerThread. `OutOfMemoryError` during bounded frame decode is converted into a clear unsupported/memory warning instead of being allowed to crash the stream process.
- Render summary distinguishes an MP4 that is ready and waiting for RTMP LIVE/reconnect from one that is actively playing.

## Tests and validation

- Added five deterministic `ModeBVideoPlaybackClockTest` cases: no playback before publish, pause/resume continuity, loop wrap, final-frame freeze, and invalid duration rejection.
- The five clock tests and two Android scaled-frame argument tests pass in the local Java test harness (7 total).
- `ModeBStreamService`, `StudioOverlayView`, `NativeVideoOverlayDecoder`, and the supporting Mode B policy classes compile in a Java smoke compilation against Android/Capacitor/RootEncoder API stubs.
- `package.json` and `bun.lock` are unchanged from V14.

## Not verified here

- No Gradle/APK build was performed in this environment.
- Actual MP4 frame cadence, device codec behavior, thermal load, and RTMP playback/reconnect behavior still require a physical Android device and a real RTMP endpoint.
- The current renderer remains a bounded local MP4 overlay at up to 8 fps, with no video audio track, no remote URLs, and no WebM support.
