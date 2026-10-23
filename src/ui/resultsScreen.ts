/**
 * Calibration results in plain language, the recommended gesture-to-action
 * mapping (which a helper can change), a live "try it" check, and saving.
 */
import type { CalibrationResult } from "../signal/calibration";
import { ControlEngine, DEFAULT_ENGINE } from "../signal/engine";
import { explainGesture } from "../signal/explain";
import { gestureDef, type GestureId } from "../signal/gestures";
import { buildProfile, type Profile } from "../signal/profile";
import { ACTIONS, assignActions, conflict, selectGestures, type Action } from "../signal/selection";
import type { AppContext, Screen } from "./app";
import { downloadText, formatDuration, h, timestampForFile } from "./dom";
import { Meters } from "./meters";

const ACTION_HELP: Record<Action, string> = {
  SELECT: "chooses the highlighted item",
  NEXT: "moves the highlight forward (step mode)",
  BACK: "goes back up a level",
};

export class ResultsScreen implements Screen {
  private unsub: (() => void) | null = null;

  constructor(private ctx: AppContext) {}

  mount(root: HTMLElement): void {
    const last = this.ctx.lastCalibration;
    if (!last) {
      root.append(
        h("h2", {}, "Results"),
        h("p", {}, "No calibration yet."),
        h("button", { class: "big-button", onclick: () => this.ctx.go("calibrate") }, "Calibrate"),
      );
      return;
    }
    const { result, trace, durationMs } = last;
    const selection = selectGestures(result);
    const actions = assignActions(selection.chosen);

    // --- Mapping editor ------------------------------------------------------
    const selects = new Map<Action, HTMLSelectElement>();
    const editor = h("div", { class: "mapping" });
    for (const action of ACTIONS) {
      const sel = h("select", { "aria-label": `Gesture for ${action}` });
      if (action !== "SELECT") sel.append(h("option", { value: "" }, "(none)"));
      for (const g of result.gestures) {
        const label = `${gestureDef(g.id).label}${g.usable ? "" : " (not reliable)"}`;
        sel.append(h("option", { value: g.id, selected: actions[action] === g.id }, label));
      }
      if (action === "SELECT" && !actions.SELECT && result.gestures.length) sel.selectedIndex = 0;
      selects.set(action, sel);
      editor.append(
        h("label", { class: "mapping-row" }, h("strong", {}, action), h("span", { class: "hint" }, ACTION_HELP[action]), sel),
      );
    }
    const warnings = h("ul", { class: "warnings", "aria-live": "polite" });
    const meters = new Meters();
    let engine: ControlEngine | null = null;
    let profile: Profile | null = null;

    const current = (): Partial<Record<Action, GestureId>> => {
      const out: Partial<Record<Action, GestureId>> = {};
      for (const [a, sel] of selects) if (sel.value) out[a] = sel.value as GestureId;
      return out;
    };
    const refresh = () => {
      warnings.replaceChildren();
      const map = current();
      try {
        profile = buildProfile(result, map, durationMs);
      } catch (e) {
        profile = null;
        warnings.append(h("li", {}, e instanceof Error ? e.message : String(e)));
      }
      warnings.append(...mappingWarnings(result, map).map((w) => h("li", {}, w)));
      if (profile) {
        engine = new ControlEngine(profile.bindings, {
          ...DEFAULT_ENGINE,
          tauMs: profile.tauMs,
          holdMs: this.ctx.settings.holdMs,
          refractoryMs: this.ctx.settings.refractoryMs,
        });
        meters.setChannels(profile.bindings);
      } else {
        engine = null;
        meters.setChannels([]);
      }
      save.disabled = !profile;
    };
    for (const sel of selects.values()) sel.addEventListener("change", refresh);

    const save = h("button", { class: "big-button" }, "Save and start talking");
    save.addEventListener("click", () => {
      if (!profile) return;
      this.ctx.setProfile(profile);
      this.ctx.recordCalibration(result, durationMs, profile.bindings.map((b) => b.gesture));
      this.ctx.go("talk");
    });

    // --- Layout --------------------------------------------------------------
    root.append(
      h("h2", {}, "Your results"),
      h("p", { class: "callout" }, summaryText(selection.chosen)),
      durationMs > 0 ? h("p", { class: "hint" }, `Calibration took ${formatDuration(durationMs)}.`) : "",
      h("h3", {}, "Gestures and what they do"),
      editor,
      warnings,
      h("h3", {}, "Try it"),
      h("p", { class: "hint" }, "Do each gesture. The bar should pass the tick mark, and the row lights up when it counts."),
      meters.el,
      h(
        "div",
        { class: "button-row" },
        save,
        h("button", { class: "mid-button", onclick: () => this.ctx.go("calibrate") }, "Calibrate again"),
        h(
          "button",
          {
            class: "mid-button",
            onclick: () => downloadText(`calibration-${timestampForFile()}.json`, JSON.stringify(trace)),
          },
          "Download calibration recording",
        ),
      ),
      h("h3", {}, "Every movement tested"),
      result.gestures.some((g) => !g.usable)
        ? h(
            "p",
            { class: "callout calm" },
            "Not every movement works for every person. That's expected: Tessera only needs 1 to 3 that work for you.",
          )
        : "",
      h(
        "div",
        { class: "result-cards" },
        result.gestures.map((g) => {
          const ex = explainGesture(g, result.config);
          const role = ACTIONS.find((a) => actions[a] === g.id);
          return h(
            "article",
            { class: `result-card ${ex.verdict}` },
            h("h4", {}, gestureDef(g.id).label, role ? h("span", { class: "badge" }, role) : null),
            h("p", { class: "verdict" }, ex.headline),
            h("ul", {}, ex.details.map((d) => h("li", {}, d))),
          );
        }),
      ),
      result.skipped.length
        ? h("p", { class: "hint" }, `Skipped: ${result.skipped.map((id) => gestureDef(id).label).join(", ")}.`)
        : "",
      h(
        "p",
        { class: "hint" },
        "The recording contains only numbers describing facial movement, never images. It's saved only if you download it.",
      ),
    );
    refresh();

    this.unsub = this.ctx.subscribe((det) => {
      if (!engine) return;
      const out = engine.update(det.frame);
      meters.update(out.channels, out.fired, det.frame.t);
    });
  }

  unmount(): void {
    this.unsub?.();
    this.unsub = null;
  }
}

function summaryText(chosen: GestureId[]): string {
  const names = chosen.map((id) => gestureDef(id).label.toLowerCase());
  if (chosen.length === 0) {
    return (
      "None of the movements were reliable enough this time. Check the lighting and position, " +
      "then try again with more of the movements ticked. Smaller movements are fine if they're consistent."
    );
  }
  if (chosen.length === 1) {
    return (
      `One movement worked reliably: ${names[0]}. That's enough to type with auto-scan: ` +
      "the highlight moves by itself and you use this movement to choose."
    );
  }
  return `Recommended for you: ${names.join(", ")}. They work reliably and don't get confused with each other.`;
}

/** Warns about choices a helper made by hand that calibration wouldn't recommend. */
function mappingWarnings(result: CalibrationResult, map: Partial<Record<Action, GestureId>>): string[] {
  const out: string[] = [];
  const stats = Object.values(map).map((id) => result.gestures.find((g) => g.id === id)!);
  for (const s of stats) {
    if (!s.usable) out.push(`${gestureDef(s.id).label} wasn't reliable in calibration; it may misfire or not respond.`);
  }
  for (let i = 0; i < stats.length; i++) {
    for (let j = i + 1; j < stats.length; j++) {
      if (conflict(stats[i], stats[j]) >= 0.5) {
        out.push(
          `${gestureDef(stats[i].id).label} and ${gestureDef(stats[j].id).label} interfere with each other for you.`,
        );
      }
    }
  }
  return out;
}
