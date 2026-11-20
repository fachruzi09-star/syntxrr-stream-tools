# SYNTXRR STREAM V41 — Live Preset Snapshot Safety Guard

Basis: `syntxrr-stream-tools-main-fixed-v40.zip` (SHA-256: `899e8e6dcfb3a01c0b6f11b487d7d3a48e27cab26ab847916ffe555f5b4d080f`).

## Read-only audit findings

- `DashboardView.handleStartModeBStream()` constructs `overlayElements`, `screenCaptureLayer`, and `backgroundAssetId` once and passes them to `NativeStreaming.startStream()`.
- The native `ModeBStreamService` builds `StudioBackgroundView`, `SurfaceFilterRender`, and `StudioOverlayView` during session start. No Capacitor/native method exists to replace the active scene snapshot while RTMP is running.
- `App.handleSelectPreset()` changes `activePresetId`, `studioElements`, and persisted settings, and the same callback is used by Preset Manager, Studio scene selection, and Stream Deck `switch_scene` commands.
- Therefore, selecting another preset during a Mode B session changes the app's visible/selected scene but leaves the native RTMP compositor on the old snapshot. This can mislead the operator about what viewers are receiving.
- V40 normal cleanup already releases the native views, their owned reservations, video decoders, camera frame state, and then the shared worker in owner order. No confirmed reconnect-time budget leak was found in that normal teardown path, so V41 does not duplicate it.

## Changes

- Added `modeBPresetSwitchPolicy` with a fail-closed policy: only explicit terminal/idle native statuses with `isStreaming === false` permit active-preset changes.
- Added `canChangeActivePresetDuringModeB()` to query the native service status. Non-Android browser preview is unaffected; a failed or unknown native status blocks the mutation.
- Applied the guard to active-preset changes from preset selection, preset creation/import, saving the current canvas as a new active preset, deleting the active preset, and resetting defaults.
- The user receives an Indonesian or English explanation that the RTMP compositor still uses the immutable start-time snapshot and Mode B must be stopped before changing the active preset.
- This prevents a false Studio/stream state; it does not implement live scene switching.

## Validation

- 13 focused policy assertions passed in a standalone Node runner after strict TypeScript compilation of the policy and test.
- `App.tsx`, `nativeStreamingBridge.ts`, the policy module, and its test passed TypeScript transpile/syntax checks with zero diagnostics.
- The guard's native status path was checked against `ModeBStreamService` terminal and busy status publication paths.
- Full project type-check, Vite build, Android compilation, APK build, device LIVE, and StreamingIn interoperability remain unverified.
- `package.json` and `bun.lock` are unchanged from V40.

## Not changed

- Native MediaProjection/VirtualDisplay and Direct/Compatibility capture paths.
- Camera/video shared worker, frame arbiter, buffer reuse, and V40 bitmap budget.
- Active native RTMP scene contents while a stream is running; no live scene replacement API was added.
- Preset transition/screen-saver runtime, cloud preset sync, marketplace catalog, Mode A/TikTok connector, and GitHub state.

## Next engineering priority

Implement a native live-scene replacement contract that updates the RTMP compositor without creating a second MediaProjection or stopping the RTMP transport. The contract must stage new scene assets without deleting assets currently used by the live session, validate the new snapshot, swap the scene safely on the render/GL owner thread, and release the previous scene only after no render pass references it. Add a transition runtime only after scene replacement and asset lifecycle are reliable. Keep screen reshare, cloud sync, and marketplace work separate.
