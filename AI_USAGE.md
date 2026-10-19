# AI usage record

This project is built with help from an AI coding assistant (Claude, by Anthropic,
through Claude Code). It's a personal project, not a contest entry, but I keep an honest
record of which parts were generated and which parts I decided or wrote.

## What I (the project owner) did

- The project idea, problem framing, and full feature spec (M1–M7, constraints,
  evaluation plan).
- Scope decisions (2026-10-16): target users; positioning as complementary to voice
  control; no speech recognition; primary use = message building + speech + quick
  phrases; no emergency, video-call, or reading features; desktop Chrome as the only
  supported target.
- Plan update (2026-10-16): the sharing/export constraint (user-initiated,
  local-only); added saved quick phrases, local share/export with a progress report
  (no typed text by default, opt-in to include it), and word prediction with my own
  trie, measured with prediction on vs. off; set the new priority order (practice
  games cut first).
- Spec update (2026-10-16): the name Tessera; the locked React stack; the new
  milestone order with a hardening pass; M4's three-condition comparison; the safety
  rules; the face visualization feature in two tiers; DEMO_CHECKLIST.md (I write
  the video script myself).
- Plan update (2026-10-19): onboarding with guest and local-profile paths;
  memory-only guest mode with a one-time report; IndexedDB profiles with history,
  backups, and storage warnings; the 3D head (wireframe first, solid mesh only if
  licenses allow); the new priority order.
- _To fill in as I go: code I write or change myself, testing with my own webcam,
  results I collect, design decisions I make._

## What the AI generated

### M1: camera and live debug view
- Project scaffolding (`package.json`, `tsconfig.json`, `vite.config.ts` with CSP,
  `.gitignore`, `scripts/copy-wasm.mjs`).
- `src/vision/landmarker.ts`, `src/vision/camera.ts` (based on the official MediaPipe
  Face Landmarker web guide, credited in comments).
- `src/signal/types.ts`, `src/signal/quality.ts`, `src/ui/debugView.ts`, `index.html`,
  `src/styles.css`, `tests/quality.test.ts`.

### M2 + M3: calibration, selection, control engine, scanning keyboard
- Signal processing: `src/signal/gestures.ts`, `smoothing.ts`, `trace.ts`,
  `detector.ts`, `engine.ts`, `calibration.ts`, `selection.ts`, `explain.ts`,
  `profile.ts`.
- Keyboard logic: `src/keyboard/scanner.ts`, `layouts.ts`, `typing.ts`.
- Camera/replay sources: `src/vision/tracker.ts`.
- UI: `src/main.ts`, `src/ui/*` (app shell, camera check, calibration, results,
  meters, talk, settings, speech, storage, DOM helpers), `index.html`, `src/styles.css`.
- Tests: `tests/synth.ts` (synthetic data generator), `tests/detector.test.ts`,
  `tests/engine.test.ts`, `tests/calibration.test.ts`, `tests/keyboard.test.ts`.
- Docs: `README.md`, `DECISIONS.md`, `WALKTHROUGH.md`.
- Research and checks: MediaPipe API verification, comparison with Project Gameface,
  Android Camera Switches, and Apple Switch Control; headless-browser end-to-end tests;
  finding and documenting MediaPipe's usage logger.

### Plan update (2026-10-16)
- `PLAN.md`, `ATTRIBUTION.md`, the new sections in `DECISIONS.md` and `WALKTHROUGH.md`
  §5 (word prediction design), README updates.
- Checks: Web Share and clipboard user-activation rules (W3C spec plus a test in
  headless Chromium 141), and a first look at word-list licenses (not yet verified).

### Spec update (2026-10-16)
- Rewrote `PLAN.md`, added a `DECISIONS.md` entry and `DEMO_CHECKLIST.md`, and renamed
  the app in the UI and README.
- Safety fix: auto-scan pauses when the face is lost (`src/ui/talkScreen.ts`,
  `Scanner.hold()` in `src/keyboard/scanner.ts`, plus a test).
- Checks: a live test of MediaPipe's facial transformation matrix and mesh data.

### Audit + plan update (2026-10-19)
- An audit of M1–M4 and the hardening pass (re-ran all tests and the browser checks).
- `PLAN.md` statuses and the new sections (G, V2a, P, V2b), the `DECISIONS.md` entry,
  and `WALKTHROUGH.md` §6 (storage schema) and §7 (movement-map colors), written as
  designs.
- Checks: Three.js and MediaPipe licenses, MediaPipe's connection sets and triangle
  data, and the left/right convention, all tested in code.

## Third-party code and assets (neither AI nor me)
- `@mediapipe/tasks-vision` library and `face_landmarker.task` model, © Google, Apache-2.0.
