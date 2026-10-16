# Decisions

A short record of key choices and the reasons for them. Newest entries are at the bottom.

## M1 (2026-10-16)

- **MediaPipe `@mediapipe/tasks-vision` 1.1.1, pinned exactly.** This is the latest stable
  release. The API names (`FilesetResolver.forVisionTasks`, `FaceLandmarker.createFromOptions`,
  `detectForVideo`, `outputFaceBlendshapes`) were checked against the type definitions
  shipped in the package. The docs site couldn't be reached from the dev environment.
  All dependency versions are pinned, so a build in two weeks behaves the same as today's.
- **The model and the WebAssembly runtime are served from our own origin.** The model
  (`face_landmarker.task`, float16 v1, sha256 `64184e22…bc9ff`) is committed in
  `public/models/`. `scripts/copy-wasm.mjs` copies the wasm runtime out of `node_modules`
  before each dev or build run, so it always matches the installed library version.
  With no CDN, the demo works offline and in front of judges on bad Wi-Fi.
- **Production builds have a Content-Security-Policy with `connect-src 'self'`.** This turns
  "no data leaves the device" from a promise into a rule the browser enforces: it blocks
  any request to another site. The dev server is exempt because live reload needs a websocket.
- **Only the preview is mirrored, never the model input.** MediaPipe's type docs state that
  `*Left/*Right` blendshapes refer to the subject's own face and that a mirrored input swaps
  them. CSS `scaleX(-1)` on the `<video>` keeps the mirror feel without corrupting the data.
- **GPU delegate with CPU fallback.** The GPU is faster where it's available, and the CPU always works.
- **The camera starts only on a button press.** Users and caregivers see what's about to
  happen before the permission prompt appears.
- **Pure code lives in `src/signal/` (no DOM, no camera).** It takes plain `BlendshapeFrame`
  objects, so it can be unit-tested and later driven by recorded traces.
- **The UI redraws at about 15 Hz; the model runs on every new camera frame.** People can't
  read faster than that, and skipping redraws leaves more CPU for the model.
- **Setup checks are rules of thumb:** face width 20–75% of the image, face centered within 20%,
  nose within 15% of the face center, mean brightness 60–200, under 25% blown-out pixels.
  They're named constants in `src/signal/quality.ts` and need tuning on real webcams.
- **Observation from the first test (not a result):** on a still photo of a smiling face with
  a neutral brow, `browDownLeft/Right` read about 0.75. A blendshape's resting level can sit
  far from 0 for a given face, and that is the reason calibration starts with a rest baseline
  instead of a fixed threshold.
