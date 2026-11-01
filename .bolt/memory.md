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
- esbuild was bumped from `^0.25.0` to `^0.28.0` to resolve peer dependency conflict.
- A stale `package-lock.json` was created by an npm install; this should not have happened and should not be relied on.
- `bun.lock` is currently out of sync with `package.json` (esbuild version mismatch).
- CI workflow (`.github/workflows/android.yml`) uses `bun install --frozen-lockfile`, so lockfile must match `package.json` or CI fails.
- To regenerate lockfile: run `bun install` (requires Bun installed in the environment). This updates only `bun.lock`; does not touch source code or upgrade unrelated deps.
- Production build succeeds under current dependency state.

## Open questions & assumptions

- Bun is not installed in the current environment; lockfile regeneration must be done where Bun is available.
- Whether to remove the stale `package-lock.json` — deferred until explicit user approval.
- Product purpose, audience, visual design, and brand voice still undefined.
- Bundle size warning may warrant code-splitting or lazy loading if it grows or becomes a concern.