/**
 * Calibration analysis: from a recording of one person, measure how well
 * each candidate gesture works FOR THEM, and pick their thresholds.
 *
 * What the recording contains (see CalibrationScreen for the prompts):
 *   - REST segments: the person relaxes, then looks around and talks (or
 *     moves their mouth) naturally. This shows how high each signal goes
 *     when they are NOT trying to do anything. It's the noise we must ignore.
 *   - REP segments: "Raise your eyebrows NOW", 5 times per gesture.
 *
 * Key ideas, each explained where it's computed:
 *   restLevel   how high the signal goes during rest (98th percentile)
 *   held peak   the highest level the person KEPT UP for the hold time in a rep
 *   typicalPeak the median held peak over all reps
 *   on / off    thresholds placed between restLevel and typicalPeak
 *   hitRate     leave-one-out: would each rep have worked with a threshold
 *               set from the OTHER reps? (an honest test of consistency)
 *   auc         how cleanly reps separate from rest (1 = perfectly)
 *   crossTalk   when doing gesture A, how close does gesture B come to firing?
 *
 * Everything is computed on the SAME smoothed signal, with the SAME hold
 * time, that live control uses. So "this rep would have worked" here means
 * exactly the same thing as it does in live control.
 */
import { GestureDetector, progressToward } from "./detector";
import { gestureSignals, isGestureId, GESTURE_IDS, type GestureId } from "./gestures";
import { Smoother } from "./smoothing";
import type { Marker } from "./trace";
import type { BlendshapeFrame } from "./types";

export interface CalibrationConfig {
  /** Smoothing time constant, must match live control. */
  tauMs: number;
  /** Minimum hold time, must match live control. */
  holdMs: number;
  /** Which percentile of rest values counts as "the resting level". */
  restPercentile: number;
  /** `on` sits this fraction of the way from restLevel up to typicalPeak. */
  onFraction: number;
  /** `off` sits this fraction of the way from restLevel up to `on`. */
  offFraction: number;
  /** A gesture whose typical peak is less than this above rest is "too weak". */
  minGap: number;
  /** Gap at which a gesture counts as fully strong (more doesn't help the score). */
  fullGap: number;
  minAuc: number;
  minHitRate: number;
  minReps: number;
  /** A rep needs at least this many frames with a face in them to count. */
  minFramesPerRep: number;
  /** If the face disappears for longer than this, smoothing restarts. */
  maxFaceGapMs: number;
  /** Rest is cut into overlapping windows this far apart (for AUC). */
  restWindowStepMs: number;
  /** Never put `on` higher than this, or it may be unreachable on a tired day. */
  maxOn: number;
}

export const DEFAULT_CALIBRATION: CalibrationConfig = {
  tauMs: 80,
  holdMs: 250,
  restPercentile: 0.98,
  onFraction: 0.5,
  offFraction: 0.5,
  minGap: 0.1,
  fullGap: 0.3,
  minAuc: 0.9,
  minHitRate: 0.8,
  minReps: 3,
  minFramesPerRep: 5,
  maxFaceGapMs: 300,
  restWindowStepMs: 250,
  maxOn: 0.9,
};

export interface Segment {
  start: number;
  end: number;
}

export interface CalibrationSegments {
  rest: Segment[];
  reps: Partial<Record<GestureId, Segment[]>>;
  skipped: GestureId[];
}

export type Problem = "too-few-reps" | "weak" | "overlaps-rest" | "inconsistent";

export interface GestureStats {
  id: GestureId;
  /** Reps that had enough face data to use. */
  reps: number;
  restLevel: number;
  peaks: number[];
  typicalPeak: number;
  /** typicalPeak - restLevel: how far above "doing nothing" a typical attempt reaches. */
  gap: number;
  on: number;
  off: number;
  auc: number;
  hitRate: number;
  /** Median time from the prompt until the gesture would have fired (ms), or null if it never did. */
  reactionMs: number | null;
  /** When doing THIS gesture: how close each other tested gesture came to firing (1 = it would fire). */
  crossTalk: Partial<Record<GestureId, number>>;
  usable: boolean;
  /** 0..1, higher is better. 0 for gestures that aren't usable. */
  score: number;
  problems: Problem[];
}

export interface CalibrationResult {
  gestures: GestureStats[];
  skipped: GestureId[];
  restSeconds: number;
  config: CalibrationConfig;
}

// ---------------------------------------------------------------------------
// Small math helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Value below which a fraction p of the data falls (linear interpolation). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.min(Math.max(p, 0), 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

/**
 * AUC ("area under the ROC curve"), computed the simple way: pick one rep
 * and one rest window at random. AUC is the chance the rep is higher.
 * 1.0 = every rep beats every rest window. 0.5 = no better than a coin flip.
 */
export function auc(positives: readonly number[], negatives: readonly number[]): number {
  if (positives.length === 0 || negatives.length === 0) return 0;
  let wins = 0;
  for (const p of positives) {
    for (const n of negatives) wins += p > n ? 1 : p === n ? 0.5 : 0;
  }
  return wins / (positives.length * negatives.length);
}

/**
 * The highest level the signal STAYED AT for at least holdMs, within frames
 * [i0, i1). This is exactly the highest `on` threshold the detector could
 * have fired at in this stretch, so "held peak >= on" means "would fire".
 * Returns 0 if the stretch is shorter than holdMs.
 */
export function heldPeak(
  values: readonly number[],
  times: readonly number[],
  i0: number,
  i1: number,
  holdMs: number,
): number {
  let best = 0;
  for (let i = i0; i < i1; i++) {
    let lowest = values[i];
    let k = i;
    let complete = true;
    while (times[k] - times[i] < holdMs) {
      k++;
      if (k >= i1) {
        complete = false;
        break;
      }
      lowest = Math.min(lowest, values[k]);
    }
    if (!complete) break; // later starts are even shorter
    best = Math.max(best, lowest);
  }
  return best;
}

/**
 * Where to put the two thresholds for one gesture.
 * `on` is part-way (onFraction, default halfway) from the resting level up to
 * a typical attempt: well clear of rest noise, but easy to reach even on a
 * weaker attempt. `off` is part-way between rest and `on`.
 */
export function thresholdsFor(
  restLevel: number,
  typicalPeak: number,
  cfg: Pick<CalibrationConfig, "onFraction" | "offFraction" | "maxOn">,
): { on: number; off: number } {
  const MIN_MARGIN = 0.02;
  let on = restLevel + cfg.onFraction * (typicalPeak - restLevel);
  on = Math.max(on, restLevel + MIN_MARGIN);
  on = Math.min(on, Math.max(cfg.maxOn, restLevel + MIN_MARGIN));
  const off = restLevel + cfg.offFraction * (on - restLevel);
  return { on, off };
}

// ---------------------------------------------------------------------------
// Reading the recording
// ---------------------------------------------------------------------------

/**
 * Marker labels written by the calibration screen:
 *   "rest:start" / "rest:end"
 *   "rep:<gestureId>:start" / "rep:<gestureId>:end"
 *   "skip:<gestureId>"   (the person chose not to do this gesture; its tries are dropped)
 */
export function segmentsFromMarkers(markers: readonly Marker[]): CalibrationSegments {
  const out: CalibrationSegments = { rest: [], reps: {}, skipped: [] };
  const open = new Map<string, number>();
  for (const m of [...markers].sort((a, b) => a.t - b.t)) {
    const parts = m.label.split(":");
    const edge = parts[parts.length - 1];
    const key = parts.slice(0, -1).join(":");
    if (parts[0] === "skip" && isGestureId(parts[1])) {
      out.skipped.push(parts[1]);
    } else if (edge === "start") {
      open.set(key, m.t);
    } else if (edge === "end" && open.has(key)) {
      const seg = { start: open.get(key)!, end: m.t };
      open.delete(key);
      if (key === "rest") out.rest.push(seg);
      else if (parts[0] === "rep" && isGestureId(parts[1])) (out.reps[parts[1]] ??= []).push(seg);
    }
  }
  // "Skip" means "I can't do this one": drop any tries recorded before skipping.
  for (const id of out.skipped) delete out.reps[id];
  return out;
}

interface Series {
  t: number[];
  values: Record<GestureId, number[]>;
}

/** Smoothed gesture signals for every frame that has a face. */
function buildSeries(frames: readonly BlendshapeFrame[], cfg: CalibrationConfig): Series {
  const t: number[] = [];
  const values = {} as Record<GestureId, number[]>;
  const smoothers = {} as Record<GestureId, Smoother>;
  for (const id of GESTURE_IDS) {
    values[id] = [];
    smoothers[id] = new Smoother(cfg.tauMs);
  }
  let lastFaceT = -Infinity;
  for (const f of frames) {
    if (!f.face) continue;
    if (f.t - lastFaceT > cfg.maxFaceGapMs) for (const id of GESTURE_IDS) smoothers[id].reset();
    lastFaceT = f.t;
    t.push(f.t);
    const sig = gestureSignals(f.scores);
    for (const id of GESTURE_IDS) values[id].push(smoothers[id].update(sig[id], f.t));
  }
  return { t, values };
}

/** Index of the first time >= x (binary search; times are sorted). */
function lowerBound(times: readonly number[], x: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function range(series: Series, seg: Segment): [number, number] {
  return [lowerBound(series.t, seg.start), lowerBound(series.t, seg.end + 1e-9)];
}

// ---------------------------------------------------------------------------
// The analysis
// ---------------------------------------------------------------------------

export function analyzeCalibration(
  frames: readonly BlendshapeFrame[],
  markers: readonly Marker[],
  cfg: CalibrationConfig = DEFAULT_CALIBRATION,
): CalibrationResult {
  const segs = segmentsFromMarkers(markers);
  if (segs.rest.length === 0) throw new Error("No rest recording found, so there is nothing to compare against.");
  const series = buildSeries(frames, cfg);

  // Rest frames, as index ranges.
  const restRanges = segs.rest.map((s) => range(series, s));
  const restSeconds = segs.rest.reduce((sum, s) => sum + (s.end - s.start), 0) / 1000;

  // Rest windows the same length as a rep, so AUC compares like with like:
  // "the best you held during a rep" vs. "the most that happened by accident
  // during the same amount of resting time".
  const allReps = Object.values(segs.reps).flat();
  const windowMs = allReps.length ? median(allReps.map((s) => s.end - s.start)) : 2500;
  const restWindows: [number, number][] = [];
  for (const s of segs.rest) {
    if (s.end - s.start <= windowMs) {
      restWindows.push(range(series, s));
      continue;
    }
    for (let a = s.start; a + windowMs <= s.end; a += cfg.restWindowStepMs) {
      restWindows.push(range(series, { start: a, end: a + windowMs }));
    }
  }

  const restLevelOf = (id: GestureId): number =>
    percentile(restRanges.flatMap(([i0, i1]) => series.values[id].slice(i0, i1)), cfg.restPercentile);

  const tested = GESTURE_IDS.filter((id) => (segs.reps[id]?.length ?? 0) > 0);
  const stats: GestureStats[] = [];
  const repRanges = {} as Record<GestureId, { seg: Segment; r: [number, number] }[]>;

  for (const id of tested) {
    const vals = series.values[id];
    const restLevel = restLevelOf(id);
    const usableReps = segs.reps[id]!
      .map((seg) => ({ seg, r: range(series, seg) }))
      .filter(({ r }) => r[1] - r[0] >= cfg.minFramesPerRep);
    repRanges[id] = usableReps;

    const peaks = usableReps.map(({ r }) => heldPeak(vals, series.t, r[0], r[1], cfg.holdMs));
    const typicalPeak = median(peaks);
    const gap = typicalPeak - restLevel;
    const { on, off } = thresholdsFor(restLevel, typicalPeak, cfg);

    // Leave-one-out hit rate: hide one rep, set `on` from the others,
    // and check whether the hidden rep reaches it. Repeat for every rep.
    // This is fairer than testing reps against a threshold they helped set.
    let hits = 0;
    peaks.forEach((p, i) => {
      const others = peaks.filter((_, j) => j !== i);
      const looOn = others.length ? thresholdsFor(restLevel, median(others), cfg).on : on;
      if (p >= looOn) hits++;
    });
    const hitRate = peaks.length ? hits / peaks.length : 0;

    const restPeaks = restWindows.map(([i0, i1]) => heldPeak(vals, series.t, i0, i1, cfg.holdMs));
    const separation = auc(peaks, restPeaks);

    // Reaction time: run the real detector on each rep and time when it fires.
    const reactions: number[] = [];
    for (const { seg, r } of usableReps) {
      const det = new GestureDetector({ on, off, holdMs: cfg.holdMs, refractoryMs: 0 });
      det.arm();
      for (let i = r[0]; i < r[1]; i++) {
        if (det.update(vals[i], series.t[i])) {
          reactions.push(series.t[i] - seg.start);
          break;
        }
      }
    }

    const problems: Problem[] = [];
    if (peaks.length < cfg.minReps) problems.push("too-few-reps");
    if (gap < cfg.minGap) problems.push("weak");
    if (separation < cfg.minAuc) problems.push("overlaps-rest");
    if (hitRate < cfg.minHitRate) problems.push("inconsistent");
    const usable = problems.length === 0;

    // Score = reliable × separable × big enough. Each part is 0..1.
    const strength = Math.min(1, Math.max(0, gap) / cfg.fullGap);
    stats.push({
      id,
      reps: peaks.length,
      restLevel,
      peaks,
      typicalPeak,
      gap,
      on,
      off,
      auc: separation,
      hitRate,
      reactionMs: reactions.length ? median(reactions) : null,
      crossTalk: {},
      usable,
      score: usable ? hitRate * separation * strength : 0,
      problems,
    });
  }

  // Cross-talk: while the person did gesture A, how close did each other
  // gesture B get to ITS OWN `on` line? 0 = B stayed at rest, 1 = B would
  // have fired too. Averaged over A's reps.
  for (const a of stats) {
    for (const b of stats) {
      if (a.id === b.id || repRanges[a.id].length === 0) continue;
      const levels = repRanges[a.id].map(({ r }) =>
        progressToward(heldPeak(series.values[b.id], series.t, r[0], r[1], cfg.holdMs), b.restLevel, b.on),
      );
      a.crossTalk[b.id] = levels.reduce((x, y) => x + y, 0) / levels.length;
    }
  }

  stats.sort((x, y) => y.score - x.score || y.gap - x.gap);
  return { gestures: stats, skipped: segs.skipped, restSeconds, config: cfg };
}
