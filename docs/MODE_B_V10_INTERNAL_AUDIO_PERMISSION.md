# Mode B V10 — Internal audio permission correction

## Defect found in V9

The plugin requested `RECORD_AUDIO` only for `mix` and `microphone`. However, RootEncoder 2.8.1 `InternalAudioSource.create()` calls `MicrophoneManager.createMicrophone(...)` before starting its playback-capture `AudioRecord`. The library's `createInternalMicrophone(...)` documentation also explicitly requires `Manifest.permission.RECORD_AUDIO`. An Internal-only user could therefore proceed to MediaProjection consent without the required permission, then fail while preparing audio.

## Fix

- Request Android `RECORD_AUDIO` for all supported Mode B audio routes: Mix, Internal, and Microphone.
- Use the permission alias `audioCapture` and a neutral user-facing denial message. The service rechecks the permission before constructing the source in case it was revoked between the plugin check and service startup.
- Disable echo cancellation/noise suppression for Internal-only capture; those effects remain enabled for Mix/Microphone routes.
- Explain in Dashboard that Internal mode still captures device playback; the permission is a platform prerequisite and does not silently switch the stream source to microphone.
- Preserve the narrow fallback rule: only Mix mode may fall back to microphone after a confirmed playback-capture failure. Internal-only selection is never silently changed.

## Regression coverage

`ModeBStreamPolicyTest.allRootEncoderAudioRoutesRequestRecordAudioPermission` checks all three supported routes and rejects unknown/null values.

## Validation boundary

This is a targeted source correction grounded in the RootEncoder 2.8.1 source API. Android runtime permission behavior and actual internal-audio capture still require APK build/device verification.
