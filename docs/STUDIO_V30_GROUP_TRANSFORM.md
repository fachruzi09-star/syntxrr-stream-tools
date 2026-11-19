# Studio V30 — Whole-Group Transform

## V29 source gap

V29 persisted Groups and Supergroups, provided multi-select creation, visibility/lock inheritance, and JSON transfer, but a Group could not be selected as a canvas object. Users could only edit its child elements individually. The group model already stored optional `x`, `y`, `width`, `height`, `rotation`, and `zIndex` metadata, and V29 explicitly listed whole-Group drag/resize as unfinished.

## V30 behavior

1. Select a Group by tapping its name in the Layers panel.
2. The canvas shows an amber frame based on the current child element bounds.
3. Drag the Group label to move all children as one unit.
4. Drag one of the four corner handles to scale the child positions and sizes relative to the Group bounds.
5. Tap an individual element or empty canvas to leave Group selection.

The frame is a non-blocking pointer layer: the frame itself does not intercept clicks on child elements; only the top label and resize handles accept pointer input.

## Transform and persistence rules

- Every pointer move is calculated from the pointer-down element snapshot, not from the previous frame, to avoid incremental rounding drift.
- Non-member elements are returned unchanged.
- Child IDs, layer order, rotation, visibility, lock flags, properties, event bindings, and media references are preserved.
- Element width and height keep the Studio minimums of 5% and 3% respectively.
- One undo snapshot is appended when the gesture ends.
- Preset normalization recalculates Group `x/y/width/height` from child bounds on every element update, so the same metadata follows normal edits and undo/redo snapshots.
- A locked Group, locked containing Supergroup, locked child, or missing child blocks whole-Group transform. This avoids partially moving a Group.

## Verification

`presetModel.test.ts` covers live bounds, horizontal and vertical translation, proportional resize, unaffected non-members, and immutability. The Studio TSX was syntax-transpiled with the full source tree. Runtime pointer capture and physical Android behavior remain unverified.

## Known limits

- Group rotation and pivot manipulation are not included.
- Supergroup transform is not included.
- Bounds use the same axis-aligned `x/y/width/height` convention as V29 group creation; rotated child corners are not included in the frame calculation.
- No claim is made that this exactly matches StreamingIn's Group gesture semantics; the APK reverse-engineering confirmed the structured preset model, not all editor runtime behavior.
