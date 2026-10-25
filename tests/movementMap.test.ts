import { describe, expect, it } from "vitest";
import { analyzeCalibration, type CalibrationResult, type GestureStats, DEFAULT_CALIBRATION } from "../src/signal/calibration";
import {
  BASE_COLOR,
  BIN_COLORS,
  binOf,
  colorFor,
  gestureValue,
  legendEntries,
  NOT_TESTED_COLOR,
  pointColors,
  regionNodes,
  regionScores,
  regionText,
  TESTABLE_REGIONS,
  type RegionId,
} from "../src/signal/movementMap";
import { traceFrames } from "../src/signal/trace";
import { standardPerson } from "./synth";

function stat(id: GestureStats["id"], hitRate: number, gap: number, usable = true, problems: GestureStats["problems"] = []): GestureStats {
  return {
    id, hitRate, gap, usable, reps: 5, restLevel: 0, peaks: [], typicalPeak: gap, on: 0, off: 0,
    auc: 1, reactionMs: null, crossTalk: {}, score: 0, problems,
  };
}

function result(gestures: GestureStats[]): CalibrationResult {
  return { gestures, skipped: [], restSeconds: 15, config: DEFAULT_CALIBRATION };
}

describe("gestureValue", () => {
  it("reliability is the hit rate", () => {
    expect(gestureValue(stat("smile", 0.8, 0.5), "reliability", 0.3)).toBe(0.8);
  });
  it("a movement too small to tell apart from rest is NOT shown as reliable, even with a 100% hit rate", () => {
    expect(gestureValue(stat("jawLeft", 1, 0.05, false, ["weak"]), "reliability", 0.3)).toBe(0);
    expect(gestureValue(stat("jawLeft", 1, 0.2, false, ["overlaps-rest"]), "reliability", 0.3)).toBe(0);
  });
  it("an inconsistent movement keeps its real hit rate", () => {
    expect(gestureValue(stat("browLower", 0.6, 0.4, false, ["inconsistent"]), "reliability", 0.3)).toBe(0.6);
  });
  it("range is gap / fullGap, capped at 100%", () => {
    expect(gestureValue(stat("smile", 1, 0.15), "range", 0.3)).toBeCloseTo(0.5);
    expect(gestureValue(stat("smile", 1, 0.9), "range", 0.3)).toBe(1);
    expect(gestureValue(stat("smile", 1, -0.1), "range", 0.3)).toBe(0);
  });
});

describe("regionScores", () => {
  const r = result([stat("smile", 1, 0.6), stat("pucker", 0.4, 0.1, false), stat("winkLeft", 0.6, 0.3)]);
  const scores = regionScores(r, "reliability");

  it("a region takes the HIGHEST value among its gestures", () => {
    expect(scores.lips.value).toBe(1);
  });

  it("lists every gesture in the region, best first", () => {
    expect(scores.lips.gestures.map((g) => g.id)).toEqual(["smile", "pucker"]);
  });

  it("close-left-eye colors the person's LEFT eye only", () => {
    expect(scores.leftEye.value).toBe(0.6);
    expect(scores.rightEye.value).toBeNull();
  });

  it("untested regions are null (not tested), not 0", () => {
    expect(scores.leftCheek.value).toBeNull();
    expect(scores.jaw.value).toBeNull();
  });

  it("a tested gesture that scored 0 gives 0, not null", () => {
    const s = regionScores(result([stat("cheekPuff", 0, 0.2, false, ["inconsistent"])]), "reliability");
    expect(s.leftCheek.value).toBe(0);
    expect(s.rightCheek.value).toBe(0);
  });

  it("open mouth counts for both lips and jaw", () => {
    const s = regionScores(result([stat("mouthOpen", 0.8, 0.3)]), "reliability");
    expect(s.lips.value).toBe(0.8);
    expect(s.jaw.value).toBe(0.8);
  });

  it("works on a real analysis result (synthetic test person)", () => {
    const trace = standardPerson();
    const a = analyzeCalibration(traceFrames(trace), trace.markers);
    const s = regionScores(a, "reliability");
    expect(s.leftBrow.value).toBe(1); // browRaise worked 5/5
    expect(s.rightEye.value).toBeNull(); // winkRight wasn't tested
    expect(s.jaw.value).toBe(0); // jawLeft was too small: not shown as reliable
  });
});

describe("bins and colors", () => {
  it("splits 0..100% into 5 bins, with 100% in the top bin", () => {
    expect([0, 0.19, 0.2, 0.5, 0.79, 0.8, 1].map(binOf)).toEqual([0, 0, 1, 2, 3, 4, 4]);
  });
  it("clamps out-of-range values", () => {
    expect(binOf(-1)).toBe(0);
    expect(binOf(2)).toBe(4);
  });
  it("not tested has its own color, different from every bin", () => {
    expect(colorFor(null)).toBe(NOT_TESTED_COLOR);
    expect(BIN_COLORS).not.toContain(NOT_TESTED_COLOR);
  });
  it("the legend has a text label for every color", () => {
    const l = legendEntries();
    expect(l.map((e) => e.label)).toEqual(["0–20%", "20–40%", "40–60%", "60–80%", "80–100%", "Not tested", "Rest of face"]);
    expect(new Set(l.map((e) => e.color)).size).toBe(l.length);
  });
});

describe("pointColors", () => {
  const regions = { leftEye: [0, 1], rightEye: [2], leftBrow: [], rightBrow: [], lips: [3], leftCheek: [], rightCheek: [], jaw: [3, 4] } as Record<
    RegionId,
    number[]
  >;

  it("colors region points and leaves the rest as base", () => {
    const s = regionScores(result([stat("winkLeft", 1, 0.5)]), "reliability");
    const c = pointColors(s, regions, 6);
    expect(c[0]).toBe(BIN_COLORS[4]);
    expect(c[2]).toBe(NOT_TESTED_COLOR);
    expect(c[5]).toBe(BASE_COLOR);
  });

  it("a point in two regions takes the earlier region in the fixed order (lips before jaw)", () => {
    const s = regionScores(result([stat("smile", 1, 0.5), stat("jawLeft", 0, 0, false)]), "reliability");
    expect(pointColors(s, regions, 6)[3]).toBe(BIN_COLORS[4]);
  });

  it("with no calibration, every region shows as not tested", () => {
    const c = pointColors(null, regions, 6);
    expect(c[0]).toBe(NOT_TESTED_COLOR);
    expect(c[5]).toBe(BASE_COLOR);
  });

  it("ignores out-of-range indices instead of crashing", () => {
    expect(() => pointColors(null, { ...regions, jaw: [99] }, 6)).not.toThrow();
  });
});

describe("regionText", () => {
  it("gives the number and each gesture in words", () => {
    const s = regionScores(result([stat("smile", 1, 0.6), stat("pucker", 0.4, 0.1)]), "reliability");
    expect(regionText(s.lips)).toBe("Lips: 100% (Smile 100%, Pucker lips 40%)");
    expect(regionText(s.leftCheek)).toBe("Left cheek: not tested");
  });
});

describe("regionNodes (the dots on the 3D head)", () => {
  it("nothing calibrated yet: every testable region gets a red 'not tested yet' dot; the cheeks get none", () => {
    const nodes = regionNodes(null);
    expect(nodes).toHaveLength(8);
    for (const n of nodes) {
      expect(n.color).toBeNull();
      if (n.region === "leftCheek" || n.region === "rightCheek") {
        // Puff cheeks was retired, so nothing can test the cheeks any more.
        expect(n.state).toBe("unavailable");
        expect(n.label).toMatch(/no test for this area$/);
      } else {
        expect(n.state).toBe("untested");
        expect(n.label).toMatch(/not tested yet$/);
      }
    }
  });

  it("an older calibration that tested Puff cheeks still shows the cheeks as tested", () => {
    const nodes = regionNodes(regionScores(result([stat("cheekPuff", 1, 0.3)]), "reliability"));
    expect(nodes.find((n) => n.region === "leftCheek")).toMatchObject({ state: "tested", label: "Left cheek · 100%" });
  });

  it("tested regions use their result color and show the number; the rest stay untested", () => {
    const nodes = regionNodes(regionScores(result([stat("mouthOpen", 0.8, 0.3)]), "reliability"));
    const lips = nodes.find((n) => n.region === "lips")!;
    expect(lips).toMatchObject({ state: "tested", color: colorFor(0.8), label: "Lips · 80%" });
    expect(nodes.find((n) => n.region === "leftEye")!.state).toBe("untested");
  });

  it("a tested movement that scored 0% is tested, not 'not tested'", () => {
    const nodes = regionNodes(regionScores(result([stat("cheekPuff", 0, 0.2, false, ["inconsistent"])]), "reliability"));
    expect(nodes.find((n) => n.region === "leftCheek")).toMatchObject({ state: "tested", label: "Left cheek · 0%" });
  });
});

describe("retired gestures and the face regions", () => {
  it("the cheeks can't be tested any more; the jaw still can (Jaw to your right)", () => {
    expect(TESTABLE_REGIONS.has("leftCheek")).toBe(false);
    expect(TESTABLE_REGIONS.has("rightCheek")).toBe(false);
    expect(TESTABLE_REGIONS.has("jaw")).toBe(true);
    expect(TESTABLE_REGIONS.has("lips")).toBe(true);
  });

  it("untestable regions are colored like the rest of the face, not 'not tested'", () => {
    const regions = { leftBrow: [0], rightBrow: [1], leftEye: [2], rightEye: [3], lips: [4], leftCheek: [5], rightCheek: [6], jaw: [7] };
    const colors = pointColors(null, regions, 8);
    expect(colors[5]).toBe(BASE_COLOR);
    expect(colors[6]).toBe(BASE_COLOR);
    expect(colors[4]).toBe(NOT_TESTED_COLOR);
  });
});

