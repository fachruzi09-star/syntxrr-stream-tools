# Project memory

## Product intent & audience

- Vite + React project. Specific product purpose and target audience not yet defined.
- App includes text-to-speech functionality for live event narration, deployed to Android via WebView (GitHub Actions workflow in `.github/workflows/android.yml`).

## Brand personality & voice

- Not yet established.

## Visual design & UX direction

- App has a `LiveCenterView` component with a TTS test button.
- User interaction patterns: first user gesture (pointerdown/keydown) is used to prime the TTS engine.

## Decisions, constraints & rationale

- Framework: Vite + React (vite-react).
- Intended package manager: **Bun** (`bun.lock` is the canonical lockfile).
- Vite 8 requires esbuild `^0.27.0 || ^0.28.0`; esbuild at `^0.28.0` (resolves to 0.28.2).
- `bun install --frozen-lockfile` succeeds (274 installs, 364 packages).
- `bun run build` succeeds: 1698 modules transformed, output to `dist/`.
- A stale `package-lock.json` from an earlier npm install still exists untouched.

- **P0-1 TTS fix** — Android WebView `speechSynthesis` silently fails without user-gesture unlock. Three-part fix:
  - **Gesture priming**: `prime()` sends silent (volume 0) utterance to unlock engine; called on first user interaction (one-time pointerdown/keydown listener in App.tsx) and explicitly before test button and live event triggers.
  - **Queue-aware cancel**: `cancel()` only fires when a pending utterance is queued behind an active one — prevents killing slow-starting Android speech.
  - **Voice loading retry + resume timer**: exponential retry (up to 5 attempts) for delayed Android voice init; periodic `synth.resume()` if engine pauses (backgrounding/stalls).
- TTS service interface unchanged (`speak`, `speakEvent`, `stop`, `updateConfig`) — no call-site modifications needed.

## Open questions & assumptions

- Whether to remove the stale `package-lock.json` — deferred until explicit user approval.
- Product purpose, audience, visual design, and brand voice still undefined.
- Bundle size warning (578 kB main bundle) is non-blocking; may warrant code-splitting or lazy loading.
- P0-1 TTS fix needs validation on a real Android device — WebView speech engine behavior varies by device and Android version.