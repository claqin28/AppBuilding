/**
 * Setup checks: is the face well placed, and is the lighting usable?
 *
 * These are simple rules of thumb, not science. Their job is to catch the
 * common problems (face too small, half out of frame, room too dark, window
 * behind the user) before calibration, because bad setup produces bad
 * calibration data. All thresholds are named constants so they can be tuned.
 */
import type { Point2 } from "./types";

export interface CheckResult {
  ok: boolean;
  /** Plain-language message to show the user. */
  message: string;
}

/** Bounding box of the face, in normalized camera-image coordinates. */
export interface FaceBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Face width as a fraction of the image width. Below MIN = too far away. */
export const FACE_WIDTH_MIN = 0.2;
export const FACE_WIDTH_MAX = 0.75;
/** How far the face center may drift from the image center (fraction of image). */
export const CENTER_TOLERANCE = 0.2;
/** Nose offset from face center, as a fraction of face width, before we say "turned". */
export const TURN_TOLERANCE = 0.15;

/** Smallest box that contains all the landmark points. */
export function faceBoxFromLandmarks(points: readonly Point2[]): FaceBox {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

/**
 * Checks face size, centering, and whether the head is turned.
 *
 * Direction words are from the USER's point of view. The camera sees the
 * user flipped: if the face is on the left of the camera image (cx < 0.5),
 * the user is sitting to their own right, so we tell them to move left.
 *
 * `noseX` is the x position of the nose tip; if it sits far from the middle
 * of the face box, the head is turned sideways.
 */
export function checkPosition(box: FaceBox, noseX: number): CheckResult {
  if (box.w < FACE_WIDTH_MIN) return { ok: false, message: "Move closer to the camera." };
  if (box.w > FACE_WIDTH_MAX) return { ok: false, message: "Move a little farther from the camera." };
  const dx = box.cx - 0.5;
  if (dx < -CENTER_TOLERANCE) return { ok: false, message: "Move a little to your left." };
  if (dx > CENTER_TOLERANCE) return { ok: false, message: "Move a little to your right." };
  if (box.cy - 0.5 < -CENTER_TOLERANCE) return { ok: false, message: "Lower the camera or move down a little." };
  if (box.cy - 0.5 > CENTER_TOLERANCE) return { ok: false, message: "Raise the camera or move up a little." };
  if (Math.abs(noseX - box.cx) / box.w > TURN_TOLERANCE) {
    return { ok: false, message: "Turn your face toward the camera." };
  }
  return { ok: true, message: "Position looks good." };
}

export interface LumaStats {
  /** Average brightness, 0 (black) to 255 (white). */
  mean: number;
  /** Fraction of pixels that are nearly black. */
  darkFrac: number;
  /** Fraction of pixels that are nearly white (blown out). */
  brightFrac: number;
}

/**
 * Brightness statistics for an RGBA pixel buffer (the format canvas getImageData returns).
 * Brightness ("luma") uses the standard Rec. 601 weights: green looks brightest
 * to human eyes, blue the darkest.
 */
export function lumaStats(rgba: ArrayLike<number>): LumaStats {
  const n = Math.floor(rgba.length / 4);
  if (n === 0) return { mean: 0, darkFrac: 1, brightFrac: 0 };
  let sum = 0, dark = 0, bright = 0;
  for (let i = 0; i < n; i++) {
    const y = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    sum += y;
    if (y < 30) dark++;
    if (y > 240) bright++;
  }
  return { mean: sum / n, darkFrac: dark / n, brightFrac: bright / n };
}

export const LUMA_TOO_DARK = 60;
export const LUMA_TOO_BRIGHT = 200;
/** If this fraction of the image is blown out, there's probably a window or lamp in view. */
export const BLOWN_OUT_FRAC = 0.25;

export function checkLighting(s: LumaStats): CheckResult {
  if (s.mean < LUMA_TOO_DARK) return { ok: false, message: "It's too dark. Turn on a light facing you." };
  if (s.mean > LUMA_TOO_BRIGHT) return { ok: false, message: "It's very bright. Reduce light shining at the camera." };
  if (s.brightFrac > BLOWN_OUT_FRAC) {
    return { ok: false, message: "Strong light behind you (a window?). Try facing the light instead." };
  }
  return { ok: true, message: "Lighting looks good." };
}
