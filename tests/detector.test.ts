import { describe, expect, it } from "vitest";
import { GestureDetector, progressToward } from "../src/signal/detector";
import { Smoother, smoothSeries } from "../src/signal/smoothing";

const params = { on: 0.5, off: 0.3, holdMs: 200, refractoryMs: 300 };

/** Feeds values at 50 ms steps; returns the times at which the detector fired. */
function run(det: GestureDetector, values: number[], t0 = 0, dt = 50): number[] {
  const fired: number[] = [];
  values.forEach((v, i) => {
    if (det.update(v, t0 + i * dt)) fired.push(t0 + i * dt);
  });
  return fired;
}

function armed(): GestureDetector {
  const d = new GestureDetector(params);
  d.arm();
  return d;
}

describe("GestureDetector", () => {
  it("fires once after the signal is held above `on` for the hold time", () => {
    // above from t=100; fires at t=300 (held 200 ms)
    expect(run(armed(), [0, 0, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6])).toEqual([300]);
  });

  it("ignores twitches shorter than the hold time", () => {
    expect(run(armed(), [0, 0.9, 0.9, 0, 0, 0.9, 0.9, 0])).toEqual([]);
  });

  it("hysteresis: wobbling between off and on after firing does not refire", () => {
    const wobble = [0, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.45, 0.55, 0.4, 0.6, 0.35, 0.6, 0.6, 0.6, 0.6];
    expect(run(armed(), wobble)).toHaveLength(1);
  });

  it("holding a gesture does not auto-repeat", () => {
    expect(run(armed(), Array(40).fill(0.8))).toHaveLength(1);
  });

  it("can fire again after release + refractory period", () => {
    const seq = [0.8, 0.8, 0.8, 0.8, 0.8, 0, 0, 0, 0, 0, 0, 0.8, 0.8, 0.8, 0.8, 0.8];
    expect(run(armed(), seq)).toHaveLength(2);
  });

  it("refractory period blocks a quick bounce after release", () => {
    // release at t=250, re-rise at t=300 (only 50 ms later; refractory is 300 ms)
    const seq = [0.8, 0.8, 0.8, 0.8, 0.8, 0, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8];
    expect(run(armed(), seq)).toHaveLength(1);
  });

  it("starts by waiting for the person to relax", () => {
    const det = new GestureDetector(params);
    expect(run(det, Array(10).fill(0.8))).toEqual([]);
    expect(det.phase).toBe("holding");
  });

  it("after reset() (face lost), a still-held gesture does not fire", () => {
    const det = armed();
    run(det, [0, 0, 0]);
    det.reset();
    expect(run(det, Array(10).fill(0.8), 1000)).toEqual([]);
  });

  it("hold time 0 fires on the first frame above `on`", () => {
    const det = new GestureDetector({ ...params, holdMs: 0 });
    det.arm();
    expect(run(det, [0, 0.6])).toEqual([50]);
  });

  it("rejects off > on", () => {
    expect(() => new GestureDetector({ ...params, off: 0.6 })).toThrow();
  });
});

describe("progressToward", () => {
  it("is 0 at rest, 1 at the on line", () => {
    expect(progressToward(0.1, 0.1, 0.5)).toBe(0);
    expect(progressToward(0.5, 0.1, 0.5)).toBeCloseTo(1);
    expect(progressToward(0.0, 0.1, 0.5)).toBe(0);
  });
});

describe("Smoother", () => {
  it("first value passes straight through", () => {
    expect(new Smoother(100).update(0.7, 0)).toBe(0.7);
  });
  it("moves ~63% of the way after one time constant", () => {
    const s = new Smoother(100);
    s.update(0, 0);
    expect(s.update(1, 100)).toBeCloseTo(1 - Math.exp(-1), 5);
  });
  it("behaves the same at different frame rates", () => {
    const fast = smoothSeries(Array(61).fill(1).fill(0, 0, 1), Array.from({ length: 61 }, (_, i) => i * (1000 / 60)), 100);
    const slow = smoothSeries(Array(16).fill(1).fill(0, 0, 1), Array.from({ length: 16 }, (_, i) => i * (1000 / 15)), 100);
    expect(fast[60]).toBeCloseTo(slow[15], 5);
  });
  it("tau 0 means no smoothing", () => {
    expect(smoothSeries([0, 1, 0], [0, 10, 20], 0)).toEqual([0, 1, 0]);
  });
});
