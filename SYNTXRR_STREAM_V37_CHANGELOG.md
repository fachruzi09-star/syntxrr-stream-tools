# SYNTXRR STREAM V37 — Video Decoder Admission Guard

Basis: `syntxrr-stream-tools-main-fixed-v36.zip`.

## Read-only audit findings

- `NativeVideoOverlayDecoder.pausePlayback()` already removes its scheduled frame callback, and its decode loop only reschedules while the playback clock is running. Paused clips therefore do not continue extracting frames.
- `StudioOverlayView.parseElements()` already skips elements with `visible=false` before allocating video decoders.
- A visible video element with zero opacity, zero width/height, or an origin at 100% canvas edge could still allocate a `MediaMetadataRetriever` and consume one of the two decoder slots even though `drawElement()` clips it to an empty/zero-area region.

## Changes

- Added `ModeBVideoLayerPolicy` to reject MP4 decoder creation for layers that cannot contribute visible pixels to the canvas snapshot.
- Applied the policy before `loadVideoAsset()`, so invisible-by-geometry MP4 elements do not allocate a retriever or occupy the shared worker.
- Kept paused-playback scheduling, hidden-element handling, decoder cadence, shared worker ownership, and media limits unchanged.

## Validation

- Added focused unit tests for visible, partially visible, transparent, zero-size, off-canvas-origin, and non-finite layer geometry.
- This patch is intentionally limited to video-layer admission; it does not claim to introduce a global adaptive FPS scheduler or prove device performance.
- Full Android compilation, APK build, physical-device multi-video testing, camera temperature/performance, and LIVE alongside StreamingIn remain unverified.
- No GitHub push/merge is performed.
