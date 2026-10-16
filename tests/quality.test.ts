import { describe, expect, it } from "vitest";
import { checkLighting, checkPosition, faceBoxFromLandmarks, lumaStats } from "../src/signal/quality";

const centered = { cx: 0.5, cy: 0.5, w: 0.4, h: 0.5 };

describe("faceBoxFromLandmarks", () => {
  it("returns the tight box around the points", () => {
    const box = faceBoxFromLandmarks([{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.9 }, { x: 0.4, y: 0.5 }]);
    expect(box.cx).toBeCloseTo(0.4);
    expect(box.cy).toBeCloseTo(0.6);
    expect(box.w).toBeCloseTo(0.4);
    expect(box.h).toBeCloseTo(0.6);
  });
});

describe("checkPosition", () => {
  it("accepts a centered, front-facing face", () => {
    expect(checkPosition(centered, 0.5).ok).toBe(true);
  });
  it("asks the user to come closer when the face is small", () => {
    expect(checkPosition({ ...centered, w: 0.1 }, 0.5).message).toMatch(/closer/);
  });
  it("asks the user to back up when the face is huge", () => {
    expect(checkPosition({ ...centered, w: 0.9 }, 0.5).message).toMatch(/farther/);
  });
  it("uses the user's own left/right (camera image is not mirrored)", () => {
    // Face on the left of the camera image = user is off to their right = should move left.
    expect(checkPosition({ ...centered, cx: 0.2 }, 0.2).message).toMatch(/your left/);
    expect(checkPosition({ ...centered, cx: 0.8 }, 0.8).message).toMatch(/your right/);
  });
  it("detects a turned head from the nose position", () => {
    expect(checkPosition(centered, 0.5 + 0.4 * 0.3).message).toMatch(/Turn/);
  });
});

function solid(value: number, pixels = 100): number[] {
  return Array.from({ length: pixels * 4 }, (_, i) => (i % 4 === 3 ? 255 : value));
}

describe("lighting", () => {
  it("computes mean brightness", () => {
    expect(lumaStats(solid(128)).mean).toBeCloseTo(128, 0);
  });
  it("flags a dark image", () => {
    expect(checkLighting(lumaStats(solid(20))).ok).toBe(false);
  });
  it("accepts a mid-gray image", () => {
    expect(checkLighting(lumaStats(solid(130))).ok).toBe(true);
  });
  it("flags strong backlight even when the average is fine", () => {
    const px = [...solid(80, 60), ...solid(255, 40)]; // 40% blown out, mean ~150
    const res = checkLighting(lumaStats(px));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/behind you/);
  });
  it("handles an empty buffer without dividing by zero", () => {
    expect(lumaStats([]).mean).toBe(0);
  });
});
