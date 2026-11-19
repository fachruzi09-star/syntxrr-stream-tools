# SYNTXRR STREAM — V32 Checkpoint

Basis: `syntxrr-stream-tools-main-fixed-v31.zip`.

## Purpose

Correct the V31 Mode B compositing-order issue without risking loss of the captured screen. This is a safety/architecture correction, not a claim that background-behind-screen compositing has been implemented.

## Changes

- `createModeBOverlaySnapshot` now accepts only actual Studio elements; the `backgroundUri` argument and synthetic full-canvas image are removed.
- The native overlay budget is restored to 60 real Studio elements because preset background no longer consumes a slot or native image-cache entry.
- `prepareModeBOverlayAssets` handles only actual visible image/sticker/video overlay layers. Preset background remains stored and transferred as preset metadata/media but is not uploaded for Mode B.
- Dashboard Mode B and Studio Media panel both explain that preset background remains in Studio preview and local preset import/export but is not sent to RTMP Mode B yet.
- Group/Supergroup behavior, background model/storage, local media persistence, preset import/export, camera/video decoders, and the existing screen-capture lifecycle are left unchanged.
- Updated `STREAMINGIN_FUNCTIONAL_GAP_TRACKER.md` and added `MODE_B_V32_COMPOSITING_AUDIT.md` with the actual source order and the requirements for a future layered MediaProjection architecture.

## Validation performed

- Focused `nativeStreamingBridge.test.ts`: **14 assertions passed**, covering original overlay preservation, null input, no synthetic background, property allow-listing, 60-element acceptance, z-order sorting, hidden-element exclusion, and rejection above 60.
- TypeScript strict compilation of the isolated composition helper and test succeeded.
- All **59** TS/TSX source files were syntax-transpiled with the installed TypeScript compiler: **0 syntax diagnostics**. This is not a dependency-backed full-project type-check.
- Source comparison against V31 is limited to the Mode B background boundary, UI explanation, tests, checkpoint documentation, and gap tracker.

## Not verified

- Dependency-backed complete TypeScript type-check or Vite production build (the ZIP does not include `node_modules`).
- Full Android Gradle compilation or APK build.
- Any change to Android `ScreenSource`/`MediaProjection` internals; no new VirtualDisplay or capture Surface is introduced by V32.
- Background rendering in RTMP output (deliberately disabled until the capture source is a true scene layer).
- Camera orientation, multiple layer performance, physical-device LIVE, or StreamingIn interoperability.
- GitHub push/merge (not performed).
