/** Turns calibration numbers into plain sentences a non-technical person can act on. */
import type { CalibrationConfig, GestureStats } from "./calibration";
import { gestureDef } from "./gestures";

export type Verdict = "good" | "ok" | "poor";

export interface Explanation {
  verdict: Verdict;
  headline: string;
  details: string[];
}

/** Cross-talk at or above this is worth mentioning to the user. */
const MENTION_OVERLAP = 0.5;
/** Score at or above this is called "works well" rather than just "works". */
const GOOD_SCORE = 0.6;

export function explainGesture(s: GestureStats, cfg: CalibrationConfig): Explanation {
  const details: string[] = [];
  const hits = Math.round(s.hitRate * s.reps);
  const weak = s.problems.includes("weak");

  // For a too-small movement, "worked 5 of 5" would be misleading: it only
  // "worked" against a threshold buried in the noise. Lead with the real reason.
  if (weak) {
    details.push("Too small to tell apart from resting or talking.");
  } else {
    details.push(`Worked ${hits} of ${s.reps} tries.`);
    if (s.problems.includes("inconsistent")) details.push("Works on some tries but not others.");
    if (s.problems.includes("overlaps-rest")) details.push("Too similar to how your face moves when resting or talking.");
    else if (s.gap >= cfg.fullGap) details.push("Clearly stronger than when you're resting or talking.");
    else details.push("Noticeably stronger than when you're resting.");
  }
  if (s.usable && s.reactionMs !== null) details.push(`Takes about ${(s.reactionMs / 1000).toFixed(1)} seconds.`);

  const overlaps = Object.entries(s.crossTalk)
    .filter(([, level]) => (level ?? 0) >= MENTION_OVERLAP)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  for (const [other, level] of overlaps) {
    const name = gestureDef(other as GestureStats["id"]).label.toLowerCase();
    details.push(level! >= 1 ? `Also triggers "${name}".` : `Partly triggers "${name}".`);
  }

  if (s.problems.includes("too-few-reps")) details.push("Not enough tries were recorded with your face visible.");

  let verdict: Verdict;
  let headline: string;
  if (!s.usable) {
    verdict = "poor";
    headline = "Not reliable enough to use";
  } else if (s.score >= GOOD_SCORE) {
    verdict = "good";
    headline = "Works well";
  } else {
    verdict = "ok";
    headline = "Works";
  }
  return { verdict, headline, details };
}
