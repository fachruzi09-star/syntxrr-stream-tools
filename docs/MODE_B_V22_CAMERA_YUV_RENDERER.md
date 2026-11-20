# Mode B V22 — Camera2 YUV frame path

## Changes

- Replaced the repeated JPEG `ImageReader` path with `ImageFormat.YUV_420_888` and a `TEMPLATE_PREVIEW` repeating request. Android recommends `YUV_420_888` or `SurfaceTexture` for app-driven camera frame processing.
- Added a stride-aware YUV-to-ARGB converter that honors each plane's row stride, pixel stride, buffer position, and the `Image` crop rectangle.
- Kept source capture bounded to 1280×720 and compositor frames bounded to 640×480 at no more than 8 fps.
- Rotates raw preview frames using the Camera2 preview-buffer orientation formula; JPEG EXIF handling is no longer part of this streaming camera path.
- Every acquired `Image` is closed in `finally`; an undelivered bitmap is recycled on all early-return/error paths.

## Tests

- YUV converter tests cover neutral grayscale, a red JFIF sample, padded row stride, two-byte chroma pixel stride, crop offsets, invalid strides, and output pixel budget.
- Camera policy tests cover all quarter-turn display rotations for front and back lenses.

## Not yet verified

- A full Android Gradle build and physical-device camera/RTMP test remain required.
- Device-specific YUV stream configurations can differ; unsupported YUV configurations fail clearly rather than silently switching to a still-photo JPEG pipeline.
