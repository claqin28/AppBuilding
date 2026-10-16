# Demo video checklist (3 minutes)

What the video should *show*. This isn't a script; the words are yours. Items marked
*(when built)* depend on milestones that aren't done yet. Leave them out if they still
aren't built.

## Must show
- [ ] The privacy statement on screen, and that the app runs in the browser with no account
- [ ] Chrome DevTools **Network** tab during use: no requests to other sites
- [ ] Camera check: face detected indicator, position and lighting checks
- [ ] "Mesh only" mode, so the camera image isn't on screen *(when built)*
- [ ] Calibration: rest, natural movement, and a few tries of one movement
- [ ] Results in plain language, including **one movement that was rejected and why**
      (too small, inconsistent, or triggers another movement)
- [ ] The chosen movements and which action each one does
- [ ] Typing a short message with face movements and speaking it **by selecting Speak**
- [ ] Looking away or leaving the frame: control **pauses** with a clear message, then resumes
- [ ] The Pause key, and resuming with a long hold
- [ ] Evaluation results with **real numbers only** *(when built)*: false activations
      per minute while talking, typing speed, and all three conditions (default,
      hand-tuned, Tessera), even if Tessera doesn't win
- [ ] Who the numbers came from (able-bodied volunteers, until a real user exists)

## Show if built
- [ ] Fatigue or drift: the break or recalibrate suggestion
- [ ] Movement map with its "prototype visualization, not a clinical assessment" label
- [ ] Quick phrases with the "spoken aloud only, does not call for help" label
- [ ] Exporting a progress report, showing that typed text is excluded unless opted in
- [ ] Word prediction on vs. off, with measured numbers

## Say or show somewhere
- [ ] Not a medical device. Not validated with people who have motor impairments.
- [ ] Complements voice control; it isn't a replacement for people with reliable speech
- [ ] Existing tools (Gameface, Switch Control, Camera Switches) let people hand-tune;
      Tessera's difference is *automatic* selection, adaptation, and measurement
- [ ] AI assistance was used and is disclosed in `AI_USAGE.md`

## Don't
- [ ] Don't show any number that wasn't measured
- [ ] Don't say existing tools can't be customized
- [ ] Don't imply it can call for help
