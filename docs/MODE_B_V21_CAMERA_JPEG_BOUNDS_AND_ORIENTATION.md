# Mode B V21 — Camera JPEG bounds and orientation handling

## Problems found in V20

- If the camera did not expose a JPEG output at or below 640×480, the selector fell back to
  the smallest advertised size without an upper bound. Some devices could therefore allocate
  a much larger ImageReader than the Studio compositor is designed to consume.
- `JPEG_ORIENTATION` is device-dependent: Camera2 may encode the requested rotation in EXIF or
  rotate the JPEG pixels. Applying only the requested rotation can leave an image sideways or
  rotate it twice.
- The callback copied the JPEG buffer before checking its size limit.
- The front/back orientation formula did not match the Camera2 sensor/device rotation rule.

## Changes

- Camera JPEG outputs are now limited to 1280 pixels per edge and 1280×720 total pixels. If a
  camera exposes no output size inside those limits, the overlay reports unsupported camera
  output instead of selecting an unbounded size.
- JPEG payload size is checked before allocating the duplicate byte array.
- The frame path reads the JPEG EXIF orientation. If EXIF carries a 90°, 180°, or 270° rotation,
  that rotation is applied to the decoded bitmap. If EXIF does not carry it, decoded dimensions
  are checked for the already-rotated-pixel case before applying the requested rotation.
- The requested JPEG orientation now follows the Camera2 rule: sensor orientation plus device
  rotation for rear cameras, and sensor orientation minus device rotation for front cameras.
- Added platform-independent tests for safe output selection, orientation calculation, EXIF
  handling, and avoiding double rotation.

## Verification boundary

The pure Java camera policy ran 18 assertion checks successfully. The complete Android Camera2
class and physical camera output still require an Android SDK/Gradle build and device testing.
