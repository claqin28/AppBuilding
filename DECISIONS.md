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

## Context change (2026-10-16)

- **This is a personal project for family, not a contest entry.** There's no deadline.
  Getting it right for the real user matters more than finishing every milestone.
- **The web app's limit is stated up front.** A browser page can't control other apps.
  Android Camera Switches and Apple Switch Control can, so the README compares them
  honestly. This app's own job is to measure which gestures work for a person and to
  provide in-page communication (keyboard plus speech).
- **The evaluation measures usefulness and frustration.** False activations during
  conversation rank first, because that's what makes people give up on a tool.

## Scope, from the project owner's answers (2026-10-16)

- **Target users:** adults with limited or no hand and arm movement who can make some
  voluntary facial movements and control their head. Speech may be weak, tiring, or hard
  to understand. There's no specific user yet. Testing will be with able-bodied
  volunteers, and the README must say so. No user-validation claims.
- **No hardcoded gesture set.** The candidate list is only what calibration *tests*;
  calibration decides per person.
- **Complementary to voice control,** never claimed to beat it.
- **No speech recognition** (Chrome's sends audio to a server).
- **Primary use:** build a message with the scanning keyboard and speak it, plus quick
  phrases. No video calls, reading, or emergency-call features. An optional attention
  chime later must be labeled as not an emergency system.
- **Devices:** desktop Chrome on a laptop is the only supported, tested target. Mobile is
  best effort and is not claimed.

## M2 calibration and M3 control (2026-10-16)

Built together because calibration's "Try it" check uses the M3 control engine.

**Privacy finding**
- `@mediapipe/tasks-vision` 1.1.1 creates a usage logger for every task. It tries to
  POST stats (task type, running mode, timing counters) to
  `https://odml.pa.googleapis.com/v1/log` every 60 seconds and has no public off switch.
  My 10-second M1 test was too short to catch it. Fix: the CSP is now applied to the dev
  server too (it was production-only), and privacy tests run longer than 60 s. Verified:
  in a 70 s run the browser blocked the request and none went out. I chose not to patch
  the library's internals, because it's minified and fragile across versions, and the
  CSP covers it.
- **TTS uses on-device voices only** (`localService === true`), and the voice is always
  set explicitly. Chrome's "Google …" voices send text to a server.

**Signals**
- Paired movements (smile, frown) use the **larger side**, so one-sided weakness still works.
- Wink = `eyeBlinkLeft − eyeBlinkRight`, so ordinary two-eye blinks cancel out.
- Head movements are not candidates yet. Many target users have good head control, so
  this is a strong future addition (MediaPipe can output a head-pose matrix).

**Calibration** (`src/signal/calibration.ts`)
- **Rest includes 10 s of natural movement (talking, looking around),** not just a still
  face. The thresholds must sit above what everyday movement produces, because false
  activations during conversation are what make people give up on a tool.
- **Held peak** (highest level kept for the hold time) instead of the raw maximum, so
  "would this try have worked" matches live control exactly.
- **Same smoothing (80 ms) and hold (250 ms) as live control.** If someone changes the
  hold time a lot in Settings, the UI recommends recalibrating.
- `restLevel` = 98th percentile of rest, so one cough or swallow doesn't set the level.
- `on` halfway from rest to the typical try, `off` halfway from rest to `on`, and `on`
  never above 0.9. Halfway leaves room for weaker tries on a tired day while staying
  clear of rest. These are judgment calls to revisit with real data.
- **Leave-one-out hit rate,** so tries aren't graded against a threshold they helped set.
- **AUC against rest windows of the same length as a try** (compares like with like).
- Usable only if: ≥3 tries, gap ≥ 0.10, AUC ≥ 0.90, hit rate ≥ 0.80.
  Score = hitRate × AUC × min(1, gap/0.30).
- "Skip" discards that movement's tries. A try interrupted by Pause is redone, not kept.
- Calibration won't start until a face is visible.
- **Open question (needs real data):** the hold time filters out short jaw movements
  from talking, so a mouth-open only a bit bigger than talking can still pass, weakly
  (score ~0.4 in synthetic tests). Synthetic talking is too regular to trust here. The
  60 s talking test in M4 has to check this on real people.

**Selection** (`src/signal/selection.ts`)
- Conflict = worse direction of cross-talk. A pair is not allowed at ≥ 0.5.
- **Exhaustive search** over groups (≤220), so the best group is guaranteed, not
  approximated by a greedy pick.
- Best movement → SELECT (used most, and the only one auto-scan needs), then NEXT, BACK.
- A helper can override the mapping. The UI warns about unreliable or conflicting choices.

**Control** (`detector.ts`, `engine.ts`)
- The detector **starts in "holding"**, and resets to it when the face is lost for more
  than 300 ms, so a gesture already in progress never fires by itself.
- While pending, dropping below **`on`** (not `off`) cancels. This keeps the hold rule
  identical to calibration's held peak.
- **One at a time** across gestures, plus a **shared cooldown** (400 ms).

**Keyboard** (`src/keyboard/`)
- Letters in English frequency order. The command row (Speak, Space, Delete, Phrases,
  Pause) comes first, and scanning restarts at the top after each choice.
- The first item dwells 1.5× longer. Auto-scan backs out of a row after 2 passes.
- Scan speed is limited to 0.5–4 s per step, so the highlight changes at most 2 times
  per second, under the 3 Hz flashing limit.
- **Pause** stops scanning during conversation. **Resume** needs SELECT held about 1 s
  longer than usual, which is harder to trigger by accident. A helper can also click Resume.
- Phrases are one per row, so one SELECT speaks a phrase. The phrase list includes
  "I need help", with a visible note that the app is not an emergency system.
