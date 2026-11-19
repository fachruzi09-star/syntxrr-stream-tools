# Mode B V27 — Explicit Screen-Capture Loss and Fresh-Consent Recovery

## Finding in V26

`ModeBStreamService` ended the session when `MediaProjection.Callback.onStop()` fired, but published the generic `stopped` status. The Dashboard therefore could not distinguish an intentional stop from Android revoking/stopping screen capture, and offered no recovery-specific guidance.

The native start path already requests a new Android screen-capture consent through `MediaProjectionManager.createScreenCaptureIntent()` for each start. The service also resets a completed session before accepting a new one.

## V27 change

- A MediaProjection `onStop()` now ends the RTMP session with status `capture_lost`, not the normal user-stop status.
- The service message states that RTMP has ended and that the next start must request fresh screen-share permission.
- The Dashboard treats `capture_lost` as a recoverable, non-live status. The start button becomes `Bagikan Layar Lagi & Mulai Ulang` (or the English equivalent).
- The status explanation is localized in the Dashboard.
- Starting again follows the existing Android consent flow and creates a fresh MediaProjection session; no expired/revoked token is reused.

## What this does not claim

This is an explicit stop-and-restart recovery path. It does **not** keep the original RTMP session alive while the user reselects the screen, nor does it implement StreamingIn-style seamless in-session reshare. That requires a larger capture/encoder lifecycle design and must be validated against Android's MediaProjection one-shot token behavior.

## Validation boundary

- Source inspection confirms the projection-stop callback publishes `capture_lost` and ends the current session.
- TypeScript syntax transpilation and targeted source assertions pass.
- The Dashboard start action remains enabled for `capture_lost`; the stop action is disabled because the previous native session has already been torn down.
- Full Android/Gradle compilation: **not verified**.
- APK build: **not verified**.
- Physical-device capture revocation, fresh-consent restart, and real LIVE behavior: **not verified**.
