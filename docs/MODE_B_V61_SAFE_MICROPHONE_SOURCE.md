# Mode B V61 — Safe Microphone-Only Source

## Why this exists

The Mode B microphone-only route previously used RootEncoder 2.8.1 `MicrophoneSource`. In that version, `create()` allocates an `AudioRecord` and `start()` allocates another one into the same `MicrophoneManager` field. Because the manager does not release the first recorder before assigning the second, the first recorder can become unreachable and evade cleanup.

## Runtime behavior

`ModeBSafeMicrophoneSource` delays recorder allocation until `start()`. It validates the created recorder's actual initialized/recording state, publishes the encoder PCM sink only after startup succeeds, clears that sink before cleanup, and uses the app-owned safe manager for blocking-read retirement and retryable release.

The service uses this source for the initial Microphone-only route and all Mix-to-Microphone fallbacks. Before `startStream()` opens the RTMP session, a short preflight starts and stops the microphone against a discard PCM sink. This detects a microphone permission/device failure without first opening RTMP. The later real stream start creates exactly one fresh recorder for its own capture generation.

## Safety constraints

- Internal audio remains `InternalAudioSource`; it is never silently converted to microphone audio.
- Mix remains `ModeBSafeMixAudioSource`; its playback-capture failure policy is unchanged.
- A Mix fallback is still explicitly a microphone-only route and updates the active route as before.
- The audio source replacement path remains in-place through RootEncoder `changeAudioSource()`; V61 does not stop/restart the RtmpStream or reconnect the transport.
- `package.json` and `bun.lock` are not changed.

## Validation boundary

V61's focused JVM tests and stub integration verify lifecycle admission, recorder allocation count, preflight cleanup, sink gating, and cleanup retry behavior. Real Android AudioRecord behavior, APK installation, physical-device reshare, and RTMP server continuity still require device testing.
