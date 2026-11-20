# Mode B V18 — Camera2 Studio overlay

## Change

- A visible `camera` Studio element now requests Android `CAMERA` permission before screen-capture consent and before Mode B starts.
- The foreground service declares and activates the Android `camera` foreground-service type only when the preset contains a visible camera element.
- Added `NativeCameraOverlay`, a bounded Camera2 JPEG-frame source that feeds the Studio canvas compositor. It uses the requested front/back lens, selects a supported JPEG output size, requests a low frame-rate range where available, throttles delivery to at most 8 fps, and downsamples decoded frames to at most 640x480.
- Camera elements with the same `facingMode` reuse one physical camera feed and can be positioned/sized/rotated/rounded independently in Studio. A preset requesting both front and rear lenses is not silently switched: only the first requested direction is supported in this release; opposite-facing layers are reported as omitted.
- Camera border, opacity, cover/contain, and front-camera mirror behavior are rendered in the native Studio view.
- Camera failure is reported in the render summary and shown as a placeholder; it does not substitute a simulated video or terminate the RTMP stream.
- Release now guards late camera callbacks so a frame arriving during teardown cannot resurrect a bitmap after assets have been released.
- Updated Dashboard, Settings, and Mode Launcher capability text.

## Limits

- One physical Camera2 lens per Mode B session; multiple Studio camera layers can reuse that same lens only when they request the same facing direction.
- Camera frames are JPEG-backed, at most 640x480 after decode, and delivered to the compositor at no more than 8 fps. Device-specific Camera2 support and thermal performance vary.
- Browser capture, remote media, simultaneous front+rear capture, and multi-camera concurrency are not supported.

## Verification boundary

- Added JVM policy tests for visible/hidden camera element detection and permission gating.
- XML and source-level checks are performed in this environment.
- A full Android Gradle build and physical-device Camera2 + RTMP test are still required; the current environment cannot download the Gradle 8.14.3 distribution or access an installed Android SDK.
