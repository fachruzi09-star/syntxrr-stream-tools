# SYNTXRR STREAM V67 changelog

## Mode B — idempotent Screensaver media retirement

V67 closes an asynchronous teardown race in `ModeBReshareWaitingView.releaseMedia()`. Previously, the first call began retiring the video decoder, audio decoder, and visual-worker tasks. A duplicate call made while retirement was still in progress could acknowledge immediately through the visual-worker barrier without waiting for the exact native decoders from the first call. The decoder references were also cleared before their release acknowledgements arrived. In a projection-loss followed by service-teardown sequence, this could allow a caller to believe media cleanup had completed too early.

- Added `ModeBMediaReleaseCoordinator` to coalesce repeated release requests. Only the first caller starts retirement; later callers join it and receive their callback only when the same retirement completes. Calls made after completion are acknowledged immediately.
- Added `ModeBAsyncReleaseBarrier` to aggregate independent asynchronous cleanup acknowledgements and fire exactly once after every participant has retired.
- Updated `ModeBReshareWaitingView.releaseMedia()` to run on the main thread, snapshot the exact video/audio decoder instances, flush the Screensaver PCM queue, and await video decoder retirement, audio decoder retirement, plus a FIFO barrier on the shared visual worker.
- Kept decoder references discoverable until all three retirement paths have completed. Only then are the matching references cleared and every joined caller acknowledged.
- Added concurrency, duplicate-request, duplicate-completion, post-completion, and all-participant barrier regression tests.

## Validation

- 35 focused JVM tests passed across six suites: media-release coordinator (4), async-release barrier (3), Screensaver audio timeline (8), PCM mixer (6), PCM converter (6), and timestamped PCM queue (8).
- The two new lifecycle helper classes and their tests compiled with `javac` and passed a local JUnit-compatible runner, including 16-way concurrent release requests and 32-way concurrent cleanup arrivals.
- Source invariants confirm `releaseMedia()` has one retirement owner, duplicate callers join that owner, the barrier accounts for video/audio/visual-worker completion, and decoder references are cleared only after the shared barrier completes.
- The V67 archive was compared with V66: 2 new Java helpers, 2 new test files, and 1 modified view; no files were deleted. `package.json` and `bun.lock` remain byte-identical to V66.

## Not verified

No Gradle/Android build or APK was produced. The configured Gradle 8.14.3 distribution remains unavailable in this environment because `services.gradle.org` DNS resolution failed in the previous build attempt. No physical-device MediaCodec playback, pause/resume/loop behavior, actual A/V sync, audible output, AAC mux/RTMP viewer playback, or network continuity test was performed. V67 hardens native media cleanup ordering; it is not device validation.
