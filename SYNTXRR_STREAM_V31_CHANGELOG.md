# SYNTXRR STREAM — V31 Checkpoint

Basis: `syntxrr-stream-tools-main-fixed-v30.zip`.

## Purpose

Make the already-modeled preset `backgroundUri` functional without repeating V28/V29 transfer work or V30 Group transform work.

## Changes

- Added stable local background URI helpers using `studio-media://<asset-id>`.
- Added active-preset background assignment/removal controls to Studio's Media panel. Only persisted local images are assignable for the portable/native path; temporary WebView Blob URLs are never saved.
- Studio canvas preview resolves the local background image from the restored IndexedDB media library and renders it using center/cover sizing. Existing HTTPS background references remain preview-only.
- Preset JSON export now discovers a background-only local image reference and embeds that image. Import validates and restores the image, remaps its asset ID, and rewrites `backgroundUri` to the new stable local reference.
- Native Mode B snapshot appends a synthetic full-canvas image layer below all Studio elements. Existing `prepareModeBOverlayAssets` then copies its local image through the same validated native cache path.
- External URL or malformed background references are rejected for native Mode B with a user-facing explanation. The selected background is not silently dropped.
- Background consumes one of the existing 60 native overlay slots and one of the existing eight local image slots. Existing 5 MB per-image and 12 MB total image caps remain in force.

## Validation

- `presetModel.test.ts`: 38 assertions passed.
- `presetTransfer.test.ts`: 35 assertions passed, including background image packaging, missing background rejection, and fresh asset ID remapping.
- `nativeStreamingBridge.test.ts`: 13 assertions passed for background ordering, stable asset ID forwarding, external URL rejection, unchanged no-background snapshots, and the 60-element bound.
- TypeScript syntax transpilation: 58 `.ts`/`.tsx` files, zero syntax diagnostics.

## Deliberate boundary

The native Mode B base source is Android `ScreenSource`, and `StudioOverlayView` is attached afterward as a `ViewFilterRender`. The V31 background therefore covers the captured screen and then Studio elements render above it. This is explicitly shown in the Studio Media panel. It is not claimed to match undocumented StreamingIn compositing internals.

## Not verified

- Full dependency-backed project type-check or Vite production build.
- Full Android Gradle compilation or APK build.
- Installation or visual background verification on a physical Android device.
- Actual LIVE behavior with a background and MediaProjection screen sharing.
- StreamingIn runtime parity.
- GitHub push/merge (not performed).
