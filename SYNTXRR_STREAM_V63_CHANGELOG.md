# SYNTXRR STREAM V63 changelog

## Mode B — Audio reshare transition policy

- Added `ModeBAudioResharePolicy` to make the projection dependency of each audio route explicit.
- Applied it to projection-loss detection, Silence insertion, reshare audio restoration, and failed-reshare recovery.
- Internal remains a strict playback-capture route and cannot silently become microphone.
- Mix remains the only route eligible for a clean-failure microphone fallback.
- Microphone-only audio remains active when screen projection is lost; it is not unnecessarily replaced by Silence and restarted.
- Duplicate Silence replacement is suppressed when the route is already silenced.
- Added five JVM policy tests for Internal, Mix, Microphone, duplicate silence, and unsupported route behavior.
- Added `docs/MODE_B_V63_AUDIO_RESHARE_TRANSITIONS.md` and updated the master interface audit.

## Validation performed

- 20 JVM tests passed with a lightweight local JUnit-compatible runner: 5 new reshare-policy tests, 10 existing source-swap tests, and 5 existing audio-capture lifecycle tests.
- 13 service source invariants passed, including Internal/Mix safe source restoration, Mix-only fallback, both silence handoff paths, same `RtmpStream` identity/generation checks, and no RTMP stop/start or stream recreation in the audio swap method.
- `package.json` and `bun.lock` are byte-identical to V62.
- ZIP CRC/integrity is verified in the final archive.

No Android Gradle build, APK, physical-device test, real playback-capture test, or RTMP network continuity test was performed. The source invariants do not replace those runtime checks.
