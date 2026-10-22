/**
 * Fixed inputs for the M4 evaluation (not built yet).
 *
 * The test phrases were WRITTEN BY THE PROJECT OWNER (2026-10-22), not
 * generated, and not taken from a published phrase set.
 */
import type { Binding } from "../signal/profile";

/** Phrases typed in the fixed-phrase typing test. */
export const TEST_PHRASES: readonly string[] = [
  "I need some water",
  "Turn on the light",
  "Thank you very much",
  "What time is it",
  "Please open the door",
  "I am ready to go",
  "Good morning to you",
  "Please come back soon",
];

/**
 * Condition 1, "Default": the same gestures and thresholds for everyone, no
 * calibration (chosen by the project owner, 2026-10-22). Open mouth, raise
 * eyebrows, and smile match common built-in defaults.
 *
 * `on` is 0.5 for every gesture. `off` (0.35) and everything else (smoothing,
 * hold time, refractory period) are the same as in the other conditions, so the
 * comparison only changes WHICH gestures are used and WHERE the thresholds are.
 * restLevel/typicalPeak are placeholders: Default doesn't measure them.
 */
export const DEFAULT_CONDITION: readonly Binding[] = [
  { action: "SELECT", gesture: "mouthOpen", on: 0.5, off: 0.35, restLevel: 0, typicalPeak: 1 },
  { action: "NEXT", gesture: "browRaise", on: 0.5, off: 0.35, restLevel: 0, typicalPeak: 1 },
  { action: "BACK", gesture: "smile", on: 0.5, off: 0.35, restLevel: 0, typicalPeak: 1 },
];
