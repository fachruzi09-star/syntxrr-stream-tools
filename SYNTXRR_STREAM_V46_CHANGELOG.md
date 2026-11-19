# SYNTXRR STREAM V46 — Bounded Preset Fade Runtime

Basis: `syntxrr-stream-tools-main-fixed-v45.zip`.

## Audit findings

- `transitionIn`, `transitionOut`, and `screensaver` are preserved as opaque preset metadata and are not read by the runtime.
- StreamingIn Stage 8 confirms that live preset switching runs the outgoing preset's exit transition before the incoming preset's enter transition. The inspected APK evidence does not expose a complete transition schema or the exact screensaver trigger/content contract.
- The existing native scene replacement path stages overlay/background filters, waits for GL output draws, and retires old filters only after RootEncoder release acknowledgement. A bounded fade can use those scene-owned views without restarting RTMP or MediaProjection.

## Changes

- Added a fail-closed transition contract supporting only `fade` and explicit `none`/`cut`.
- Fade duration is bounded to 100–1200 ms; omitted fade duration defaults to 300 ms.
- App passes the active preset's `transitionOut` and target preset's `transitionIn` to native scene replacement.
- Native service executes outgoing fade first, then incoming fade, matching the transition order observed in StreamingIn Stage 8.
- Added scene-wide opacity multipliers to Studio overlay and background views. Final old-filter retirement waits for two more output GL draws after the fade completes.
- Unsupported/malformed transition metadata is rejected before active React/persistent preset state is changed.
- Fade transitions are rejected if either the current or target scene contains a visible camera layer, avoiding a fade of a view after its single Camera2 owner is transferred.
- Transition timeout cancels the animator, restores the active scene/background opacity, and follows the existing staged-scene rollback path.
- RootEncoder output-frame fences fire on the GL render thread; the transition state machine is now marshalled to the main Looper before starting `ValueAnimator`, avoiding animator startup from a non-Looper GL thread.

## Explicit limits

- `slide`, `zoom`, and other transition types remain preserved in preset JSON but are not enabled for LIVE because their runtime semantics were not verified.
- Screensaver metadata remains preserved but inactive. The inspected APK material does not establish a reliable trigger, content source, wake behavior, or interaction contract, so V46 does not invent one.
- Fade applies to the scene overlay and, when changed, its preset background. Screen capture itself is not faded or restarted.
- A preset containing a visible camera may still use the existing cut/handoff path, but fade is rejected until camera-frame continuity during opacity animation can be guaranteed.

## Validation performed

- TypeScript/TSX syntax transpilation: 69 files, zero syntax diagnostics.
- Transition policy test: 14 assertions passed.
- Java transition policy standalone harness: 11 checks passed.
- Whole-source `javac` parser pass: no syntax/forward-reference diagnostics; Android/Capacitor/RootEncoder dependencies are missing, so this is not compilation.
- Source invariants checked for outgoing-before-incoming ordering, post-fade GL fences, rollback opacity restoration, native duration validation, and camera transition guard.
- `package.json` and `bun.lock` unchanged from V45.
- ZIP integrity checked after packaging.

## Not verified

- Full TypeScript project type-check and Vite production build.
- Full Android Gradle compilation and APK build.
- Real RootEncoder GL transition rendering/filter retirement on Android hardware.
- Preset switching with fades during an actual RTMP session.
- Screensaver runtime and StreamingIn interoperability.

## Next priority

Investigate screensaver behavior from available APK evidence before implementation. Do not invent screensaver semantics. Verify fade rendering on device before expanding transition type coverage.
