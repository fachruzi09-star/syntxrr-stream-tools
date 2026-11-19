# Mode B V38 — Fair Visual Frame Scheduler

## Source audit (V37)

V37 already serialized camera YUV conversion and MP4 frame extraction on one session-scoped
`ModeBVisualWorker`. Each MP4 decoder, however, independently posted its next frame after its
own 125 ms delay, while Camera2 submitted conversion work using the worker's ordinary FIFO
`post()` path. Serialization prevented parallel CPU-heavy work but did not define a fair order
between camera, Video A, and Video B.

The following already-correct behavior was preserved: paused decoders stop scheduling frames;
hidden layers are omitted before decoder creation; transparent/zero-area/off-canvas video layers
are rejected by `ModeBVideoLayerPolicy`; Camera2 control and image acquisition remain on the
Camera2 handler; and the camera frame gate permits only one queued/converting frame.

## V38 changes

- Added `ModeBVisualFrameArbiter`, a synchronized round-robin queue with at most one waiting
  frame per source. A source re-enqueued after its previous frame is selected goes to the tail.
- Added `ModeBVisualFrameBudget`, limiting aggregate visual-frame task start times to one per
  42 ms (about 24 starts/second). This matches the existing three-source ceiling of camera +
  two MP4 layers, each individually capped at 8 FPS, without raising any per-source rate.
- Updated `ModeBVisualWorker` to drain frame tasks fairly and to keep initialization/release/control
  work on its existing Handler queue.
- Updated `NativeVideoOverlayDecoder` to submit frame extractions through a stable per-file source
  key and to cancel pending work during pause/release/failure.
- Updated `NativeCameraOverlay` to submit YUV conversion through its own source key and remove
  any pending camera frame on teardown. Camera2 ownership, YUV byte bounds, and one-frame gate
  remain unchanged.

## Tests

`ModeBVisualFrameArbiterTest` covers round-robin order, one waiting frame per source, source
removal, invalid inputs, and queue clearing. `ModeBVisualFrameBudgetTest` covers the aggregate
start interval and backward-clock handling. These are pure-Java tests; they do not replace Android
instrumentation or a device performance run.

## Not claimed

No Android full build, APK build, real-device FPS/thermal benchmark, camera+two-video LIVE test,
or StreamingIn interoperability test is claimed by this source checkpoint.
