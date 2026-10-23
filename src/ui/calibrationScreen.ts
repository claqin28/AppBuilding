/**
 * Step 2: calibration. Guides the person through:
 *   1. rest (relaxed face), 2. natural movement (talking, looking around),
 *   3. each chosen gesture, 5 tries.
 * Everything is recorded as a trace (numbers only, never video) with markers,
 * then analyzed by src/signal/calibration.ts.
 *
 * The person (or a helper) can pause, skip a gesture they can't do, or stop.
 * A try interrupted by a pause is simply redone.
 */
import { analyzeCalibration, DEFAULT_CALIBRATION } from "../signal/calibration";
import { gestureDef, gestureSignals, GESTURES, type GestureId } from "../signal/gestures";
import { TraceRecorder, traceFrames } from "../signal/trace";
import type { BlendshapeFrame } from "../signal/types";
import type { AppContext, Screen } from "./app";
import { formatDuration, h } from "./dom";

const REST_STILL_MS = 5000;
const REST_NATURAL_MS = 10000;
const INTRO_MS = 2500;
const READY_MS = 1200;
const WINDOW_MS = 2500;
const RELAX_MS = 1300;
const REPS = 5;
const FACE_LOST_MS = 700;
const FACE_WAIT_MS = 5000;

/** Thrown inside the run to unwind on user control. */
class Interrupt {
  constructor(public kind: "stop" | "skip" | "paused") {}
}

export class CalibrationScreen implements Screen {
  private root!: HTMLElement;
  private unsub: (() => void) | null = null;
  private control: "run" | "pause" | "skip" | "stop" = "run";
  private running = false;
  private mounted = false;
  /** Skip only makes sense while a movement is being tested, not during rest. */
  private allowSkip = false;
  /** Why the run stopped, if it wasn't the user pressing Stop. */
  private stopMessage: string | null = null;
  private lastFrame: BlendshapeFrame | null = null;
  private lastFaceT = 0;
  private meterTarget: GestureId | null = null;
  private els!: {
    prompt: HTMLElement;
    sub: HTMLElement;
    card: HTMLElement;
    meter: HTMLElement;
    meterWrap: HTMLElement;
    progress: HTMLProgressElement;
    pause: HTMLButtonElement;
    skip: HTMLButtonElement;
    warn: HTMLElement;
  };

  constructor(private ctx: AppContext) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.mounted = true;
    this.renderIntro();
  }

  unmount(): void {
    this.mounted = false;
    this.ctx.setActivity(null);
    this.control = "stop";
    this.unsub?.();
    this.unsub = null;
  }

  // ----- Intro: choose gestures to test ------------------------------------

  private renderIntro(): void {
    this.root.replaceChildren();
    const boxes = GESTURES.map((g) => {
      const box = h("input", { type: "checkbox", value: g.id, checked: g.defaultOn });
      return { id: g.id, box, label: h("label", { class: "check-item" }, box, " ", g.label) };
    });
    const estimate = h("p", { class: "hint" });
    const updateEstimate = () => {
      const n = boxes.filter((b) => b.box.checked).length;
      const ms = REST_STILL_MS + REST_NATURAL_MS + n * (INTRO_MS + REPS * (READY_MS + WINDOW_MS + RELAX_MS));
      estimate.textContent = `${n} gestures selected · about ${formatDuration(ms)}. You can pause at any time.`;
    };
    boxes.forEach((b) => b.box.addEventListener("change", updateEstimate));
    updateEstimate();

    const start = h("button", { class: "big-button" }, "Start calibration");
    start.addEventListener("click", async () => {
      const chosen = boxes.filter((b) => b.box.checked).map((b) => b.id);
      if (chosen.length === 0) {
        this.ctx.notify("Choose at least one gesture to test.", true);
        return;
      }
      start.disabled = true;
      if (await this.ctx.ensureCamera()) void this.run(chosen);
      else start.disabled = false;
    });

    this.root.append(
      h("h2", {}, "Step 2: Calibrate"),
      h(
        "p",
        {},
        "This finds which face movements work best for you. First you'll rest, then move naturally, ",
        "then try each movement 5 times. Do them at a comfortable strength. Don't strain.",
      ),
      h(
        "p",
        { class: "hint" },
        "Untick anything you know you can't do; that keeps it shorter. A helper can run this for you.",
      ),
      h("fieldset", { class: "check-grid" }, h("legend", {}, "Movements to test"), boxes.map((b) => b.label)),
      estimate,
      start,
    );
  }

  // ----- Running ----------------------------------------------------------

  private renderRunning(): void {
    const prompt = h("p", { class: "cal-prompt", "aria-live": "assertive" });
    const sub = h("p", { class: "cal-sub" });
    const meter = h("span", { class: "bs-fill" });
    const meterWrap = h("div", { class: "cal-meter", hidden: true }, h("span", { class: "bs-track" }, meter));
    const warn = h("p", { class: "cal-warn", role: "alert" });
    const card = h("div", { class: "cal-card" }, prompt, sub, meterWrap, warn);
    const progress = h("progress", { max: 1, value: 0, "aria-label": "Calibration progress" });
    const pause = h("button", { class: "mid-button", onclick: () => this.togglePause() }, "Pause");
    const skip = h(
      "button",
      { class: "mid-button", disabled: true, onclick: () => this.allowSkip && (this.control = "skip") },
      "Skip this movement (I can't do it)",
    );
    const stop = h("button", { class: "mid-button danger", onclick: () => (this.control = "stop") }, "Stop");
    this.root.replaceChildren(
      h("h2", {}, "Calibrating"),
      card,
      progress,
      h("div", { class: "button-row" }, pause, skip, stop),
    );
    this.els = { prompt, sub, card, meter, meterWrap, progress, pause, skip, warn };
  }

  private togglePause(): void {
    if (this.control === "pause") {
      this.control = "run";
      this.els.pause.textContent = "Pause";
    } else if (this.control === "run") {
      this.control = "pause";
      this.els.pause.textContent = "Resume";
      this.show("Paused", "Press Resume when you're ready.", "rest");
    }
  }

  private show(prompt: string, sub: string, mode: "rest" | "ready" | "go"): void {
    this.els.prompt.textContent = prompt;
    this.els.sub.textContent = sub;
    this.els.card.dataset.mode = mode;
  }

  /**
   * Waits ms milliseconds of RUNNING time. Throws Interrupt if the user
   * stops, skips, or pauses (after the pause ends, so the step can be redone).
   */
  private async wait(ms: number, onTick?: (remainingMs: number) => void): Promise<void> {
    const end = performance.now() + ms;
    for (;;) {
      if (this.control === "stop") throw new Interrupt("stop");
      if (this.control === "skip") {
        if (this.allowSkip) throw new Interrupt("skip");
        this.control = "run";
      }
      if (this.control === "pause") {
        while (this.control === "pause") await sleep(100);
        throw new Interrupt("paused");
      }
      const left = end - performance.now();
      if (left <= 0) return;
      onTick?.(left);
      await sleep(Math.min(100, left));
    }
  }

  private async run(gestures: GestureId[]): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.ctx.setActivity("calibrating");
    this.control = "run";
    this.stopMessage = null;
    this.lastFrame = null;
    this.renderRunning();

    const rec = new TraceRecorder({
      kind: "calibration",
      tested: gestures,
      tauMs: DEFAULT_CALIBRATION.tauMs,
      holdMs: DEFAULT_CALIBRATION.holdMs,
    });
    this.lastFaceT = performance.now();
    this.unsub = this.ctx.subscribe((det) => {
      rec.push(det.frame);
      this.lastFrame = det.frame;
      if (det.frame.face) this.lastFaceT = det.frame.t;
    });
    const uiTimer = window.setInterval(() => this.updateLive(), 66);
    const t0 = performance.now();
    rec.mark("calibration:start", t0);

    const totalSteps = 2 + gestures.length * REPS;
    let done = 0;
    const advance = () => (this.els.progress.value = ++done / totalSteps);

    try {
      // Don't record anything until the camera can actually see a face.
      this.show("Looking for your face…", "Sit where the camera can see your whole face.", "rest");
      const lookStart = performance.now();
      while (!this.faceVisible()) {
        if (performance.now() - lookStart > FACE_WAIT_MS) {
          this.stopMessage = "We couldn't see your face, so calibration didn't start. Check the camera panel.";
          this.control = "stop";
        }
        await this.wait(100);
      }

      // Rest, part 1: still.
      await this.redoOnPause(async () => {
        this.show("Relax your face", "Look at the screen and breathe normally.", "rest");
        const start = performance.now();
        await this.wait(REST_STILL_MS, (left) => (this.els.sub.textContent = `Look at the screen and breathe normally. ${Math.ceil(left / 1000)}`));
        rec.mark("rest:start", start);
        rec.mark("rest:end", performance.now());
      });
      advance();

      // Rest, part 2: natural movement. This teaches the app what to IGNORE.
      await this.redoOnPause(async () => {
        this.show(
          "Now move naturally",
          "Talk (or move your mouth as if talking) and look around. Don't do any of the test movements.",
          "rest",
        );
        const start = performance.now();
        await this.wait(REST_NATURAL_MS, (left) =>
          (this.els.sub.textContent = `Talk or move your mouth as if talking, and look around. Don't do the test movements. ${Math.ceil(left / 1000)}`),
        );
        rec.mark("rest:start", start);
        rec.mark("rest:end", performance.now());
      });
      advance();

      for (const id of gestures) {
        const def = gestureDef(id);
        this.setSkippable(true);
        try {
          this.meterTarget = null;
          this.show(`Next: ${def.label}`, `You'll be asked ${REPS} times. Do it when you see NOW.`, "rest");
          await this.redoOnPause(() => this.wait(INTRO_MS));
          for (let r = 0; r < REPS; r++) {
            await this.redoOnPause(async () => {
              this.meterTarget = id;
              this.show("Get ready…", `${def.label}: try ${r + 1} of ${REPS}`, "ready");
              await this.wait(READY_MS);
              const start = performance.now();
              this.show(`${def.prompt} NOW`, `Try ${r + 1} of ${REPS}. Hold it for a moment.`, "go");
              await this.wait(WINDOW_MS);
              // Only complete tries get both markers; an interrupted try has no end and is ignored.
              rec.mark(`rep:${id}:start`, start);
              rec.mark(`rep:${id}:end`, performance.now());
              this.show("Relax", `${def.label}: try ${r + 1} of ${REPS} done`, "rest");
              await this.wait(RELAX_MS);
            });
            advance();
          }
        } catch (e) {
          if (!(e instanceof Interrupt) || e.kind !== "skip") throw e;
          rec.mark(`skip:${id}`, performance.now());
          this.control = "run";
          done = 2 + (gestures.indexOf(id) + 1) * REPS;
          this.els.progress.value = done / totalSteps;
        }
        this.setSkippable(false);
      }
    } catch (e) {
      clearInterval(uiTimer);
      this.unsub?.();
      this.unsub = null;
      this.running = false;
      this.ctx.setActivity(null);
      if (e instanceof Interrupt && e.kind === "stop") {
        this.ctx.notify(this.stopMessage ?? "Calibration stopped. Nothing was saved.", this.stopMessage !== null);
        if (this.mounted) this.renderIntro();
        return;
      }
      throw e;
    }

    clearInterval(uiTimer);
    this.unsub?.();
    this.unsub = null;
    this.running = false;
    this.ctx.setActivity(null);
    const durationMs = performance.now() - t0;
    rec.mark("calibration:end", performance.now());
    rec.setMeta("durationMs", Math.round(durationMs));
    this.show("Analyzing…", "", "rest");

    const trace = rec.toTrace();
    try {
      const result = analyzeCalibration(traceFrames(trace), trace.markers);
      this.ctx.lastCalibration = { result, trace, durationMs };
      this.ctx.go("results");
    } catch (err) {
      this.ctx.notify(`Couldn't analyze the calibration: ${err instanceof Error ? err.message : String(err)}`, true);
      if (this.mounted) this.renderIntro();
    }
  }

  private faceVisible(): boolean {
    return this.lastFrame?.face === true;
  }

  private setSkippable(on: boolean): void {
    this.allowSkip = on;
    this.els.skip.disabled = !on;
  }

  /** Runs a step; if it was interrupted by a pause, runs it again from the start. */
  private async redoOnPause(step: () => Promise<void>): Promise<void> {
    for (;;) {
      try {
        await step();
        return;
      } catch (e) {
        if (e instanceof Interrupt && e.kind === "paused") continue;
        throw e;
      }
    }
  }

  private updateLive(): void {
    const faceLost = performance.now() - this.lastFaceT > FACE_LOST_MS;
    this.els.warn.textContent = faceLost ? "We can't see your face. Move back into view, or press Pause if you need a break." : "";
    const target = this.meterTarget;
    this.els.meterWrap.hidden = target === null;
    if (target && this.lastFrame?.face) {
      const v = gestureSignals(this.lastFrame.scores)[target];
      this.els.meter.style.width = `${(Math.min(1, v) * 100).toFixed(0)}%`;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
