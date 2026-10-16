/**
 * Traces: recordings of blendshape numbers over time (NEVER video).
 *
 * A trace lets us replay a session without a camera: for unit tests, for
 * re-analyzing a calibration after changing the algorithm, and for
 * evaluation. Markers label moments in time ("rest started", "rep 3 of
 * smile started") so analysis knows what the person was asked to do.
 *
 * File format (JSON), kept compact because a minute at 30 fps is ~1800 frames:
 *   names:  the blendshape names, in a fixed order
 *   frames: [t, face, v0, v1, ...] where v_i is the score for names[i]
 *           (face = 0 means no face was found; then there are no values)
 */
import type { BlendshapeFrame } from "./types";

export const TRACE_FORMAT = "face-gesture-trace";
export const TRACE_VERSION = 1;

export interface Marker {
  t: number;
  label: string;
}

export interface Trace {
  format: typeof TRACE_FORMAT;
  version: typeof TRACE_VERSION;
  createdAt: string;
  names: string[];
  frames: number[][];
  markers: Marker[];
  /** Free-form extra info, e.g. which gestures were tested. */
  meta: Record<string, unknown>;
}

/** Collects frames and markers while a session runs. */
export class TraceRecorder {
  private names: string[] = [];
  private frames: number[][] = [];
  private markers: Marker[] = [];

  constructor(private meta: Record<string, unknown> = {}) {}

  push(frame: BlendshapeFrame): void {
    if (!frame.face) {
      this.frames.push([round(frame.t, 1), 0]);
      return;
    }
    if (this.names.length === 0) this.names = Object.keys(frame.scores).sort();
    const row = [round(frame.t, 1), 1];
    for (const n of this.names) row.push(round(frame.scores[n] ?? 0, 3));
    this.frames.push(row);
  }

  mark(label: string, t: number): void {
    this.markers.push({ t: round(t, 1), label });
  }

  setMeta(key: string, value: unknown): void {
    this.meta[key] = value;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  toTrace(): Trace {
    return {
      format: TRACE_FORMAT,
      version: TRACE_VERSION,
      createdAt: new Date().toISOString(),
      names: [...this.names],
      frames: this.frames.map((f) => [...f]),
      markers: [...this.markers].sort((a, b) => a.t - b.t),
      meta: { ...this.meta },
    };
  }
}

/** Turns a trace back into frames the rest of the app understands. */
export function traceFrames(trace: Trace): BlendshapeFrame[] {
  return trace.frames.map((row) => {
    const [t, face] = row;
    if (!face) return { t, face: false, scores: {} };
    const scores: Record<string, number> = {};
    trace.names.forEach((n, i) => (scores[n] = row[i + 2]));
    return { t, face: true, scores };
  });
}

/** Checks that some JSON really is a trace, so a wrong file gives a clear error. */
export function parseTrace(json: unknown): Trace {
  const o = json as Partial<Trace> | null;
  if (!o || o.format !== TRACE_FORMAT) throw new Error("This file is not a face-gesture trace.");
  if (o.version !== TRACE_VERSION) throw new Error(`Unsupported trace version: ${String(o.version)}`);
  if (!Array.isArray(o.names) || !Array.isArray(o.frames) || !Array.isArray(o.markers)) {
    throw new Error("Trace file is missing names, frames, or markers.");
  }
  for (const row of o.frames) {
    if (!Array.isArray(row) || row.length < 2 || (row[1] === 1 && row.length !== o.names.length + 2)) {
      throw new Error("Trace file has a malformed frame.");
    }
  }
  return {
    format: TRACE_FORMAT,
    version: TRACE_VERSION,
    createdAt: String(o.createdAt ?? ""),
    names: o.names,
    frames: o.frames,
    markers: o.markers,
    meta: o.meta ?? {},
  };
}

function round(x: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(x * k) / k;
}
