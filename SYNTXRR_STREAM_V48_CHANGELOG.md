# SYNTXRR STREAM V48 — Mode B Text Screensaver Runtime

## Baseline
- Parent checkpoint: `syntxrr-stream-tools-main-fixed-v47.zip` (901,484 bytes).
- V48 continues the existing Mode B RTMP, MediaProjection, scene replacement, and V47 in-session reshare paths. It does not rebuild the stream pipeline.
- StreamingIn static DEX inspection identifies a preset `Screensaver` model with `on`, `text`, `media`, `mediaSound`, `enter`, and `exit`; `enter`/`exit` reference a `SceneTransition` (`type`, `duration`). `LiveService` reads the screensaver exit transition and checks its enabled state. APK UI strings describe a waiting card when the host leaves an Android 14+ single-app capture target or presses Pause on the floating control. This is static APK evidence, not a complete decompilation/runtime trace.

## Changes
- Add a typed Studio screensaver model and a bounded normalizer for `on`, `text`, `media`, `mediaSound`, `enter`, and `exit`.
- Add Studio controls for enable/disable, waiting-card text, Fade/Cut entry and exit, and bounded Fade duration (100–1,200 ms). Legacy string transition values remain editable.
- Transport the normalized screensaver settings to native Mode B at initial stream start and with a committed live-scene replacement.
- Add native `ModeBScreensaverPolicy` parsing and validation. The built-in waiting text defaults to `Sedang menunggu host`; text is limited to 180 characters. Fade is bounded to 100–1,200 ms; Cut is zero-duration.
- Implement a full-output opaque waiting card in the existing GL pipeline for Mode B when Android 14+ single-app capture reports the selected app is no longer visible.
- Add manual host-wait Pause/Resume from the floating control, Android foreground-service notification action, and Dashboard button. The control is only shown while screensaver is enabled and a suitable LIVE session is active.
- Fade the waiting card in/out on the main Looper; GL callbacks are marshalled to the main thread before `ValueAnimator` is started. The waiting filter is retired only after the renderer acknowledges release.
- Reuse the same waiting card when the projection token is stopped and V47 reshare recovery begins; preserve the configured screensaver policy across reshare completion.
- Fix a reshare visibility race: a hidden single-app target reported while a new projection is attaching is no longer overwritten as visible on reshare completion. If the new projection remains hidden after the first frame and the reshare card is retired, host-wait is re-applied.
- Handle null `text`/`media` fields using safe defaults instead of treating JSON null as the literal string `null`.
- Preserve unsupported `media` and `mediaSound` metadata and display a clear text-fallback notice. V48 does not play screensaver image/GIF/video media or media audio.

## Validation performed
- 69 TypeScript/TSX files transpiled with zero syntax diagnostics.
- `modeBScreensaverPolicy.test.ts`: 15 standalone assertions passed.
- `ModeBHostWaitVisibilityPolicy` compiled and ran in a standalone JVM harness: 7 assertions passed.
- Native integration source checks: 17/17 passed (start payload, scene-replacement payload, API 34 visibility callback, manual action, full-canvas filter, preserved screensaver across reshare, post-reshare hidden-target recovery, Dashboard and Studio controls).
- Java parser diagnostic scan reported no syntax-pattern errors, no illegal forward reference, and no unclosed construct in the changed Java sources. `javac` semantic compilation could not complete because Android, Capacitor, and RootEncoder classes are unavailable in this environment.
- `package.json` and `bun.lock` are byte-identical to V47.
- Android Manifest remains unchanged from V47; V48 adds no Activity or manifest permission.
- ZIP integrity and archive member count checked after packaging.

## Not verified
- Full TypeScript project type-check. `tsc --noEmit` stops at the unavailable `vite/client` type definition in this environment.
- Full Android Gradle compilation and APK build; Android SDK/dependency toolchain is not available here.
- Screensaver behavior on a physical Android 14+ device, including single-app visibility callback delivery, floating pause, notification actions, and transition timing.
- Reshare + screensaver combined behavior with real MediaProjection, RTMP transport, internal/mixed audio, and both Direct/Compatibility capture paths.
- Real LIVE interoperability with StreamingIn.

## Safety and behavior boundaries
- Screensaver runtime applies to Mode B. Automatic visibility behavior relies on Android 14+ single-app capture visibility callbacks; manual Pause is available via the floating control/Dashboard/notification while the configured screensaver is enabled.
- Projection `onStop` continues through V47's separate reshare-waiting path; each reshare still requires fresh Android consent and one new VirtualDisplay for the fresh MediaProjection token.
- Waiting text is displayed over the full outgoing Mode B frame. RTMP is retained only when the prior session had reached LIVE and the transport remains active.
- Screensaver `media` image/GIF/video playback and `mediaSound` are not implemented in V48; the data is preserved and the UI/native status discloses the fallback to text.
- Screensaver transitions support only Fade (100–1,200 ms) and Cut. Other transition types are rejected rather than silently approximated.
- This is source-level implementation and focused tests, not proof of app readiness or StreamingIn parity. Do not build the APK or push GitHub until end-to-end device validation is available and the user’s LIVE-readiness gate is met.
