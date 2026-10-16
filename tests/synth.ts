/**
 * Synthetic calibration recordings for tests. These are NOT real data; they
 * exist so the algorithms can be tested deterministically (same seed = same
 * numbers every run). Real behavior must be checked with real recordings.
 */
import type { GestureId } from "../src/signal/gestures";
import { TraceRecorder, type Trace } from "../src/signal/trace";

/** Small seeded random number generator (mulberry32), so tests are repeatable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const NAMES = [
  "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "browDownLeft", "browDownRight",
  "jawOpen", "jawLeft", "jawRight", "mouthSmileLeft", "mouthSmileRight", "mouthPucker",
  "cheekPuff", "eyeBlinkLeft", "eyeBlinkRight", "mouthLeft", "mouthRight",
];

export interface SynthGesture {
  /** Blendshape -> amplitude reached at full effort. */
  shapes: Record<string, number>;
  /** How many reps (from the end) are half-hearted (amplitude × weakFactor). */
  weakReps?: number;
  weakFactor?: number;
}

export interface SynthOptions {
  seed?: number;
  fps?: number;
  noise?: number;
  reps?: number;
  /** Resting level for some blendshapes (default 0.03). */
  baseline?: Record<string, number>;
  /** Blendshape -> max extra amplitude while talking during the natural-rest phase. */
  talking?: Record<string, number>;
  gestures: Partial<Record<GestureId, SynthGesture>>;
  skipped?: GestureId[];
}

const READY_MS = 1200;
const WINDOW_MS = 2500;
const RELAX_MS = 1300;

export function synthCalibration(opts: SynthOptions): Trace {
  const rand = rng(opts.seed ?? 1);
  const fps = opts.fps ?? 30;
  const dt = 1000 / fps;
  const noise = opts.noise ?? 0.02;
  const reps = opts.reps ?? 5;
  const rec = new TraceRecorder({ synthetic: true });
  let t = 1000;
  let nextBlink = 2000;

  // Each "phase" adds extra activation on top of the baseline at time t.
  const emit = (durationMs: number, extra: (tt: number) => Record<string, number>) => {
    const end = t + durationMs;
    for (; t < end; t += dt) {
      const scores: Record<string, number> = {};
      for (const n of NAMES) scores[n] = (opts.baseline?.[n] ?? 0.03) + (rand() - 0.5) * 2 * noise;
      const add = extra(t);
      for (const [n, x] of Object.entries(add)) scores[n] += x;
      // Natural blinks every ~3 s, both eyes together, ~150 ms.
      if (t >= nextBlink && t < nextBlink + 150) {
        scores.eyeBlinkLeft += 0.85;
        scores.eyeBlinkRight += 0.85;
      } else if (t >= nextBlink + 150) {
        nextBlink += 2500 + rand() * 1500;
      }
      for (const n of NAMES) scores[n] = Math.min(1, Math.max(0, scores[n]));
      rec.push({ t, face: true, scores });
    }
  };

  rec.mark("rest:start", t);
  emit(5000, () => ({}));
  rec.mark("rest:end", t);

  rec.mark("rest:start", t);
  emit(10000, (tt) => {
    const out: Record<string, number> = {};
    // Talking: a bumpy ~4 Hz pattern with random loudness.
    const env = Math.abs(Math.sin((tt / 1000) * Math.PI * 4)) * (0.5 + 0.5 * rand());
    for (const [n, amp] of Object.entries(opts.talking ?? {})) out[n] = amp * env;
    return out;
  });
  rec.mark("rest:end", t);

  for (const [id, g] of Object.entries(opts.gestures) as [GestureId, SynthGesture][]) {
    for (let r = 0; r < reps; r++) {
      const weak = r >= reps - (g.weakReps ?? 0);
      const effort = (weak ? (g.weakFactor ?? 0.25) : 1) * (0.9 + 0.2 * rand());
      emit(READY_MS, () => ({}));
      const start = t;
      rec.mark(`rep:${id}:start`, start);
      // Reaction 400 ms, rise 300 ms, hold 1000 ms, fall 300 ms.
      emit(WINDOW_MS, (tt) => {
        const x = tt - start;
        const level =
          x < 400 ? 0 : x < 700 ? (x - 400) / 300 : x < 1700 ? 1 : x < 2000 ? 1 - (x - 1700) / 300 : 0;
        const out: Record<string, number> = {};
        for (const [n, amp] of Object.entries(g.shapes)) out[n] = amp * effort * level;
        return out;
      });
      rec.mark(`rep:${id}:end`, t);
      emit(RELAX_MS, () => ({}));
    }
  }
  for (const id of opts.skipped ?? []) rec.mark(`skip:${id}`, t);
  return rec.toTrace();
}

/** The standard test person used across tests. */
export function standardPerson(seed = 1): Trace {
  return synthCalibration({
    seed,
    // Like the real portrait test: brow-lower rests high for this face.
    baseline: { browDownLeft: 0.3, browDownRight: 0.3 },
    // Talking moves the jaw a lot, and the smile a little.
    talking: { jawOpen: 0.45, mouthSmileLeft: 0.1, mouthSmileRight: 0.1 },
    gestures: {
      browRaise: { shapes: { browInnerUp: 0.8, browOuterUpLeft: 0.6, browOuterUpRight: 0.6 } },
      winkLeft: { shapes: { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.15 } },
      // Smile and cheek puff overlap for this person: puffing also lifts the smile.
      smile: { shapes: { mouthSmileLeft: 0.75, mouthSmileRight: 0.7 } },
      cheekPuff: { shapes: { cheekPuff: 0.6, mouthSmileLeft: 0.6, mouthSmileRight: 0.6 } },
      // Opening the mouth on purpose is no bigger than talking.
      mouthOpen: { shapes: { jawOpen: 0.35 } },
      // Too small to use.
      jawLeft: { shapes: { jawLeft: 0.07 } },
      // Works on some tries but not others.
      browLower: { shapes: { browDownLeft: 0.5, browDownRight: 0.5 }, weakReps: 2, weakFactor: 0.1 },
    },
    skipped: ["jawRight"],
  });
}
