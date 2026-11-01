# Project memory

## Product intent & audience

- Vite + React project. Specific product purpose and target audience not yet defined.

## Brand personality & voice

- Not yet established.

## Visual design & UX direction

- No visual or UX direction inferred yet.

## Decisions, constraints & rationale

- Framework: Vite + React (vite-react).
- Vite version in use is Vite 8, which requires esbuild `^0.27.0 || ^0.28.0`.
- esbuild was bumped from `^0.25.0` to `^0.28.0` to resolve peer dependency conflict.
- Stale lock file pinning old esbuild was removed; dependencies reinstalled fresh.
- Production build now succeeds.
- Known informational warning: main JS chunk is 578 kB (bundle size notice, non-blocking).

## Open questions & assumptions

- Product purpose, audience, visual design, and brand voice still undefined.
- Bundle size warning may warrant code-splitting or lazy loading if it grows or becomes a concern.