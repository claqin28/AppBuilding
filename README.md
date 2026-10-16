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

## What this can and can't do

This is a web page, so it can only control **itself**. Inside the page you get a
scanning keyboard, text-to-speech, and copy-to-clipboard. It **cannot** click buttons
in other apps or type into WhatsApp or email. Built-in operating-system tools can
control the whole device:

| Tool | Platform | Gestures | Tuning |
|---|---|---|---|
| [Camera Switches](https://support.google.com/accessibility/android/answer/11150722) | Android | 6 fixed: look left/right/up, smile, raise eyebrows, open mouth | Gesture size dial and hold time, set by hand |
| [Switch Control, Head Tracking](https://support.apple.com/en-qa/guide/iphone/iph8de250c54/ios) | iPhone, iPad, Mac | Head movement plus facial expressions | Set by hand per expression |
| [Project Gameface](https://github.com/google/project-gameface) (archived Sept 2025) | Windows, Android | Any of 52 blendshapes | Per-gesture threshold, smoothing, hold time, set by hand |

None of these that I found **measure** which gestures a particular person can make
reliably, check whether two gestures get confused with each other, or adapt as the
person tires. Someone has to pick the gestures and tune them by trial and error. This
app measures that. Its calibration results can also guide how to set up the built-in
tools above.

## Evaluation plan

The goal is to answer "does this work for the person using it, without frustrating
them?" Proving anything to anyone else isn't the goal.

1. **Test on myself first, using recorded traces.** Every calibration and session can
   be saved as a trace (numbers only, never video) and replayed. Settings can then be
   tuned without asking anyone to repeat gestures.
2. **False activations while talking (most important for real use).** Talk and look
   around for 60 seconds. Count how often the app fires on its own. A tool that types
   while someone is having a conversation won't get used.
3. **Personalized vs. fixed thresholds.** Same gestures, same tasks, once with a
   standard fixed threshold (0.5) and once with the calibrated thresholds. Alternate
   the order (fixed, personal, personal, fixed) so practice doesn't favor one side.
4. **Next-day check.** Does yesterday's calibration still work today, or does it need
   redoing?
5. **With the real user:** short sessions, stop at the first sign of tiredness or
   frustration, and start with an easy success.

Results from one or two people show how it works *for them*. They don't show it works
for everyone with a given condition, and this README won't claim that.

No results yet. This section will only ever contain numbers that were actually measured.

## Credits

Uses Google MediaPipe Face Landmarker (Apache-2.0). See `AI_USAGE.md` for AI assistance.
