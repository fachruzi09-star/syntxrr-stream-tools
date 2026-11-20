# Mode B V8 — Local image overlays

## Supported path

The active Studio preset is reduced to a JSON-safe native overlay snapshot. For image and sticker elements, the WebView resolves only the referenced local asset IDs from IndexedDB and uploads those blobs to the app-private `cache/modeb-overlay-assets` directory before the Android screen-capture consent flow begins.

The native `StudioOverlayView` loads the cached assets and draws them through RootEncoder `ViewFilterRender`, after screen capture and before H.264 encoding. Position, size, layer order, opacity, rotation, contain/cover fit, and rounded clipping are applied by the native canvas renderer.

## Safety limits

- At most 8 distinct local image assets are uploaded for one preset.
- Each file is limited to 5 MiB; aggregate source files are limited to 12 MiB.
- Only PNG, JPEG, WebP, and GIF signatures matching the declared MIME type are accepted.
- GIF is rendered as a static first frame; animation is not supported.
- Bitmap decoding chooses a power-of-two sample size from the image bounds before allocating the bitmap.
- Decoded images are limited to 2 million pixels per image and 8 million pixels in aggregate.
- Asset IDs are restricted to alphanumeric, underscore, and hyphen characters; SVG and arbitrary remote/blob URLs are not accepted by the native cache path.
- Partially uploaded assets are cleared on preparation/start failure. The service clears its private asset cache when the stream session ends.

## Still unsupported

Video playback, animated GIF playback, camera/friend-camera layers, browser/embed content, remote URLs, and music/media widgets are not rendered by this compositor yet. Unsupported elements are counted in the native render summary instead of being represented by fake content.

## Validation performed for this checkpoint

- TypeScript syntax transpilation: 53 source files, no syntax errors. This is not a full TypeScript type-check.
- Java smoke compilation with Android/Capacitor/RootEncoder API stubs: Mode B service, plugin, compositor, and policy compile.
- Native policy smoke tests: 31 assertions covering audio fallback, retry classification, asset ID/size bounds, MIME signatures, and pre-decode bitmap sampling.
- AndroidManifest XML parses successfully.

A full Gradle/APK build and on-device RTMP/MediaProjection test have not been performed in this environment.
