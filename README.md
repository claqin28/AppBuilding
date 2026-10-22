# Tessera

Tessera is an assistive web app prototype for adults with limited or no hand and arm movement
(for example high spinal cord injury, ALS, or muscular dystrophy) who can still make
some voluntary facial movements. A webcam watches for small facial movements, and
the person uses them to build a message on a scanning keyboard and speak it aloud.

Its main idea: **it measures which movements each person can make reliably** instead
of assuming everyone can smile, wink, or open their mouth on cue. Then it picks
thresholds for that person.

**Try it:** https://claqin28.github.io/AppBuilding/ (desktop Chrome, laptop webcam).

> **Status:** prototype. **Not a medical device.** It has **not** been tested with
> anyone who has a motor impairment. So far it has been tested with synthetic data
> and a still photo; testing with able-bodied volunteers is next, and results will be
> reported here labeled as such.

## Who it's for, and who it isn't for

- **For** people who can't rely on speech: speech that's weak, tiring, or hard to
  understand, or settings where speaking isn't possible or private.
- **If someone's speech is reliable**, voice control (Voice Access on Android, Voice
  Control on Apple devices) may well work better. This app doesn't replace it and
  doesn't claim to beat it.
- **Not an emergency system.** It can speak "I need help" aloud in the room, but it
  cannot call anyone or alert anyone remotely.

## What works now

1. **Camera check:** live view of the 51 facial signals, a face-detected indicator,
   and position and lighting checks in plain language.
2. **Calibration (about 1–5 minutes):** rest, then natural movement (talking, looking
   around), then 5 tries of each movement. For each movement, the app measures how far
   it rises above rest, how consistent it is, how fast it is, and whether it
   accidentally triggers other movements. It then picks the best 1–3 movements that
   don't interfere with each other. A helper can override the choice.
3. **Talk:** a row/column scanning keyboard (letters ordered by frequency), quick
   phrases, and speech with an **on-device voice**. Auto-scan needs just one reliable
   movement. Step-scan uses two or three. A pause mode stops scanning during
   conversation, and resuming requires a deliberately long hold. **If the camera
   loses your face, control pauses and says so;** nothing can be selected until you're
   back in view.
4. **Face map (prototype):** a 3D wireframe head, either live from the camera or a
   standard face, colored by your calibration's reliability or range. It has labels,
   a legend, and a numbers table, and you can rotate and zoom. It can export an image
   (always the standard face, never your own face shape). There's an off switch, and
   the 3D code downloads only when used. *Prototype visualization, not a medical or
   clinical assessment.*
5. **Recordings (traces):** calibration can be saved as numbers only (never images)
   and replayed without a camera, for testing and re-analysis.

Planned (see `PLAN.md` for order and status): an evaluation mode (false activations
while talking, typing speed, personalized vs. fixed thresholds), drift and fatigue
adaptation, onboarding with a guest mode that saves nothing, a one-time report,
optional local profiles stored only in this browser, a 3D "movement map" of the face
(a prototype visualization, not a clinical assessment), an editable quick-phrase list,
local share/export, word prediction, practice games, and offline install (PWA).

## Supported devices

**Supported and tested target:** desktop Chrome on a laptop with its built-in webcam.

iPad and Android browsers may work but are **untested**. This app makes no claim of
mobile support until that's tested.

## Privacy

- All face processing happens inside your browser tab. No video, images, or face data
  are sent anywhere or stored.
- Text-to-speech uses **on-device voices only**. Chrome also offers "Google …" voices
  that send text to Google's servers, so the app hides and never uses them.
- No speech recognition is used. Chrome's version sends audio to a server.
- Your gesture setup and settings are kept in this browser's local storage on this
  device only, and Settings has a button to delete them.
- **A Content-Security-Policy blocks all network requests to other sites,** in both
  the dev server and production builds.
- **What the website host sees:** the app is served by GitHub Pages. Like any
  website, GitHub receives standard request information (such as IP address and
  browser type) when your browser downloads the app's files. It never receives
  anything from the camera or anything you type, because the app sends nothing.
- **Sharing and export only happen when you choose them,** and only locally: copy to
  the clipboard, download a file, or your device's share menu. Nothing is ever sent
  automatically or to a server. Today the only export is the calibration recording,
  downloaded when you click its button.

### A finding about MediaPipe's logging

The face model library, `@mediapipe/tasks-vision` 1.1.1, contains a usage logger.
Every 60 seconds it tries to send usage statistics (which task is running, plus timing
counters) to `https://odml.pa.googleapis.com/v1/log`. There is no public setting to
turn it off. This app's Content-Security-Policy blocks the request. In a 70-second
test with the camera running, the browser blocked it and **no request left the
machine**. Inspecting the library's code, I found no image data in what it assembles,
but I haven't independently decoded the payload.

**Verify it yourself:** open Chrome DevTools, start the camera, and wait more than 60
seconds. The **Console** shows a "Refused to connect … violates the Content Security
Policy" error for that address. The **Network** tab shows no request to any other site.

## Setup

You need Node.js 22.12 or newer (the current LTS from nodejs.org works) and desktop Chrome.

```bash
npm install
npm run dev        # http://localhost:5173 (the camera works on localhost)
npm test           # unit tests
npm run build      # production build in dist/
npm run preview    # serve the production build locally
```

**Publishing:** every push to `main` runs `.github/workflows/deploy-pages.yml`, which
installs, runs the tests, builds, and publishes `dist/` to GitHub Pages. If a test
fails, nothing is published.

## Architecture

```
src/signal/    pure signal processing (no DOM, no camera), unit tested
  gestures.ts    candidate movements as formulas over blendshape scores
  smoothing.ts   time-based exponential smoothing
  detector.ts    hysteresis + minimum hold + refractory period, per gesture
  engine.ts      runs the person's gestures together -> SELECT / NEXT / BACK
  calibration.ts measures each movement for this person; picks thresholds
  selection.ts   picks the best non-interfering set of 1-3 movements
  explain.ts     turns numbers into plain sentences
  trace.ts       record / save / load / replay facial-signal recordings
  quality.ts     position and lighting checks
  movementMap.ts calibration numbers -> face-region colors (for the 3D map)
src/viz/       3D face map: regions, standard face data, Three.js renderer (lazy-loaded)
src/keyboard/  scanning keyboard logic (pure, unit tested)
src/vision/    camera access + MediaPipe Face Landmarker + replay source
src/ui/        screens (camera check, calibrate, results, talk, settings)
public/        model file + wasm runtime (served locally, no CDN)
```

See `WALKTHROUGH.md` for how the main algorithms work and `DECISIONS.md` for why.

## Limitations

- Not tested with anyone who has a motor impairment.
- Calibration thresholds and setup checks use rules of thumb that still need tuning
  on real webcams and real people.
- Facial signals come from a general-purpose model, and accuracy can vary with
  lighting, glasses, facial hair, skin tone, and facial differences. That hasn't been
  measured here.
- A web page can only control itself. It can't operate other apps on the computer.
- Head movements aren't used yet, though many people with high spinal cord injury
  have good head control.

## Evaluation

No results yet. Unit tests (115) use **synthetic** data and only check that the code
does what it was designed to do. They don't show that the app works for people. This
section will only ever contain numbers that were actually measured, labeled with who
they were measured on.

## Credits

Uses Google MediaPipe Face Landmarker (Apache-2.0). See `ATTRIBUTION.md` for all
third-party code and data, and `AI_USAGE.md` for AI assistance.
