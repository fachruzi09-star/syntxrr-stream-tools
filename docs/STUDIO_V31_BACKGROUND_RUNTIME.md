# SYNTXRR STREAM — V31 Preset Background Runtime

Basis: `syntxrr-stream-tools-main-fixed-v30.zip`.

## Why this change was selected

V30 already retained `backgroundUri` in the structured preset and JSON transfer model, but source inspection found no Studio canvas rendering and no Mode B native overlay preparation for it. The StreamingIn Stage 8 APK analysis confirms `backgroundUri` is a field on the structured `Preset` model. It does not establish every URI scheme or exact runtime compositing behavior.

## V31 changes

- Added a stable local media URI form: `studio-media://<asset-id>`. The URI stores an IndexedDB asset ID, never a session-scoped WebView `blob:` URL.
- Added a Background Preset panel to Studio's Media tab. Persisted local images can be assigned to or removed from the active preset.
- Studio canvas preview resolves the local URI from the existing restored media URL map and renders the image with `cover` sizing. HTTPS URLs remain previewable when already present in the preset, but are not portable local assets.
- Preset JSON export now includes the local image referenced only by `backgroundUri`. Import validates its presence/type, stores it in IndexedDB under a fresh ID, and rewrites the imported URI to the fresh local asset ID. Existing remote background URLs remain references and are not embedded.
- Mode B snapshot creates one synthetic full-canvas image layer at the lowest Studio layer value. It uses the same bounded local-image cache/decoder path as other Studio image elements; no WebView URL or Blob crosses the native bridge.
- The synthetic background consumes one slot of the existing 60 overlay-element and 8 image-asset limits. It is also subject to the existing 5 MB per-image and 12 MB total image limits.
- A background URI that is not a valid local `studio-media://` reference causes native Mode B start preparation to fail with an actionable message rather than silently omitting the selected background.

## Important compositing boundary

`ModeBStreamService` uses Android `ScreenSource` as the base video source and attaches `StudioOverlayView` through `ViewFilterRender` afterward. Therefore V31's opaque full-canvas background image is drawn above the captured Android display and can cover it; subsequent Studio elements render above the background. This is the current native pipeline's ordering, not evidence that StreamingIn uses the same internal composition. Do not claim the background sits behind the MediaProjection source. A later architecture change would be required if SYNTXRR needs the captured screen to remain visible underneath a preset background.

External HTTPS background URIs can render in the WebView preview, but V31 intentionally rejects them for native Mode B because the native cache path accepts validated local IndexedDB assets only. Importing the source image into Studio Media creates a portable/live-compatible reference.

## Validation performed

- Focused preset-model test includes stable URI generation/parsing and malformed local URI rejection.
- Focused preset-transfer test covers background media embedding, missing-background rejection, restored asset ID remapping, and v1 compatibility.
- TypeScript syntax transpilation is recorded separately in the V31 checkpoint report.

## Not verified

- Full project dependency-backed type-check, Vite production build, or Gradle/Android compilation.
- APK generation, installation, or physical-device background rendering.
- Whether a full-canvas background covering MediaProjection is the desired live behavior on the target phone.
- External HTTPS background rendering under WebView/CORS/network conditions.
- StreamingIn parity beyond the static APK field evidence in Stage 8.
