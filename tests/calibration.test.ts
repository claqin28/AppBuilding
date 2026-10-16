import { describe, expect, it } from "vitest";
import {
  analyzeCalibration,
  auc,
  heldPeak,
  median,
  percentile,
  segmentsFromMarkers,
  thresholdsFor,
  DEFAULT_CALIBRATION,
  type GestureStats,
} from "../src/signal/calibration";
import { explainGesture } from "../src/signal/explain";
import { gestureSignals } from "../src/signal/gestures";
import { buildProfile, parseProfile } from "../src/signal/profile";
import { assignActions, combinations, conflict, selectGestures } from "../src/signal/selection";
import { parseTrace, traceFrames } from "../src/signal/trace";
import { standardPerson, synthCalibration } from "./synth";

const analyze = (trace = standardPerson()) => analyzeCalibration(traceFrames(trace), trace.markers);
const find = (gs: GestureStats[], id: string) => gs.find((g) => g.id === id)!;

describe("math helpers", () => {
  it("percentile and median interpolate", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(percentile([0, 10], 0.98)).toBeCloseTo(9.8);
    expect(percentile([], 0.5)).toBe(0);
  });

  it("auc is 1 for perfect separation, 0.5 for identical, counts ties as half", () => {
    expect(auc([0.8, 0.9], [0.1, 0.2])).toBe(1);
    expect(auc([0.5], [0.5])).toBe(0.5);
    expect(auc([0.1], [0.9])).toBe(0);
    expect(auc([], [1])).toBe(0);
  });

  it("heldPeak is the highest level kept up for the hold time", () => {
    const v = [0, 0.5, 0.6, 0.7, 0.2];
    const t = [0, 100, 200, 300, 400];
    expect(heldPeak(v, t, 0, 5, 150)).toBe(0.5); // 0.5..0.7 held from t=100 to t=300
    expect(heldPeak(v, t, 0, 5, 0)).toBe(0.7); // no hold: plain maximum
    expect(heldPeak(v, t, 0, 2, 500)).toBe(0); // stretch shorter than hold
  });

  it("thresholds sit halfway to the typical peak, off halfway to on", () => {
    const { on, off } = thresholdsFor(0.1, 0.7, DEFAULT_CALIBRATION);
    expect(on).toBeCloseTo(0.4);
    expect(off).toBeCloseTo(0.25);
  });

  it("thresholds never exceed maxOn and stay above rest", () => {
    expect(thresholdsFor(0.1, 1.9, DEFAULT_CALIBRATION).on).toBe(DEFAULT_CALIBRATION.maxOn);
    expect(thresholdsFor(0.3, 0.2, DEFAULT_CALIBRATION).on).toBeGreaterThan(0.3);
  });
});

describe("segmentsFromMarkers", () => {
  it("pairs start/end markers and collects skips", () => {
    const s = segmentsFromMarkers([
      { t: 0, label: "rest:start" },
      { t: 5, label: "rest:end" },
      { t: 6, label: "rep:smile:start" },
      { t: 8, label: "rep:smile:end" },
      { t: 9, label: "rep:smile:start" }, // never ended (e.g. paused): ignored
      { t: 10, label: "skip:cheekPuff" },
      { t: 11, label: "rep:notAGesture:start" },
      { t: 12, label: "rep:notAGesture:end" },
    ]);
    expect(s.rest).toEqual([{ start: 0, end: 5 }]);
    expect(s.reps.smile).toEqual([{ start: 6, end: 8 }]);
    expect(s.skipped).toEqual(["cheekPuff"]);
  });

  it("drops tries recorded before a gesture was skipped", () => {
    const s = segmentsFromMarkers([
      { t: 0, label: "rep:smile:start" },
      { t: 2, label: "rep:smile:end" },
      { t: 3, label: "skip:smile" },
    ]);
    expect(s.reps.smile).toBeUndefined();
    expect(s.skipped).toEqual(["smile"]);
  });
});

describe("gesture signals", () => {
  it("a normal two-eye blink gives no wink signal", () => {
    const g = gestureSignals({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.88 });
    expect(g.winkLeft).toBeLessThan(0.05);
    expect(g.winkRight).toBe(0);
  });
  it("a one-sided smile still counts", () => {
    expect(gestureSignals({ mouthSmileLeft: 0.7, mouthSmileRight: 0.05 }).smile).toBe(0.7);
  });
});

describe("analyzeCalibration on the synthetic test person", () => {
  const result = analyze();
  const g = (id: string) => find(result.gestures, id);

  it("finds the clearly strong gestures usable", () => {
    expect(g("browRaise").usable).toBe(true);
    expect(g("winkLeft").usable).toBe(true);
    expect(g("smile").usable).toBe(true);
  });

  it("rejects a gesture that is too small", () => {
    expect(g("jawLeft").usable).toBe(false);
    expect(g("jawLeft").problems).toContain("weak");
  });

  it("rejects mouth-open when talking moves the jaw as much as the gesture does", () => {
    expect(g("mouthOpen").usable).toBe(false);
  });

  it("flags a gesture that only works on some tries", () => {
    expect(g("browLower").problems).toContain("inconsistent");
    expect(g("browLower").hitRate).toBeLessThanOrEqual(0.6);
  });

  it("uses the high personal resting level for brow-lower instead of assuming 0", () => {
    expect(g("browLower").restLevel).toBeGreaterThan(0.25);
  });

  it("natural blinks do not make the wink look noisy at rest", () => {
    expect(g("winkLeft").restLevel).toBeLessThan(0.1);
  });

  it("places thresholds between rest and the typical attempt", () => {
    for (const s of result.gestures.filter((x) => x.usable)) {
      expect(s.restLevel).toBeLessThan(s.off);
      expect(s.off).toBeLessThan(s.on);
      expect(s.on).toBeLessThan(s.typicalPeak);
    }
  });

  it("measures cross-talk: cheek puff triggers smile for this person", () => {
    expect(g("cheekPuff").crossTalk.smile).toBeGreaterThanOrEqual(1);
    expect(g("browRaise").crossTalk.smile ?? 0).toBeLessThan(0.3);
  });

  it("reports reaction time close to the synthetic 400 ms + rise", () => {
    const r = g("browRaise").reactionMs!;
    expect(r).toBeGreaterThan(400);
    expect(r).toBeLessThan(1100);
  });

  it("lists skipped gestures and does not analyze them", () => {
    expect(result.skipped).toEqual(["jawRight"]);
    expect(result.gestures.find((x) => x.id === "jawRight")).toBeUndefined();
  });

  it("requires a rest recording", () => {
    expect(() => analyzeCalibration([], [])).toThrow(/rest/);
  });
});

describe("trace replay", () => {
  it("analysis of a saved-and-reloaded trace is identical", () => {
    const trace = standardPerson(7);
    const reloaded = parseTrace(JSON.parse(JSON.stringify(trace)));
    expect(analyzeCalibration(traceFrames(reloaded), reloaded.markers)).toEqual(
      analyzeCalibration(traceFrames(trace), trace.markers),
    );
  });

  it("rejects files that are not traces", () => {
    expect(() => parseTrace({ hello: 1 })).toThrow(/not a face-gesture trace/);
  });

  it("frames without a face are skipped, not treated as zeros", () => {
    const trace = standardPerson(3);
    // Blank out every 4th frame (as if the face was briefly lost).
    trace.frames = trace.frames.map((f, i) => (i % 4 === 0 ? [f[0], 0] : f));
    const r = analyzeCalibration(traceFrames(trace), trace.markers);
    expect(find(r.gestures, "browRaise").usable).toBe(true);
  });
});

describe("selection", () => {
  const result = analyze();
  const sel = selectGestures(result);

  it("chooses three gestures", () => {
    expect(sel.chosen).toHaveLength(3);
  });

  it("never chooses two gestures that conflict", () => {
    expect(sel.chosen.includes("smile") && sel.chosen.includes("cheekPuff")).toBe(false);
  });

  it("only chooses usable gestures", () => {
    for (const id of sel.chosen) expect(find(result.gestures, id).usable).toBe(true);
  });

  it("assigns SELECT to the best gesture", () => {
    const actions = assignActions(sel.chosen);
    expect(actions.SELECT).toBe(sel.chosen[0]);
    expect(Object.keys(actions)).toEqual(["SELECT", "NEXT", "BACK"]);
  });

  it("falls back to fewer gestures when only one is usable", () => {
    const trace = synthCalibration({
      seed: 2,
      gestures: { browRaise: { shapes: { browInnerUp: 0.8 } }, jawLeft: { shapes: { jawLeft: 0.05 } } },
    });
    const r = analyzeCalibration(traceFrames(trace), trace.markers);
    expect(selectGestures(r).chosen).toEqual(["browRaise"]);
  });

  it("returns nothing when no gesture is usable", () => {
    const trace = synthCalibration({ seed: 4, gestures: { jawLeft: { shapes: { jawLeft: 0.05 } } } });
    expect(selectGestures(analyzeCalibration(traceFrames(trace), trace.markers)).chosen).toEqual([]);
  });

  it("conflict takes the worse direction", () => {
    const a = { id: "smile", crossTalk: { cheekPuff: 0.1 } } as GestureStats;
    const b = { id: "cheekPuff", crossTalk: { smile: 0.9 } } as GestureStats;
    expect(conflict(a, b)).toBe(0.9);
  });

  it("combinations enumerates every group", () => {
    expect(combinations([1, 2, 3, 4], 2)).toHaveLength(6);
    expect(combinations([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });
});

describe("explanations", () => {
  const result = analyze();
  it("describes a strong gesture as working", () => {
    const e = explainGesture(find(result.gestures, "browRaise"), result.config);
    expect(e.verdict).toBe("good");
    expect(e.details[0]).toMatch(/Worked 5 of 5/);
  });
  it("mentions cross-talk by name", () => {
    const e = explainGesture(find(result.gestures, "cheekPuff"), result.config);
    expect(e.details.join(" ")).toMatch(/triggers "smile"/);
  });
  it("calls a too-small gesture unreliable without claiming it worked", () => {
    const e = explainGesture(find(result.gestures, "jawLeft"), result.config);
    expect(e.verdict).toBe("poor");
    expect(e.details[0]).toMatch(/Too small/);
    expect(e.details.join(" ")).not.toMatch(/Worked/);
  });
  it("says why an inconsistent gesture was rejected", () => {
    const e = explainGesture(find(result.gestures, "browLower"), result.config);
    expect(e.details.join(" ")).toMatch(/some tries but not others/);
  });
});

describe("profile", () => {
  const result = analyze();
  const actions = assignActions(selectGestures(result).chosen);

  it("round-trips through JSON", () => {
    const p = buildProfile(result, actions, 120000, new Date("2026-10-16T00:00:00Z"));
    expect(parseProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it("requires a SELECT gesture and distinct gestures", () => {
    expect(() => buildProfile(result, { NEXT: "browRaise" }, 0)).toThrow(/SELECT/);
    expect(() => buildProfile(result, { SELECT: "browRaise", NEXT: "browRaise" }, 0)).toThrow(/different/);
  });

  it("rejects damaged stored data", () => {
    expect(parseProfile(null)).toBeNull();
    expect(parseProfile({ version: 1, bindings: [{ action: "SELECT", gesture: "nope" }] })).toBeNull();
  });
});
