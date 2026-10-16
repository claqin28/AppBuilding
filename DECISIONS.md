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

## Plan update: sharing constraint, quick phrases, share/export, word prediction (2026-10-16)

**New hard constraint (from the project owner):** any sharing or export must be
user-initiated and local-only (copy, download, or the Web Share API). Nothing is ever
sent automatically or to a server.
- **Audit of existing code:** compliant. The only export is "Download calibration
  recording", which runs only when that button is clicked (`src/ui/resultsScreen.ts`).
  There are no `fetch`, `XMLHttpRequest`, `sendBeacon`, WebSocket, clipboard, or share
  calls in `src/`. The CSP still blocks any network request to another site.
- "Local-only" for Web Share means the content goes to an app the person picks on
  their own device. The app itself never sends it anywhere. The UI must say this.

**Order and priority (from the project owner):** M4 → M5 → quick phrases → share/export
→ word prediction. Priority if time is tight: M1–M4, then M5, then quick phrases +
share/export, then word prediction. Practice games (M6) are cut first. The new
features are numbered M8–M10 so the original M6/M7 keep their names. See `PLAN.md`.
- *Recommendation awaiting approval:* do M7's public link and offline install early,
  since volunteers need a link to test.

**Browser rules that shape M9 (checked 2026-10-16):**
- `navigator.share()` **requires transient user activation** (a real click or key
  press). The W3C spec rejects calls without it with `NotAllowedError`, and Mozilla's
  test suite confirms it. **A face gesture detected by the camera does not count as
  user activation.** So Share… can only be a helper-clicked button.
- In Chromium 141 on Linux, `navigator.share` doesn't exist at all. It must be
  feature-detected and hidden when missing.
- Clipboard: in Chromium 141 (headless), `writeText` worked **without** a click once
  the clipboard-write permission was granted. Chrome normally grants it to the active,
  focused tab. Firefox and Safari require a click. **To verify on real desktop
  Chrome** before relying on Copy from a face gesture.
- Downloads started without a click worked in that headless test. Real Chrome may ask
  "allow multiple downloads?" the first time. **To verify.**
- Result: Copy and Save-as-.txt are planned as scan-reachable keys (under "More", so
  they don't slow typing). Share… is helper-only.

**Quick phrases (M8):** the basics already exist from M3. Remaining: an editable,
locally stored list; "save message as phrase" by scanning; the "spoken aloud only,
does not alert anyone" label shown on the phrase screen itself (not just at the bottom
of Talk); and a cap of about 12 phrases, since each row costs scan time.

**Progress report (M9b):**
- Excluded by default: typed text, raw facial-signal recordings, and the learned word
  list. The spec required leaving out typed text. I extended that to the recordings
  and the word list: recordings are detailed per-person facial data, and the word
  list reveals what was said. Only typed text gets an opt-in checkbox, unchecked each
  time.
- A printable summary page plus JSON/CSV, with a preview of exactly what will be in
  the file.

**Word prediction (M10):**
- My own trie and ranking, explained in `WALKTHROUGH.md` §5. Ranking interpolates
  bundled frequencies with personal ones, using λ = n/(n+50).
- **The word list isn't chosen yet, on purpose.** Requirement: redistribution allowed
  with at most attribution (MIT/BSD/Apache/CC0/CC BY), verified from the source's own
  LICENSE file, recorded in `ATTRIBUTION.md`, and screened for offensive words.
  Leads found so far, *not yet verified*:
  - **SCOWL** (Kevin Atkinson): Debian's copyright file shows a permissive MIT-style
    grant. But it gives commonness *levels*, not true frequencies.
  - **wordfreq**: its code is MIT, but its *data* carries several licenses, with
    attribution terms from its sources. Any share-alike component would rule it out
    under "permissive".
  - **google-10000-english**: license unclear. Avoid unless clarified.
  - Possible complement: a small conversational core list written by the project owner.
- **Keystroke savings is not the goal; typing speed is.** Research on word prediction
  for switch users has found that savings often don't turn into speed (see
  WALKTHROUGH §5). M4's evaluation measures both, on the same fixed phrases.
- Where the suggestion row goes involves a trade-off. At the top, it costs a scan step
  on every letter. At the bottom, it's slow to reach. Start with a top row of up to 4
  suggestions, then compare with the scan-step simulator before testing with people.

## Public link on GitHub Pages (2026-10-16)

- Approved by the project owner so volunteers can test from a link without installing.
- **GitHub Actions builds and publishes** (`.github/workflows/deploy-pages.yml`) on each
  push to `main`, rather than committing built files to a branch. Tests must pass
  before publishing, and the site can never drift from the source. Actions are pinned
  to their current major versions (checkout v7, setup-node v7, upload-pages-artifact
  v5, deploy-pages v5).
- **Only the two wasm variants the app can load** (SIMD and no-SIMD) are copied. The
  "module" variant is only used with `useModule=true`, which this app doesn't use.
  The deployed size dropped from 43 MB to 30 MB. Users download only one variant
  (about 13 MB, plus the 3.7 MB model) on first load.
- **The README states what the host sees:** GitHub receives normal request info (IP,
  browser) when files are downloaded, like any website, but never camera data or text.
- The CSP is a `<meta>` tag, so it works on GitHub Pages, which can't set custom headers.

## Spec update: Tessera, locked stack, new order, safety rules, face visualization (2026-10-16)

**Name:** the project is now **Tessera**. The README, page title, and header are updated.

**Stack: React is locked, but the current UI isn't React.** The first spec said
"vanilla TypeScript, no UI framework", so M1–M3's UI was written as plain DOM code. The
locked stack is React + TypeScript + Vite, so the next step (**R** in `PLAN.md`) moves
only the UI layer to React. The signal, keyboard, and vision modules are already
framework-free and stay as they are. The camera loop stays outside React (rAF + refs).
This is aligning to the locked stack, not changing it.

**Milestone numbering now follows the owner's spec:** M5 drift, M6 quick phrases, M7
share/export, M8 word prediction, M9 practice games (first to cut), M10 polish + PWA.
Older entries in this file that say "M8 quick phrases / M9 share / M10 prediction"
refer to the previous numbering: old M8 = M6, old M9 = M7, old M10 = M8, old M6 = M9,
old M7 = M10.

**New steps:** a **hardening pass (H)** after M4, with no new features. **Face
visualization** in two tiers, V1 (with M1–M2) and V2 (after M4 + H, before M6–M8). If
time is tight, M9 is cut before the visualization.

**M4(c) changed to three conditions:** (1) default fixed gestures and thresholds, (2) the
same fixed gestures with one-pass user-set thresholds (like hand-tuned tools), and (3)
Tessera's automatic selection. All are reported, even if (3) doesn't win. Condition 2
is the fairer comparison: it tests whether *automatic* selection beats a person tuning
by hand, which is what existing tools offer.

**Safety rules, checked against the current code:**
- *Face lost → pause control:* **this was violated.** Auto-scan kept moving when the
  face was lost; actions couldn't fire, but the highlight moved on. **Fixed now:**
  scanning stops, the keyboard dims, and the message reads "Paused: can't see your
  face…". When the face returns, `Scanner.hold()` keeps the highlight in place for the
  longer first-item wait. Tested: unit test plus a replay with a 6-second face gap
  (the highlight stayed on the same row the whole time).
- *Never fire random actions:* the engine fires nothing without a face, and the
  detector must see the person relax after the face returns (from M3).
- *Tracking state always visible:* the Talk status now starts with "Tracking" or
  "Paused". **A global tracking/paused/calibrating indicator is still to do** (R + H).
- *Pause shortcut:* there's a Pause key (gesture) and a helper button. **A keyboard
  shortcut is still to do** (R).
- *Backspace/undo:* Delete exists. **Undo for "Clear all" is still to do** (R).
- *Speak only on explicit selection:* already true (the Speak key or a chosen phrase).
- *"Tracking uncertain"* (low framerate, multiple faces) is handled in H.

**Claims audit:** the README never says existing tools lack customization. Its table
says Camera Switches, Switch Control, and Gameface are all tuned by hand, which is
accurate. It already says voice control may be better for people with reliable speech.

**Face visualization decisions**
- **What "mesh only" protects:** it keeps the camera image off the screen (for screen
  sharing, demo videos, and bystanders). It does *not* change what's processed, since
  frames never leave the device in either mode. The UI must say this accurately and
  not imply extra data protection.
- **The transformation matrix question (checked 2026-10-16):** the official docs site
  was unreachable from the dev environment. I checked the package's type
  documentation and ran a live test with `outputFacialTransformationMatrixes: true`:
  - It returns one **4×4 matrix** per face: rotation plus translation, stored
    column-major. On the frontal test photo the rotation was near identity and the
    translation was about (−0.4, 22.5, −65.4), which looks like centimetres. The docs
    describe it as transforming the canonical face to the detected face.
  - **It helps Tier 2:** its inverse removes head pose, so the 3D mesh can stay steady
    while the head moves. It would also enable head-movement gestures later (proposed,
    not approved).
  - Each face also has **478 landmarks with x, y, z**. The mesh connections come as
    **2,556 edges** (`FACE_LANDMARKS_TESSELATION`), *not triangles*. Tier 2 either
    draws the mesh as colored lines/points, or derives triangles from the edges. Decide
    at V2.
  - *To verify yourself:* read the official Face Landmarker web guide and confirm the
    matrix's description and units.
- **Generic vs. personal face shape for the movement map (recommendation):** color a
  **generic face mesh**, not the person's own face geometry, in anything stored or
  exported. A person's 3D facial geometry is more identifying than movement scores.
  A generic mesh carries the same information (which regions work, by how much)
  without storing what someone's face looks like. The live view can use their real
  landmarks in memory only. This needs owner approval.
- **Three.js** (MIT, free) is lazy-loaded with a dynamic `import()` into its own file,
  served from this site, so it fits the CSP. It goes in `ATTRIBUTION.md` when added.
- **Colors** come with numbers and a legend, and the palette is checked for
  color-vision deficiency. The view renders on demand (when data changes), not in a
  constant loop.
- **The pure parts stay testable:** gesture → face-region mapping and region scores are
  plain TypeScript in `src/signal/`, with no React or Three.js imports.

**DEMO_CHECKLIST.md added:** what the 3-minute video should show, as a checklist, not a
script.
