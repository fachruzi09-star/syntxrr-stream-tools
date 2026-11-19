# Mode B V58 — AudioRecord release retry

## Confirmed lifecycle hazard
RootEncoder 2.8.1 `MicrophoneManager.stop()` attempts `AudioRecord.stop()` before `AudioRecord.release()` for each non-null recorder. V57 deliberately kept a reference to an uninitialized recorder when its direct `release()` failed, but the inherited stop sequence could fail again at `stop()` and never reach `release()` on a subsequent cleanup attempt.

## V58 correction
- `ModeBSafeMicrophoneManager.stop()` stops the PCM reader loop and waits up to 200 ms for its `HandlerThread` to retire before touching recorder resources.
- Each recorder is processed independently. `AudioRecord.stop()` is called only when the recorder reports `STATE_INITIALIZED` and `RECORDSTATE_RECORDING`.
- `AudioRecord.release()` is attempted regardless of whether `stop()` succeeds.
- A recorder field is cleared only after `release()` returns successfully. If release fails, the field is retained and the source lifecycle remains cleanup-eligible for another `stop()` attempt.
- RootEncoder's base `stop()` runs only after both recorder fields have been cleared, allowing its private post-process effects and `created` flag to be reset without re-entering unsafe recorder operations.
- The new PCM output sink is assigned only after the Mix lifecycle admits and completes a start. A start rejected while prior cleanup is pending cannot redirect stale PCM callbacks to a new sink.

## Regression coverage
The V58 test harness covers repeated Mix → Silence → Mix replacements across fresh MediaProjection generations, the prepare/preflight stop followed by actual source start, an uninitialized playback recorder whose first release attempt fails, a playback-start partial failure, a recorder release failure after microphone capture has started, retry after cleanup failure, and rejection of a new output sink until cleanup completes.

## Validation boundary
The 56-assertion integration harness uses deterministic Android/RootEncoder stubs, not physical Android `AudioRecord`. Real device behavior and full Android Gradle/APK builds remain unverified.
