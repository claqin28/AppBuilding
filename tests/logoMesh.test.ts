import { describe, expect, it } from "vitest";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { buildLogoMesh, chains, MIN_SEPARATION } from "../src/viz/logoMesh";
import type { Pt } from "../src/viz/delaunay";

function smallestAngle([p, q, r]: Pt[]): number {
  const angle = (a: Pt, b: Pt, c: Pt) => {
    const u = [b[0] - a[0], b[1] - a[1]];
    const v = [c[0] - a[0], c[1] - a[1]];
    return (Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]))) * 180) / Math.PI;
  };
  return Math.min(angle(p, q, r), angle(q, r, p), angle(r, p, q));
}

describe("chains", () => {
  it("walks an eye outline as one closed loop of 16 points", () => {
    const loops = chains(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(16);
  });

  it("splits the lips into an outer and an inner loop", () => {
    expect(chains(FaceLandmarker.FACE_LANDMARKS_LIPS).map((c) => c.length)).toEqual([20, 20]);
  });

  it("splits an eyebrow into its two lines", () => {
    expect(chains(FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW).map((c) => c.length)).toEqual([5, 5]);
  });
});

describe("logo mesh", () => {
  for (const detail of ["full", "small"] as const) {
    describe(detail, () => {
      const mesh = buildLogoMesh(detail);

      it("keeps the face outline", () => {
        const ids = new Set(mesh.ids);
        expect(ids.has(10)).toBe(true); // top of the forehead
        expect(ids.has(152)).toBe(true); // bottom of the chin
      });

      it("has no two points on top of each other", () => {
        const P = mesh.points2;
        for (let i = 0; i < P.length; i++) {
          for (let j = i + 1; j < P.length; j++) {
            expect(Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1])).toBeGreaterThanOrEqual(MIN_SEPARATION);
          }
        }
      });

      it("has no thin sliver triangles (every angle is at least 10°)", () => {
        for (const t of mesh.tris) expect(smallestAngle(t.map((k) => mesh.points2[k]))).toBeGreaterThanOrEqual(10);
      });

      it("fills both eyes and the mouth", () => {
        const eyeX = mesh.tris.filter((_, i) => mesh.eye[i]).map((t) => mesh.points2[t[0]][0]);
        expect(eyeX.some((x) => x > 0)).toBe(true); // person's left eye
        expect(eyeX.some((x) => x < 0)).toBe(true); // person's right eye
        expect(mesh.mouth.filter(Boolean).length).toBeGreaterThan(0);
      });
    });
  }

  it("the small version uses fewer, bigger triangles", () => {
    expect(buildLogoMesh("small").tris.length).toBeLessThan(buildLogoMesh("full").tris.length / 1.5);
  });
});
