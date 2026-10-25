# Tessera: plan

What gets built, in what order, and what gets cut first. Reasons live in
`DECISIONS.md`; algorithm explanations live in `WALKTHROUGH.md`.

## Hard constraints (apply to every milestone)

**Cost and stack**
1. **Everything is free.** No paid services, no API keys, no accounts, no backend.
   Static hosting on a free tier (GitHub Pages, HTTPS).
2. **The stack:** TypeScript + Vite with **no UI framework** (owner's decision,
   2026-10-22; React is no longer planned), `@mediapipe/tasks-vision` Face Landmarker,
   and Three.js for the 3D face map (lazy-loaded). Desktop Chrome first. iPad Safari is a best-effort test target: no mobile
   or iPad support is claimed until it's tested.
3. **Signal-processing code** (calibration, selection, hysteresis, debounce, drift,
   word prediction, visualization math) has **no DOM, UI, or Three.js imports**, and it
   has unit tests.
4. **The camera/landmarker loop runs on requestAnimationFrame, separate from the
   screens.** Screens subscribe and redraw at most about 10–15 times a second.

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

Audited 2026-10-19 by re-running every check on the current code (see DECISIONS).
"Works" means verified in headless Chrome with a still photo or recorded data.
**Nothing has been tested with a real moving face on a real webcam yet.**

| Step | What | Status |
|---|---|---|
| M1 | Camera, live signals, setup checks, HTTPS deploy | 🟡 **Works.** 2D overlay (V1) not built |
| M2 | Calibration + gesture selection | 🟡 **Works on synthetic data and a photo.** Measures time-to-*fire*, not time-to-*peak* (small fix). Thresholds unvalidated on real faces |
| M3 | Control engine, scanning keyboard, speech | 🟡 **Works.** Missing from the safety rules: always-visible tracking badge, pause keyboard shortcut, undo for Clear. **Speech has never been heard** (headless Chrome has no voices) |
| ~~R~~ | ~~Move the UI to React~~ | **Dropped** (owner's decision, 2026-10-22: stay with plain TypeScript) |
| **S** | The missing M3 safety items (tracking badge, pause shortcut, undo for Clear) + time-to-peak | 🟡 **Tracking badge done** (2026-10-22, with the redesign). Pause shortcut, undo, and time-to-peak: next, with M4 |
| V1 | Face visualization Tier 1 (2D overlay, mesh-only mode, per-gesture bars) | Planned |
| M4 | Evaluation mode (the technical result) | ❌ **Not started** (only calibration time is logged) |
| H | Hardening pass | ❌ **Not started** (done early: face-lost pause, no-face guard, CSP) |
| M5 | Drift and fatigue adaptation | Planned. **Placement needs your decision** (see below) |
| G | Onboarding + guest mode + one-time report | 🟡 **Onboarding and guest mode built** (2026-10-22). One-time report: waits for M4 metrics |
| V2a | 3D head, live wireframe/point cloud + movement-map colors | ✅ **First version built (2026-10-22),** moved ahead of M4 by the owner. Tested in headless Chrome only |
| P | Local profiles (IndexedDB) + history charts | 🟡 **Profiles built** (create, switch, delete, guest → profile, data from older versions carried over). History charts and backup export/import still to do |
| V2b | 3D head: solid shaded mesh upgrade | Planned |
| M6 | Saved quick phrases | Planned (basics exist from M3) |
| M7 | Message share/export (the report part moves into G and P) | Planned |
| M8 | Word prediction | Planned |
| M9 | Adaptive practice games | Planned. **First to cut** |
| M10 | Polish + PWA install (PWA layer built last) | Planned |
| F | Floating mini-keyboard (Chrome's Document Picture-in-Picture) | 💡 **Idea, not scheduled** (owner, 2026-10-25). Feasibility test done: promising, not yet proven on a real computer. **Settings → "Open floating test window"** lets the owner check on a real laptop |

**Order (owner's priority, 2026-10-19):** finish and verify M1–M4 and H first (R and
V1 are part of finishing M1–M3 to the locked spec). Then **G → V2a → P → V2b**. Cut M9
before any of these.

**Restyle done (2026-10-22)** from the owner's screenshot of tesseractai.web.app:
style only, with self-hosted open-licensed fonts (see DECISIONS.md). The exact font
the reference uses is unconfirmed.

**Changes (2026-10-22, owner's decisions):** V2a, the 3D head, was built *before* M4
so the owner could see it first. React is dropped; the UI stays plain TypeScript.
**Next:** M4 (with the S safety items), so volunteer testing can start.

**Needs your decision:** where M5 (drift) goes. Your earlier priority put it right
after the hardening pass; the new list doesn't mention it. *Recommendation:* M4 → H →
**M5** → G → V2a → P → V2b → M6–M8. Adapting as people tire is one of Tessera's three
claimed contributions, and the reports and history need fatigue events.

**If time gets tight, protect in this order:** M1–M4 + H → (M5) → G → V2a → P → V2b →
M6–M7 → M8. **M9 is cut first.**

## S: Missing M3 safety items (with M4)

- ✅ An always-visible tracking badge (Tracking / Paused / Calibrating / No face), done
  2026-10-22.
- A pause keyboard shortcut for helpers.
- Undo for "Clear all".
- M2 fix: record time-to-peak as well as time-to-fire.

## V1: Face visualization, Tier 1

- **2D landmark overlay** drawn on a canvas over the camera view, using the 478 face
  landmarks and MediaPipe's official mesh/contour connection lists
  (`FaceLandmarker.FACE_LANDMARKS_*`). Mirrored exactly like the preview.
- **"Mesh only" mode:** hides the camera image and shows only the drawn mesh. The
  camera still runs, because the model needs it. This mode keeps your face off the
  screen, which matters for screen-sharing, demo videos, and people walking by. It
  doesn't change what's processed, which never leaves the device in either mode.
- **Live per-gesture bars:** the 9 offered candidate gestures (not the 51 raw signals), each
  with its rest level and thresholds marked once calibration exists.
- Drawing is throttled (about 15–30 fps), with no animation effects and no flashing.

## M4: Evaluation mode (the technical result)

- (a) **60-second idle test:** talk and look around; count false activations per minute.
- (b) **Fixed-phrase typing:** characters per minute and error rate.
- **Decided 2026-10-22:** the 8 test phrases (written by the owner) and the Default
  gestures are in `src/evaluation/setup.ts`.
- **Needs the owner's decision (2026-10-25):** the Default condition uses **Open
  mouth** as SELECT. On 2026-10-25 Open mouth was retired from calibration because it
  was too hard for everyone the owner tried. Keeping it in Default would make the
  baseline look worse for a reason the owner already knows about. That's fair only
  if it's what real tools ship with, and then the report must say so.
- (c) **Three conditions, all reported honestly even if Tessera doesn't win:**
  1. **Default:** fixed gestures with fixed default thresholds.
  2. **Hand-tuned:** the same fixed gestures, with thresholds the person sets once
     using a slider per gesture (like hand-tuned tools).
  3. **Tessera:** automatic personalized gesture selection and thresholds.

  Condition order is varied between sessions so practice doesn't favor one condition.
- (d) Calibration time is logged (already recorded). **Log each session's
  sensitivity setting ("Movement needed")** too: it changes the Tessera condition's
  thresholds, so results at different settings can't be pooled without saying so.
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
- **Multiple faces:** the model currently tracks one face (`numFaces: 1`), so it might
  lock onto a second person who leans in. Plan: track up to 2 faces, and pause control
  with a message whenever more than one face is visible.
- Already done early: face lost → auto-scan pauses with a clear message (2026-10-16).
- **Hidden tab (found 2026-10-25):** with another tab in front, the camera loop slowed
  from about 6 to 1.6 frames per second. Frames that far apart are more than the
  engine's 300 ms face-gap limit, so every detector resets each frame and no gesture
  can ever fire, but the badge still says "Tracking". Fix: show "Paused" (and say why)
  when the tab is hidden or the frame rate is too low for gestures to count.

## G: Onboarding, guest mode, one-time report (after M4 + H)

**Welcome screen, two paths:**
- **"Try it now":** guest mode. Nothing is saved.
- **"Save my progress on this device":** creates a local profile (a nickname only; see P).
  Until P is built, this path is shown as "coming soon".

**Onboarding steps (both paths), each skippable for returning profile users:**
1. Privacy in plain language: the video never leaves the device, there's no account,
   and there's no server.
2. Why the camera is needed.
3. Lighting and placement check (the existing camera check).
4. Calibration.

**Caregiver-assisted setup mode:** large targets, every step driven by big buttons,
and no typing required anywhere (a profile nickname can be skipped or picked from
suggestions).

**Guest mode stores nothing.** Everything is held in memory only: no localStorage, no
IndexedDB, no sessionStorage. That also means **reloading the page erases the session**,
and the app says so. (This needs a storage layer that can turn writes off. Today the
app always writes its settings and profile to localStorage.)

**One-time report at the end of a guest session:**
- A readable summary: calibration results, per-gesture reliability, evaluation metrics
  (M4), and the 3D movement map as an image once V2a exists.
- **Print to PDF** (a print stylesheet), **JSON**, and **CSV** downloads.
- A clear notice: *"Closing this page erases this session unless you've downloaded
  it."*
- **"Save this session to a profile"** (once P exists).
- **Excluded by default:** typed text and video (video is never stored anyway).
  Including the current message text requires an explicit opt-in checkbox.

The report generator is one module shared by guest reports, profile history exports,
and M7. It's built once.

## V2a: 3D head, live wireframe + movement map (after G)

- **A 3D head built from the live Face Landmarker landmarks,** mirroring the person's
  face in real time. It starts as a **wireframe or point cloud**.
- **Data available (checked 2026-10-19, see DECISIONS):** `@mediapipe/tasks-vision`
  1.1.1 (Apache-2.0) exports 478 landmarks with x, y, z; the connection sets for
  tesselation, lips, eyes, eyebrows, irises, face oval, and contours; and the tesselation
  edges, which form 852 triangles. Attribution goes in `ATTRIBUTION.md`.
- **Head pose:** the facial transformation matrix can hold the head steady.
- **After calibration, face regions are colored by the measured reliability or range**
  (switchable), using the real calibration numbers. The mapping is in WALKTHROUGH §7.
  - **Never color alone:** a legend with numbers, region labels, a text table of the
    same numbers, and a colorblind-safe palette that also reads in grayscale.
- **Rotate and zoom** with mouse or touch (Three.js OrbitControls, MIT, part of the
  `three` package).
- **Performance and safety:**
  - Three.js (MIT, free) is **lazy-loaded** from this site.
  - The render loop runs outside React (rAF + refs), throttled, and renders only when
    something changes.
  - GPU resources are released when the view closes.
  - **WebGL is checked first;** if it's unavailable, a clear message replaces the view.
  - There's an **off toggle**.
  - Reduced motion is respected (no auto-rotate, no inertia), and nothing flashes.
- **Labeled:** "Prototype visualization, not a medical or clinical assessment."
- **Export only as an image the person chooses to export.** *Needs your decision:* see
  DECISIONS on whether that image shows the person's real face shape or a generic one.
- **The data-to-color logic is plain TypeScript with tests** (`src/signal/`), with no
  Three.js or React imports.
- **No rigged avatar.**

## P: Local profiles and history (after V2a)

- **Not a server account.** A profile is a nickname stored only in this browser's
  IndexedDB. No email, no password, no network.
- **Profile control in the top corner:**
  - switch profile and view history
  - export or import a JSON backup
  - delete this profile, or delete all data
- **Stored per profile:**
  - session dates and calibration results over time
  - per-gesture reliability trends
  - fatigue events, false activations per minute, typing speed, calibration time
  - settings and the current gesture setup
- **History view** with charts drawn as plain SVG (no chart library).
- **Versioned schema with migrations, and storage caps** (WALKTHROUGH §6).
- **Storage warnings:**
  - when storage is unavailable or may not last (private browsing, or the browser
    refuses persistence)
  - that clearing browser data erases profiles, with a recommendation to export a
    backup
- **Honest limits, stated in the UI:**
  - Profiles aren't protected from other people who use the same browser.
  - Private browsing can't be detected reliably, so the warning is based on signs
    like refused persistence and a small quota.
- Reports exclude typed text and video by default. Text requires an opt-in.

## V2b: 3D head, solid shaded mesh (after P)

The license check passed (Apache-2.0 triangle data, see V2a), so a solid shaded mesh is
allowed. It uses the 852 triangles from the package's tesselation. Triangle winding
(which side faces out) hasn't been checked yet, so the first version renders both sides.

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
- **(b) Progress report:** *now built once in G (guest) and P (profiles); M7 keeps the
  message-sharing part.*
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

## F: Floating mini-keyboard (idea added 2026-10-25, not scheduled)

A small window that stays on top of other apps (a video, a video call) with Tessera's
keyboard, quick phrases, and Speak, so someone can keep talking without switching
back to the Tessera tab. Built with Chrome's Document Picture-in-Picture: free, runs on
the device, no server.

- **What it can't do:** type into other apps. A web page can only control itself.
  Controlling the whole computer would need a desktop app with system permissions,
  which means leaving the free static website.
- **Not copied from Cluely:** Cluely's window is hidden from screen sharing, so other
  people can't tell it's there. Tessera's floating window stays visible. Hiding from
  other people doesn't help the people Tessera is for.
- **Feasibility test (2026-10-25), the deciding question: does face tracking keep
  running while the Tessera tab is hidden?** Results are in DECISIONS.md. In short:
  without a floating window, a hidden tab slowed tracking to an unusable rate; with
  one open, tracking stayed at full speed. Not yet tested on a real computer, with
  Chrome minimized, or with another app on top.
- **Before building:** repeat the test on a real laptop (Windows or macOS), then M4 and
  H come first. The test tool for that is built: Settings → Experimental → "Open
  floating test window" (2026-10-25).

## Proposed, not approved (won't be built unless you say so)

- **Head movements as candidate gestures** (turn, nod, tilt). The transformation matrix
  makes this straightforward, and many people with high spinal cord injury have
  reliable head control.
- **Next-word prediction,** only after M8 shows whether single-word prediction helps.
