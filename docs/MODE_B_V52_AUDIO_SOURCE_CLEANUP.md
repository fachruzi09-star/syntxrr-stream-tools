# Mode B V52 — Failed AudioSource Candidate Cleanup

## Confirmed RootEncoder 2.8.1 behavior
`StreamBase.changeAudioSource()` initializes the candidate, stops the current source, starts the candidate when the current source was running, and restarts the previous source if candidate start throws. The library does not stop or release the failed candidate object after that exception. `InternalAudioSource.start()` and `MixAudioSource.start()` create a `HandlerThread` and register a MediaProjection callback before attempting to create the playback-capture AudioRecord. Their `isRunning()` can still be false when setup fails after those resources are acquired.

## V52 fix
- `ModeBAudioSourceSwap.replace()` cleans the failed candidate using `stop()` and `release()` after `changeAudioSource()` throws, while preserving the original exception.
- `ModeBAudioPreflight.verifyAndRelease()` always calls `stop()` after an attempted start. It no longer treats `isRunning()` as proof that no callback/thread was allocated.
- Cleanup errors are added as suppressed exceptions and do not hide the primary capture/start failure. The restored source is also checked with `isRunning()` because RootEncoder does not surface rollback-start failure.
- Mix-to-Microphone fallback is allowed only when the failed Mix candidate was cleaned without suppressed errors. If cleanup or previous-source rollback is uncertain, no third source is layered on top and the RTMP session is ended rather than retaining a potentially orphaned capture resource.
- If a failed reshare cannot install the silence source, the service terminates the session instead of leaving a projection-dependent AudioRecord attached to an expired token.
- All Mode B audio transitions now use the safe wrapper: projection loss to silence, internal/mix restoration after reshare, Mix-to-Microphone fallback, and return-to-waiting silence.

## Route behavior preserved
- Internal audio never silently changes to microphone. If Internal cannot be restored after reshare, LIVE remains in waiting state and the user can retry.
- Mix may fall back to microphone only under its existing documented fallback.
- Microphone-only remains active during screen reshare because it does not depend on the MediaProjection token.
- `mediaSound` is not injected into RTMP in this checkpoint.
