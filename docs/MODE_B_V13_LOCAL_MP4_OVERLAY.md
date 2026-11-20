# Mode B V13 — Bounded local MP4 overlay rendering

## Defect found in V12

Studio already imported local video files and rendered them in the WebView preview, but the native bridge only transferred image/sticker assets. `StudioOverlayView` therefore omitted every `video` element from RTMP output even when the editor showed the clip.

## Change

- The native bridge now resolves both image and video asset IDs from IndexedDB and transfers only assets referenced by the active preset.
- One local MP4 asset is supported per preset; image limits remain unchanged.
- MP4 uploads are capped at 12 MiB, validated as `video/mp4`, checked for an ISO-BMFF `ftyp` signature, and written into the app-private overlay cache.
- `NativeVideoOverlayDecoder` extracts scaled frames off the compositor render thread at up to 8 fps, caps frames at 1280x720, and supports looping or a final frozen frame.
- Video overlay decoding requires Android 8.1 (API 27) or newer. Clip duration is limited to 30 seconds. Video overlay audio is intentionally muted; audio routing remains owned by Mode B's selected audio source.
- Video decoders and their current bitmap are released after the RootEncoder GL renderer is stopped.
- Settings explains the exact limits; unsupported video URLs, camera, browser, and other media sources remain explicitly unsupported.

## Local validation performed

- 53 TypeScript/TSX files transpiled with zero syntax diagnostics (syntax-only; not a full TypeScript type-check).
- `ModeBStreamService`, `StudioOverlayView`, `NativeVideoOverlayDecoder`, the native Capacitor plugin, and the new upload path passed Java smoke compilation against Android/Capacitor/RootEncoder API stubs.
- 14 Java policy/regression tests passed, including MP4 MIME/signature/size/duration bounds, audio preflight lifecycle, RTMP retry policy, and send-progress watchdog behavior.
- AndroidManifest XML parses successfully.
- `package.json` and `bun.lock` are byte-identical to V12.

## Validation boundary

- This is a source-level implementation based on Android `MediaMetadataRetriever`; actual codec support depends on the device's Android media stack.
- Full Gradle/APK build, MP4 decode on a physical device, and RTMP playback verification have not been performed in this environment.
- The renderer is a bounded low-frame-rate local MP4 overlay, not a general-purpose real-time video player or browser media renderer.
