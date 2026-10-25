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

## Audit + plan update: onboarding, guest mode, local profiles, 3D head (2026-10-19)

**Audit method:** re-ran everything on the current code.
- Unit tests (86 pass), typecheck, and build all pass, and GitHub's `main` matches local.
- The last 2 deploys succeeded.
- Five headless-Chrome checks pass:
  1. a replayed synthetic calibration → save → step-scan typing produced the expected
     letter
  2. face lost for 6 s → scanning paused
  3. no face → calibration refuses to start
  4. the real calibration flow through a fake camera playing a still photo, with Skip
  5. production build, camera on for 70 s → MediaPipe's logger blocked, zero outgoing
     requests

The table in `PLAN.md` records each milestone's status.

**Gaps found by the audit:**
- The UI isn't React yet (plan step R).
- M2 reports time-to-*fire*, not time-to-*peak*.
- M3 is missing: an always-visible tracking badge, a pause keyboard shortcut, and undo
  for Clear.
- `numFaces: 1` means a second person leaning in could be tracked instead (added to H).
- Speech output has never actually been heard, because headless Chrome has no voices.
- **M4 is not started. The hardening pass is not started** (except face-lost pause,
  the no-face guard, and the CSP).
- The browser checks are scratch scripts outside the repo, so they can't be reproduced
  from the repo yet. H moves them in as replay regression tests.

**Order:** the owner's new priority is M1–M4 + H, then G (guest report) → V2a
(wireframe head) → P (profiles) → V2b (solid mesh), with M9 cut first. Open question:
where M5 goes (recommendation: right after H). The progress-report part of M7 merges
into G/P as one shared report module.

**Guest mode is memory-only.** It uses no localStorage, sessionStorage, or IndexedDB,
so a reload erases it too, and the UI says so. This needs a storage layer that can
turn writes off, since the current code always writes to localStorage. The browser's
own memory of the camera permission isn't app data, and isn't affected.

**Local profiles (IndexedDB), with honest limits.**
- They're **not protected from other people using the same browser.** There's no
  server, so a password could only be checked locally, which would protect little and
  could lock out the owner. The UI states this instead of implying privacy it doesn't
  have.
- Private browsing **can't be detected reliably**, so warnings are based on signs
  (refused `navigator.storage.persist()`, a failed open, an unusually small quota) and
  say "may be erased".
- Only **summary numbers** are stored. Raw recordings, landmarks, typed messages, and
  video are never stored (WALKTHROUGH §6).
- Each migration is a pure function, so it's testable.
- Charts are plain SVG, with no chart library (keeps dependencies minimal).

**3D head: verified data and licenses (2026-10-19).** The official docs site was
unreachable from the dev environment again, so I checked these directly:
- **Connection sets in `@mediapipe/tasks-vision` 1.1.1 (Apache-2.0):** `LIPS`,
  `LEFT/RIGHT_EYE`, `LEFT/RIGHT_EYEBROW`, `LEFT/RIGHT_IRIS`, `FACE_OVAL`, `CONTOURS`,
  `TESSELATION`. Read from the package types and listed at runtime.
- **Triangulation is available:** the 2,556 tesselation edges are exactly **852
  triangles**. Every group of 3 consecutive edges closes into a triangle; checked in
  code. The highest index is 467, so the triangles cover the 468 face landmarks (not
  the 10 iris points).
- **Separately, MediaPipe's repo** (google-ai-edge/mediapipe, Apache-2.0, `BUILD` says
  `licenses(["notice"])`) has `canonical_face_model.obj` (468 vertices, 898 triangles)
  and `face_model_with_iris.obj` (478 vertices, 906 triangles). This is a *different*
  triangulation: 434 triangles are shared with the package's 852. That overlap strongly
  suggests the same vertex numbering as the landmarks, but it isn't proven.
- **Decision:** use the package's 852 triangles. They're already in a dependency, so no
  extra file is needed. **A solid mesh is allowed** (Apache-2.0 is compatible).
  Triangle winding is unchecked, so the first version renders both sides.
- **Left/right:** MediaPipe's `LEFT_EYE` / `LEFT_EYEBROW` sets sit on the person's own
  left (on a test photo, their x positions fell on the image's right in the unmirrored
  frame). That matches `eyeBlinkLeft`. Checked on one frontal photo only.
- **Three.js:** version 0.186.1, MIT. OrbitControls comes inside the same package.
  Both are added to `ATTRIBUTION.md` when built.

**Movement map: real face shape vs. generic face (needs owner decision).** The new spec
says to render from the person's live landmarks, so the live view uses their real face
shape, in memory only. The open question is the **exported image.** A wireframe of
someone's real face shape is more identifying than the colored numbers it carries.
*Recommendation:* export on the generic canonical face by default, with an option to
export the real shape. Until decided, the export uses the generic face.

**Color mapping (WALKTHROUGH §7):**
- Reliability or range is shown one at a time, never mixed into one color.
- A region's value is the highest value among its gestures, and the labels list each
  gesture separately.
- "Not tested" is gray, which is different from 0%.
- 5 bins from a sequential palette that gets lighter as values rise and is checked for
  color-vision deficiency.
- There's always a legend, labels, and a numbers table.

## 3D face map built (V2a) + M4 inputs decided (2026-10-22)

**Owner decisions:**
- **Build order:** V2a, the 3D head, goes *before* M4. Volunteer testing comes after.
  The cost is that the technical result (M4) is pushed back. To avoid redoing work,
  the 3D code is split into pure logic (`src/signal/movementMap.ts`), a renderer
  (`src/viz/head3d.ts`), and a thin screen. Moving the UI to React later only means
  rewrapping the screen.
- **The M4 "Default" condition:** open mouth = SELECT, raise eyebrows = NEXT, smile =
  BACK, `on` = 0.5. I chose `off` = 0.35. Smoothing, hold time, and refractory period
  are the same as in the other conditions, so only the gestures and thresholds
  differ.
- **The M4 test phrases** were written by the owner (8 phrases, `src/evaluation/setup.ts`).

**What I verified before building:**
- **The standard face uses the same point numbering as the live landmarks.** MediaPipe's
  `canonical_face_model.obj` (468 points) compared with landmarks from a test photo:
  the distance patterns between points correlate at **0.98**, versus **−0.01** when the
  numbering is shuffled.
- **The standard face's axes:** +x = the person's left, +y = up, +z = toward the viewer,
  in centimetres. So point *i* on the standard face is landmark *i*.
- **The palette** (the 5 blues): checked with the dataviz palette validator in ordinal
  mode against this app's dark background (#0f1115), and every check passed.
  - Lightness changes in one direction, each step is visibly different from the next,
    there's a single hue, and the darkest step is 2.85:1 against the background.
  - A first, darker version passed too, but its darkest step was only 2.33:1, too faint
    for thin lines, so I shifted the ramp one step lighter.

**Design decisions:**
- **Wireframe + points from the package's own tesselation** (unique edges of the 852
  triangles). No extra mesh file is needed. The solid mesh stays for V2b.
- **The live head follows the person's head turns; there's no pose correction.** That
  literally mirrors them in real time and avoids sign-convention bugs in matrix math
  that I couldn't test (I have no photo of a turned head). The transformation matrix
  is still available for later.
- **Mirror view** (the person's left on the screen's left), matching the camera preview.
  The text labels say "your own left".
- **Exports use the standard face and the front view,** never the person's own face
  shape. This applies my earlier recommendation, since the owner didn't choose
  otherwise. It's easy to change if the owner wants a real-shape option.
- **Lazy loading:** Three.js is in its own 553 kB file (137 kB compressed), downloaded
  only when the Face map opens with the 3D view on. The main app grew by 8 kB
  compressed (the standard face data and regions). WebGL is checked *before*
  downloading. If there's no WebGL, a message points to the table, and Three.js is
  never downloaded (verified with WebGL disabled).
- **Rendering:**
  - Renders on demand, with no constant loop.
  - Live shape updates are capped at 20 per second.
  - No auto-rotation, and no drifting after a drag.
  - GPU memory is released when leaving the screen or turning the view off.
- **The off switch** is remembered in settings. When it's off, the 3D code isn't
  downloaded at all.
- **Cheeks are split into left and right.** With one combined region, the label landed
  on the nose (the average of two cheeks is the middle of the face).
- **Bug found by the browser test and fixed:** "reliability" showed 100% for movements
  calibration had rejected as too small (they "hit" a threshold buried in the noise).
  Too-small or rest-like movements now show 0% reliability, with a unit test. This is
  the same trap as the earlier "Worked 5 of 5 tries" explanation bug.

**Tested (headless Chrome, with the fake-camera photo and the synthetic calibration):**
- The live wireframe renders.
- The colored standard face renders, and dragging rotates it.
- The table and labels match the numbers.
- The PNG export downloads and contains the legend, numbers, prototype label, and front view.
- The off switch removes the canvas.
- With no WebGL, the fallback message shows and Three.js isn't downloaded.
- No outside requests, no page errors, and 115 unit tests pass.

**Not verified:**
- A real moving face, real GPU, or real frame rate. The headless test ran at about
  5 frames/s on software rendering.
- Touch pinch-zoom on a real touch screen.
- iPad Safari.

## No React: the UI stays plain TypeScript (2026-10-22)

The owner decided to keep the UI in plain TypeScript instead of moving it to React.
The plan's step R is dropped. Reasons:
- It changes nothing for users.
- It saves time for M4, the technical result.
- It keeps dependencies minimal.
- The core logic (signal processing, keyboard, face-map math) never used React anyway.

The app is a web app either way; React would only have changed how the screens are
written. The earlier rules still apply in framework-free form: signal-processing code
has no UI imports, and the camera loop runs on requestAnimationFrame, separate from
the screens.

## Visual redesign (2026-10-22)

The owner asked for a nicer-looking front end. What changed and why:
- **Light and dark themes.** They follow the computer's setting, with a header switch
  (Auto / Light / Dark) that's remembered. Every color is a named token in
  `src/styles.css`, defined once per theme.
- **Contrast is checked by a script, not by eye.** `npm run check:contrast`
  (`scripts/check-contrast.mjs`) reads the tokens from the CSS and checks WCAG
  contrast in both themes:
  - body text ≥ 7:1
  - secondary text, button text, and error text ≥ 4.5:1
  - borders, focus rings, and bars ≥ 3:1

  All 30 checks pass. It also runs in the GitHub publish workflow, so a color change
  that breaks contrast can't be published.
- **The highlighted key's outline** is checked against the row around it, not against
  the key's own yellow, since separating the key from its row is the outline's job.
  The outline is 17:1 in light and 14:1 in dark.
- **Identity:** the logo is a 3×3 grid of mosaic tiles with one highlighted, like the
  scanning keyboard. A *tessera* is a mosaic tile. It's inline SVG, with no image files
  and no fonts downloaded (system fonts only), so there are still zero outside
  requests. *(Replaced 2026-10-22: see "Tech-style redesign and geometric face logo".)*
- **The always-visible tracking badge** (a safety-rule item) sits in the header:
  - Camera off → No face → Paused → Calibrating → Tracking, in that priority order, so
    "No face" always wins.
  - Each state has its own dot shape (circle, square, pause bars) plus text, so it
    never depends on color.
  - The calibration and Talk screens report their state through `ctx.setActivity()`.
- **Navigation:** numbered steps (1 Camera check, 2 Calibrate, 3 Talk), with Face map
  and Settings kept apart. There's a skip link and a footer saying "not a medical
  device, not an emergency system".
- **Unchanged:** big targets (52–64 px), no animations or transitions at all, and the
  same screen behavior. The 3D view stays dark in both themes, because its colors were
  validated against that dark background.
- Small fix: the "Press Start camera" hint now disappears once the camera is running.

Tested in headless Chrome, in both themes:
- screenshots of every screen
- the badge going Tracking → No face → Paused with a replayed recording
- the highlighted-key style
- typing via replay still works
- the face map still lazy-loads Three.js
- no outside requests and no page errors

## Onboarding, guest mode, local profiles, mosaic logo (2026-10-22)

The owner asked for: a mosaic-face logo that "clicks" together while loading;
onboarding with a short description; and a choice between signing up to save
progress or starting as a guest.

**"Sign up" became "Create a profile on this device."** The hard constraints say no
accounts and no server, so a profile is a nickname stored only in this browser
(IndexedDB). The wording avoids implying an online account, and the UI says "no email,
no password, no online account".

**Guest mode stores nothing at all.** Tested: after a full guest session there are no
databases and no localStorage keys. To make that true:
- The database is created only when a profile is created, and startup checks whether
  it exists *without* creating it.
- Settings that used to go straight to localStorage now go through the current store.

**Storage design** (WALKTHROUGH §6):
- `src/storage/` has pure `schema.ts` / `settings.ts` (12 tests), plus `profileDb.ts`
  (IndexedDB) and `store.ts` (GuestStore / ProfileStore).
- Version 1 has a migration framework, caps (20 profiles, 500 sessions each), and
  calibration stored as ~1.7 KB summaries.
- Damaged or too-new records are rejected instead of crashing the app.
- `navigator.storage.persist()` is requested, and a "may be erased" warning appears if
  the browser refuses. Headless Chrome refused, so the warning path is tested.

**Older saved data:** the old localStorage setup moves into the first profile created,
then is deleted (tested).

**Leaving or switching** (leave guest, switch profile, delete) reloads the page. That
gives a clean state with no leftovers from the previous person. The camera then needs
"Start camera" again, a small cost for a guarantee that one person's session can't
leak into the next. Saving a guest session to a profile happens without a reload.

**Profile limits stated honestly:** anyone using the same browser can open a profile.
I didn't add a password, because without a server it could only be checked on the
device, which protects little and could lock the owner out.

**Mosaic logo** (`src/ui/mosaic.ts`; *replaced the same day by the geometric face
logo, see the next section*):
- A 9×9 tile face (eyes, cheeks, smile) as inline SVG, with no image files.
- A seeded shuffle decides the order the tiles appear, plus a slight tilt per tile for
  a hand-laid look. The "click into place" animation plays once (about 1.4 s).
- **This is the app's only animation:**
  - each tile appears exactly once, so there's no flashing
  - it's turned off for people with reduced motion (tested: `animation-name: none`)
- It's used on the welcome screen and as the camera placeholder, where it replays
  while the face model loads. The header shows a static version.
- The eye color was lightened slightly after a dark-mode screenshot showed the eyes
  looking like missing tiles.

**Caregiver-assisted setup:** every onboarding step works with big buttons, and no
typing is required (nickname suggestions, or leave it blank for "Profile 1").

**Not done yet, and why:**
- **The reference site's layout and fonts** (tesseractai.web.app) are blocked from the
  dev environment, so I'm waiting on screenshots or font names. If its font is
  open-licensed, it will be stored in the app itself (no Google Fonts or other font
  CDN, which would break the no-network rule) and credited in ATTRIBUTION. I'll copy
  the *style*, not their code, logo, or text. *(Done 2026-10-22 from the owner's
  screenshot: see the next section.)*
- **The guest one-time report** waits for M4, since there are no evaluation metrics yet.
- **Profile history charts and backup export/import** are part of step P and not built.

## Tech-style redesign and geometric face logo (2026-10-22)

The owner asked for: a logo that is "a face that looks like the 3D mesh but the 2D
version", made of triangles that click together, not a smiley; and a sleeker
"tech web app" look, using a screenshot of tesseractai.web.app as the reference.

**What was taken from the reference: the style only.** Light gray page, big white
cards with very round corners, a split hero (huge, heavy, tightly spaced headline on
the left, a visual on the right), black pill buttons, and a pill "sign up" button in
the header. No code, images, logo, or text were copied (the site can't even be
reached from the dev environment; I worked from the screenshot).

**Fonts:** Inter (body) and Inter Tight (headings), both SIL Open Font License 1.1.
- **I can't confirm what font the reference site uses.** Inter Tight is the closest
  free match I know of to its heavy, tight headlines. If the owner finds the real font
  name and it's open-licensed, it can be swapped in.
- **Self-hosted, never from a font CDN:** the npm packages (`@fontsource-variable/*`,
  pinned to 5.3.0) are bundled by Vite and served from the app's own site, so the
  no-network rule still holds (tested: zero outside requests in both themes). Only
  the Latin files actually load (about 48 KB each); the other alphabets are fetched
  only if that text appears.
- The OFL requires the license to travel with the fonts, so both license texts are
  published at `licenses/`.
- Headline letter-spacing was loosened after a screenshot showed words running
  together ("speakwith"). Tight is the look; unreadable isn't.

**Logo** (`src/viz/logoMesh.ts` for the geometry, `src/ui/faceLogo.ts` for drawing):
- **Points:** first the features, taken from MediaPipe's own connection sets (face
  outline, eyes, eyebrows, outer lips, thinned out), plus a few nose points. Then the
  rest of the face is filled with *farthest-point sampling*: keep adding the standard
  face point farthest from everything chosen, until none is farther than a set
  spacing.
- **Why sampling instead of hand-picking:** my first version hand-picked ~35 extra
  points. Its triangles fanned out from the eyes and mouth into long thin slivers that
  looked noisy. Even spacing removed them: the full logo now has 104 points and 170
  triangles, and **no angle under 10°** (a unit test enforces this).
- **Triangles:** Delaunay triangulation (Bowyer–Watson, `src/viz/delaunay.ts`, own
  code with tests). It's the standard way to avoid slivers, since no point may fall
  inside another triangle's circumcircle.
- **Shading:** each triangle is shaded by which way it faces in 3D (from the dropped
  depth), lit from the upper left. On a light page, lit faces use less ink; on a dark
  page, more light, so the face looks lit from the same side in both themes. Eyes use
  the brand blue, and the lips are darker than any skin triangle, so it reads as a
  face rather than a blank mask.
- **Small sizes:** below 96 px a coarser mesh is used (49 points, 78 triangles), and
  the eyes get a same-color outline so they still show in the 48 px header logo.
- **Animation:** the triangles fly in from slightly outside and click together, once
  (about 1.3 s): on the welcome screen and as the camera placeholder while the model
  loads. Each piece appears once (no flashing), and reduced motion turns it off
  (tested: `animation-name: none`).

**Not done:** the inside screens (calibration, results, Talk) only got the new
tokens, fonts, and pill buttons, not a layout redesign. They're functional screens
used under time pressure, and big, plain, predictable controls matter more there than
looking like a landing page.

## Friendlier logo and calm blue for frustrating moments (2026-10-23)

The owner asked for: a friendlier face in the logo, and "a calming blue,
especially in the places where people might get frustrated."

**Why the old logo looked unfriendly:** the standard face has a neutral mouth
and nearly closed eyes, and the shading went from white to almost black, so
half the face was in dark shadow. It read as a stern mask.

**What changed** (`src/viz/logoMesh.ts`, `src/ui/faceLogo.ts`):
- **Soft blue tones** instead of gray to black. Shades are stretched between two
  tokens (`--logo-lit`, `--logo-shadow`), so no part of the face is darker than a
  mid blue. A small seeded variation per piece makes it look like hand-laid
  mosaic tiles.
- **Open eyes:** eye outlines are drawn 1.8 times taller than on the standard
  face, with a small white highlight in each (full size only; too small to see
  in the header).
- **A slight smile:** points near the mouth move up, the most at the corners
  (0.4 cm) and none in the middle. The lips are a medium blue, with a thin dark
  smile line where they meet.
  - My first try filled the whole lip outline dark. That made a heavy blob that
    read as a closed "O", not a smile, so I replaced it with the smile line.
- **Kept subtle on purpose:** the owner said earlier they didn't want a smiley
  face. This is a realistic face with a slight smile, not an emoji. A test checks
  that the corners turn up, but by less than 1 cm.
- The mesh tests still pass: no angle under 10°, and no overlapping points.

**Calm blue: who gets which color** (written at the top of `src/styles.css`):
- **Calm blue** (`--calm`, `--calm-soft`, `--calm-text`) for moments that can be
  frustrating but are nobody's fault:
  - camera setup hints, which now start with "→" (a next step) instead of "!"
  - the calibration card while resting and getting ready, and its "can't see
    your face" note
  - the Talk message box
  - the "No face" and "Paused" status badge
  - the face-lost status and the paused banner
  - the results note, and movements that didn't work
  - onboarding errors and the "may be erased" note
  - the camera placeholder while the model loads
  - the face map's "No face" note
- **Red** only for actions that delete things: delete profile, delete all data,
  and calibration "Stop", which throws away the run in progress.
- **Yellow** only for the scanning highlight. It has to be the most visible
  thing on the screen, so I didn't change it to blue.
- **Green** for "go" and "it worked".

**Wording changed too.** The evidence that a color by itself calms people is
weak and mixed, so I didn't rely on blue alone. The stronger reasons are:
red signals failure or danger, and these moments aren't failures; and people
cope better when told what to do next, without blame. So:
- Face lost in Talk: "Paused: we can't see your face. Take your time. Scanning
  continues when your face is back in view." This is true: tested with a
  recording where the face disappears, and scanning stays frozen until it's
  back.
- Calibration, face lost: "…or press Pause if you need a break." Calibration
  does *not* wait while the face is gone, so I didn't claim it does.
- Results, when some movements didn't work: "Not every movement works for every
  person. That's expected: Tessera only needs 1 to 3 that work for you."
  Movements that didn't work get a neutral gray stripe, not red.

**Still accessible:** states never depend on color alone (the badge has a
different shape and text per state; setup hints have ✓ or →). New contrast
checks cover every calm-blue text and border pair, and the logo's eyes and
smile against the face (all pass in both themes). The contrast script now also
fails if the two copies of the dark theme drift apart.

**Not verified:** whether this actually feels calmer to anyone. Nobody has used
it yet. A good question for the volunteer sessions: "Was there a moment you felt
frustrated? What did the screen look like then?"

## Always open on the welcome page (2026-10-23)

The owner asked for the app to always start on the landing page. Before this,
anyone with a saved profile skipped it and went straight into the app, so after
creating a test profile the owner never saw the landing page again and thought
it had been removed.

**Now:** every load opens the welcome page.
- If a profile was used last time, the hero's main button is "Continue as
  <nickname>". Returning is still one click.
- "Other options" scrolls to the full list: other profiles, a new profile, or
  guest mode.
- The page already uses that profile's saved theme, so nothing changes color when
  they continue.
- Nothing is opened or changed until a button is clicked.

**The cost, stated plainly:** if the page reloads in the middle of use (a crash,
or an accidental refresh), someone has to click "Continue as …" before face
control works again. The person Tessera is for may not be able to click. A
reload already needed a click to restart the camera, so it's one more click at
the same moment, but it's still a cost. If volunteer testing shows it's a
problem, the fix is a setting such as "open straight to Talk on this device"
(off by default). It isn't built yet.

## Floating mini-keyboard: feasibility test (2026-10-25)

The owner asked whether Tessera could have something like Cluely's floating window.
Cluely's window is hidden from screen sharing so other people can't tell it's there;
that part isn't useful for Tessera and isn't copied. The useful part is a window that
stays on top of other apps. Chrome can do that with Document Picture-in-Picture (free,
on the device). The idea is in PLAN.md as step F, not scheduled.

**The deciding question:** Tessera's camera loop runs on the page's animation frames
(`src/vision/tracker.ts:105`), and Chrome slows or stops those when a tab is hidden.
If that happens, a floating keyboard is useless.

**How it was tested:** real windowed Chrome 141 (not headless) on a virtual screen in
the dev container, with the fake camera playing a face video, on the Talk screen. I
counted how often the camera loop ran per second. Playwright, the test tool, normally
switches off Chrome's background slowdowns; I switched those defaults back on so the
test sees Chrome's real behavior.

| Situation | Camera loop runs per second |
|---|---|
| Tessera tab in front | about 6 (full speed on this slow machine) |
| Another tab in front, no floating window | 1.6 |
| Floating window open, Tessera tab in front | 6.6 |
| Floating window open, another tab in front | 7 (full speed) |
| Chrome minimized, or another app on top | **not tested**: the virtual screen has no window manager, so "minimize" did nothing |

**What this shows:** with a floating window open, tracking kept running at full speed
even with the Tessera tab hidden. Without one, it slowed to 1.6 per second. At that
rate, frames are farther apart than the engine's 300 ms face-gap limit, so the
detectors reset every frame and no gesture can fire. That's a separate problem in the
current app, added to the hardening list: the badge still says "Tracking".

**Limits of this test:**
- The page kept reporting itself as "visible" even when hidden, which suggests the
  test tool fakes that. Real Chrome may stop a hidden tab's loop completely rather
  than slowing it.
- Minimizing Chrome and putting another app on top, the realistic cases, weren't
  tested.
- So this is promising but not proof. Next check: a real Windows or macOS laptop.

## Floating window test button, and a tab icon (2026-10-25)

**Why a button:** the container can't test the realistic cases (Chrome minimized,
another app on top), so the owner needs a way to check on a real laptop. Settings →
Testing tools → "Experimental: floating window test" opens a floating window
(`src/ui/floatingTest.ts`) that shows:
- frames per second
- whether gestures can count right now, and if not, why
- the longest wait between frames, against the engine's 300 ms limit
- the lowest rate seen, and how many seconds were too slow for gestures

**Design choices:**
- **It only shows numbers.** It doesn't control anything, and nothing is saved or
  sent (tested: no outside requests).
- **It updates on the floating window's own timer,** so if the Tessera tab is slowed
  down, the window shows it rather than freezing on an old number.
- **The "can gestures count?" logic** is a small pure function with unit tests
  (`src/signal/trackingHealth.ts`). The hardening fix for hidden tabs can reuse it.
- **Warm-up:** "lowest so far" ignores the first 3 seconds after frames start. My
  first version counted from when the window opened, so camera start-up showed up
  as a false low of 2 frames/s.
- **Order:** the window opens before the camera starts, because Chrome only allows
  the window right after a click.

**Tested in windowed Chrome 141:** with the Tessera tab hidden behind another tab,
the window kept showing about 7 frames/s and "Yes: gestures can count". A second
click reuses the same window, and closing it unsubscribes cleanly.

**Tab icon:** that test also found a 404 for `/favicon.ico` on every real-Chrome visit.
The app had no tab icon, and headless tests never ask for one, so it went unnoticed.
Added `public/favicon.svg`: the 48 px face logo in the light theme, exported with its
colors baked in as plain hex. If the logo changes, the icon must be re-exported. The
export script isn't in the repo, because it needs Playwright, which the project
doesn't depend on.

## Cluely-inspired welcome page, 3D face demo, and dots on the face map (2026-10-25)

The owner asked for three things they liked on cluely.com:
1. Text that animates in instead of just appearing.
2. A picture of the real product: a live 3D face mesh on the welcome page that you can
   try with your camera. It should mark untested areas with small red dots, not big
   text labels covering the mesh, and the Face map screen should do the same.
3. Cards that appear as you scroll, clear space between sections with titles, and
   clean, Apple-like cards.

**Source:** cluely.com can't be reached from the dev environment, so I worked from the
owner's screen recording (frames pulled out with ffmpeg). Only the style was taken: no
code, images, or text.

**Welcome page** (`src/ui/onboarding.ts`, `showWelcome`):
- **Hero:** centered, with a soft blue glow behind it. The headline appears word by
  word (fade, rise, un-blur), then the subtitle, then the buttons, in about 1.7 s.
- **"See what Tessera sees":** the live 3D demo in a soft frame, like a product shot.
- **"How it works":** three cards (find your movements, scanning keyboard, spoken
  words). Each has a small picture of the real screen.
- **"Private by design":** four cards, the same promises as the onboarding privacy
  step.
- **"How do you want to start?":** the mosaic face logo, which assembles when it
  scrolls into view (playing the floating-icon role from Cluely's page), then the
  profile and guest choices.

**Animation rules** (`src/ui/reveal.ts`, and listed at the top of `src/styles.css`):
- Everything plays once. Nothing loops or flashes, and the app's working screens
  don't animate.
- Reduced motion turns all of it off (tested: every element visible at once, no sway).
- Content is only hidden once the script is running (`reveal-ready`), so if anything
  fails the page is still readable.
- Anything that gets keyboard focus is revealed at once.

**3D demo** (`src/ui/landingFace.ts`):
- It reuses the Face map's Three.js view, the standard face, and the same live-shape
  code, so it shows exactly what the app shows.
- The head sways slowly, about 22° each way over 9 seconds. The sway runs only while
  the demo is on screen, and never with reduced motion.
- Dragging and zooming are off, so scrolling over the head scrolls the page.
- "Try it with your camera" starts the app's camera, and the mesh then follows the
  face. The privacy line sits right under the button: "Your video stays in this
  browser tab. Nothing is recorded or sent." The live shape is only drawn, never
  saved.
- I checked first that face tracking works while the camera panel is hidden on the
  welcome page (it does: "Tracking" at about 6 frames/s in the test).
- When the welcome page closes, the 3D view is disposed, and the camera keeps
  running for the app.
- Without WebGL, the mosaic logo stays and a note says the app still works without
  it.
- **Cost:** Three.js (about 136 KB compressed) now downloads when the demo scrolls
  near, on first-time visits too, not only when someone opens the Face map.

**Dots instead of labels** (`src/ui/mapNodes.ts`, `regionNodes` in
`src/signal/movementMap.ts` with tests):
- There's one small dot per face region, on both the welcome demo and the Face map.
- Red means not tested yet. A tested region's dot uses its result color.
- Pointing at a dot shows its name and number, e.g. "Lips · 80%". The Face map's
  legend explains the red dot, and its table still lists every number as text, so
  nothing depends on hovering or on color.
- The exported image keeps text labels, because a downloaded picture can't be hovered.
- **Red is an exception to the color roles** (red otherwise means "deletes
  something"). It's the owner's choice. "Not tested yet" isn't a problem, so if
  volunteers read the red dots as errors, the fix is one token (`--node-untested`).
- Fixed along the way: the dot positions now follow the head when it turns
  (`project` uses the head's full transform, not just the mirror).

**Cards:** a soft gradient, 30px corners, no heavy borders, and a soft shadow in the
light theme. The shadow also applies to the app's main panels. One deep-blue card
leads, like Cluely's. The contrast checks now cover all of it: card text, the blue
card, highlighted words, the hero glow, the demo frame, and the red dot on both
backgrounds.

**Bug found and fixed:** the "hidden" attribute didn't hide elements whose class
sets a display, such as pill buttons. So "Starting the camera…" stayed visible, and
the demo button showed before the 3D view was ready. Fix: a global
`[hidden] { display: none !important; }`.

**Bug found after publishing, and fixed:** on a desktop-sized screen the 3D face
sometimes never loaded. The browser can report "not visible" (from before the page
was shown) and then "visible" in one batch, and the code read only the first report.
Phone-sized screens got the two reports separately, so the phone test passed. Fix:
use the newest report. Re-tested scrolling at once, scrolling after 2 seconds, and
not scrolling: the 3D face loads in all three.

**Tested:** both themes and phone width (390 px, no sideways scrolling), plus reduced
motion. The camera demo was tested with the fake camera. Onboarding, profiles, Talk,
Face map, face-lost, and calm-blue checks all pass, with no errors and no outside
requests.

**Not tested:** a real webcam and a real phone, and whether the animations feel
calm or distracting to someone who's tired.

## Welcome page: privacy message as a card, no header tagline (2026-10-25)

The owner asked for two changes:
1. Move the "Private by design" bar off the top of the welcome page and make it one
   of the animated boxes.
2. Remove the tagline under "Tessera" in the header.

- **Privacy bar:** hidden on the welcome page only (`body.on-welcome`). Its message is
  now the lead card of the "Private by design" section: a big blue card with the lock
  icon. It replaces the old "Your video stays here" card, which said the same thing.
  The bar still shows on the onboarding steps and every app screen.
- **Why this still meets "say it plainly in the UI":** on the welcome page, the
  camera can only be started by "Try it with your camera". The line right under that
  button says the video stays in the browser tab and nothing is recorded or sent.
  The onboarding privacy step says it again before the app's camera step.
- **Header:** just the logo and "Tessera". The welcome hero already says what Tessera
  does. This also makes the header shorter on phones.
- **Tested:** both themes and phone width. Checked that the bar is hidden on the
  welcome page and back on the privacy step and in the app, and that the card fades
  up on scroll. All earlier checks still pass.

## White background and a smoother hero glow (2026-10-25)

The owner asked for a white background, and pointed out that the hero's blue glow
ended awkwardly (a visible edge where it stopped).

- **White page (light theme only; dark is unchanged):** `--bg` changed from #ececec
  to #ffffff. White cards would vanish on a white page, so:
  - the landing cards get a very light gray-blue tint (`--card-1`, `--card-2`), in
    the Apple style
  - the app's white panels (camera, main, menu bar, privacy bar) get a hairline
    border (`--card-border` #e6e6eb) on top of the soft shadow
  - the small screen pictures inside the cards are now white, so they stand out
    from the tint

  Contrast checks all still pass. For example, gray borders on white are 4.3:1
  (need 3:1).
- **Why the glow ended awkwardly:** it was the hero box's own background, brightest
  right at the box's top edge, so the box clipped it into a hard line and visible
  sides.
- **Glow fix:** it's now its own layer, a bit larger than the hero, that fades to
  fully transparent before reaching any edge (`closest-side`). Several color stops
  make the fade smooth, so it can't end in a line.
- **Found by the screenshots:** the bigger glow reached behind the header and
  tinted the "Create a profile" button. Fix: the header now sits in front of it
  (checked: the button is the top element at its own position).

## Talk: slightly more sensitive by default, with a setting (2026-10-25)

The owner reported that Talk "doesn't always work and sense things" and asked for it
to be slightly more sensitive.

**Possible causes, and which one this fixes:**
1. **Threshold too high for real use.** Calibration puts `on` halfway between rest
   and the person's typical *deliberate* movement. Movements made while typing are
   often smaller, especially when tired. **This is what the change fixes.**
2. **Not relaxing between gestures.** After a gesture counts, the face must drop
   below `off` before the next one can. Nothing on screen explained this, so the
   meters now say "Relax your face to reset". The message appears only after 0.6 s
   stuck in that state, so it doesn't pop up briefly after every gesture.
3. **Very low frame rate.** Below about 3 frames a second, frames are more than 300 ms
   apart and the engine resets every gesture. Not changed; the floating test window
   (Settings) measures it. If the owner's laptop shows this, it's a separate fix.

**The change:**
- New setting, Settings → Sensitivity → "Movement needed": how far toward the typical
  full movement a gesture must go to count.
  - Default **40%** (was effectively 50%), range 30–60%.
  - Stored per profile; older profiles get the default.
- `withReach` (`src/signal/profile.ts`) works the lines out again from the
  calibration's own `restLevel` and `typicalPeak`, with the same limits as
  calibration. No recalibration is needed. Talk and the results screen's "Try it" both
  use it, so "Try it" matches Talk.
- Calibration's analysis (hit rate, AUC, score) still measures at 50%, so its results
  and the choice of gestures don't change.

**Evidence, from synthetic test people only (`tests/sensitivity.test.ts`):**
- Tries **half the size** of calibration's: caught **23%** at the old setting, **97%**
  at the new default.
- Tries at 60% size: 97% → 100%.
- Resting and talking: **no accidental clicks even at 30%**, the most sensitive
  setting allowed.

**What this does NOT show:** the synthetic people are steadier than real faces and
rest for only 15 seconds, so they can't measure the real cost in accidental clicks.
That needs the M4 idle test on real people, which should also record each session's
sensitivity setting (added to PLAN.md).

**Why the range stops at 30%:** the line must stay clearly above the resting level.
Below 30%, ordinary face movement at rest gets close to the line. That's a judgment
call; the synthetic data can't show where real faces start misfiring.

**Found while measuring:** my first measurement showed 5 of 15 tries "always
missed", whatever the sensitivity. That was a bug in my test harness, not the app:
it fed overlapping stretches of the recording into one detector, so time ran
backwards. Re-measured with a fresh detector per try.

## Speech: "no on-device voice" on a Mac was a timing bug (2026-10-25)

**What happened:** testing on Chrome on a Mac, the owner pressed Speak and got "This
browser has no on-device voice… Try Chrome on Windows or macOS". Macs do have
on-device voices, and the message told a Mac user to use a Mac.

**Cause:** Chrome loads its voice list in the background, and right after the page
opens the list is empty for a moment. The Settings screen waited for it, but Talk's
Speak checked instantly, saw an empty list, and treated "not loaded yet" as "this
computer has no voices". It only went unnoticed because headless test Chrome has no
voices at all, so speech had never been tested for real (PLAN.md has said so since
M3).

**Fix** (`src/ui/speech.ts`):
- The app asks Chrome for its voices as soon as it starts (`warmUpVoices`).
- If the list is still empty when someone speaks, Speak waits up to 2 seconds for it.
- Choosing a voice is now a small tested function (`chooseVoice`). It still only ever
  uses on-device voices, and online "Google" voices are never used.
- **Separate, honest messages** for:
  - no voices yet ("wait a few seconds and try again")
  - only online voices ("would send your message to a server, so Tessera won't use
    them")
  - Chrome refusing to speak because the page hasn't been clicked ("click anywhere
    once")

  Before, all three looked like "no voice".
- The Settings voice list refreshes when Chrome's voices arrive late, and its note uses
  the same three cases.

**Tested:**
- Unit tests for voice choice and messages.
- A browser test that fakes Chrome's behavior: voices arrive 0.8 s late, the voice
  list mixes a Google online voice and a Mac on-device voice, there's an only-online
  case, and there's a "blocked" case. Speak waited and used the on-device voice, never
  the online one.

**Still not verified:** that sound actually plays on a real Mac. Only the owner's
laptop can confirm that.

