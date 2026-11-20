# SYNTXRR STREAM — V30 Checkpoint

Basis: `syntxrr-stream-tools-main-fixed-v29.zip`

## Purpose

Close the explicitly recorded V29 Studio gap: selecting and transforming a whole Group on the canvas. V29 already provided group/supergroup data, grouping controls, inherited visibility/lock, and transfer support; V30 does not recreate those features.

This is an incremental source checkpoint, not a release or an APK validation build.

## Changes

- Added a dedicated selected-Group state in Studio. Selecting a Group from the Layers panel clears the individual element selection and displays a canvas frame derived from the live child element positions.
- Added pointer/touch drag from the Group frame label to translate all child elements together.
- Added four corner handles to resize the Group. Child positions are scaled relative to the original Group bounds and child width/height are scaled while respecting the existing minimum element sizes (5% width and 3% height).
- Group movement and resize use one immutable pointer-down snapshot for each gesture, avoiding cumulative rounding drift while pointer events arrive.
- A completed Group gesture contributes one undo-history snapshot, not one entry per pointer movement.
- Group `x`, `y`, `width`, and `height` metadata are recalculated from child bounds in preset normalization, so ordinary element edits and undo/redo snapshots also cannot leave stale Group bounds.
- Non-member elements are unchanged. Individual child rotation, layer order, visibility, properties, IDs, and media references are preserved.
- Group movement/resizing is blocked if the Group, its containing Supergroup, or any child element is locked. A missing child reference also blocks the transform rather than partially moving the Group.
- Existing per-element drag/resize remains unchanged. Selecting an individual element or clearing the canvas exits Group selection.

## Deliberate limits

- V30 supports whole-Group translation and axis-aligned resize only. It does not add Group rotation, arbitrary pivot editing, or whole-Supergroup transforms.
- Group bounds are derived from child `x/y/width/height`, matching the existing V29 group-bound convention. Rotated child corners are not used to expand the frame; child rotation values are preserved.
- These are SYNTXRR Studio editor interactions informed by the structured Group/Supergroup data model. They are not claimed to reproduce undocumented StreamingIn runtime behavior byte-for-byte.
- Android touch behavior, physical-device editor interaction, and the resulting live overlay composition have not been tested on a phone in this checkpoint.

## Validation performed

- `presetModel.test.ts`: 35 assertions passed, including Group bounds, horizontal/vertical group movement, proportional group resize, non-member preservation, and source immutability.
- TypeScript syntax transpilation: all 57 `.ts`/`.tsx` source files transpiled with zero syntax diagnostics.
- The focused pure-model test was compiled with TypeScript 5.8.3 and executed under Node 22.16.0.

## Not verified

- Dependency-backed full-tree TypeScript type-check, lint, or Vite production build (the archive has no installed `node_modules`; syntax transpilation is not a type-check).
- Full Android Gradle compilation.
- APK generation, installation, or physical-device testing.
- Group gestures with Android touch on a physical phone.
- Camera/video/compositor performance and orientation during real LIVE.
- TikTok LIVE, RTMP, or StreamingIn interoperability on a physical device.
- GitHub push/merge (not performed).
