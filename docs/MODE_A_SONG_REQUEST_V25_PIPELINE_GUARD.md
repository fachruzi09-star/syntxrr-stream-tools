# Mode A V25 — Song Request Source & Pipeline Guard

## Scope

A narrow, additive correction to the existing Mode A Song Request flow. No playback engine, native service, event-bus, or Mode B camera code was rewritten.

## Changes

- External YouTube/Spotify catalog results are treated as metadata only unless an actual playable audio source exists.
- `handlePlayCommand()` rejects metadata-only results before applying the viewer cooldown or adding an item to the queue. The message tells the user to import an audio file they are permitted to use into Local Audio.
- `enqueueAndPlayItem()` defensively rejects non-playable items so a metadata-only entry cannot poison the playback queue through another caller.
- The seven-stage diagnostic counts a source as resolved only when a playable local file is present. A preflight inspection does not claim that playback has started.
- `overallSuccess` now requires successful source resolution, actual playback start, and an active audio output state. A warning no longer counts as full success.
- Stage 7 wording clarifies that an active player does not prove TikTok LIVE captured the audio; that final check requires a real LIVE test.
- Studio status labels now say `ENGINE OK` / `PERLU VERIFIKASI` rather than claiming all seven stages succeeded when the result is only preflight or still has warnings.

## Regression coverage added

- Configured remote catalog without a playable local file cannot pass Stage 5 or the full pipeline.
- A local-file preflight can resolve the source but cannot claim playback has started.
- Actual HTML5 playback must complete Stage 6 and the engine-level pipeline.
- Metadata-only items are rejected by the queue API and do not increase queue length.

## Validation boundary

- V24 Camera2 rotation test: 7/7 policy tests passed in a local Java test harness.
- V25 TypeScript source and test files were checked for transpilation syntax.
- The project's Bun test runner and full TypeScript project check were not executable in this environment: Bun is unavailable, project dependencies (including `vite/client`) are not installed, and network access is unavailable. Run `bun run src/services/__tests__/songRequest.test.ts` and the normal Android CI workflow in the project environment before merging.
- TikTok LIVE audio capture is intentionally not claimed as verified by the app's MediaPlayer/HTMLAudio playback state; it still requires a device-level live test.
