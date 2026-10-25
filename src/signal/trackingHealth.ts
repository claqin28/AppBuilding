/**
 * Is face tracking running fast enough for gestures to count?
 *
 * The control engine resets every gesture if frames arrive more than
 * `maxGapMs` apart (DEFAULT_ENGINE.maxFaceGapMs, 300 ms), because a gap that
 * long means it can't tell what the face did in between. So tracking can look
 * like it's working (frames still arrive, a face is seen) while no gesture can
 * ever fire. This turns recent frame times into a plain answer.
 *
 * Pure function, no DOM. Used by the floating test window (src/ui/floatingTest.ts).
 */

export type HealthReason = "ok" | "no-frames" | "no-face" | "too-slow";

export interface TrackingHealth {
  /** Frames received in the last second. */
  fps: number;
  /** Longest wait between frames over the last 2 seconds, including "since the last frame". */
  longestGapMs: number;
  /** True when a face is seen and frames come often enough for gestures to count. */
  canCount: boolean;
  reason: HealthReason;
}

const WINDOW_MS = 2000;

/**
 * @param frameTimes when each frame arrived (ms, oldest first)
 * @param now        the current time (same clock)
 * @param faceVisible whether the latest frame had a face
 * @param maxGapMs   the engine's face-gap limit
 */
export function trackingHealth(frameTimes: readonly number[], now: number, faceVisible: boolean, maxGapMs: number): TrackingHealth {
  const recent = frameTimes.filter((t) => t > now - WINDOW_MS && t <= now);
  const fps = recent.filter((t) => t > now - 1000).length;
  if (recent.length === 0) return { fps: 0, longestGapMs: Infinity, canCount: false, reason: "no-frames" };

  let longestGapMs = now - recent[recent.length - 1];
  for (let i = 1; i < recent.length; i++) longestGapMs = Math.max(longestGapMs, recent[i] - recent[i - 1]);

  const reason: HealthReason = longestGapMs > maxGapMs ? "too-slow" : faceVisible ? "ok" : "no-face";
  return { fps, longestGapMs, canCount: reason === "ok", reason };
}
