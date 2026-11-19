# SYNTXRR STREAM V50 — Bounded Animated GIF Screensaver Runtime

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v49.zip` (942,050 bytes).
- V50 continues the existing Mode B waiting card, reshare behavior, per-scene asset namespace, session-scoped `ModeBVisualWorker`, and 48 MiB session bitmap budget. It does not create another GL filter, decoder worker, RTMP session, or MediaProjection.
- StreamingIn APK UI/DEX evidence identifies Screensaver media as image/GIF/video; V50 implements only the bounded local GIF subset. This is not a claim of full runtime parity.

## Changes
- Studio media selection now offers local PNG/JPEG/GIF Screensaver assets. Native bridge staging accepts a bounded local `image/gif` and stages it into the same immutable scene asset namespace used for the Screensaver. Existing overlay/screensaver deduplication and shared image upload cap remain in place.
- Added `ModeBScreensaverMediaPolicy`: validates GIF87a/GIF89a signatures, maximum 5 MiB file size, parses extension and image-data sub-blocks, counts image descriptors, rejects malformed files and animations above 120 frames, samples logical dimensions to at most 750,000 pixels, and estimates three ARGB-equivalent working frames for memory admission.
- On Android API 28+, `ModeBReshareWaitingView` decodes multi-frame GIF through `ImageDecoder.decodeDrawable()` on the existing `ModeBVisualWorker`, applies target sampling and `MEMORY_POLICY_LOW_RAM`, then displays an `AnimatedImageDrawable` with infinite repetition while the waiting card is visible. The animation is stopped when the card fades out or is released.
- On Android API 24–27, GIF is decoded as a still image (first frame) through the existing BitmapFactory path. Single-frame GIFs also use the still-image path.
- The GIF working estimate is reserved against the existing static pool in the 48 MiB session bitmap budget. If the file is invalid, oversized, exceeds the frame/pixel caps, cannot decode, or cannot reserve memory, the existing text Screensaver remains as fallback. PNG/JPEG V49 behavior is preserved.
- Updated Studio explanatory text and the functional gap tracker. `mediaSound`, animated WebP, and video Screensaver remain metadata-only/not playable.

## Validation performed
- TypeScript/TSX syntax transpilation: 69 files, zero syntax diagnostics.
- `modeBScreensaverPolicy.test.ts`: 19 assertions passed.
- Standalone GIF policy harness: 16 assertions passed, including signatures, file size bounds, sampling, working-buffer estimate, one/two frame parsing, truncated data, and rejection above 120 frames.
- Real local GIF sample harness: 7 assertions passed. Two valid library GIF files (4,691,023 bytes / 60 frames and 4,804,227 bytes / 44 frames) were parsed with exact frame counts matching independent image metadata. A 70-frame 8,581,551-byte GIF was rejected by the 5 MiB admission cap. A PNG whose filename ended in `.gif` was rejected by byte signature.
- Changed Java source parser scan: no syntax-token or illegal-forward-reference diagnostics detected.
- `package.json` and `bun.lock` hashes are identical to V49.
- ZIP integrity and exact member list were checked after packaging.

## Not verified
- Full TypeScript project type-check; the environment does not provide the project's `vite/client` declaration.
- Android semantic compilation, full Gradle build, or APK. Android SDK/framework plus Capacitor/RootEncoder build dependencies are unavailable in this verification environment.
- Actual GIF playback/rendering on Android API 28+, API 24–27 first-frame output, and the RootEncoder GL view path on a physical device.
- CPU/battery/memory behavior under long LIVE sessions. ImageDecoder/AnimatedImageDrawable internal decoder allocations are framework-owned; the three-frame reservation is a bounded ARGB-equivalent estimate, not a complete measurement of all framework memory.
- Screensaver GIF with reshare, camera plus two MP4 layers, actual RTMP output, and interoperability with StreamingIn on a real phone.

## Behavior boundaries
- One local Screensaver GIF at a time. File maximum 5 MiB; animation maximum 120 frames; sampled logical frame maximum 750,000 pixels.
- API 28+ animated infinite loop while visible; API 24–27 first-frame fallback.
- PNG/JPEG static Screensaver continues to work as in V49.
- Animated WebP, video Screensaver, `mediaSound` playback, and Mode A Screensaver are not implemented.
- No APK build and no GitHub push in this checkpoint. Continue to require physical-device validation before declaring the app LIVE-ready.
