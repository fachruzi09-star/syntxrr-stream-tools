# SYNTXRR STREAM V51 — Bounded MP4 Screensaver Runtime

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v50.zip` (950,472 bytes).
- V51 continues the V50 Mode B Screensaver card, V47 reshare recovery, per-Screensaver asset namespace, session-scoped `ModeBVisualWorker`, `ModeBVisualFrameArbiter`, and 48 MiB session bitmap budget.
- No additional decoder thread, RTMP session, audio source, MediaProjection, or VirtualDisplay is created for Screensaver video.

## Changes
- Studio Screensaver media selection now includes one local MP4 in addition to the existing PNG/JPEG/GIF options. The Studio preview uses a muted local `<video>` element. The UI explicitly states that native MP4 Screensaver needs Android 8.1+, loops silently, supports 0.5–30 second files up to 12 MiB and frames capped at 1280×720, and does not play `mediaSound`.
- `StudioScreensaverSettings.mediaType` and the runtime policy preserve `image` versus `video` while keeping old presets defaulted to image.
- The native bridge stages the selected Screensaver media in its own immutable `screensaver` namespace. MP4 uses the existing video MIME validation and contributes to the combined 12 MiB video upload cap. Unsupported/missing Screensaver assets now fail staging with a specific error instead of silently returning an empty namespace.
- `ModeBReshareWaitingView` uses the existing `NativeVideoOverlayDecoder` for one looping, silent Screensaver MP4. It uses the same session worker and round-robin arbiter as camera YUV conversion and up to two Studio MP4 overlays; it does not create another thread. The Screensaver decoder reserves from the static pool so the dynamic camera and two overlay video slots remain protected.
- The Screensaver MP4 is paused while the waiting card is hidden and starts only when card opacity crosses the visible threshold. Decoder start/pause commands are sent only on visibility-state changes, not on every `ValueAnimator` tick.
- Video frame work shares the existing 42 ms aggregate start interval (about 24 frame-work starts/second). With camera + two overlay videos + Screensaver MP4 all active, all four sources share this cap; this is a scheduling ceiling, not a promise of 24 FPS per source.
- Fixed a fast-decoder-failure notification race: the shared video decoder no longer clears its listener before delivering failure, and a listener attached after asynchronous initialization failure receives the terminal failure once. The Screensaver can therefore return to its text fallback instead of remaining indefinitely in “loading”.
- Fixed a concurrent live-scene replacement guard: a second staged scene request is rejected and only its own namespaces are deleted before the in-flight Screensaver namespace handle is modified. This preserves the first scene's staging/decoder lifetime.
- Added a FIFO worker-release barrier before acknowledging retirement of a Screensaver namespace. Removing a queued PNG/JPEG/GIF decode task does not prove that an already-running file read has stopped; the old namespace is now deleted only after the previous worker queue drains. If the worker no longer accepts a barrier during shutdown, deletion is deferred to the service-wide cache cleanup instead of racing an active read. The same barrier is applied to idempotent media release and MP4 decoder teardown.
- Added tests for Screensaver MP4 file-size admission, Screensaver video using the static pool while camera/two-overlay dynamic reservations remain available, and four-source round-robin scheduling. Added a regression check that `mediaSound` remains metadata while native MP4 stays silent.

## Validation performed
- TypeScript/TSX syntax transpilation: 69 files, zero syntax diagnostics.
- `modeBScreensaverPolicy.test.ts`: 27 assertions passed through a standalone TypeScript-transpile harness.
- Standalone Java Screensaver policy/budget harness: MP4 size boundaries, camera + two overlay dynamic reservations, one Screensaver static reservation, and budget cleanup passed; two real library GIFs still parsed at 60 and 44 frames.
- Standalone Java frame-arbiter harness: 7 assertions passed, confirming order `camera → video-a → video-b → screensaver-video`, unique pending frame per source, and empty queue after dispatch.
- Java parser scan did not report syntax-token or illegal-forward-reference diagnostics. A full `javac` compile did not succeed because Android, AndroidX, RootEncoder, and `org.json` dependencies are not present in this environment.
- `tsc --noEmit` remains blocked by the missing `vite/client` type definition (`TS2688`).
- `package.json` and `bun.lock` SHA-256 values are identical to V50.
- ZIP content listing and CRC/integrity checks were performed after packaging.

## Not verified
- Full TypeScript project type-check and Vite production build.
- Android semantic compilation, Gradle build, APK build/install, or Android instrumentation tests.
- Actual MP4 Screensaver playback on a physical phone, Android 8.1+ compatibility, and GL drawing in RootEncoder.
- MP4 decoder timing/CPU/battery/thermal behavior under sustained LIVE.
- Camera + two Studio MP4 layers + Screensaver MP4 running simultaneously on a real device.
- MP4 Screensaver across live scene replacement, reshare, projection loss, and session teardown on a real device.
- Real RTMP output and interoperability with StreamingIn.

## Behavior boundaries
- One local Screensaver MP4 at a time; file ≤12 MiB; duration 0.5–30 seconds; decoded frame ≤1280×720; Android 8.1+ required by the existing native decoder.
- Playback is silent and loops while the Screensaver card is visible. `mediaSound` remains preserved metadata and does not route MP4 audio into the RTMP audio track.
- The Screensaver video consumes the shared worker/frame arbiter and static bitmap pool. It competes with other visual sources under the existing global frame budget; do not interpret the configured per-decoder 8 FPS as an aggregate guarantee.
- PNG/JPEG and GIF behavior from V49/V50 remains unchanged. Animated WebP and Screensaver audio remain unsupported.
- Mode B only; do not infer Mode A parity.
- No APK build and no GitHub push in this checkpoint. Physical-device validation is still required before declaring SYNTXRR LIVE-ready like StreamingIn.


## V51 Lifecycle Follow-up — Screensaver Namespace Read Barrier

A final source review found a file-lifetime race that is independent of MP4 decoding: when replacing a Screensaver image/GIF while its decode is already executing on the shared worker, `removeCallbacks()` cannot stop the running task. Earlier acknowledgement could therefore allow the old scene namespace to be deleted while `BitmapFactory` or `ImageDecoder` was still reading that file. V51 now enqueues a FIFO worker barrier before acknowledging previous-media release; a rejected barrier deliberately withholds namespace deletion until session-wide `deleteAll()` cleanup. Video decoder release acknowledgement also passes through this barrier, and repeated release requests no longer acknowledge immediately while prior worker work is pending. A standalone Java test covers FIFO ordering, rejected barrier behavior, and null acknowledgements.


## V51 Final Regression Validation

- `ModeBWorkerReleaseBarrier` standalone Java harness: 3 assertions passed (FIFO file-read-before-ack order, rejected barrier withholds deletion acknowledgement, null acknowledgement is a no-op).
- Current-source Screensaver video/budget harness: 10 checks passed; real library GIF samples still parse as 60 and 44 frames.
- Current-source four-source round-robin arbiter harness: 7 assertions passed.
- Current TypeScript/TSX syntax transpilation: 69 files, zero syntax diagnostics.
- Current Screensaver TypeScript policy suite: 27 assertions passed.
- Whole-source `javac` parser scan found zero Java syntax/forward-reference diagnostics; semantic compile remains blocked by absent Android, AndroidX, RootEncoder and `org.json` dependencies (3,006 unresolved dependency/type diagnostics).
- `package.json` and `bun.lock` remain byte-identical to the V50 baseline.
- No Gradle/Android build, APK, install, instrumentation, phone runtime, RTMP or StreamingIn interoperability test was performed.
