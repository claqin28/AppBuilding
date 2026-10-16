# AI usage disclosure

This project was built with help from an AI coding assistant (Claude, by Anthropic,
through Claude Code). This file lists which parts the AI generated and which parts
I wrote. I update it at every milestone.

## What I (the student) did

- Came up with the project idea, the problem framing, and the full feature spec
  (milestones M1–M7, constraints, evaluation plan).
- _To fill in as I go: code I write or substantially change myself, testing with my
  own webcam, results I collect, design decisions I make._

## What the AI generated

### M1: camera and live debug view (2026-10-16)
- Project scaffolding: `package.json`, `tsconfig.json`, `vite.config.ts` (including the CSP),
  `.gitignore`, `scripts/copy-wasm.mjs`.
- `src/vision/landmarker.ts`, `src/vision/camera.ts`: model loading and camera access,
  based on the official MediaPipe Face Landmarker web guide (credited in code comments).
- `src/signal/types.ts`, `src/signal/quality.ts`: the frame type plus the position and lighting checks.
- `src/ui/debugView.ts`, `src/main.ts`, `index.html`, `src/styles.css`: the UI.
- `tests/quality.test.ts`: unit tests.
- The text of `DECISIONS.md` and `README.md`.
- Research: checked the current MediaPipe API and what Google's Project Gameface does today.

## Third-party code and assets (neither AI nor me)
- The `@mediapipe/tasks-vision` library and the `face_landmarker.task` model, © Google, Apache-2.0.
