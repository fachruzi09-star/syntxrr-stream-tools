# SYNTXRR STREAM V43 — Live Media Scene Lifetime Hardening

Basis: `syntxrr-stream-tools-main-fixed-v42.zip` (size: 891,787 bytes; source archive available in the project Library).

## Read-only audit findings

- The V42 source archive already contained namespace-based media upload and staging for image, sticker, and MP4 overlays, and the native allowlist already accepted those types. This was inconsistent with the V42 changelog/gap-tracker text, which described the milestone as static-only. V43 treats that code as existing V42 groundwork rather than claiming it was newly invented here.
- The native replacement callback wrapper in the V42 service source was recursively calling its own wrapper variable instead of the original callback. This prevented a safe one-shot callback boundary and was a Java definite-initialization/compile defect.
- V42's staged-scene abort paths could clear the pending replacement slot before the staged view/decoder had finished releasing its file references. A new scene could then be staged while resources from the failed attempt were still outstanding.
- If a staged filter had already been attached to GL and its removal could not be scheduled, the code cleared pending references too early. That could allow a further replacement while the previous staged filter might still be present in the GL chain.
- The Java service field initializer for the screen-capture readiness timeout referenced `stopRequested` before its declaration, producing an illegal forward reference.
- The JS bridge eagerly deleted the staged namespace after a native replacement failure/exception. That is unsafe when the native service may still be completing decoder/filter rollback or when the plugin result is uncertain.

## Changes

- Replaced the recursive result callback with a one-shot wrapper that always delegates to the original caller and suppresses duplicate completion from stop/cleanup races.
- Kept the replacement slot occupied until a not-yet-attached staged view has completed decoder cleanup and its namespace is deleted.
- After a staged filter has entered the GL chain, kept pending view/filter/namespace references until RootEncoder acknowledges filter release and the view's decoder cleanup callback completes. If GL removal throws, fail the request but keep the slot and resources fail-closed for session teardown; no third replacement is allowed to stack over a possibly attached filter.
- Retained the session-owned `ModeBVisualWorker` for both active and staged views. Per-view release does not shut down the worker; the service shuts it down only after all scene views have completed decoder cleanup during session teardown.
- Kept old scene namespaces until the old filter release acknowledgement and previous `StudioOverlayView.releaseAssets()` completion. Session background assets remain in their separate namespace until the whole session ends.
- Updated `NativeStreamingPlugin.replaceLiveScene` to delete the new namespace on synchronous validation rejection or when no service accepted the request. Once queued, the native service owns namespace cleanup.
- Removed eager JS-side namespace deletion after a native call fails or returns an uncertain result. This avoids deleting files while native MediaMetadataRetriever/Bitmap readers may still reference them; session teardown removes orphaned namespaces after resource cleanup.
- Aligned the TypeScript allowlist with native handling for invisible elements: a `visible: false` unsupported source is omitted from the snapshot and no longer blocks a replacement that the native service will accept.
- Corrected overlay status text so it no longer describes all rendered elements as static/event-only.
- Moved the `cleanedUp`, `stopRequested`, and `retryPending` field declarations before the readiness-timeout lambda to remove the Java illegal forward reference.
- Updated the functional gap tracker to record the V42 archive/documentation mismatch and V43's actual changes.

## Supported boundary after V43

- Source path accepts text/static/event overlays, local images, stickers, and MP4 video for a new scene, each uploaded into a unique scene namespace.
- Media-backed scenes are rejected if the image/video cannot be loaded, an element is omitted, a video decoder reports failure, the initial video frame is not ready within five seconds, or the shared Mode B memory budget cannot admit the staged scene.
- The screen-capture configuration, canvas dimensions/orientation, background asset identity, and capture-engine choice must remain unchanged during a live swap.
- Camera2 is still excluded from replacement because Mode B has one physical Camera2 owner; V43 does not open a second camera.
- Old scene files are retained until GL filter retirement and decoder cleanup complete. Background files remain session-owned and are not deleted during overlay scene swaps.
- This is not proof of device behavior or full StreamingIn parity. The two-filter handoff may briefly show both overlays while GL completes the handoff; no crossfade is implemented.

## Validation performed

- TypeScript/TSX syntax transpilation: 67 files, zero syntax diagnostics.
- `modeBLiveScenePolicy` standalone test: 10 assertions passed.
- `modeBSceneMutationPolicy` standalone test: 8 assertions passed.
- `modeBPresetSwitchPolicy` standalone test: 13 assertions passed.
- Java standalone harness (actual source for `ModeBAssetNamespace`, `ModeBLiveScenePolicy`, `ModeBSceneReplacementFence`, and `ModeBVisualFrameArbiter`, with a minimal Android `Context` stub): 18 checks passed. It covers namespace isolation/deletion, media allowlist/camera exclusion, two-frame one-shot fence, and one-pending-frame-per-source ordering.
- `javac` parser pass for `ModeBStreamService.java` and `NativeStreamingPlugin.java`: no syntax, illegal-forward-reference, or definite-assignment diagnostics were reported. Full attribution emitted expected missing Android/AndroidX/Capacitor/RootEncoder classes because those SDK/dependency artifacts are not installed in this environment; this is not an Android compile.
- Full `tsc --noEmit` could not complete because `vite/client` type definitions are unavailable in this environment.
- `package.json` and `bun.lock` remain unchanged from V42.
- ZIP integrity checked after packaging.

## Not verified

- Full Android/Gradle compilation and APK build.
- Actual RootEncoder GL filter handoff and release callbacks on a device.
- Image/sticker/MP4 scene switching while a real RTMP stream is running.
- Camera + two videos simultaneously, long-session memory/thermal behavior, camera orientation during LIVE, and StreamingIn interoperability.
- No GitHub push was performed.

## Next engineering priority

Audit single-owner Camera2 continuity across scene changes. Preserve the existing camera session/resource owner if both the active and next scene require a compatible camera layer; do not open a second Camera2 session to stage a replacement. When the next scene changes facing mode or unsupported camera configuration, reject the swap safely. Background replacement, preset transition runtime, and screensaver runtime remain later milestones.
