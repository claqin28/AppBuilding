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
 *   3. Give it a friendlier expression. The standard face is neutral with
 *      nearly closed eyes, which reads as stern, so we gently open the eyes
 *      and lift the mouth corners into a slight smile (see `friendlier`).
 *   4. Connect the points with Delaunay triangulation (src/viz/delaunay.ts).
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
  /** True for triangles that fill the lips (drawn a little darker than the skin). */
  mouth: boolean[];
  /** A thin crescent where the lips meet: the smile line (front view). */
  smile: Pt[];
  /** Each eye's centre and size (front view, after opening), for the eye highlights. */
  eyes: { cx: number; cy: number; w: number; h: number }[];
}

/** How much taller the eyes are drawn than on the (nearly closed) standard face. */
export const EYE_OPEN = 1.8;
/** How far the mouth corners are lifted, in cm. Small on purpose: a slight smile, not a cartoon. */
export const SMILE_LIFT = 0.4;

// Nose tip, bridge, between the eyes, and the sides of the nostrils.
const NOSE_FULL = [1, 4, 6, 168, 98, 327, 2];
const NOSE_SMALL = [1, 168, 98, 327];

const SETTINGS: Record<LogoDetail, { outline: number; eye: number; brow: number; lips: number; nose: number[]; spacing: number; smileThickness: number }> = {
  full: { outline: 1, eye: 2, brow: 1, lips: 2, nose: NOSE_FULL, spacing: 1.55, smileThickness: 0.3 },
  // Thicker smile line when small, so it's still about 2 px at 48 px.
  small: { outline: 2, eye: 4, brow: 2, lips: 5, nose: NOSE_SMALL, spacing: 2.6, smileThickness: 0.6 },
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
  // Eye and lip outlines start at their left corner, so thinning them always keeps
  // both corners (each outline has an even number of points, corners half-way round).
  const eyeLoops = [chains(F.FACE_LANDMARKS_LEFT_EYE)[0], chains(F.FACE_LANDMARKS_RIGHT_EYE)[0]].map((l) => fromLeftmost(l, p2));
  for (const loop of eyeLoops) for (const id of everyNth(loop, s.eye)) add(id);
  for (const set of [F.FACE_LANDMARKS_LEFT_EYEBROW, F.FACE_LANDMARKS_RIGHT_EYEBROW]) {
    for (const chain of chains(set)) for (const id of everyNth(chain, s.brow)) add(id);
  }
  // The lips set holds two loops: outer and inner. The outer one is the longer way round.
  const lipLoops = chains(F.FACE_LANDMARKS_LIPS)
    .sort((a, b) => loopLength(b, p2) - loopLength(a, p2))
    .map((l) => fromLeftmost(l, p2));
  for (const id of everyNth(lipLoops[0], s.lips)) add(id);
  for (const id of s.nose) add(id);

  // 2. Farthest-point sampling for even coverage.
  for (;;) {
    let best = -1;
    for (let j = 0; j < CANONICAL_POINT_COUNT; j++) if (best < 0 || minDist[j] > minDist[best]) best = j;
    if (minDist[best] < s.spacing) break;
    add(best);
  }

  // 3. A friendlier expression, then 4. triangles.
  const move = friendlier(eyeLoops, lipLoops[0], p2);
  const points2 = ids.map(move);
  // Keep 3D in step with the moved points (screen y is the face's -y), for shading.
  const points3 = ids.map((id, k): [number, number, number] => [points2[k][0], -points2[k][1], p3(id)[2]]);
  const tris = delaunay(points2);
  const eyeSets = eyeLoops.map((loop) => new Set(loop));
  const eye = tris.map((t) => eyeSets.some((set) => t.every((k) => set.has(ids[k]))));
  const lipSet = new Set(lipLoops[0]);
  const mouth = tris.map((t) => t.every((k) => lipSet.has(ids[k])));
  const eyes = eyeSets.map((set) => {
    const pts = points2.filter((_, k) => set.has(ids[k]));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  });
  const smile = smileLine(lipLoops[1], move, s.smileThickness);
  const mesh: LogoMesh = { ids, points2, points3, tris, eye, mouth, smile, eyes };
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

/**
 * Returns a function giving each face point's front-view position with:
 *  - the eyes opened: each eye outline point moves away from its eye's middle
 *    line, EYE_OPEN times as far as on the standard face.
 *  - a slight smile: points near the mouth move up, the most at the mouth
 *    corners (none at the middle), fading out within about 1 cm past the
 *    corners and about 1.5 cm above and below the mouth.
 */
function friendlier(eyeLoops: number[][], outerLips: number[], p: (i: number) => Pt): (id: number) => Pt {
  const eyeMid = new Map<number, number>();
  for (const loop of eyeLoops) {
    const midY = loop.reduce((s, id) => s + p(id)[1], 0) / loop.length;
    for (const id of loop) eyeMid.set(id, midY);
  }
  const lips = outerLips.map(p);
  const mx = lips.reduce((s, q) => s + q[0], 0) / lips.length;
  const my = lips.reduce((s, q) => s + q[1], 0) / lips.length;
  const halfWidth = Math.max(...lips.map((q) => Math.abs(q[0] - mx)));

  return (id) => {
    let [x, y] = p(id);
    const midY = eyeMid.get(id);
    if (midY !== undefined) y = midY + (y - midY) * EYE_OPEN;
    const u = Math.abs(x - mx) / halfWidth; // 0 at the middle, 1 at a corner
    const across = u <= 1 ? u * u : Math.exp(-(((u - 1) * halfWidth) ** 2)); // fades over ~1 cm
    const along = Math.exp(-(((y - my) / 1.5) ** 2));
    y -= SMILE_LIFT * across * along; // screen y points down, so minus = up
    return [x, y];
  };
}

/**
 * The smile line: where the lips meet (the middle of the inner lip outline,
 * which is closed on the standard face), as a crescent that's thickest in the
 * middle and tapers toward the corners.
 */
function smileLine(innerLips: number[], move: (id: number) => Pt, thickness: number): Pt[] {
  // innerLips starts at the left corner; the right corner is half-way round.
  const half = innerLips.length / 2;
  const line: Pt[] = [];
  for (let k = 0; k <= half; k++) {
    const [a, b] = [move(innerLips[k]), move(innerLips[(innerLips.length - k) % innerLips.length])];
    line.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  const [x0, x1] = [line[0][0], line[line.length - 1][0]];
  const below = line
    .slice(1, -1)
    .reverse()
    .map(([x, y]): Pt => {
      const u = (2 * (x - x0)) / (x1 - x0) - 1; // -1 at the left corner, 1 at the right
      return [x, y + thickness * Math.sqrt(Math.max(0, 1 - u * u))];
    });
  return [...line, ...below];
}

/** The same closed loop, starting at its leftmost point. */
function fromLeftmost(loop: number[], p: (i: number) => Pt): number[] {
  const start = loop.reduce((best, id, k) => (p(id)[0] < p(loop[best])[0] ? k : best), 0);
  return [...loop.slice(start), ...loop.slice(0, start)];
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
