# Mode B V67 — Screensaver media retirement

## Race closed

`ModeBReshareWaitingView.releaseMedia()` is called from more than one service lifecycle path. For example, projection-loss/reshare handling may ask the card to release media, and service teardown can later ask the same view to release media with an acknowledgement callback. The prior implementation treated the second call as already finished and only inserted a visual-worker barrier. That second caller did not join the audio/video decoder retirement already started by the first caller.

The prior implementation also cleared `mediaVideoDecoder` and `mediaAudioDecoder` immediately after taking local snapshots. A concurrent owner therefore could no longer discover the exact retiring instances through the view fields.

## New lifecycle

1. All `releaseMedia()` entry is serialized onto the main Looper.
2. `ModeBMediaReleaseCoordinator.request()` elects one owner. Subsequent callers attach callbacks to that same retirement; they do not start duplicate cleanup or acknowledge early.
3. The owner snapshots the current video/audio decoder references, disables playback, flushes the Screensaver PCM queue, and hides the frame view.
4. `ModeBAsyncReleaseBarrier` waits for each present decoder's asynchronous retirement callback and one additional FIFO marker on the shared visual worker.
5. The visual-worker marker is queued only after the decoder retirements have acknowledged, ensuring retriever/frame work cannot still be reading the old asset namespace.
6. Once the aggregate barrier completes, the view clears only references that still match the retired instances, then completes the shared coordinator. Every joined caller receives its callback on the main Looper.

The coordinator supports callback registration while retirement is in flight and immediate acknowledgement after the retirement is complete. Both the coordinator and participant barrier are thread-safe and tolerate duplicate completion attempts.

## Regression coverage

- One owner starts retirement while multiple callers join.
- Callbacks remain pending until the shared completion.
- Requests arriving after completion are acknowledged immediately.
- Duplicate completion calls do not notify callers twice.
- Concurrent request and participant-arrival races complete exactly once.

## Limits

The release coordinator/barrier helpers and adjacent PCM/timeline regression suites are JVM-tested. The Android `View` integration is source-audited but has not been compiled by the Android Gradle plugin in this environment. Device filesystem retirement, MediaCodec teardown under actual projection revocation, and RTMP continuity still require a built APK and physical-device tests.
