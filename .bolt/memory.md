# Project memory

## Product intent & audience

- Vite + React project. Specific product purpose and target audience not yet defined.

## Brand personality & voice

- Not yet established.

## Visual design & UX direction

- No visual or UX direction inferred yet.

## Decisions, constraints & rationale

- Framework: Vite + React (vite-react).
- Intended package manager: **Bun** (`bun.lock` is the canonical lockfile).
- Vite version in use is Vite 8, which requires esbuild `^0.27.0 || ^0.28.0`.
- esbuild bumped from `^0.25.0` to `^0.28.0` to resolve peer dependency conflict.
- Verified esbuild resolves to **0.28.2** via `bun pm ls esbuild`.
- Bun 1.4.4 was installed in the environment to run verification commands.
- `bun.lock` has been regenerated and is now in sync with `package.json`.
- `bun install --frozen-lockfile` now succeeds (274 installs, 364 packages).
- `bun run build` succeeds: 1698 modules transformed in ~3.5s, output to `dist/`.
- CI workflow (`.github/workflows/android.yml`) uses `bun install --frozen-lockfile`.
- A stale `package-lock.json` from an earlier npm install still exists untouched.

## Open questions & assumptions

- Whether to remove the stale `package-lock.json` — deferred until explicit user approval.
- Product purpose, audience, visual design, and brand voice still undefined.
- Bundle size warning (578 kB main bundle) is non-blocking; may warrant code-splitting or lazy loading if it grows or becomes a concern.