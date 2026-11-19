# Mode B V26 — Shared MP4 Decode Worker for the Studio Compositor

## Goal

Reduce avoidable CPU/thread contention when a Mode B preset contains multiple active video layers, without changing the existing camera source, compositor order, RTMP path, or playback semantics.

## Finding in V25

V25 allowed up to two distinct local MP4 assets. Each `NativeVideoOverlayDecoder` created its own `HandlerThread`, so two clips could run separate `MediaMetadataRetriever` frame-extraction operations at the same time. Camera2 capture also runs on its own handler thread. The per-clip frame and file bounds limited resource use, but the video decode work was not serialized across clips.

## V26 change

- Added `ModeBVideoDecodeWorker`, one session-scoped background worker owned by `StudioOverlayView`.
- All distinct `NativeVideoOverlayDecoder` instances receive the same worker. Metadata initialization, frame extraction, playback start/pause work, and retriever disposal are queued on that worker.
- Video decoding therefore runs sequentially rather than launching one competing decoder thread per clip.
- Each clip retains its own playback clock, frame schedule, loop/finish state, and latest-frame bitmap. One clip failing does not stop the shared worker or another valid clip.
- Teardown releases every decoder on the shared worker, then posts one final worker shutdown marker. This preserves the existing V19 ordering: detach the `ViewFilterRender` view, stop/release the stream, then release overlay assets.
- The existing limits remain unchanged: at most two distinct MP4 assets, 12 MiB per file and aggregate cache, 1280×720 maximum decoded frame, 8 fps maximum per clip, no MP4 audio, and one Camera2 lens per session shared by matching-facing camera layers.
- The compositor status summary now states that one shared decode worker is used.

## Scope deliberately not changed

- No Mode A companion behavior or TikTok connector changes.
- No camera orientation or Camera2 capture changes.
- No RTMP encoder configuration, screen capture, or overlay element schema changes.
- No user-interface redesign and no GitHub push.

## Validation performed for this checkpoint

- Source inspection confirms `NativeVideoOverlayDecoder` no longer creates its own `HandlerThread`.
- Source inspection confirms the two-video asset limit and per-clip 125 ms frame interval remain intact.
- Source inspection confirms `StudioOverlayView` injects one worker into every distinct video decoder and shuts it down only after all decoder release tasks are queued.
- A standalone `javac` harness passed **11 assertions** covering regular frame cadence, missed-deadline handling, playback start/pause/resume, and non-looping completion.
- The new shared-worker class passed a Java syntax compile against minimal Android API stubs. This checks Java syntax only; it is not an Android SDK/Gradle build.
- **10 structural source checks passed** for shared ownership, the two-asset cap, frame/size limits, worker-based decode/cleanup, and teardown ordering.

## Validation not performed

- Full Android/Gradle compilation: **not verified**.
- APK build: **not verified**.
- Camera orientation changes during an actual LIVE session on a physical phone: **not verified**.
- Real-device performance with camera plus two simultaneous video layers: **not verified**.

The worker refactor is a targeted source-level performance improvement. Device-level frame cadence, thermal behavior, and RTMP output still need to be measured at the later integration-validation stage.

## Later scope extension (V36)

V26 originally centralized only MP4 decoder work; Camera2 still retained its own control handler. V36 supersedes the worker ownership name with `ModeBVisualWorker` and moves the expensive camera YUV conversion/Bitmap rotation onto that same session worker. Camera2 open/session/frame acquisition and teardown remain on the Camera2 owner handler. This keeps Camera2 API ownership intact while serializing the CPU-heavy visual work.
