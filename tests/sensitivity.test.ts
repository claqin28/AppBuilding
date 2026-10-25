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

describe("the sensitivity setting (\"Movement needed\")", () => {
  it("defaults to 25%, and older saved settings without it get the default", () => {
    expect(DEFAULT_SETTINGS.movementNeeded).toBe(0.25);
    expect(normalizeSettings({ holdMs: 300 }).movementNeeded).toBe(0.25);
  });

  it("a profile that saved the old 40% default (as 'reach') gets the new 25% default", () => {
    const s = normalizeSettings({ reach: 0.4 });
    expect(s.movementNeeded).toBe(0.25);
    expect("reach" in s).toBe(false);
  });

  it("is kept between 20% and 60%", () => {
    expect(normalizeSettings({ movementNeeded: 0.05 }).movementNeeded).toBe(LIMITS.movementNeeded.min);
    expect(normalizeSettings({ movementNeeded: 0.99 }).movementNeeded).toBe(LIMITS.movementNeeded.max);
    expect(LIMITS.movementNeeded.min).toBe(0.2);
    expect(normalizeSettings({ movementNeeded: "lots" }).movementNeeded).toBe(0.25);
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
  it("movements half the size of calibration's: calibration's own 50% misses most, 40% catches nearly all", () => {
    expect(catchRate(0.5, 0.5)).toBeLessThan(0.5);
    expect(catchRate(0.4, 0.5)).toBeGreaterThan(0.9);
  });

  it("movements 40% of calibration's size: 40% misses most, the 25% default catches them all", () => {
    expect(catchRate(0.4, 0.4)).toBeLessThan(0.5);
    expect(catchRate(DEFAULT_SETTINGS.movementNeeded, 0.4)).toBe(1);
  });

  it("no accidental clicks while resting or talking, even at the most sensitive setting", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { trace, frames, profile } = setup(seed);
      const rest = segmentsFromMarkers(trace.markers).rest;
      const engine = new ControlEngine(withReach(profile.bindings, LIMITS.movementNeeded.min), { ...DEFAULT_ENGINE, tauMs: profile.tauMs });
      const fired = frames.filter((f) => rest.some((s) => f.t >= s.start && f.t < s.end)).map((f) => engine.update(f).fired).filter(Boolean);
      expect(fired, `seed ${seed}`).toEqual([]);
    }
  });
});

describe("when the resting face sits higher than at calibration", () => {
  // Six selections in a row, each held 1 s at 70% of the calibration movement, with the
  // resting face between tries sitting `drift` of the way from rest toward the peak.
  function repeated(drift: number, releaseMs: number): number {
    const b = withReach([binding], DEFAULT_SETTINGS.movementNeeded)[0];
    const engine = new ControlEngine([b], { ...DEFAULT_ENGINE, releaseMs });
    const gap = b.typicalPeak - b.restLevel;
    let counted = 0;
    for (let k = 0; k < 6; k++) {
      let fired = false;
      for (let t = k * 3000; t < (k + 1) * 3000; t += 33) {
        const local = t - k * 3000;
        const level = local > 800 && local < 1800 ? b.restLevel + 0.7 * gap : b.restLevel + drift * gap;
        if (engine.update({ t, face: true, scores: { browInnerUp: level } }).fired) fired = true;
      }
      counted += fired ? 1 : 0;
    }
    return counted;
  }

  it("without the release rule, a resting face 20% of the way up blocks every selection", () => {
    expect(repeated(0.2, Infinity)).toBe(0);
  });

  it("with it (0.6 s below the on line counts as relaxed), every selection counts", () => {
    expect(repeated(0.2, DEFAULT_ENGINE.releaseMs)).toBe(6);
    expect(repeated(0, DEFAULT_ENGINE.releaseMs)).toBe(6);
  });
});

