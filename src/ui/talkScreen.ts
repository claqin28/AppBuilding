/**
 * Step 3: Talk. Build a message with the scanning keyboard and speak it.
 *
 * Gestures drive the scanner through the ControlEngine. Every key can also
 * be clicked with a mouse, so a helper can assist.
 *
 * PAUSE: choosing the Pause key stops scanning so nothing gets typed while
 * the person rests or talks. To resume, they hold their SELECT gesture for an
 * extra second, which is much harder to do by accident than a normal SELECT.
 */
import { DEFAULT_PHRASES, KEYBOARD, phraseLayout } from "../keyboard/layouts";
import { Scanner, type Key, type Layout, type ScanMode } from "../keyboard/scanner";
import { applyKey } from "../keyboard/typing";
import { ControlEngine, DEFAULT_ENGINE, type EngineOutput } from "../signal/engine";
import { gestureDef } from "../signal/gestures";
import type { Profile } from "../signal/profile";
import type { Action } from "../signal/selection";
import type { AppContext, Screen } from "./app";
import { h } from "./dom";
import { Meters } from "./meters";
import { speak, speakErrorMessage } from "./speech";
import { LIMITS } from "./storage";

const TICK_MS = 50;
const RESUME_HOLD_MS = 1000;
const FACE_LOST_MS = 700;

export interface TalkEvents {
  /** Called for every action and chosen key (used by evaluation). */
  onAction?: (action: Action, t: number) => void;
  onKey?: (key: Key, text: string, t: number) => void;
}

export class TalkScreen implements Screen {
  private unsub: (() => void) | null = null;
  private timer: number | null = null;
  private text = "";
  private layout: Layout = KEYBOARD;
  private paused = false;
  private resumeStart: number | null = null;
  private lastFaceT = performance.now();
  /** True while control is paused because the face can't be seen. */
  private trackingPaused = false;
  private scanner!: Scanner;
  private engine!: ControlEngine;
  private meters = new Meters();
  private els!: {
    message: HTMLTextAreaElement;
    grid: HTMLElement;
    status: HTMLElement;
    pausedBanner: HTMLElement;
    resumeHint: HTMLElement;
  };
  private keyButtons: HTMLButtonElement[][] = [];
  private rowEls: HTMLElement[] = [];

  constructor(
    private ctx: AppContext,
    private events: TalkEvents = {},
    private options: { embedded?: boolean; profile?: Profile } = {},
  ) {}

  mount(root: HTMLElement): void {
    const profile = this.options.profile ?? this.ctx.profile;
    if (!profile) {
      root.append(
        h("h2", {}, "Talk"),
        h("p", { class: "callout" }, "First, calibrate so the app knows which movements work for you."),
        h("button", { class: "big-button", onclick: () => this.ctx.go("calibrate") }, "Calibrate"),
      );
      return;
    }
    const s = this.ctx.settings;
    const hasNext = profile.bindings.some((b) => b.action === "NEXT");
    const mode: ScanMode = s.scanMode === "step" && hasNext ? "step" : "auto";

    this.engine = new ControlEngine(profile.bindings, {
      ...DEFAULT_ENGINE,
      tauMs: profile.tauMs,
      holdMs: s.holdMs,
      refractoryMs: s.refractoryMs,
    });
    this.meters.setChannels(profile.bindings);
    this.scanner = new Scanner(this.layout, mode, s.scanMs, performance.now());

    const message = h("textarea", {
      class: "message",
      rows: 3,
      "aria-label": "Your message",
      placeholder: "Your message appears here",
    });
    message.addEventListener("input", () => (this.text = message.value));
    const grid = h("div", { class: "kb-grid", role: "group", "aria-label": "Scanning keyboard" });
    const status = h("p", { class: "talk-status", "aria-live": "polite" });
    const resumeHint = h("p", { class: "resume-hint" });
    const pausedBanner = h(
      "div",
      { class: "paused-banner", hidden: true },
      h(
        "p",
        {},
        h("strong", {}, "Paused. "),
        `To resume, do "${gestureDef(selectGesture(profile)).label.toLowerCase()}" and keep holding it about 1 second longer than usual.`,
      ),
      resumeHint,
      h("button", { class: "mid-button", onclick: () => this.setPaused(false) }, "Resume"),
    );
    this.els = { message, grid, status, pausedBanner, resumeHint };

    // Helper controls (mouse/keyboard), for a caregiver or for testing.
    const modeSel = h(
      "select",
      { "aria-label": "Scan mode" },
      h("option", { value: "auto", selected: mode === "auto" }, "Auto-scan (SELECT only)"),
      h("option", { value: "step", selected: mode === "step", disabled: !hasNext }, "Step-scan (NEXT + SELECT)"),
    );
    modeSel.addEventListener("change", () => {
      const m = modeSel.value as ScanMode;
      this.scanner.setMode(m, performance.now());
      this.ctx.setSettings({ ...this.ctx.settings, scanMode: m });
      this.renderHighlight();
    });
    const speed = h("input", {
      type: "range",
      min: LIMITS.scanMs.min,
      max: LIMITS.scanMs.max,
      step: 100,
      value: s.scanMs,
      "aria-label": "Scan speed",
    });
    const speedLabel = h("span", {}, `${(s.scanMs / 1000).toFixed(1)} s per item`);
    speed.addEventListener("input", () => {
      const ms = Number(speed.value);
      this.scanner.scanMs = ms;
      speedLabel.textContent = `${(ms / 1000).toFixed(1)} s per item`;
      this.ctx.setSettings({ ...this.ctx.settings, scanMs: ms });
    });

    const mapping = profile.bindings.map((b) => `${gestureDef(b.gesture).label} = ${b.action}`).join(" · ");

    root.append(
      this.options.embedded ? "" : h("h2", {}, "Talk"),
      message,
      pausedBanner,
      grid,
      status,
      this.meters.el,
      h("p", { class: "hint" }, mapping),
      this.options.embedded
        ? ""
        : h(
            "details",
            { class: "helper-panel" },
            h("summary", {}, "Helper controls"),
            h("div", { class: "control-row" }, h("label", {}, "Mode ", modeSel)),
            h("div", { class: "control-row" }, h("label", {}, "Speed ", speed), speedLabel),
            h(
              "div",
              { class: "control-row" },
              h("button", { class: "mid-button", onclick: () => this.chooseKey({ label: "Speak", kind: "speak" }) }, "Speak message"),
              h("button", { class: "mid-button", onclick: () => this.setPaused(!this.paused) }, "Pause / resume"),
            ),
            h("p", { class: "hint" }, "Quick phrases (click to speak):"),
            h(
              "div",
              { class: "phrase-buttons" },
              DEFAULT_PHRASES.map((p) =>
                h("button", { class: "mid-button", onclick: () => this.chooseKey({ label: p, kind: "phrase", text: p }) }, p),
              ),
            ),
          ),
      h(
        "p",
        { class: "hint disclaimer" },
        "This is a communication aid, not an emergency alert system. It cannot call for help.",
      ),
    );
    this.renderGrid();

    this.unsub = this.ctx.subscribe((det) => this.onFrame(this.engine.update(det.frame), det.frame.t));
    this.timer = window.setInterval(() => this.onTick(), TICK_MS);
  }

  unmount(): void {
    if (this.paused) this.ctx.setActivity(null);
    this.unsub?.();
    this.unsub = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Current message (used by evaluation). */
  get message(): string {
    return this.text;
  }

  setMessage(text: string): void {
    this.text = text;
    if (this.els) this.els.message.value = text;
  }

  private onFrame(out: EngineOutput, t: number): void {
    if (out.face) this.lastFaceT = performance.now();
    this.meters.update(out.channels, out.fired, t);

    if (this.paused) {
      const sel = out.channels.find((c) => c.action === "SELECT");
      if (out.fired === "SELECT") this.resumeStart = t;
      if (this.resumeStart !== null) {
        if (sel?.phase !== "holding") {
          this.resumeStart = null;
          this.els.resumeHint.textContent = "";
        } else if (t - this.resumeStart >= RESUME_HOLD_MS) {
          this.setPaused(false);
        } else {
          this.els.resumeHint.textContent = "Keep holding…";
        }
      }
      return;
    }
    if (!out.fired) return;
    this.events.onAction?.(out.fired, t);
    const key = this.scanner.handle(out.fired, performance.now());
    if (key) this.chooseKey(key);
    this.renderHighlight();
  }

  private onTick(): void {
    const now = performance.now();
    // Safety rule: if the face can't be seen, control pauses. Auto-scan stops
    // moving (nothing could be selected anyway), and when the face is back the
    // highlight stays put a little longer so the person can get ready.
    const faceLost = now - this.lastFaceT > FACE_LOST_MS;
    if (faceLost && !this.trackingPaused) {
      this.trackingPaused = true;
      this.els.grid.classList.add("dimmed");
    } else if (!faceLost && this.trackingPaused) {
      this.trackingPaused = false;
      this.els.grid.classList.toggle("dimmed", this.paused);
      this.scanner.hold(now);
    }
    if (!this.paused && !this.trackingPaused && this.scanner.tick(now)) this.renderHighlight();
    const where =
      this.scanner.level === "row" ? "Choosing a row" : `In row: ${this.layout[this.scanner.row].map((k) => k.label).join(" ")}`;
    this.els.status.textContent = this.paused
      ? "Paused"
      : this.trackingPaused
        ? "Paused: can't see your face. Scanning continues when your face is back in view."
        : `Tracking · ${this.scanner.mode === "auto" ? "Auto-scan" : "Step-scan"} · ${where}`;
    this.els.status.classList.toggle("bad", this.trackingPaused && !this.paused);
  }

  private chooseKey(key: Key): void {
    const effect = applyKey(this.text, key);
    this.setMessage(effect.text);
    if (effect.speak) {
      const err = speakErrorMessage(speak(effect.speak, this.ctx.settings.speechRate, this.ctx.settings.voiceURI));
      if (err) this.ctx.notify(err, true);
      if (key.kind === "speak" && this.ctx.settings.clearAfterSpeak) this.setMessage("");
    }
    if (effect.layout) {
      this.layout = effect.layout === "phrases" ? phraseLayout(DEFAULT_PHRASES) : KEYBOARD;
      this.scanner.setLayout(this.layout, performance.now());
      this.renderGrid();
    }
    if (effect.pause) this.setPaused(true);
    this.events.onKey?.(key, this.text, performance.now());
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.ctx.setActivity(paused ? "paused" : null);
    this.resumeStart = null;
    this.els.pausedBanner.hidden = !paused;
    this.els.resumeHint.textContent = "";
    this.els.grid.classList.toggle("dimmed", paused || this.trackingPaused);
    if (!paused) this.scanner.reset(performance.now());
    this.renderHighlight();
  }

  private renderGrid(): void {
    this.keyButtons = [];
    this.rowEls = [];
    this.els.grid.replaceChildren();
    this.els.grid.classList.toggle("phrases", this.layout !== KEYBOARD);
    this.layout.forEach((row) => {
      const buttons = row.map((key) =>
        h(
          "button",
          { class: `kb-key kind-${key.kind}`, "aria-label": key.name ?? key.label, onclick: () => this.chooseKey(key) },
          key.label,
        ),
      );
      const rowEl = h("div", { class: "kb-row" }, buttons);
      this.keyButtons.push(buttons);
      this.rowEls.push(rowEl);
      this.els.grid.append(rowEl);
    });
    this.renderHighlight();
  }

  private renderHighlight(): void {
    const { level, row, col } = this.scanner;
    this.rowEls.forEach((el, r) => el.classList.toggle("hl-row", !this.paused && r === row));
    this.keyButtons.forEach((buttons, r) =>
      buttons.forEach((b, c) => b.classList.toggle("hl-key", !this.paused && level === "key" && r === row && c === col)),
    );
  }
}

function selectGesture(p: Profile) {
  return p.bindings.find((b) => b.action === "SELECT")!.gesture;
}
