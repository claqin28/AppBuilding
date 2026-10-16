# Tessera: plan

What gets built, in what order, and what gets cut first. Reasons live in
`DECISIONS.md`; algorithm explanations live in `WALKTHROUGH.md`.

## Hard constraints (apply to every milestone)

**Cost and stack**
1. **Everything is free.** No paid services, no API keys, no accounts, no backend.
   Static hosting on a free tier (GitHub Pages, HTTPS).
2. **The stack is locked:** React + TypeScript + Vite, `@mediapipe/tasks-vision` Face
   Landmarker. Desktop Chrome first. iPad Safari is a best-effort test target: no mobile
   or iPad support is claimed until it's tested.
3. **Signal-processing code** (calibration, selection, hysteresis, debounce, drift,
   word prediction, visualization math) is plain TypeScript with **no React or Three.js
   imports**, and it has unit tests.
4. **The camera/landmarker loop runs outside React state** (requestAnimationFrame +
   refs). Only low-frequency UI events go into React state.

**Privacy**

5. Everything runs in the browser. No video or frames leave the device or are stored.
6. No network calls except loading the app's own files, enforced by a
   Content-Security-Policy (`connect-src 'self'`).
7. **Sharing and export are user-initiated and local-only** (copy, download, or the
   Web Share API). Nothing is sent automatically or to a server.
8. No browser speech recognition. Text-to-speech uses on-device voices only.

**Safety**

9. When the face is lost or tracking is uncertain, **control pauses with a clear
   message**. Random actions never fire.
10. **Tracking state is always visible** (tracking / paused / calibrating).
11. There's a **pause shortcut** and **backspace/undo**.
12. Text is spoken **only when the person explicitly selects** Speak or a phrase.
13. **Not a medical device, not an emergency system.** Nothing may suggest the app
    alerts or calls anyone.

**Honesty**

14. No user-validation claims. Testers are able-bodied volunteers until a real user
    exists, and every result says who it was measured on.
15. Never claim existing tools lack customization, or that phones and tablets lack
    facial-gesture control. Project Gameface, Apple Switch Control, and Android Camera
    Switches all allow hand-tuning. Tessera's contribution is *automatic* per-person
    discovery and selection, adaptation during a session, and measured results.
    Voice control may suit people with reliable speech better. Tessera complements it.

## Build order and status

| Step | What | Status |
|---|---|---|
| M1 | Camera, live signals, setup checks, HTTPS deploy | ✅ Done (live on GitHub Pages) |
| M2 | Calibration + gesture selection | ✅ Done (thresholds need real-data tuning) |
| M3 | Control engine, scanning keyboard, speech | ✅ Done |
| **R** | **Move the UI layer to React** (locked stack) | ⏭ **Next.** No behavior change; signal code untouched |
| **V1** | **Face visualization Tier 1** (2D landmark overlay, mesh-only mode, per-gesture bars) | ⏭ With R (belongs to M1–M2) |
| M4 | Evaluation mode (the technical result) | Planned |
| H | Hardening pass (no new features) | Planned |
| V2 | Face visualization Tier 2: 3D "movement map" | Planned |
| M5 | Drift and fatigue adaptation | Planned |
| M6 | Saved quick phrases | Planned (basics exist from M3) |
| M7 | Local share/export + caregiver/OT progress report | Planned |
| M8 | Word prediction | Planned |
| M9 | Adaptive practice games | Planned. **First to cut** |
| M10 | Polish + PWA install (PWA layer built last) | Planned |

**If time gets tight, protect in this order:** M1–M4 + hardening → M5 → M6–M7 → M8 →
M9. **M9 is cut first, before the face visualization.**

---

## R: Move the UI layer to React (next)

The current UI is plain TypeScript DOM code, because the first spec said "no UI
framework". The locked stack is React, so the UI layer (the screens in `src/ui/`) gets
rewritten as React components. What stays the same:
- `src/signal/`, `src/keyboard/`, and `src/vision/` stay as they are (already
  framework-free), along with their 86 tests.
- The camera loop stays outside React (rAF + refs). Components subscribe to it and
  update React state at most ~10 times per second.
- Every current behavior stays the same. Done when the existing end-to-end checks pass
  unchanged.

## V1: Face visualization, Tier 1 (with R)

- **2D landmark overlay** drawn on a canvas over the camera view, using the 478 face
  landmarks and MediaPipe's official mesh/contour connection lists
  (`FaceLandmarker.FACE_LANDMARKS_*`). Mirrored exactly like the preview.
- **"Mesh only" mode:** hides the camera image and shows only the drawn mesh. The
  camera still runs, because the model needs it. This mode keeps your face off the
  screen, which matters for screen-sharing, demo videos, and people walking by. It
  doesn't change what's processed, which never leaves the device in either mode.
- **Live per-gesture bars:** the 12 candidate gestures (not the 51 raw signals), each
  with its rest level and thresholds marked once calibration exists.
- Drawing is throttled (about 15–30 fps), with no animation effects and no flashing.

## M4: Evaluation mode (the technical result)

- (a) **60-second idle test:** talk and look around; count false activations per minute.
- (b) **Fixed-phrase typing:** characters per minute and error rate.
- (c) **Three conditions, all reported honestly even if Tessera doesn't win:**
  1. **Default:** fixed gestures with fixed default thresholds.
  2. **Hand-tuned:** the same fixed gestures, with thresholds the person sets once
     using a slider per gesture (like hand-tuned tools).
  3. **Tessera:** automatic personalized gesture selection and thresholds.

  Condition order is varied between sessions so practice doesn't favor one condition.
- (d) Calibration time is logged (already recorded).
- (e) Session-over-session metrics are logged locally for the day-two check.
- Export JSON/CSV by download only.
- A **scan-step simulator** gives repeatable best-case numbers without a camera.

## H: Hardening pass (no new features)

- List realistic failure modes and show how each is handled: dim or backlit rooms,
  glasses, face lost, multiple faces, permission denied, camera busy, hidden tab, low
  framerate, model load failure, stale service worker.
- **Fix anything that causes wrong actions or crashes.**
- **In-app diagnostics panel:** tracking state, framerate, latency, thresholds.
- **Replay-based regression tests** from recorded traces.
- **A manual test checklist** for the deployed site, including a Network-tab check that
  nothing leaves the device.
- A written list of what couldn't be verified.
- Already done early: face lost → auto-scan pauses with a clear message (2026-10-16).

## V2: Face visualization, Tier 2, the "movement map" (after M4 + H, before M6–M8)

- A **3D face mesh** rendered with **Three.js** (MIT license, free). It's
  **lazy-loaded**: the 3D code downloads only when someone turns the view on, and
  it's served from this site like everything else.
- **After calibration, face regions are colored by that person's measured
  reliability and range,** using the real calibration numbers (hit rate, gap above
  rest). Brow regions use brow raise and brow lowering, mouth corners use smile, and so
  on. Every color also has a number and a legend, because color alone isn't
  accessible.
- **The facial transformation matrix helps** (checked 2026-10-16, see DECISIONS): it
  gives head rotation and position, so its inverse can hold the mesh steady while the
  head moves.
- **Labeled on screen:** "Prototype visualization, not a medical or clinical assessment."
- **Off switch:** a toggle turns the 3D view off. It also respects reduced motion (no
  auto-rotation), never flashes, and renders only when its data changes.
- **In the progress report only as an image the person chooses to export.**
- **No rigged avatar.**
- The pure parts (gesture → face-region mapping, region scores, colors) live in
  `src/signal/` with tests, with no Three.js imports.

## M5: Drift and fatigue adaptation

Track the resting level and active peak over time, adapt thresholds slowly within safe
bounds, detect fatigue (shrinking peaks), and suggest a break or recalibration. Never
let adaptation silently make control worse. Fatigue events are logged for the M7 report.

## M6: Saved quick phrases

Already done in M3: the Phrases key, one SELECT speaks a phrase, default phrases, and
the "not an emergency system" note.

To do:
- A user-editable list stored locally.
- "Save message as phrase", reachable by scanning.
- A helper editor in Settings.
- The label "Spoken aloud only. Does not alert anyone or call for help." on the phrase
  screen itself.
- A cap of about 12 phrases.

## M7: Local share/export (user-initiated only)

- **(a) Message:**
  - **Copy** and **Save as .txt**, reachable by scanning.
  - **Share…** is a helper-clicked button only, because the Web Share API requires a
    real click and a face gesture doesn't count. It's hidden where the browser doesn't
    support it.
- **(b) Progress report:**
  - A readable summary plus JSON/CSV: per-gesture reliability over time, calibration
    time, false activations per minute, typing speed, error rate, and fatigue events.
  - **Excluded by default:** typed text, video (never stored), raw recordings, and
    the learned word list.
  - Including text requires an explicit opt-in.
  - The V2 movement-map image is included only if the person chooses to export it.

## M8: Word prediction

- A trie of my own design, plus a small bundled word-frequency list under a permissive
  license (recorded in `ATTRIBUTION.md`; not chosen yet).
- Personal word frequencies, stored locally.
- The top 3–5 suggestions appear as scan targets.
- Evaluation: typing speed and keystroke savings with prediction on vs. off, added to
  M4's evaluation mode.

## M9: Adaptive practice games (first to cut)

Short target/hold games focused on the weakest gesture, with adjustable difficulty and
per-gesture mastery.

## M10: Polish + PWA (PWA layer built last)

- High contrast, large targets, reduced motion, nothing flashing faster than 3 Hz.
- A caregiver-assisted setup mode and clear error states.
- **PWA:** web manifest, a service worker that caches the model and assets, and an
  install button. **Test that updates don't serve a stale cached version.**

---

## Proposed, not approved (won't be built unless you say so)

- **Head movements as candidate gestures** (turn, nod, tilt). The transformation matrix
  makes this straightforward, and many people with high spinal cord injury have
  reliable head control.
- **Next-word prediction,** only after M8 shows whether single-word prediction helps.
