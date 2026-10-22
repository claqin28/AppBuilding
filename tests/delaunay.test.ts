import { describe, expect, it } from "vitest";
import { delaunay, inCircumcircle, type Pt } from "../src/viz/delaunay";
import { rng } from "./synth";

describe("delaunay", () => {
  it("a square becomes 2 triangles", () => {
    expect(delaunay([[0, 0], [1, 0], [1, 1], [0, 1]])).toHaveLength(2);
  });

  it("fewer than 3 points gives no triangles", () => {
    expect(delaunay([[0, 0], [1, 1]])).toEqual([]);
  });

  it("ignores duplicate points", () => {
    expect(delaunay([[0, 0], [1, 0], [0, 1], [0, 0]])).toHaveLength(1);
  });

  it("random points: no point lies inside any triangle's circumcircle (the Delaunay rule)", () => {
    const r = rng(3);
    const pts: Pt[] = Array.from({ length: 60 }, () => [r() * 100, r() * 100]);
    const tris = delaunay(pts);
    expect(tris.length).toBeGreaterThan(60);
    for (const [a, b, c] of tris) {
      for (let i = 0; i < pts.length; i++) {
        if (i === a || i === b || i === c) continue;
        expect(inCircumcircle(pts[i], pts[a], pts[b], pts[c])).toBe(false);
      }
    }
  });

  it("covers the whole area: triangle areas add up to the convex hull area", () => {
    const pts: Pt[] = [[0, 0], [4, 0], [4, 3], [0, 3], [2, 1], [1, 2], [3, 2]];
    const area = delaunay(pts).reduce((s, [a, b, c]) => {
      const [p, q, r] = [pts[a], pts[b], pts[c]];
      return s + Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])) / 2;
    }, 0);
    expect(area).toBeCloseTo(12);
  });
});
