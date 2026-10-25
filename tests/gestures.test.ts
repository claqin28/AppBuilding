import { describe, expect, it } from "vitest";
import { GESTURES, isGestureId, OFFERED_GESTURES } from "../src/signal/gestures";
import { parseProfile } from "../src/signal/profile";

describe("which gestures calibration offers", () => {
  it("Open mouth, Puff cheeks, and both jaw movements are no longer offered", () => {
    const offered = OFFERED_GESTURES.map((g) => g.id);
    for (const id of ["mouthOpen", "cheekPuff", "jawLeft", "jawRight"]) expect(offered).not.toContain(id);
    expect(offered).toEqual(["browRaise", "browLower", "smile", "pucker", "winkLeft", "winkRight", "mouthLeft", "mouthRight"]);
  });

  it("retired gestures are never ticked by default", () => {
    for (const g of GESTURES) if (!g.offered) expect(g.defaultOn, g.id).toBe(false);
  });

  it("a profile saved with a retired gesture still loads (the names are still known)", () => {
    expect(isGestureId("cheekPuff")).toBe(true);
    const old = {
      version: 1,
      createdAt: "2026-10-20T00:00:00.000Z",
      calibrationMs: 1,
      tauMs: 80,
      holdMs: 250,
      bindings: [{ action: "SELECT", gesture: "cheekPuff", on: 0.4, off: 0.2, restLevel: 0.02, typicalPeak: 0.7 }],
    };
    expect(parseProfile(old)?.bindings[0].gesture).toBe("cheekPuff");
  });
});
