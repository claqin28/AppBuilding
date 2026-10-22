import { describe, expect, it } from "vitest";
import { analyzeCalibration } from "../src/signal/calibration";
import { traceFrames } from "../src/signal/trace";
import {
  calibrationSession,
  cleanNickname,
  MAX_NICKNAME,
  newProfileRecord,
  readProfileRecord,
  SCHEMA_VERSION,
} from "../src/storage/schema";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/storage/settings";
import { standardPerson } from "./synth";

const now = new Date("2026-10-22T12:00:00Z");

describe("normalizeSettings", () => {
  it("fills in defaults for missing or broken values", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = normalizeSettings({ scanMs: "fast", theme: "purple", scanMode: "x", show3d: "yes" });
    expect(s.scanMs).toBe(DEFAULT_SETTINGS.scanMs);
    expect(s.theme).toBe("auto");
    expect(s.scanMode).toBe("auto");
    expect(s.show3d).toBe(true);
  });
  it("clamps numbers to safe limits (scan never faster than 0.5 s)", () => {
    expect(normalizeSettings({ scanMs: 50 }).scanMs).toBe(500);
    expect(normalizeSettings({ holdMs: 99999 }).holdMs).toBe(1500);
  });
  it("drops unknown keys", () => {
    expect(Object.keys(normalizeSettings({ secret: "x" }))).not.toContain("secret");
  });
});

describe("cleanNickname", () => {
  it("trims, collapses spaces, and caps length", () => {
    expect(cleanNickname("  Sam   B  ", [])).toBe("Sam B");
    expect(cleanNickname("x".repeat(100), []).length).toBe(MAX_NICKNAME);
  });
  it("an empty nickname becomes the next free 'Profile N'", () => {
    expect(cleanNickname("   ", [])).toBe("Profile 1");
    expect(cleanNickname("", ["Sam", "Profile 2"])).toBe("Profile 3");
  });
  it("removes control characters", () => {
    expect(cleanNickname("Sa\u0000m\u0007", [])).toBe("Sam");
  });
});

describe("profile records", () => {
  it("a new record round-trips through storage-style JSON", () => {
    const rec = newProfileRecord("id1", "Sam", now, DEFAULT_SETTINGS, null);
    expect(readProfileRecord(JSON.parse(JSON.stringify(rec)))).toEqual(rec);
  });
  it("rejects damaged records instead of crashing", () => {
    expect(readProfileRecord(null)).toBeNull();
    expect(readProfileRecord({ schemaVersion: 1, id: 5 })).toBeNull();
    expect(readProfileRecord("hello")).toBeNull();
  });
  it("rejects records from a NEWER version of the app (can't be read safely)", () => {
    const rec = { ...newProfileRecord("id1", "Sam", now, DEFAULT_SETTINGS, null), schemaVersion: SCHEMA_VERSION + 1 };
    expect(readProfileRecord(rec)).toBeNull();
  });
  it("repairs bad settings inside an otherwise valid record", () => {
    const rec = { ...newProfileRecord("id1", "Sam", now, DEFAULT_SETTINGS, null), settings: { scanMs: -5 } };
    expect(readProfileRecord(rec)!.settings.scanMs).toBe(500);
  });
});

describe("calibration sessions", () => {
  const trace = standardPerson();
  const result = analyzeCalibration(traceFrames(trace), trace.markers);
  const s = calibrationSession("s1", "id1", now, result, 123456.7, ["browRaise"]);

  it("stores summary numbers only (no frames, no markers)", () => {
    const json = JSON.stringify(s);
    expect(json).not.toContain("frames");
    expect(json).not.toContain("markers");
    expect(json.length).toBeLessThan(4000);
  });
  it("keeps the numbers the history view will need", () => {
    expect(s.calibration.durationMs).toBe(123457);
    expect(s.calibration.gestures.find((g) => g.id === "browRaise")?.hitRate).toBe(1);
  });
});
