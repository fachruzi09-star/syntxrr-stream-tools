# Mode B V64 — Screensaver MP4 audio foundation

## Scope

V64 adds two small, allocation-free primitives for the next Screensaver MP4 audio stage:

- `ModeBScreensaverAudioTimeline` maps an audio sample's MP4 presentation timestamp onto the live monotonic stream clock using the current Screensaver video position.
- `ModeBScreensaverPcmMixer` sums two already-aligned interleaved PCM16 little-endian buffers with independent gains and signed-16 saturation.

`NativeVideoOverlayDecoder.mapAudioPresentationTimeUs()` exposes the same-clock mapping using the existing Screensaver video clock. It returns `DROP_TIMESTAMP` when the video is not running, metadata is not ready, or the audio PTS is stale/outside the current media duration.

## Clock decision

The existing video clock uses Android elapsed realtime. RootEncoder 2.8.1's `TimeUtils.getCurrentTimeNano()` uses `SystemClock.elapsedRealtimeNanos()`, so decoded MP4 PTS can be mapped to the same monotonic timebase without introducing a wall-clock offset. Mapping uses the nearest loop occurrence for looping media. It permits up to 1,000 ms of decoder pre-roll but drops audio more than 250 ms behind the video clock or more than 1,000 ms ahead. The asymmetric window is intentionally bounded: modest read-ahead can be queued for the next AAC interval, while stale audio must not trail the visible video substantially.

Reference implementation inspected: RootEncoder tag `cca548a` / release `2.8.1`, `common/src/main/java/com/pedro/common/TimeUtils.kt` and `encoder/src/main/java/com/pedro/encoder/input/sources/audio/BufferAudioSource.kt`.

## PCM mixer contract

- Inputs must already be converted to the same sample rate, channel count, interleaving, and PCM16 little-endian layout.
- Either input may be null (silence).
- Gain range is finite 0.0–4.0; the output saturates instead of wrapping on overflow.
- The hot-path method writes into a caller-owned output array and allocates no buffers.
- Shifted overlapping in-place ranges are rejected; exact same-offset in-place mixing is supported.

## Not yet implemented

V64 does **not** decode the MP4 audio track, produce PCM from `MediaExtractor`/`MediaCodec`, connect this mixer to the selected Mode B audio source, or inject mixed PCM into RootEncoder AAC. The existing Studio notice that Screensaver media audio is not active remains correct. Those steps require a generation-scoped decoder, bounded PCM queue, and a composite source that can preserve the selected Microphone/Internal/Mix route (including Silence during reshare) without replacing the current source or interrupting RTMP.

## Validation

- JVM tests cover matching/future/late PTS, bounded decoder pre-roll, asymmetric stale/lead rejection, loop-boundary mapping, pause/drop behavior, invalid clocks, timestamp overflow, PCM summation, clipping, gains, buffer bounds, and in-place aliasing.
- Android Gradle build, APK, hardware decoder, real AAC encode, device timing, and RTMP continuity are not claimed by this source-only checkpoint.
