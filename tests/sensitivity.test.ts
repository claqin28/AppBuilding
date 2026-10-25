import { describe, expect, it } from "vitest";
import { analyzeCalibration, DEFAULT_CALIBRATION, segmentsFromMarkers, thresholdsFor } from "../src/signal/calibration";
import { ControlEngine, DEFAULT_ENGINE } from "../src/signal/engine";
import { buildProfile, withReach, type Binding, type Profile } from "../src/signal/profile";
import { assignActions, selectGestures } from "../src/signal/selection";
import { traceFrames, type Trace } from "../src/signal/trace";
import type { BlendshapeFrame } from "../src/signal/types";
import { DEFAULT_SETTINGS, LIMITS, normalizeSettings } from "../src/storage/settings";
import { standardPerson } from "./synth";

const binding: Binding = { action: "SELECT", gesture: "browRaise", on: 0.425, off: 0.2375, restLevel: 0.05, typicalPeak: 0.8 };

describe("withReach (sensitivity)", () => {
  it("reach 0.5 gives back exactly what calibration set", () => {
    const [b] = withReach([binding], 0.5);
    const cal = thresholdsFor(0.05, 0.8, DEFAULT_CALIBRATION);
    expect(b.on).toBeCloseTo(cal.on);
    expect(b.off).toBeCloseTo(cal.off);
  });

  it("the default 0.4 lowers both lines: on = 40% of the way, off halfway between rest and on", () => {
    const [b] = withReach([binding], 0.4);
    expect(b.on).toBeCloseTo(0.05 + 0.4 * 0.75);
    expect(b.off).toBeCloseTo(0.05 + 0.5 * (b.on - 0.05));
    expect(b.on).toBeLessThan(binding.on);
  });

  it("keeps calibration's safety limits: on stays above rest and never above 0.9", () => {
    const [tiny] = withReach([{ ...binding, restLevel: 0.3, typicalPeak: 0.3 }], 0.3);
    expect(tiny.on).toBeGreaterThanOrEqual(0.3 + 0.02 - 1e-9);
    const [big] = withReach([{ ...binding, restLevel: 0.5, typicalPeak: 2.5 }], 0.6);
    expect(big.on).toBeLessThanOrEqual(0.9);
    expect(big.off).toBeLessThanOrEqual(big.on);
  });

  it("doesn't change which gesture does what", () => {
    const [b] = withReach([binding], 0.35);
    expect(b).toMatchObject({ action: "SELECT", gesture: "browRaise", restLevel: 0.05, typicalPeak: 0.8 });
  });
});

describe("the sensitivity setting", () => {
  it("defaults to 40%, and older saved settings without it get the default", () => {
    expect(DEFAULT_SETTINGS.reach).toBe(0.4);
    expect(normalizeSettings({ holdMs: 300 }).reach).toBe(0.4);
  });

  it("is kept between 30% and 60%", () => {
    expect(normalizeSettings({ reach: 0.05 }).reach).toBe(LIMITS.reach.min);
    expect(normalizeSettings({ reach: 0.99 }).reach).toBe(LIMITS.reach.max);
    expect(normalizeSettings({ reach: "lots" }).reach).toBe(0.4);
  });
});

// Synthetic test people (tests/synth.ts). Real use often has smaller movements than
// calibration's deliberate ones, so we shrink each try toward rest by `size`.
function setup(seed: number): { trace: Trace; frames: BlendshapeFrame[]; profile: Profile } {
  const trace = standardPerson(seed);
  const frames = traceFrames(trace);
  const result = analyzeCalibration(frames, trace.markers);
  return { trace, frames, profile: buildProfile(result, assignActions(selectGestures(result).chosen), 0) };
}

function shrink(f: BlendshapeFrame, size: number): BlendshapeFrame {
  return { ...f, scores: Object.fromEntries(Object.entries(f.scores).map(([k, v]) => [k, 0.03 + (v - 0.03) * size])) };
}

function catchRate(reach: number, size: number): number {
  let caught = 0;
  let total = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { trace, frames, profile } = setup(seed);
    const segs = segmentsFromMarkers(trace.markers);
    const bindings = withReach(profile.bindings, reach);
    for (const b of bindings) {
      for (const s of segs.reps[b.gesture] ?? []) {
        const engine = new ControlEngine(bindings, { ...DEFAULT_ENGINE, tauMs: profile.tauMs });
        let got = false;
        for (const f of frames) {
          if (f.t < s.start - 1000 || f.t >= s.end) continue;
          if (engine.update(shrink(f, size)).fired === b.action && f.t >= s.start) got = true;
        }
        caught += got ? 1 : 0;
        total++;
      }
    }
  }
  return caught / total;
}

describe("sensitivity on synthetic test people", () => {
  it("movements half the size of calibration's: the old setting misses most, the new default catches nearly all", () => {
    expect(catchRate(0.5, 0.5)).toBeLessThan(0.5);
    expect(catchRate(0.4, 0.5)).toBeGreaterThan(0.9);
  });

  it("no accidental clicks while resting or talking, even at the most sensitive setting", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { trace, frames, profile } = setup(seed);
      const rest = segmentsFromMarkers(trace.markers).rest;
      const engine = new ControlEngine(withReach(profile.bindings, LIMITS.reach.min), { ...DEFAULT_ENGINE, tauMs: profile.tauMs });
      const fired = frames.filter((f) => rest.some((s) => f.t >= s.start && f.t < s.end)).map((f) => engine.update(f).fired).filter(Boolean);
      expect(fired, `seed ${seed}`).toEqual([]);
    }
  });
});
