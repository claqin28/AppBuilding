import { describe, expect, it } from "vitest";
import { trackingHealth } from "../src/signal/trackingHealth";

/** Frame arrival times at a steady rate, ending at `end`. */
function steady(fps: number, seconds: number, end: number): number[] {
  const step = 1000 / fps;
  const out: number[] = [];
  for (let t = end - seconds * 1000; t <= end; t += step) out.push(t);
  return out;
}

describe("trackingHealth", () => {
  it("a normal webcam rate (30 frames/s) with a face: gestures can count", () => {
    const h = trackingHealth(steady(30, 3, 10_000), 10_000, true, 300);
    expect(h.reason).toBe("ok");
    expect(h.canCount).toBe(true);
    expect(h.fps).toBeGreaterThanOrEqual(29);
  });

  it("1.6 frames/s (a hidden tab in the feasibility test): frames are too far apart", () => {
    const h = trackingHealth(steady(1.6, 3, 10_000), 10_000, true, 300);
    expect(h.reason).toBe("too-slow");
    expect(h.canCount).toBe(false);
    expect(h.longestGapMs).toBeGreaterThan(300);
  });

  it("frames stopped a while ago: counts the wait since the last frame", () => {
    const h = trackingHealth(steady(30, 1, 9_500), 10_000, true, 300);
    expect(h.reason).toBe("too-slow");
    expect(h.longestGapMs).toBeGreaterThanOrEqual(500);
  });

  it("no frames at all", () => {
    expect(trackingHealth([], 10_000, false, 300)).toMatchObject({ fps: 0, canCount: false, reason: "no-frames" });
  });

  it("fast enough, but no face in view", () => {
    expect(trackingHealth(steady(30, 3, 10_000), 10_000, false, 300)).toMatchObject({ canCount: false, reason: "no-face" });
  });
});
