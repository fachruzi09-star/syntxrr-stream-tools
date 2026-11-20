# SYNTXRR STREAM — V29 Checkpoint

Basis: `syntxrr-stream-tools-main-fixed-v28.zip`

## Purpose

Implement the next preset-system gap identified by comparing the V28 source with the saved StreamingIn APK Stage 8 preset analysis: a structured preset model with groups and super-groups, and safe persistence/transfer of that structure.

This is an incremental source checkpoint, not a release or an APK validation build.

## Changes

- Added an optional structured canvas specification (`kind`, `width`, `height`) while retaining the existing `canvasOrientation` field for compatibility.
- Added preset-level `backgroundUri`, `groups`, `superGroups`, `transitionIn`, `transitionOut`, `screensaver`, and schema metadata fields.
- Added optional element-level event/animation/timing/crop metadata so those fields can survive structured preset transfer.
- Added preset normalization for legacy flat presets. It supplies canvas defaults, preserves supported metadata, and removes dangling/duplicate group references instead of leaving broken references in IndexedDB.
- Added group and super-group creation in the Studio Layers panel using multi-select checkboxes.
- Added group/super-group visibility and lock controls. These states are inherited by contained elements in the Studio canvas and in the Mode B native overlay snapshot path.
- Group lock now blocks child element movement, resizing, property changes, duplication, deletion, and layer reordering through the Studio controls. Ungrouping retains the elements.
- Preset duplication remaps element IDs, group IDs, and super-group references so copied presets do not point back to the source preset's entities.
- Upgraded per-preset transfer export to schema version 2. Import accepts both v1 and v2; v1 packages receive safe flat-preset defaults. V2 import remaps element/group/super-group IDs and rejects invalid references before committing media blobs.

## Deliberate limits

- Group membership and inherited visibility/lock are implemented. Dragging/resizing a whole group as one transform is not implemented yet.
- `backgroundUri`, transitions, screensaver, and the additional animation/event metadata are preserved in the preset document and transfer file, but their full runtime rendering/transition behavior is not implemented in this checkpoint.
- Cloud preset sync and the remote marketplace catalog are not implemented here.
- This app-specific structure is guided by the static APK findings; it is not claimed to be a byte-for-byte reproduction of StreamingIn's internal serializer. The Stage 8 report explicitly notes that full runtime semantics and marketplace catalog contents were not established by static inspection.

## Validation performed

- `presetModel.test.ts`: 21 assertions passed.
- `presetTransfer.test.ts`: 30 assertions passed, including structured v2 round-trip, media ID remapping, invalid group-reference rejection before media persistence, and v1 import compatibility.
- Syntax transpilation of all 57 TypeScript/TSX source files completed without syntax diagnostics.
- A full-tree type-check with temporary external-module declarations surfaced only the same unrelated baseline issues already present in V28 (TikTok auth discriminated-union access, existing React type-stub omissions, and Soundboard result narrowing). The V28 `category` typing diagnostics in `App.tsx` were corrected in V29. This is not a substitute for the normal dependency-backed project type-check.

## Not verified

- Full dependency-backed TypeScript lint/build.
- Full Android Gradle compilation.
- APK generation or installation.
- Physical-device camera/video/compositor behavior.
- Real TikTok LIVE or RTMP session behavior.
- StreamingIn interoperability on a physical device.
- GitHub push/merge (not performed).
