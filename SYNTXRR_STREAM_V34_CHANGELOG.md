# SYNTXRR STREAM V34 — Screen Capture Rotation & Group Geometry

Basis: `syntxrr-stream-tools-main-fixed-v33.zip`.

## V33 gap confirmed from RootEncoder 2.8.1 source

- `BaseObjectFilterRender` draws a full-screen quad and supplies `Sprite`-transformed object coordinates separately as `aTextureObjectCoord`.
- `object_vertex.glsl` passes those coordinates to the fragment shader as `vTextureObjectCoord`; `object_fragment.glsl` / `surface_fragment.glsl` samples the object texture only while both coordinates remain within 0..1. Rotation therefore changes the sampled source mapping, not a separate per-element Android View.
- `Sprite.getTransformedVertices()` maps the unrotated output top-left vertex to object UV `(0, 0)`. Since the fragment shader samples transformed UVs, the visible source undergoes the inverse of the Sprite coordinate rotation. A positive Sprite angle appears counterclockwise on the output; Studio/CSS positive angles are clockwise, so native uses the opposite sign.
- For 90/270-degree capture rotation, the source aspect used by `Fit` is inverted. The final fitted output rectangle still uses its own x/y/width/height percentages; no canvas-center compensation or scale-axis swap is required.
- Studio Group move/resize persists transformed absolute geometry into each child element. Dashboard applies group/supergroup visibility and lock state before creating the Mode B screen-capture payload. Native code consumes those child bounds once, without another Group transform.

## Changes

- Added pure-Java `ModeBScreenCaptureGeometry` to calculate the axis-aligned `Fit` rectangle for 0/90/180/270-degree capture rotations using the output canvas aspect and rotated source aspect.
- Native `SurfaceFilterRender` receives fitted x/y/width/height percentages directly and uses the inverse Sprite angle so Studio's positive rotation direction is preserved.
- TypeScript and native validation reject oblique capture angles rather than allowing the current normalized-UV renderer to distort the captured image on non-square canvases.
- Studio rotation control for `screen_capture` uses 90-degree steps and exposes only 0/90/180/270 degrees.
- Added a Group-to-native regression test proving that the existing Group transform's persisted child bounds reach the screen-capture layer snapshot exactly once.
- Dashboard/Studio guidance documents quarter-turn rotation, `Fit` crop, and persisted Group child bounds.
- Existing MediaProjection token, single VirtualDisplay, SurfaceFilterRender lifecycle, background filter, and overlay order are unchanged.

## Validation executed

- TypeScript native bridge/composition tests, including supported and rejected capture rotations.
- Preset/Group regression tests, including propagation of transformed child bounds to the native capture layer.
- Pure-Java geometry/spec tests, including Studio-to-Sprite rotation direction and Fit bounds.
- TypeScript/TSX syntax transpilation across the source tree.
- Java syntax parsing and ZIP integrity/source comparison.

## Not claimed

- Crop `cover`/freeform crop is still unsupported; only `Fit` is accepted.
- Arbitrary-angle screen-capture rotation remains unsupported until a pixel-aspect-correct renderer is implemented.
- GPU-vs-compatibility capture-path parity is not implemented by this patch.
- Android Gradle compilation, APK creation, physical-device visual output, RTMP playback, camera-plus-video concurrency, and LIVE alongside StreamingIn remain unverified.
- No GitHub push/merge is performed.
