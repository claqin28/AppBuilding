/**
 * Movement map: turns calibration numbers into colors for regions of the face.
 *
 * Plain TypeScript (no Three.js, no React) so it can be unit tested. The 3D
 * view only displays the list of colors this module produces.
 *
 *   1. Each tested gesture gets ONE number, depending on what the person
 *      chose to show:
 *        reliability = calibration hit rate (0..1)
 *        range       = how far above rest a typical try reached, as a share of
 *                      a "fully strong" movement: min(1, gap / fullGap)
 *   2. Each face region gets the HIGHEST number among its gestures: "what's the
 *      best way this person can use this part of their face?" The label still
 *      lists every gesture separately.
 *   3. A region with no tested gesture is "not tested" (null), which is
 *      different from 0%.
 *   4. Numbers go into 5 bins (0-20%, ..., 80-100%), each with one color from a
 *      single-hue blue ramp that gets lighter as values rise. The ramp passed
 *      the dataviz palette validator (ordinal, dark surface #0f1115):
 *      monotone lightness, visible gaps between steps, darkest step 2.85:1.
 *
 * Color is never the only signal: the legend, region labels, and a table show
 * the same numbers as text.
 *
 * This is a prototype visualization, not a medical or clinical assessment.
 */
import type { CalibrationResult, GestureStats } from "./calibration";
import { gestureDef, type GestureId } from "./gestures";

export type RegionId = "leftBrow" | "rightBrow" | "leftEye" | "rightEye" | "lips" | "leftCheek" | "rightCheek" | "jaw";

/** Fixed order: used for tables, and to settle a point that's in two regions. */
export const REGION_IDS: readonly RegionId[] = [
  "leftEye",
  "rightEye",
  "leftBrow",
  "rightBrow",
  "lips",
  "leftCheek",
  "rightCheek",
  "jaw",
];

/** Left/right are always the person's OWN left/right. */
export const REGION_LABELS: Record<RegionId, string> = {
  leftBrow: "Left eyebrow",
  rightBrow: "Right eyebrow",
  leftEye: "Left eye",
  rightEye: "Right eye",
  lips: "Lips",
  leftCheek: "Left cheek",
  rightCheek: "Right cheek",
  jaw: "Jaw and chin",
};

/** Which part of the face each candidate gesture uses. */
export const GESTURE_REGIONS: Record<GestureId, readonly RegionId[]> = {
  browRaise: ["leftBrow", "rightBrow"],
  browLower: ["leftBrow", "rightBrow"],
  winkLeft: ["leftEye"],
  winkRight: ["rightEye"],
  smile: ["lips"],
  pucker: ["lips"],
  mouthLeft: ["lips"],
  mouthRight: ["lips"],
  mouthOpen: ["lips", "jaw"],
  jawLeft: ["jaw"],
  jawRight: ["jaw"],
  cheekPuff: ["leftCheek", "rightCheek"],
};

export type MapMetric = "reliability" | "range";

export const METRIC_LABELS: Record<MapMetric, string> = {
  reliability: "Reliability (how often it worked)",
  range: "Range (how strong a typical try was)",
};

/**
 * One gesture's number for the chosen metric, 0..1.
 *
 * Reliability is the hit rate, BUT only if calibration could tell the movement
 * apart from resting. A movement that was too small (or looked like resting or
 * talking) can "hit" a threshold buried in the noise every time, so its hit rate
 * would say 100% for a movement that doesn't really work. For those, reliability
 * is shown as 0%.
 */
export function gestureValue(s: GestureStats, metric: MapMetric, fullGap: number): number {
  let v: number;
  if (metric === "range") v = s.gap / fullGap;
  else v = s.problems.includes("weak") || s.problems.includes("overlaps-rest") ? 0 : s.hitRate;
  return Math.min(1, Math.max(0, v));
}

export interface GestureEntry {
  id: GestureId;
  value: number;
  usable: boolean;
}

export interface RegionScore {
  region: RegionId;
  /** Highest value among the region's tested gestures; null = not tested. */
  value: number | null;
  gestures: GestureEntry[];
}

export function regionScores(result: CalibrationResult, metric: MapMetric): Record<RegionId, RegionScore> {
  const out = {} as Record<RegionId, RegionScore>;
  for (const r of REGION_IDS) out[r] = { region: r, value: null, gestures: [] };
  for (const s of result.gestures) {
    const value = gestureValue(s, metric, result.config.fullGap);
    for (const r of GESTURE_REGIONS[s.id]) {
      out[r].gestures.push({ id: s.id, value, usable: s.usable });
      out[r].value = Math.max(out[r].value ?? 0, value);
    }
  }
  for (const r of REGION_IDS) out[r].gestures.sort((a, b) => b.value - a.value);
  return out;
}

export const BIN_COUNT = 5;

/** 0-20% -> 0, 20-40% -> 1, ..., 80-100% -> 4. Exactly 100% is in the top bin. */
export function binOf(value: number): number {
  const v = Math.min(1, Math.max(0, value));
  return Math.min(BIN_COUNT - 1, Math.floor(v * BIN_COUNT));
}

/** Single-hue blue ramp, darkest = lowest (validated, see the header comment). */
export const BIN_COLORS: readonly string[] = ["#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"];
/** Regions that weren't tested: neutral gray, labeled "not tested". */
export const NOT_TESTED_COLOR = "#7b818c";
/** The rest of the face (not part of any region). */
export const BASE_COLOR = "#3d4350";

export function colorFor(value: number | null): string {
  return value === null ? NOT_TESTED_COLOR : BIN_COLORS[binOf(value)];
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export interface LegendEntry {
  label: string;
  color: string;
}

export function legendEntries(): LegendEntry[] {
  const step = 100 / BIN_COUNT;
  const bins = BIN_COLORS.map((color, i) => ({ label: `${i * step}–${(i + 1) * step}%`, color }));
  return [...bins, { label: "Not tested", color: NOT_TESTED_COLOR }, { label: "Rest of face", color: BASE_COLOR }];
}

/**
 * One color per face point. `regions` lists which points belong to each
 * region. A point outside every region gets the base color. If a point is in
 * two regions, the first one in REGION_IDS wins (regions are built not to
 * overlap, so this is only a safety rule).
 * With no scores (nothing calibrated yet), every region point is "not tested".
 */
export function pointColors(
  scores: Record<RegionId, RegionScore> | null,
  regions: Record<RegionId, readonly number[]>,
  pointCount: number,
): string[] {
  const colors = new Array<string>(pointCount).fill(BASE_COLOR);
  for (const r of [...REGION_IDS].reverse()) {
    const color = colorFor(scores ? scores[r].value : null);
    for (const i of regions[r]) if (i >= 0 && i < pointCount) colors[i] = color;
  }
  return colors;
}

/** Short text for a region, e.g. "Lips: 100% (Smile 100%, Pucker 40%)". */
export function regionText(s: RegionScore): string {
  if (s.value === null) return `${REGION_LABELS[s.region]}: not tested`;
  const parts = s.gestures.map((g) => `${gestureDef(g.id).label} ${percent(g.value)}`);
  return `${REGION_LABELS[s.region]}: ${percent(s.value)} (${parts.join(", ")})`;
}
