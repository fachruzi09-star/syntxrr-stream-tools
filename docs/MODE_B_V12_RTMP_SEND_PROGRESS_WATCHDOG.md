# Mode B V12 — RTMP send-progress watchdog

## Why

RootEncoder 2.8.1's RTMP receive loop treats socket read timeouts differently from other read failures: timeout exceptions do not invoke `ConnectChecker.onConnectionFailed`. During some network handoffs this can leave an RTMP publish session without a recovery callback.

## Change

- Start a watchdog only after `onConnectionSuccess`.
- Sample `RtmpStreamClient.getBytesSend()`, which RootEncoder increments after `sendVideoPacket` / `sendAudioPacket` returns successfully.
- If the counter changes, refresh the progress timestamp.
- If it does not change for 20 seconds, feed a transport-stall reason through the existing bounded RTMP retry path (maximum three retries).
- Stop the watchdog on reconnect-start, disconnect, auth failure, or session cleanup.

## Limits

This detects a sustained lack of successful RTMP packet writes. It does not prove that TikTok or another ingest platform has made the stream publicly visible, and it cannot independently restore a broken Android MediaProjection token. Device-level Wi-Fi/mobile handoff testing is still required.
