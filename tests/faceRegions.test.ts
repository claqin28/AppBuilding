import { describe, expect, it } from "vitest";
import { REGION_IDS } from "../src/signal/movementMap";
import { CANONICAL_FACE, CANONICAL_POINT_COUNT } from "../src/viz/canonicalFace";
import { buildRegions, meshEdges, regionCentre } from "../src/viz/faceRegions";
import { liveToModel, standardShape } from "../src/viz/liveShape";

const regions = buildRegions();
const centre = (ids: number[]) => regionCentre(CANONICAL_FACE, ids);

describe("face regions on the standard face", () => {
  it("every region has points", () => {
    for (const r of REGION_IDS) expect(regions[r].length, r).toBeGreaterThan(5);
  });

  it("regions don't overlap", () => {
    const seen = new Map<number, string>();
    for (const r of REGION_IDS) {
      for (const i of regions[r]) {
        expect(seen.has(i), `point ${i} is in ${seen.get(i)} and ${r}`).toBe(false);
        seen.set(i, r);
      }
    }
  });

  it("'left' regions are on the person's left (+x on the standard face)", () => {
    expect(centre(regions.leftEye)[0]).toBeGreaterThan(0);
    expect(centre(regions.leftBrow)[0]).toBeGreaterThan(0);
    expect(centre(regions.rightEye)[0]).toBeLessThan(0);
  });

  it("vertical order makes sense: brows above eyes above cheeks above lips above jaw", () => {
    const y = (r: keyof typeof regions) => centre(regions[r])[1];
    expect(y("leftBrow")).toBeGreaterThan(y("leftEye"));
    expect(y("leftEye")).toBeGreaterThan(y("leftCheek"));
    expect(y("leftCheek")).toBeGreaterThan(y("lips"));
    expect(y("lips")).toBeGreaterThan(y("jaw"));
  });

  it("the left cheek is on the person's left, the right cheek on their right", () => {
    expect(regions.leftCheek.every((i) => CANONICAL_FACE[i * 3] > 0)).toBe(true);
    expect(regions.rightCheek.every((i) => CANONICAL_FACE[i * 3] < 0)).toBe(true);
  });

  it("only uses the 468 face points (no iris points)", () => {
    for (const r of REGION_IDS) for (const i of regions[r]) expect(i).toBeLessThan(CANONICAL_POINT_COUNT);
  });
});

describe("mesh edges", () => {
  it("are unique and within the 468 face points", () => {
    const edges = meshEdges();
    expect(edges.length).toBeGreaterThan(1000);
    expect(new Set(edges.map(([a, b]) => `${a},${b}`)).size).toBe(edges.length);
    for (const [a, b] of edges) {
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThan(CANONICAL_POINT_COUNT);
    }
  });
});

describe("live landmarks -> 3D shape", () => {
  // Fake "live" landmarks made from the standard face, as a camera would see it.
  const W = 640;
  const H = 480;
  const fake = Array.from({ length: CANONICAL_POINT_COUNT }, (_, i) => ({
    x: 0.5 + CANONICAL_FACE[i * 3] / 60, // person's left = image right
    y: 0.5 - CANONICAL_FACE[i * 3 + 1] / 45, // image y points down
    z: -CANONICAL_FACE[i * 3 + 2] / 60, // closer to camera = smaller z
  }));
  const live = liveToModel(fake, W, H);
  const std = standardShape();

  it("recovers the standard face shape (same orientation and size)", () => {
    let maxErr = 0;
    for (let i = 0; i < live.length; i++) maxErr = Math.max(maxErr, Math.abs(live[i] - std[i]));
    expect(maxErr).toBeLessThan(0.05);
  });

  it("returns zeros instead of crashing when landmarks are missing", () => {
    expect(liveToModel([], W, H).every((v) => v === 0)).toBe(true);
  });
});
