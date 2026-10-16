# Face Gesture Control

An assistive web app prototype that lets people with limited hand movement control a
computer with facial movements seen by a webcam. It learns which movements *each
person* can make reliably, instead of assuming everyone can make the same gestures.

> **Status:** early prototype (M1: camera and live signal view). This is not a medical device.

## Privacy

All processing happens inside your browser tab. No video, images, or face data are sent
anywhere or stored. The production build includes a Content-Security-Policy that blocks
network requests to any other site.

## Setup

You need Node.js 20+ and desktop Chrome.

```bash
npm install
npm run dev        # http://localhost:5173 (the camera works on localhost)
npm test           # unit tests
npm run build      # production build in dist/
npm run preview    # serve the production build locally
```

## Architecture

```
src/signal/   pure signal-processing code (no DOM, no camera), unit tested
src/vision/   camera access and MediaPipe Face Landmarker
src/ui/       screens and widgets
public/       model file and wasm runtime (served locally, no CDN)
```

## Evaluation

No results yet. This section will only ever contain numbers that were actually measured.

## Credits

Uses Google MediaPipe Face Landmarker (Apache-2.0). See `AI_USAGE.md` for AI assistance.
