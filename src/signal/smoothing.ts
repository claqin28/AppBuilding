/**
 * Smoothing: removes frame-to-frame jitter from a signal.
 *
 * This is an "exponential moving average": each new value pulls the smoothed
 * value part of the way toward it. How far it pulls depends on how much time
 * passed since the last frame, so smoothing behaves the same whether the
 * camera runs at 15 or 60 frames per second.
 *
 * tauMs (the "time constant") is roughly how long the smoothed value takes
 * to catch up with a sudden change: about 63% of the way after tauMs,
 * about 95% after 3 × tauMs. Bigger = smoother but slower.
 */
export class Smoother {
  private value: number | null = null;
  private lastT = 0;

  constructor(public tauMs: number) {}

  update(x: number, t: number): number {
    if (this.value === null || this.tauMs <= 0) {
      this.value = x;
    } else {
      const dt = Math.max(0, t - this.lastT);
      const alpha = 1 - Math.exp(-dt / this.tauMs);
      this.value += alpha * (x - this.value);
    }
    this.lastT = t;
    return this.value;
  }

  /** Forget history (for example after the face was lost). */
  reset(): void {
    this.value = null;
  }
}

/** Smooths a whole series at once. Used by calibration so it matches live control exactly. */
export function smoothSeries(values: readonly number[], times: readonly number[], tauMs: number): number[] {
  const s = new Smoother(tauMs);
  return values.map((x, i) => s.update(x, times[i]));
}
