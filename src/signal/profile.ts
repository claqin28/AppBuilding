/**
 * A person's saved control setup: which gesture does which action, and the
 * thresholds calibration measured. Stored on this device only.
 */
import { DEFAULT_CALIBRATION, thresholdsFor, type CalibrationResult } from "./calibration";
import { isGestureId, type GestureId } from "./gestures";
import { ACTIONS, type Action } from "./selection";

export interface Binding {
  action: Action;
  gesture: GestureId;
  on: number;
  off: number;
  /** Resting level and typical peak at calibration time (used later to spot drift and fatigue). */
  restLevel: number;
  typicalPeak: number;
}

export interface Profile {
  version: 1;
  createdAt: string;
  /** How long calibration took, start to finish (ms). */
  calibrationMs: number;
  tauMs: number;
  holdMs: number;
  bindings: Binding[];
}

export function buildProfile(
  result: CalibrationResult,
  actions: Partial<Record<Action, GestureId>>,
  calibrationMs: number,
  now = new Date(),
): Profile {
  const bindings: Binding[] = [];
  for (const action of ACTIONS) {
    const id = actions[action];
    if (!id) continue;
    const s = result.gestures.find((g) => g.id === id);
    if (!s) throw new Error(`Gesture ${id} was not calibrated.`);
    bindings.push({ action, gesture: id, on: s.on, off: s.off, restLevel: s.restLevel, typicalPeak: s.typicalPeak });
  }
  if (!bindings.some((b) => b.action === "SELECT")) throw new Error("A SELECT gesture is required.");
  if (new Set(bindings.map((b) => b.gesture)).size !== bindings.length) {
    throw new Error("Each action needs a different gesture.");
  }
  return {
    version: 1,
    createdAt: now.toISOString(),
    calibrationMs,
    tauMs: result.config.tauMs,
    holdMs: result.config.holdMs,
    bindings,
  };
}

/** Validates a stored profile; returns null if it's missing or damaged. */
export function parseProfile(json: unknown): Profile | null {
  const p = json as Partial<Profile> | null;
  if (!p || p.version !== 1 || !Array.isArray(p.bindings)) return null;
  const ok = p.bindings.every(
    (b) =>
      ACTIONS.includes(b.action) &&
      isGestureId(b.gesture) &&
      [b.on, b.off, b.restLevel, b.typicalPeak].every((x) => typeof x === "number" && Number.isFinite(x)) &&
      b.off <= b.on,
  );
  if (!ok || !p.bindings.some((b) => b.action === "SELECT")) return null;
  return p as Profile;
}

/**
 * The thresholds to use for a sensitivity setting ("reach"), worked out again
 * from the resting level and typical peak that calibration measured:
 *   on  = rest + reach × (typical peak − rest)
 *   off = halfway between rest and on (the same rule as calibration)
 * Calibration itself uses reach 0.5. A lower reach is more sensitive: smaller
 * movements count. The same safety limits as calibration apply (on stays at
 * least a little above rest, and never above 0.9).
 */
export function withReach(bindings: readonly Binding[], reach: number): Binding[] {
  const cfg = { ...DEFAULT_CALIBRATION, onFraction: reach };
  return bindings.map((b) => ({ ...b, ...thresholdsFor(b.restLevel, b.typicalPeak, cfg) }));
}

