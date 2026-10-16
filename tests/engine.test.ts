import { describe, expect, it } from "vitest";
import { ControlEngine, DEFAULT_ENGINE } from "../src/signal/engine";
import type { Binding } from "../src/signal/profile";
import type { BlendshapeFrame } from "../src/signal/types";

const bindings: Binding[] = [
  { action: "SELECT", gesture: "browRaise", on: 0.4, off: 0.25, restLevel: 0.05, typicalPeak: 0.8 },
  { action: "NEXT", gesture: "smile", on: 0.4, off: 0.25, restLevel: 0.05, typicalPeak: 0.8 },
];

const params = { ...DEFAULT_ENGINE, tauMs: 0 }; // no smoothing: easier to reason about in tests

function frame(t: number, scores: Record<string, number>, face = true): BlendshapeFrame {
  return { t, face, scores };
}

/** Runs a script of [durationMs, scores] steps at 20 ms per frame; returns fired actions with times. */
function play(engine: ControlEngine, script: [number, Record<string, number> | null][]): [number, string][] {
  const out: [number, string][] = [];
  let t = 0;
  for (const [dur, scores] of script) {
    for (const end = t + dur; t < end; t += 20) {
      const r = engine.update(frame(t, scores ?? {}, scores !== null));
      if (r.fired) out.push([t, r.fired]);
    }
  }
  return out;
}

describe("ControlEngine", () => {
  it("fires the bound action for a held gesture, once", () => {
    const e = new ControlEngine(bindings, params);
    const fired = play(e, [[500, {}], [800, { browInnerUp: 0.7 }], [500, {}]]);
    expect(fired.map((f) => f[1])).toEqual(["SELECT"]);
  });

  it("ignores a short twitch", () => {
    const e = new ControlEngine(bindings, params);
    expect(play(e, [[500, {}], [100, { browInnerUp: 0.9 }], [500, {}]])).toEqual([]);
  });

  it("one at a time: a second gesture during a held one does not fire", () => {
    const e = new ControlEngine(bindings, params);
    const fired = play(e, [
      [500, {}],
      [400, { browInnerUp: 0.7 }],
      [800, { browInnerUp: 0.7, mouthSmileLeft: 0.7 }],
      [500, {}],
    ]);
    expect(fired.map((f) => f[1])).toEqual(["SELECT"]);
  });

  it("does not fire while the face is missing, and requires relaxing after a long gap", () => {
    const e = new ControlEngine(bindings, params);
    const fired = play(e, [
      [500, {}],
      [200, { browInnerUp: 0.7 }],
      [1000, null], // face lost
      [800, { browInnerUp: 0.7 }], // comes back already raised: must relax first
    ]);
    expect(fired).toEqual([]);
  });

  it("two separate gestures both fire", () => {
    const e = new ControlEngine(bindings, params);
    const fired = play(e, [
      [500, {}],
      [500, { browInnerUp: 0.7 }],
      [600, {}],
      [500, { mouthSmileLeft: 0.7 }],
      [500, {}],
    ]);
    expect(fired.map((f) => f[1])).toEqual(["SELECT", "NEXT"]);
  });

  it("reports progress toward the threshold for meters", () => {
    const e = new ControlEngine(bindings, params);
    e.update(frame(0, {}));
    const r = e.update(frame(20, { browInnerUp: 0.4 }));
    expect(r.channels[0].progress).toBeCloseTo(1);
  });

  it("setThresholds changes when an action fires", () => {
    const e = new ControlEngine(bindings, params);
    e.setThresholds("SELECT", 0.8, 0.5);
    expect(play(e, [[500, {}], [800, { browInnerUp: 0.7 }]])).toEqual([]);
  });
});
