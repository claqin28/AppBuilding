/**
 * One moment of face data, in the simplest form the rest of the app needs.
 *
 * - `t` is the time in milliseconds (from performance.now() or a replayed trace).
 * - `face` is false when no face was found in this frame; then `scores` is empty.
 * - `scores` maps a blendshape name (e.g. "jawOpen") to a score from 0 to 1,
 *   where 0 means "not doing this at all" and 1 means "doing it as much as the
 *   model has ever seen".
 *
 * Everything in src/signal works on these plain objects, never on the camera,
 * so it can be unit-tested and fed from recorded traces.
 */
export interface BlendshapeFrame {
  t: number;
  face: boolean;
  scores: Record<string, number>;
}

/** A 2D point in normalized image coordinates (0..1 across the camera image). */
export interface Point2 {
  x: number;
  y: number;
}

/** A face landmark: x, y from 0 to 1 across the image; z = depth on the same scale as x. */
export interface Point3 extends Point2 {
  z: number;
}
