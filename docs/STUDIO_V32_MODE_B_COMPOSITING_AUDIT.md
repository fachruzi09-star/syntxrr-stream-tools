# SYNTXRR STREAM — V32 Mode B Compositing Audit and Safety Correction

Basis: `syntxrr-stream-tools-main-fixed-v31.zip`.

## Finding

`ModeBStreamService` creates the video pipeline with `ScreenSource` as the active source and then appends a `ViewFilterRender` containing `StudioOverlayView`. `GlInterface.addFilter()` appends a filter to the filter chain. Consequently, the screen capture is the full-frame base image and all Studio view drawing happens afterward.

V31 appended a synthetic 100% × 100% preset-background image as the lowest Studio element. That value only made it the first item inside `StudioOverlayView`; it did not place it behind `ScreenSource`. Since `ScreenSource` is opaque/full-frame, the background is painted over the shared display and can hide it. A low z-index inside the view is not a lower z-index than the source.

The StreamingIn APK checkpoint describes Mode B `Share Screen Mode B` as an element on the canvas. It also identifies a GPU/direct path constraint: one visible screen-share element, lowest in the editor, unrotated, uncropped, and outside groups; otherwise a compatibility path may be used. That evidence is from static APK strings/call references, not a complete decompilation of its runtime compositor.

## V32 correction

- Removed the synthetic preset-background image from `createModeBOverlaySnapshot`.
- Removed `backgroundUri` from the native overlay snapshot API so callers cannot accidentally reintroduce it as an ordinary overlay element.
- Restored the full 60-element native overlay budget; background no longer consumes one overlay or image-cache slot.
- Kept local background storage, Studio preview, and preset JSON import/export unchanged.
- Added a persistent explanation in Studio Media and Dashboard Mode B: background remains available in Studio preview and portable preset transfer, but is not sent to the current RTMP output because doing so would cover screen capture.

## Required architecture before background can join Mode B output

A future implementation must represent MediaProjection screen content as a positioned scene layer in the same compositor as background, camera, local video, and regular Studio elements. The design must use exactly one MediaProjection consent token and one VirtualDisplay per session, keep the existing `onStop` / capture-loss lifecycle, and ensure the capture Surface and GL layer are released in a deterministic order. It must not create a second projection/VirtualDisplay as a workaround. It also needs a deterministic z-order policy and a tested GPU-eligible versus compatibility path for cropped, rotated, grouped, or transformed screen elements.

## Validation

- Native bridge snapshot test asserts only actual Studio overlay elements are passed to Android and the 60-element bound remains intact.
- TypeScript syntax and focused tests are recorded in the V32 checkpoint changelog.

## Not verified

- Full dependency-backed type check or Vite production build.
- Android Gradle compilation, APK build, or device installation.
- MediaProjection capture as a positioned GL layer; it is not implemented in V32.
- Physical-device LIVE behavior or StreamingIn parity.
- GitHub push/merge (not performed).
