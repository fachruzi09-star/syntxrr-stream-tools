# SYNTXRR STREAM V49 — Mode B Static-Image Screensaver Runtime

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v48.zip` (934,119 bytes).
- V49 continues the existing Mode B waiting-card, GL waiting filter, reshare lifecycle, scene asset namespaces, shared visual worker, and 48 MiB session bitmap budget. It does not replace the RTMP or MediaProjection pipeline.
- The inspected StreamingIn Screensaver model contains `on`, `text`, `media`, `mediaSound`, `enter`, and `exit`. The source evidence supports the model contract but does not establish every media decoder, sound, or timing behavior. V49 deliberately implements a bounded local still-image subset rather than claiming full parity.

## Changes
- Add a local Studio media-library selector for one Screensaver PNG/JPEG image. Remote URLs, WebP, GIF, video, and audio are not offered as supported Screensaver media.
- Persist the selected media as the existing stable `studio-media://<assetId>` preset reference; old unsupported media metadata is preserved.
- Extend Mode B asset preparation so a valid PNG/JPEG Screensaver image is staged in the immutable scene asset namespace. The background remains in its separate session namespace. The image is deduplicated against overlay image assets and remains subject to the existing 5 MiB per-file and 12 MiB total image upload limits.
- Extend the Screensaver native policy to parse a validated local asset ID from the durable Studio media URI. Invalid/remote references continue to use the text-card fallback.
- Extend `ModeBReshareWaitingView` with a full-canvas `CENTER_CROP` still-image layer, dark readability scrim, and existing title/detail text. Decode occurs on the session-scoped `ModeBVisualWorker`; only PNG/JPEG signatures are accepted; file size is limited to 5 MiB; decoded output is sampled to at most 2,000,000 pixels; memory is reserved from the existing static pool in `ModeBBitmapBudget` and resized to actual allocation bytes.
- Preserve the prior waiting-card image while a new scene's image is being prepared; stale decode completions are discarded by generation. Decode failure, missing assets, unsupported format, or budget exhaustion falls back to the text card with an explicit notice.
- On live scene commit, update the waiting card's media reference against the newly committed scene namespace. Old scene namespaces remain protected by the existing scene/decoder cleanup barrier.
- Add `releaseMedia(Runnable)` so session cleanup waits until any in-flight Screensaver decode has left the shared worker before deleting scene asset namespaces or shutting down the worker.
- Keep `mediaSound` metadata editable/preserved, but clearly disclose that Screensaver audio playback is not implemented.

## Validation performed
- TypeScript/TSX transpilation: 69 files, zero syntax diagnostics.
- `modeBScreensaverPolicy.test.ts`: 17 standalone assertions passed.
- Native asset bridge harness: 9 assertions passed, covering PNG/JPEG upload to the scene namespace, overlay/screensaver asset deduplication, unsupported GIF skip/fallback, oversized still-image skip, and invalid asset ID rejection.
- Standalone bitmap-budget harness: 8 assertions passed, covering static screensaver reservation, actual-allocation resize, protected camera/two-video dynamic reservations, total session cap, and idempotent release.
- `javac` parser scan of the changed Android Java sources reported no syntax-pattern diagnostics (for example: expected token, illegal start, unclosed construct, or illegal forward reference). Semantic compilation could not complete because Android SDK/framework, Capacitor, RootEncoder, and JSON/JUnit build dependencies are unavailable in this environment.
- Source diff from V48 is limited to Screensaver policy/view/service, Studio UI, Dashboard/App/bridge staging, and focused policy tests. `package.json` and `bun.lock` are unchanged from V48.
- ZIP integrity, archive member count, and SHA-256 checked after packaging.

## Not verified
- Full TypeScript project type-check; the environment still lacks the `vite/client` declaration needed by `tsc --noEmit`.
- Full Android Gradle compilation and APK build.
- Screensaver image decoding/rendering on a physical Android device.
- Screensaver image replacement during live-scene change and its interaction with reshare on a physical device.
- Memory behavior under a real camera + two-video LIVE session, device temperature, and long-running sessions.
- Full Screensaver behavior against StreamingIn, including animated media, video, and mediaSound.
- Real LIVE interoperability with StreamingIn.

## Safety and behavior boundaries
- V49 supports a single local static PNG/JPEG Screensaver image plus the existing text card; images are displayed as a full-card background with a dark scrim and optional text.
- File size is capped at 5 MiB and decoded dimensions are sampled to at most 2,000,000 pixels. The existing session bitmap budget must also grant a static reservation. Failure falls back to text instead of failing the LIVE session.
- GIF, animated WebP, video, and `mediaSound` playback remain unsupported; their preset metadata is preserved. A missing/unsupported image reference falls back to text.
- Fade/Cut timing remains the V46/V48 behavior (Fade 100–1,200 ms; Cut zero-duration). No additional transition types are introduced.
- Behavior remains Mode B only. Do not infer Mode A Screensaver parity.
- This is source-level implementation with focused host-side tests, not proof of application readiness or StreamingIn parity. Do not build the APK or push GitHub until the user's LIVE-readiness gate is met and physical-device validation has been completed.
