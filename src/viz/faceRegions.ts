/**
 * Which face points belong to which region of the movement map.
 *
 * Eyes, eyebrows, and lips come straight from MediaPipe's own landmark
 * connection sets (FaceLandmarker.FACE_LANDMARKS_*; Apache-2.0). MediaPipe's
 * "LEFT" sets are the person's own left (checked 2026-10-19).
 *
 * Cheeks and jaw have no MediaPipe set, so they're chosen by position on the
 * standard (canonical) face, using lines measured from the other regions
 * rather than hard-coded numbers:
 *   jaw/chin = points below the lowest lip point
 *   cheeks   = points between the mouth corners and the bottom of the eyes,
 *              further out to the side than the mouth corners
 *              (split into left and right: +x is the person's left)
 *
 * No Three.js or React here.
 */
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { RegionId } from "../signal/movementMap";
import { CANONICAL_FACE, CANONICAL_POINT_COUNT } from "./canonicalFace";

/** MediaPipe's connection type isn't exported, so we describe its shape here. */
interface Connection {
  start: number;
  end: number;
}

/** Unique point indices used by a list of connections (only the 468 face points). */
function indicesOf(...sets: Connection[][]): number[] {
  const ids = new Set<number>();
  for (const set of sets) {
    for (const c of set) {
      if (c.start < CANONICAL_POINT_COUNT) ids.add(c.start);
      if (c.end < CANONICAL_POINT_COUNT) ids.add(c.end);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

const x = (i: number) => CANONICAL_FACE[i * 3];
const y = (i: number) => CANONICAL_FACE[i * 3 + 1];

export function buildRegions(): Record<RegionId, number[]> {
  const leftEye = indicesOf(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE);
  const rightEye = indicesOf(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE);
  const leftBrow = indicesOf(FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW);
  const rightBrow = indicesOf(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW);
  const lips = indicesOf(FaceLandmarker.FACE_LANDMARKS_LIPS);

  const taken = new Set([...leftEye, ...rightEye, ...leftBrow, ...rightBrow, ...lips]);
  const lowestLipY = Math.min(...lips.map(y));
  const mouthCornerX = Math.max(...lips.map((i) => Math.abs(x(i))));
  const mouthCornerY = y(lips.reduce((a, b) => (Math.abs(x(b)) > Math.abs(x(a)) ? b : a)));
  const eyeBottomY = Math.min(...[...leftEye, ...rightEye].map(y));

  const jaw: number[] = [];
  const leftCheek: number[] = [];
  const rightCheek: number[] = [];
  for (let i = 0; i < CANONICAL_POINT_COUNT; i++) {
    if (taken.has(i)) continue;
    if (y(i) < lowestLipY) jaw.push(i);
    else if (y(i) > mouthCornerY && y(i) < eyeBottomY && Math.abs(x(i)) > mouthCornerX) {
      (x(i) > 0 ? leftCheek : rightCheek).push(i);
    }
  }
  return { leftEye, rightEye, leftBrow, rightBrow, lips, leftCheek, rightCheek, jaw };
}

/** Mesh edges: unique pairs from MediaPipe's tesselation (852 triangles, 0-467). */
export function meshEdges(): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const c of FaceLandmarker.FACE_LANDMARKS_TESSELATION) {
    const a = Math.min(c.start, c.end);
    const b = Math.max(c.start, c.end);
    const key = `${a},${b}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push([a, b]);
    }
  }
  return out;
}

/** Region centre on the standard face, for placing text labels. */
export function regionCentre(points: ArrayLike<number>, ids: readonly number[]): [number, number, number] {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const i of ids) {
    sx += points[i * 3];
    sy += points[i * 3 + 1];
    sz += points[i * 3 + 2];
  }
  const n = Math.max(1, ids.length);
  return [sx / n, sy / n, sz / n];
}
