# SYNTXRR STREAM V47 — Screen Reshare Recovery

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v46.zip`
- V47 continues the existing Mode B RTMP and MediaProjection implementation; it does not rebuild the streaming pipeline.
- StreamingIn DEX evidence includes a waiting-card flow and a floating “Bagikan layar lagi” action after Android stops screen sharing. This evidence supports a user-driven reshare path; it does not establish automatic screensaver activation semantics.

## Changes
- Preserve an already-published RTMP session after a projection-dependent capture token is revoked, only when the session was previously LIVE, RTMP is still streaming, and stop/cleanup has not started.
- Add `reshare_waiting` and `resharing` service states while retaining the original RTMP session.
- Add a waiting card to the existing GL pipeline and continue rendering through RootEncoder's existing forced-render path.
- Add a native floating “Bagikan layar lagi” control when Android overlay permission is available, plus a notification action and Dashboard action as fallbacks.
- Add a private translucent `ModeBReshareActivity` to request fresh Android MediaProjection consent from a user action.
- Hide the floating control synchronously before opening the consent flow so it is not captured into the shared screen; restore it when consent is cancelled or the Activity cannot continue.
- Reuse the existing encoder Surface/SurfaceTexture and attach one fresh VirtualDisplay for each newly consented MediaProjection token. Direct and compatibility capture paths are handled separately.
- Replace projection-backed internal/mixed audio with paced silence while the projection token is unavailable; restore from the new token when possible. Microphone-only capture can continue. Mix-mode fallback to microphone is surfaced; internal-only mode does not silently change source.
- Pause local video playback while waiting and resume after the first screen frame is received and the waiting filter is released.
- Preserve the waiting state through RTMP reconnect callbacks; keep Stop available.
- Reject concurrent reshare attempts and restore the floating control if the service is retrying or another reshare is already in progress.

## Validation performed
- 17 standalone assertions for `ModeBResharePolicy` passed.
- 67 TypeScript/TSX files transpiled with zero syntax diagnostics.
- Java parser pass on changed Java sources reported zero syntax-pattern errors, including no illegal forward reference.
- AndroidManifest.xml parsed as valid XML; `ModeBReshareActivity` is registered once and `exported=false`; `SYSTEM_ALERT_WINDOW` is declared.
- `package.json` and `bun.lock` are byte-identical to V46.
- ZIP integrity test performed after packaging.

## Not verified
- Full Android Gradle compilation and APK build.
- Runtime MediaProjection re-consent, RTMP continuity, audio switching, notification/floating control behavior, direct-source and compatibility-source reshare on a physical device.
- Real LIVE interoperability with StreamingIn.
- Screensaver auto-trigger/wake semantics; this remains unimplemented pending stronger reverse-engineering evidence.

## Safety/behavior limits
- Reshare is available only for a session that had already reached LIVE and whose RTMP transport remains active.
- A fresh MediaProjection token is required; each token creates at most one VirtualDisplay.
- If the user cancels consent, or no first screen frame arrives before timeout, SYNTXRR remains in `reshare_waiting` while RTMP is retained when possible.
- If the service is stopped or transport is no longer available, the app must not report the reshare as successful.
- Floating overlay availability depends on Android overlay permission. Notification and Dashboard controls remain alternative entry points.
