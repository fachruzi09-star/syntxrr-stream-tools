# SYNTXRR STREAM V40 — Session-Wide Visual Memory Admission Budget

Basis: `syntxrr-stream-tools-main-fixed-v39.zip` (SHA-256 verified before extraction).

## Read-only audit findings

- `StudioOverlayView` allowed up to 8,000,000 decoded static image pixels independently.
- `StudioBackgroundView` allowed up to 4,000,000 decoded pixels independently.
- The two independent limits could therefore admit 12,000,000 static ARGB pixels (about 48 MB) before camera and video frame buffers were counted.
- Video decoders retain the previously displayed bitmap while MediaMetadataRetriever creates the replacement frame. With two active decoders, this temporarily means up to four video bitmaps.
- Camera conversion may simultaneously hold its reusable ARGB int array, a copied YUV frame, a previously displayed frame, a newly created frame, and a rotation intermediate.
- V39 bounded these paths individually but did not account for their session-wide aggregate.

## Changes

- Added `ModeBBitmapBudget`, a session-scoped 48 MiB admission budget for application-owned Mode B visual pixel buffers.
- Split the budget into a static pool and a protected dynamic pool. The dynamic pool reserves worst-case space for one camera and two MP4 decoders so images/background cannot starve active capture layers regardless of JSON element order.
- Background and static image decodes reserve their estimated ARGB allocation before decoding, then reconcile against the actual `Bitmap.getAllocationByteCount()`.
- Each MP4 decoder reserves space for its current frame plus one replacement frame before initialization. Returned frames exceeding the declared decoder dimensions/byte bound are rejected and released.
- The camera reserves capacity for its ARGB scratch array, YUV copy, up to three ImageReader YUV buffers, displayed/new/rotation-intermediate bitmaps, and releases that reservation on failure or teardown.
- Reservations are idempotently released with their owning assets. The shared session budget is passed to both background and overlay views.
- Added focused tests for pool isolation, full-session capacity, resize behavior, idempotent release, and overflow-safe byte calculations.

## Budget model

- Total app-owned visual buffer budget: 48 MiB.
- Dynamic protected pool: one camera reservation plus two video decoder reservations.
- Static pool: remaining capacity shared by preset background and local image/sticker bitmaps.
- If a static asset cannot be admitted, it is omitted rather than decoded into an over-budget session and the Studio render summary reports the memory-budget omission. If a dynamic capture layer cannot obtain its protected reservation, that layer is omitted with an explicit memory-budget notice.
- Reservation cleanup also covers allocation failures while constructing camera/video worker resources.

This accounting is conservative for known app-owned ARGB/buffer allocations. It does not include Android codec internals, GL textures, encoder surfaces, framework overhead, or other process allocations, and it is not a claim that device memory usage is exactly 48 MiB.

## Validation

- Added three focused JVM unit tests for aggregate reservation accounting and overflow handling.
- Source-level checks verify the single budget instance is created per Mode B session and passed to both native views.
- Full Android compilation, APK build, physical-device multi-layer stress, performance/temperature, camera rotation during LIVE, and interoperability with StreamingIn remain unverified.
- `package.json` and `bun.lock` are unchanged from V39.

## Not changed

- MediaProjection/Direct-vs-Compatibility source selection and GL order.
- Group/Supergroup transforms, screen-capture geometry, and preset import/export.
- Camera frame arbiter, shared visual worker, 42 ms frame dispatch spacing, and per-source 8 FPS scheduling.
- Audio routing, RTMP recovery behavior, Mode A, TikTok connector, cloud presets, or GitHub repository state.
