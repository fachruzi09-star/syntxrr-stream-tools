# Mode B V16 — MP4 readiness race and frame cadence

## Changes

- Retained the requested playback state while `MediaMetadataRetriever` initializes. RTMP publish may succeed before MP4 metadata is ready; the previous implementation could drop the early `startPlayback()` request and leave the clip paused until a later reconnect.
- Pause/reconnect now clears the pending playback intent synchronously. A queued start callback checks the latest intent before starting the playback clock.
- The decode loop checks the playback intent before decoding and before scheduling another frame, reducing stale-frame work after a pause request.
- Added a monotonic 8 fps scheduler. Fast decodes preserve the cadence; slow decodes skip missed deadlines and wait one interval rather than creating catch-up bursts.

## Tests

Added JVM regression coverage for:
- a LIVE request arriving before decoder initialization completes;
- pause cancelling a pending auto-start;
- latest playback intent winning during initialization;
- cadence when decoding is faster than the frame interval;
- slow decode skipping missed deadlines without a burst;
- invalid frame intervals.

## Verification boundaries

The targeted JVM tests and Java smoke compilation use local Android API stubs. TypeScript files are syntax-transpiled, not fully type-checked. A real Gradle APK build and on-device MP4/RTMP test remain required.
