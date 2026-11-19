# SYNTXRR STREAM V28 — Portable Preset JSON Transfer

## Why this change was selected

The StreamingIn Stage 8 APK analysis identifies preset JSON import/export and media-aware transfer as explicit preset workflows. In V27, SYNTXRR already had local preset create/select/duplicate/rename/favorite/delete and a whole-app JSON backup in Settings, but Preset Manager had no one-preset transfer flow. Whole-app backup is not a substitute for sharing one selected preset.

## V28 changes

- Added per-preset JSON export from Preset Manager.
- Added JSON preset import from Preset Manager. An imported preset is added as a new copy and becomes the active preset; an existing preset is never overwritten.
- Export packages the local image, video, and audio files referenced by the preset's `imageAssetId`, `videoAssetId`, and `audioAssetId` properties.
- Import generates new preset element IDs and new local media IDs, then rewrites element references. Old WebView `blob:` URLs are removed so Studio resolves the newly restored IndexedDB assets.
- Export refuses to create a broken package when a referenced local file is missing or exceeds transfer bounds.
- Import validates package identity/version, canvas orientation, element count and geometry, media type, base64 data, declared size, and total transfer size before storing media.
- Media restoration writes the Blob records and metadata index in one IndexedDB read/write transaction.

## Package contract and limits

- Package identity: `app = SYNTXRR STREAM`, `format = syntxrr-preset`, `schemaVersion = 1`.
- Maximum JSON file size: 48 MiB.
- Maximum single embedded media file: 20 MiB.
- Maximum total embedded media: 32 MiB.
- Maximum elements per preset: 250.
- Package contains current SYNTXRR `StudioPreset` fields and referenced media only.

## Important boundaries

- This is a local file-based portability workflow. It is not cloud sync, a marketplace connection, or StreamingIn-format compatibility.
- It transfers the current SYNTXRR flat element model. It does not yet implement StreamingIn's `groups`, `superGroups`, `backgroundUri`, transition, or screensaver scene model.
- Whole-app backup remains a separate Settings feature.
- Android download/share behavior and restore on a second physical device still require APK/device testing.

## Validation performed

- 17 executable assertions passed in the focused `presetTransfer.test.ts` harness, compiled with the global TypeScript compiler and run on Node 22 with a temporary Capacitor runtime stub: package metadata, media embedding, media restoration, fresh ID mapping, stale `blob:` cleanup, favorite metadata, missing-media rejection, and unsupported-format rejection.
- TypeScript syntax transpilation passed for the transfer service, storage, Preset Manager, and test file.
- Focused TypeScript type-check passed for the transfer service, storage, Preset Manager, and test file with temporary declarations standing in for unavailable installed Capacitor/React type packages.
- Full project `tsc`/Bun scripts were not run because project `node_modules` and Bun are unavailable in this environment.
- Full Android/Gradle compilation: **not verified**.
- APK build: **not verified**.
- Real-device import/export and media playback after import: **not verified**.
