# Mode B V63 — Audio Route Transitions During Screen Reshare

## Scope

V63 makes projection dependency and the screen-loss audio response explicit in a small policy used by `ModeBStreamService`.

- `internal`: depends on the active `MediaProjection`; replace it with `SilenceAudioSource` after projection loss, then restore `ModeBSafeInternalAudioSource` with the fresh projection. It must never fall back to microphone.
- `mix`: depends on the active `MediaProjection`; replace it with silence while waiting, then restore `ModeBSafeMixAudioSource`. Microphone fallback remains allowed only when a clean Mix capture failure is confirmed.
- `microphone`: does not depend on `MediaProjection`; keep it running during screen loss and do not insert a Silence source or try to restore it during reshare.

`ModeBStreamService` continues to call `changeAudioSource()` on the existing service-owned `RtmpStream`. The wrapper still checks object identity, stream generation, and `isStreaming()` before and after the replacement. V63 does not stop/recreate the RTMP stream or alter its encoders.

## Validation

`ModeBAudioResharePolicyTest` covers projection dependency, silence insertion, restoration eligibility, Mix-only microphone fallback, duplicate-silence prevention, and the microphone-only no-silence path. Existing `ModeBAudioSourceSwapTest` continues to cover the live-session guard and failed-candidate rollback behavior.

This policy test does not simulate Android `MediaProjection`, real `AudioRecord`, RootEncoder PCM callbacks, physical-device playback, or RTMP network continuity. Those still require Gradle/device/server validation.
