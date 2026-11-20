# Mode B V11 — RTMP read-failure recovery

## Defect found in V10

Mode B accepted only `rtmp://` and `rtmps://` endpoints, but instantiated RootEncoder's `GenericStream`. In RootEncoder 2.8.1, `GenericStreamClient` does not expose the RTMP-specific `shouldFailOnRead()` and `shouldSendPings()` controls. The underlying RTMP client defaults `shouldFailOnRead` to false; after a stream had already published, some socket read failures could therefore cancel the RTMP read loop without notifying the app service. The UI could remain `live` while the transport had stopped receiving server packets.

## Fix

- Replace `GenericStream` with RootEncoder's RTMP-only `RtmpStream`, matching the app's actual RTMP/RTMPS-only endpoint validation.
- Configure `RtmpStreamClient.shouldFailOnRead(true)` so non-timeout post-publish read errors notify the existing bounded retry/cleanup logic.
- Enable RTMP ping keep-alive with `shouldSendPings(true)`.
- Keep the retry budget at three attempts; permanent endpoint/auth/publish rejections still stop immediately.
- Add `ModeBRtmpRecoveryPolicy` and a regression test that verifies retry, read-failure, and ping options are applied together.

## Validation boundary

- The API calls are present in RootEncoder 2.8.1 `RtmpStreamClient` and `RtmpStream` source.
- Local regression assertions for the policy helper are executed for this checkpoint.
- A full Android Gradle/APK build, network handoff test, and device RTMP test have not been performed here. RootEncoder read timeouts that the library explicitly classifies as `TIMEOUT` are still treated differently from non-timeout read failures; this change does not claim perfect detection on every RTMP server/network.

## Local validation in V11

- 53 TypeScript/TSX source files parsed with zero syntax diagnostics (syntax-only; not full `tsc` type-check).
- All 7 `ModeBStreamPolicyTest` methods passed in a local Java test harness, including the RTMP health configuration test.
- RTMP recovery helper compiled and passed a standalone Java smoke test.
- AndroidManifest XML parsed successfully.
- `package.json` and `bun.lock` are byte-identical to V10.
