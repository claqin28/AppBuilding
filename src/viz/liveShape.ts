/**
 * Converts live Face Landmarker landmarks into the same 3D frame as the
 * standard face, so both can be drawn by the same 3D view.
 *
 * Landmarks come as x and y from 0 to 1 across the camera image, and z as
 * depth on the same scale as x (smaller z = closer to the camera). The
 * standard face is in centimetres with +x = the person's left, +y = up,
 * +z = toward the viewer. So:
 *   X =  (x - centre) × image width     (the person's left is the image's right)
 *   Y = -(y - centre) × image height    (image y points down; ours points up)
 *   Z = -z × image width                (closer to the camera = toward the viewer)
 * then everything is scaled so the face is as wide as the standard face.
 *
 * The head turns with the person (no pose correction). That's intentional:
 * it mirrors them in real time. No Three.js or React here.
 */
import { CANONICAL_FACE, CANONICAL_POINT_COUNT } from "./canonicalFace";

interface Point3 {
  x: number;
  y: number;
  z: number;
}

const CANONICAL_WIDTH = (() => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < CANONICAL_POINT_COUNT; i++) {
    min = Math.min(min, CANONICAL_FACE[i * 3]);
    max = Math.max(max, CANONICAL_FACE[i * 3]);
  }
  return max - min;
})();

/** Returns 468 × (x, y, z), centred on the face, in standard-face units. */
export function liveToModel(landmarks: readonly Point3[], imageWidth: number, imageHeight: number): Float32Array {
  const n = CANONICAL_POINT_COUNT;
  const out = new Float32Array(n * 3);
  if (landmarks.length < n) return out;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    const p = landmarks[i];
    const X = p.x * imageWidth;
    const Y = -p.y * imageHeight;
    const Z = -p.z * imageWidth;
    out[i * 3] = X;
    out[i * 3 + 1] = Y;
    out[i * 3 + 2] = Z;
    cx += X;
    cy += Y;
    cz += Z;
  }
  cx /= n;
  cy /= n;
  cz /= n;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    min = Math.min(min, out[i * 3]);
    max = Math.max(max, out[i * 3]);
  }
  const scale = max > min ? CANONICAL_WIDTH / (max - min) : 1;
  for (let i = 0; i < n; i++) {
    out[i * 3] = (out[i * 3] - cx) * scale;
    out[i * 3 + 1] = (out[i * 3 + 1] - cy) * scale;
    out[i * 3 + 2] = (out[i * 3 + 2] - cz) * scale;
  }
  return out;
}

/** The standard face, centred the same way. */
export function standardShape(): Float32Array {
  const n = CANONICAL_POINT_COUNT;
  const out = new Float32Array(CANONICAL_FACE);
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += out[i * 3 + k] / n;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) out[i * 3 + k] -= c[k];
  return out;
}
