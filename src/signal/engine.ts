/**
 * The control engine: blendshape frames in, actions (SELECT/NEXT/BACK) out.
 *
 * For each of the person's chosen gestures it keeps a Smoother and a
 * GestureDetector (see detector.ts for hysteresis, hold time, refractory).
 * On top of that, two rules stop gestures from interfering with each other:
 *
 *   ONE AT A TIME: while any gesture is still being held, no other gesture
 *   can fire. (Holding a smile for SELECT can't also trigger NEXT.)
 *
 *   SHARED COOLDOWN: after any action fires, no action can fire for
 *   refractoryMs. If two fire on the same frame, the one further past its
 *   own threshold wins.
 *
 * If the face disappears, nothing fires. If it was gone for longer than
 * maxFaceGapMs, everything resets and the person must relax before the next
 * gesture counts. (Someone leaning out of view and back shouldn't click.)
 */
import { GestureDetector, progressToward, type DetectorPhase } from "./detector";
import { gestureSignals, type GestureId } from "./gestures";
import type { Binding } from "./profile";
import type { Action } from "./selection";
import { Smoother } from "./smoothing";
import type { BlendshapeFrame } from "./types";

export interface EngineParams {
  tauMs: number;
  holdMs: number;
  refractoryMs: number;
  maxFaceGapMs: number;
}

export const DEFAULT_ENGINE: EngineParams = { tauMs: 80, holdMs: 250, refractoryMs: 400, maxFaceGapMs: 300 };

export interface ChannelState {
  action: Action;
  gesture: GestureId;
  /** Smoothed signal. */
  value: number;
  /** 0 at resting level, 1 at the `on` line (for meters). */
  progress: number;
  phase: DetectorPhase;
  on: number;
  off: number;
}

export interface EngineOutput {
  fired: Action | null;
  face: boolean;
  channels: ChannelState[];
}

interface Channel {
  binding: Binding;
  smoother: Smoother;
  detector: GestureDetector;
  value: number;
}

export class ControlEngine {
  private channels: Channel[] = [];
  private lastFireT = -Infinity;
  private lastFaceT = -Infinity;

  constructor(
    bindings: readonly Binding[],
    private params: EngineParams = DEFAULT_ENGINE,
  ) {
    this.setBindings(bindings);
  }

  setBindings(bindings: readonly Binding[]): void {
    this.channels = bindings.map((b) => ({
      binding: { ...b },
      smoother: new Smoother(this.params.tauMs),
      detector: new GestureDetector({
        on: b.on,
        off: b.off,
        holdMs: this.params.holdMs,
        refractoryMs: this.params.refractoryMs,
      }),
      value: 0,
    }));
  }

  /** Changes thresholds for one action without losing its state (used by drift adaptation). */
  setThresholds(action: Action, on: number, off: number): void {
    const ch = this.channels.find((c) => c.binding.action === action);
    if (!ch) return;
    ch.binding.on = on;
    ch.binding.off = off;
    ch.detector.params = { ...ch.detector.params, on, off };
  }

  get bindings(): Binding[] {
    return this.channels.map((c) => ({ ...c.binding }));
  }

  update(frame: BlendshapeFrame): EngineOutput {
    if (!frame.face) return { fired: null, face: false, channels: this.states() };

    if (frame.t - this.lastFaceT > this.params.maxFaceGapMs) {
      for (const ch of this.channels) {
        ch.smoother.reset();
        ch.detector.reset();
      }
    }
    this.lastFaceT = frame.t;

    const sig = gestureSignals(frame.scores);
    const candidates: Channel[] = [];
    for (const ch of this.channels) {
      const wasOtherHeld = this.channels.some((o) => o !== ch && o.detector.phase === "holding");
      ch.value = ch.smoother.update(sig[ch.binding.gesture], frame.t);
      const fired = ch.detector.update(ch.value, frame.t);
      if (fired && !wasOtherHeld) candidates.push(ch);
    }

    let fired: Action | null = null;
    if (candidates.length > 0 && frame.t - this.lastFireT >= this.params.refractoryMs) {
      const progress = (c: Channel) => progressToward(c.value, c.binding.restLevel, c.binding.on);
      const winner = candidates.reduce((a, b) => (progress(b) > progress(a) ? b : a));
      fired = winner.binding.action;
      this.lastFireT = frame.t;
    }
    return { fired, face: true, channels: this.states() };
  }

  private states(): ChannelState[] {
    return this.channels.map((c) => ({
      action: c.binding.action,
      gesture: c.binding.gesture,
      value: c.value,
      progress: progressToward(c.value, c.binding.restLevel, c.binding.on),
      phase: c.detector.phase,
      on: c.binding.on,
      off: c.binding.off,
    }));
  }
}
