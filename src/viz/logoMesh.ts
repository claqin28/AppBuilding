/**
 * The geometry behind the Tessera logo: a low-poly, front-on (2D) version of
 * MediaPipe's standard face, as triangles. Pure TypeScript, no DOM; drawn by
 * src/ui/faceLogo.ts.
 *
 * How the points are chosen:
 *   1. Feature points first, from MediaPipe's connection sets (Apache-2.0):
 *      the face outline, both eyes, both eyebrows, and the outer lips,
 *      thinned out (every 2nd or 4th point along each outline), plus a few
 *      nose points that give the face its shape. A point is skipped if it's
 *      almost on top of one already chosen (e.g. the upper and lower inner
 *      lip, which touch on the standard face).
 *   2. Fill the rest evenly with "farthest-point sampling": repeatedly add the
 *      face point that is farthest from every point chosen so far, until no
 *      point is farther than `spacing`. Even spacing is what avoids long,
 *      thin "sliver" triangles fanning out from the eyes and mouth.
 *   3. Connect the points with Delaunay triangulation (src/viz/delaunay.ts).
 *
 * "small" uses fewer, bigger triangles so the logo still reads at 32-48 px.
 */
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { CANONICAL_FACE, CANONICAL_POINT_COUNT } from "./canonicalFace";
import { delaunay, type Pt, type Tri } from "./delaunay";

export type LogoDetail = "full" | "small";

interface Connection {
  start: number;
  end: number;
}

export interface LogoMesh {
  /** Landmark number of each point. */
  ids: number[];
  /** Front view, in cm: x = person's left, y = down (screen direction). */
  points2: Pt[];
  /** The same points in 3D (canonical face, cm), for shading. */
  points3: [number, number, number][];
  tris: Tri[];
  /** True for triangles that fill an eye (drawn in the brand color). */
  eye: boolean[];
  /** True for triangles that fill the lips (drawn darker). */
  mouth: boolean[];
}

// Nose tip, bridge, between the eyes, and the sides of the nostrils.
const NOSE_FULL = [1, 4, 6, 168, 98, 327, 2];
const NOSE_SMALL = [1, 168, 98, 327];

const SETTINGS: Record<LogoDetail, { outline: number; eye: number; brow: number; lips: number; nose: number[]; spacing: number }> = {
  full: { outline: 1, eye: 2, brow: 1, lips: 2, nose: NOSE_FULL, spacing: 1.55 },
  small: { outline: 2, eye: 4, brow: 2, lips: 4, nose: NOSE_SMALL, spacing: 2.6 },
};

/** Two chosen points closer than this (cm) count as the same point. */
export const MIN_SEPARATION = 0.35;

const cache = new Map<LogoDetail, LogoMesh>();

export function buildLogoMesh(detail: LogoDetail = "full"): LogoMesh {
  const hit = cache.get(detail);
  if (hit) return hit;
  const s = SETTINGS[detail];
  const p3 = (i: number): [number, number, number] => [CANONICAL_FACE[i * 3], CANONICAL_FACE[i * 3 + 1], CANONICAL_FACE[i * 3 + 2]];
  const p2 = (i: number): Pt => [CANONICAL_FACE[i * 3], -CANONICAL_FACE[i * 3 + 1]];

  const ids: number[] = [];
  const minDist = new Float64Array(CANONICAL_POINT_COUNT).fill(Infinity);
  const add = (id: number): void => {
    const [x, y] = p2(id);
    if (minDist[id] < MIN_SEPARATION) return; // (almost) a duplicate
    ids.push(id);
    for (let j = 0; j < CANONICAL_POINT_COUNT; j++) {
      const [qx, qy] = p2(j);
      minDist[j] = Math.min(minDist[j], Math.hypot(qx - x, qy - y));
    }
  };

  // 1. Feature points.
  const F = FaceLandmarker;
  for (const id of everyNth(chains(F.FACE_LANDMARKS_FACE_OVAL)[0], s.outline)) add(id);
  const eyeLoops = [chains(F.FACE_LANDMARKS_LEFT_EYE)[0], chains(F.FACE_LANDMARKS_RIGHT_EYE)[0]];
  for (const loop of eyeLoops) for (const id of everyNth(loop, s.eye)) add(id);
  for (const set of [F.FACE_LANDMARKS_LEFT_EYEBROW, F.FACE_LANDMARKS_RIGHT_EYEBROW]) {
    for (const chain of chains(set)) for (const id of everyNth(chain, s.brow)) add(id);
  }
  // The lips set holds two loops: outer and inner. The outer one is the longer way round.
  const lipLoops = chains(F.FACE_LANDMARKS_LIPS).sort((a, b) => loopLength(b, p2) - loopLength(a, p2));
  for (const id of everyNth(lipLoops[0], s.lips)) add(id);
  for (const id of s.nose) add(id);

  // 2. Farthest-point sampling for even coverage.
  for (;;) {
    let best = -1;
    for (let j = 0; j < CANONICAL_POINT_COUNT; j++) if (best < 0 || minDist[j] > minDist[best]) best = j;
    if (minDist[best] < s.spacing) break;
    add(best);
  }

  // 3. Triangles.
  const points2 = ids.map(p2);
  const tris = delaunay(points2);
  const eyeSets = eyeLoops.map((loop) => new Set(loop));
  const eye = tris.map((t) => eyeSets.some((set) => t.every((k) => set.has(ids[k]))));
  const lipSet = new Set(lipLoops[0]);
  const mouth = tris.map((t) => t.every((k) => lipSet.has(ids[k])));
  const mesh: LogoMesh = { ids, points2, points3: ids.map(p3), tris, eye, mouth };
  cache.set(detail, mesh);
  return mesh;
}

/**
 * Splits a connection set into its connected pieces, each as an ordered list
 * of points (walking along the lines). Only the 468 face points are kept.
 */
export function chains(set: readonly Connection[]): number[][] {
  const next = new Map<number, number[]>();
  const link = (a: number, b: number) => next.set(a, [...(next.get(a) ?? []), b]);
  for (const { start, end } of set) {
    if (start >= CANONICAL_POINT_COUNT || end >= CANONICAL_POINT_COUNT) continue;
    link(start, end);
    link(end, start);
  }
  const seen = new Set<number>();
  const out: number[][] = [];
  // Start open lines at an end point; closed loops anywhere.
  const starts = [...next.keys()].sort((a, b) => (next.get(a)!.length - next.get(b)!.length) || a - b);
  for (const first of starts) {
    if (seen.has(first)) continue;
    const chain = [first];
    seen.add(first);
    for (let cur = first; ; ) {
      const step = next.get(cur)!.find((n) => !seen.has(n));
      if (step === undefined) break;
      chain.push(step);
      seen.add(step);
      cur = step;
    }
    out.push(chain);
  }
  return out;
}

function everyNth(chain: number[], n: number): number[] {
  return chain.filter((_, i) => i % n === 0);
}

function loopLength(chain: number[], p: (i: number) => Pt): number {
  let total = 0;
  for (let i = 0; i < chain.length; i++) {
    const [a, b] = [p(chain[i]), p(chain[(i + 1) % chain.length])];
    total += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return total;
}
