# SYNTXRR STREAM V42 — Native Live Static-Overlay Scene Replacement

Basis: `syntxrr-stream-tools-main-fixed-v41.zip` (SHA-256: `dd463289a111efa653fa51d60043dfe20af1a47229450fc6e776cc0ed2879ab5`).

## Read-only audit findings

- V41 correctly blocked preset/scene mutations while Mode B was busy, but it also confirmed the native RTMP compositor retained only the snapshot built at stream start.
- RootEncoder 2.8.1 processes filter add/remove operations on its GL render path. Its indexed `setFilter` implementation releases the previous filter during replacement, so `setFilter(index, newFilter)` cannot provide a safe rollback to the old filter.
- `ViewFilterRender` renders the Android `View` to its own `Surface` asynchronously, then the GL `BaseFilterRender.draw()` pass samples that surface. A `View.onDraw()` callback alone therefore cannot prove the new overlay participated in the output GL chain.
- The active Studio overlay already owns live event counters/feed state. A scene handoff must preserve that state and must not drop events arriving between the initial state copy and the commit.

## Changes

- Added a Capacitor `replaceLiveScene` method and a native `ModeBStreamService.requestLiveOverlaySceneReplacement` contract.
- Added a strict cross-platform/native allowlist for static and event-driven overlay types. Image, sticker, video, camera, unknown, malformed, and unsupported elements fail closed until their media/resource handoff is implemented.
- A replacement is accepted only while Mode B is confirmed LIVE, with unchanged canvas, background asset ID, screen-capture configuration, and capture-engine choice. The current MediaProjection, VirtualDisplay, RTMP stream, audio source, background, and capture layer are not restarted.
- Stage the replacement `StudioOverlayView` and its `ModeBSceneReplacementFilter` separately. Append the staged filter to the GL chain rather than using indexed `setFilter`, keeping the previous filter alive during preparation.
- Added `ModeBSceneReplacementFence`: the staged filter must complete two GL output draw passes before the old filter is scheduled for removal. A four-second readiness timeout removes the staged filter and preserves the old scene.
- Added an old-filter release acknowledgement. The UI/native operation reports success and releases the prior view's owned resources only after RootEncoder calls the prior filter's `release()` on the GL path. It does not treat queueing `removeFilter()` as proof of retirement.
- Copy the active live counters/feed state into the staged view, and fan out arriving live events to both views during the handoff window.
- Keep normal Studio element/metadata/canvas mutations locked during Mode B. Preset selection is the only live operation enabled by this milestone, and it commits React/persistent state only after the native compositor reports a successful handoff.
- Set the Studio-mutation lock to `starting` before invoking the native start/permission flow. MediaProjection consent UI can remain open before the Android Service publishes its own `starting` status; edits are now blocked during that interval too. A canceled/failed start returns the lock to the confirmed terminal state.
- Preserve all existing V40 bitmap budget, camera/video worker, decoder admission, and capture lifecycle code.

## Supported boundary

This first live replacement milestone supports only the static/event-driven overlay allowlist: shapes, separators, text variants, usernames, counters, chat/event widgets, and progress bars. Background asset, canvas specification/orientation, and screen-capture configuration must remain unchanged. Media-backed image/sticker/video/camera elements, background changes, screen-capture geometry/engine changes, Group structure edits, transitions, screensaver runtime, cloud preset sync, and marketplace sync are not part of V42.

A replacement that cannot be validated or prepared is rejected and the existing scene remains the active native scene. The scene transition is a two-filter handoff; during the short GL handoff interval both aggregate overlays can be present. The previous filter's view-owned resources are held until RootEncoder has released that filter.

## Validation

- TypeScript/TSX syntax transpilation: 65 files, zero syntax diagnostics.
- `modeBLiveScenePolicy` test: 8 assertions passed.
- `modeBSceneMutationPolicy` test: 8 assertions passed.
- Standalone Java harness using a minimal `ViewFilterRender` API stub: 13 checks passed, covering the two-output-frame fence, one-shot/disarm behavior, release acknowledgement order, and scene allowlist. This is a helper/wrapper test, not a compile against the real Android SDK/RootEncoder binaries.
- Source invariants checked: no indexed `setFilter` in the replacement path; staged filter uses `addFilter`, the previous filter is retired by object through `removeFilter`, event payloads are mirrored to both live views during staging, and UI preset state is committed only after the native callback succeeds.
- Cross-platform/native static overlay allowlists contain the same 14 supported element types.
- Start-time mutation lock is set before awaiting the native plugin's MediaProjection permission flow.
- `package.json` and `bun.lock` are unchanged from V41.
- Full project type-check, Vite production build, full Android compilation, APK build, device render verification, long-running performance, camera rotation during LIVE, and StreamingIn interoperability remain unverified.

## Not changed

- Existing Direct Screen Source / Compatibility Object Layer choice, MediaProjection token, VirtualDisplay, RTMP transport, shared camera/video worker, decoder policy, and V40 bitmap budget.
- Camera/video/image/sticker resource handoff across different live scene namespaces.
- Background live replacement and transition/screensaver runtime.
- Screen reshare, cloud preset sync, marketplace, and Mode A/TikTok integration.
- GitHub branch or remote repository state.

## Next engineering priority

Build isolated per-scene media asset staging and reference namespaces for live replacements. The current asset cache has a session-wide path and asset IDs; media files must not be overwritten or removed while the current live scene still has active Bitmap/MediaExtractor/decoder references. Prepare assets in a separate scene namespace, validate the new scene, attach media resources to the staged view, and delete the old namespace only after the prior filter/view is fully retired. Camera handoff needs its own single-camera ownership design; do not open a second Camera2 session just to stage a new scene. Add background/transition behavior only after media asset lifecycle is safe.
