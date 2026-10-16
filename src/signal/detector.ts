/**
 * Turns one smoothed gesture signal into clean "fired!" events.
 *
 * Problem: a raw signal wobbles. If we fired every time it crossed a single
 * line, one wobbly smile could fire five times, and twitches would fire too.
 * Four rules fix that:
 *
 * 1. HYSTERESIS (two lines, not one). To START a gesture the signal must go
 *    above the `on` line. To END it, the signal must drop below the lower
 *    `off` line. Wobbling between the two lines changes nothing.
 *
 * 2. MINIMUM HOLD. The signal must stay above `on` for `holdMs` before we
 *    fire. Brief twitches are shorter than that.
 *
 * 3. ONE FIRE PER GESTURE. After firing, nothing more happens until the
 *    person relaxes (signal below `off`). Holding a smile doesn't repeat.
 *
 * 4. REFRACTORY PERIOD. After relaxing, we wait `refractoryMs` before
 *    listening again, so a bouncy release can't count as a second gesture.
 *
 * States:  ready --(above on)--> pending --(held long enough)--> FIRE, holding
 *          pending --(dropped below on before hold time)--> ready
 *          holding --(below off)--> cooldown --(refractory time passed)--> ready
 *
 * The detector STARTS in "holding": if the person is already mid-gesture
 * when control begins (or the face reappears), they must relax first.
 */

export interface DetectorParams {
  /** Signal must rise above this to start a gesture. */
  on: number;
  /** Signal must fall below this to end a gesture. Must be <= on. */
  off: number;
  /** How long (ms) the signal must stay above `on` before firing. */
  holdMs: number;
  /** How long (ms) after release before a new gesture can start. */
  refractoryMs: number;
}

export type DetectorPhase = "ready" | "pending" | "holding" | "cooldown";

export class GestureDetector {
  phase: DetectorPhase = "holding";
  /** When the signal first went above `on` (valid in "pending"). */
  private pendingSince = 0;
  /** When the person relaxed (valid in "cooldown"). */
  private releasedAt = 0;

  constructor(public params: DetectorParams) {
    if (params.off > params.on) throw new Error("off threshold must not be above on threshold");
  }

  /** Feed one smoothed value at time t (ms). Returns true exactly once per deliberate gesture. */
  update(value: number, t: number): boolean {
    const { on, off, holdMs, refractoryMs } = this.params;

    if (this.phase === "cooldown" && t - this.releasedAt >= refractoryMs) this.phase = "ready";

    switch (this.phase) {
      case "ready":
        if (value < on) return false;
        this.phase = "pending";
        this.pendingSince = t;
        return this.checkHold(t, holdMs);
      case "pending":
        if (value < on) {
          this.phase = "ready";
          return false;
        }
        return this.checkHold(t, holdMs);
      case "holding":
        if (value < off) {
          this.phase = "cooldown";
          this.releasedAt = t;
        }
        return false;
      case "cooldown":
        return false;
    }
  }

  /** Makes the person relax before the next gesture can fire (used when the face is lost). */
  reset(): void {
    this.phase = "holding";
  }

  /** Puts the detector straight into "ready" (used by tests and analysis that start from rest). */
  arm(): void {
    this.phase = "ready";
  }

  private checkHold(t: number, holdMs: number): boolean {
    if (t - this.pendingSince >= holdMs) {
      this.phase = "holding";
      return true;
    }
    return false;
  }
}

/**
 * How close a value is to firing, for on-screen meters:
 * 0 = at resting level, 1 = at the `on` line, above 1 = past it.
 */
export function progressToward(value: number, rest: number, on: number): number {
  const span = on - rest;
  if (span <= 0) return value >= on ? 1 : 0;
  return Math.max(0, (value - rest) / span);
}
