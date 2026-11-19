# Mode B V57 — Mix Playback-Capture Failure Classification

## Confirmed RootEncoder 2.8.1 behavior
`MicrophoneManager.createMixMicrophone()` calls `createMicrophone()` and then `createInternalMicrophone()`. Both methods reuse the same `created` member. The microphone creation can set `created=true`; if internal playback capture then fails, its method can return the stale true value. The combined Mix factory can therefore report success even when the playback-capture `AudioRecord` is absent or not initialized.

## V57 correction
- `ModeBSafeMicrophoneManager` validates the actual `audioRecord` and `audioRecordDevice` state after the RootEncoder Mix factory returns.
- An uninitialized partial recorder is released directly before RootEncoder's `stop()` path. If direct release fails, its reference is retained so cleanup remains retryable and the service fails closed rather than silently layering a fallback source over uncertain resources.
- If the microphone leg is initialized but playback capture is not, the failure is classified as a playback-capture failure and matches the existing Mix-to-Microphone fallback policy.
- If the microphone leg itself fails, the failure is kept distinct and does not trigger a misleading playback-capture fallback.
- If the microphone starts but the playback-capture leg does not, the failure is likewise classified as playback-capture-specific.
- The shared fallback matcher no longer treats generic microphone recorder creation/start failures as playback-capture failures; only the playback-capture-specific errors continue into Mix fallback.

## Preserved behavior
- Internal-only audio is not converted to microphone-only.
- Microphone-only stays on its existing source path.
- Mix fallback remains the only route allowed to fall back to microphone-only.
- The RTMP/AAC encoder and screensaver `mediaSound` behavior are unchanged.

## Validation boundary
The V57 harnesses use minimal Android/RootEncoder stubs. They verify classification, recorder state validation, cleanup invocation, callback retirement, and lifecycle ordering. They do not validate vendor AudioRecord behavior on physical devices or a complete Android Gradle build.
