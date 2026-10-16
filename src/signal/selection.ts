/**
 * Picks the person's control gestures from calibration results.
 *
 * Goal: 2 or 3 gestures that are each reliable AND don't get confused with
 * each other. A great smile is useless as SELECT if smiling also triggers
 * "open mouth" (mapped to NEXT).
 *
 * Method, small enough to try every combination:
 *   1. Keep only usable gestures (passed every calibration check).
 *   2. Try every group of 3. A group is allowed only if no pair in it
 *      conflicts too much (see `conflict`).
 *   3. Rate each allowed group: add up the gesture scores, then multiply by
 *      (1 - conflict) for every pair, so even mild overlap costs something.
 *   4. Take the best group. If no group of 3 is allowed, try 2, then 1.
 *
 * With ~12 candidates there are at most 220 groups of 3, so trying them all
 * is instant, and we know we found the true best (no guessing heuristics).
 */
import type { CalibrationResult, GestureStats } from "./calibration";
import type { GestureId } from "./gestures";

export type Action = "SELECT" | "NEXT" | "BACK";
export const ACTIONS: readonly Action[] = ["SELECT", "NEXT", "BACK"];

export interface SelectionConfig {
  maxGestures: number;
  /** Two gestures conflict too much if doing one gets the other this close to firing. */
  maxConflict: number;
}

export const DEFAULT_SELECTION: SelectionConfig = { maxGestures: 3, maxConflict: 0.5 };

/**
 * How badly two gestures interfere, 0..1. We check both directions (doing A
 * may trigger B even if doing B doesn't trigger A) and keep the worse one.
 */
export function conflict(a: GestureStats, b: GestureStats): number {
  const ab = a.crossTalk[b.id] ?? 0;
  const ba = b.crossTalk[a.id] ?? 0;
  return Math.min(1, Math.max(ab, ba));
}

/** All groups of size k from items (in order). */
export function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  items.forEach((item, i) => {
    for (const rest of combinations(items.slice(i + 1), k - 1)) out.push([item, ...rest]);
  });
  return out;
}

export interface Selection {
  /** Chosen gestures, best first. */
  chosen: GestureId[];
  /** Rating of the chosen group (for display/debugging). */
  value: number;
}

export function selectGestures(result: CalibrationResult, cfg: SelectionConfig = DEFAULT_SELECTION): Selection {
  const candidates = result.gestures.filter((g) => g.usable);
  for (let size = Math.min(cfg.maxGestures, candidates.length); size >= 1; size--) {
    let best: { group: GestureStats[]; value: number } | null = null;
    for (const group of combinations(candidates, size)) {
      let value = group.reduce((sum, g) => sum + g.score, 0);
      let allowed = true;
      for (const [a, b] of combinations(group, 2)) {
        const c = conflict(a, b);
        if (c >= cfg.maxConflict) allowed = false;
        value *= 1 - c;
      }
      if (allowed && (!best || value > best.value)) best = { group, value };
    }
    if (best) {
      const chosen = [...best.group].sort((x, y) => y.score - x.score).map((g) => g.id);
      return { chosen, value: best.value };
    }
  }
  return { chosen: [], value: 0 };
}

/**
 * Gives each chosen gesture a job. The best gesture gets SELECT because it's
 * used most (and it's the only one auto-scan needs). Then NEXT, then BACK.
 */
export function assignActions(chosen: readonly GestureId[]): Partial<Record<Action, GestureId>> {
  const out: Partial<Record<Action, GestureId>> = {};
  chosen.slice(0, ACTIONS.length).forEach((id, i) => (out[ACTIONS[i]] = id));
  return out;
}
