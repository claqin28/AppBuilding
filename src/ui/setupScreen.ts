/** Step 1: camera check. Live signal bars so the user (or a helper) can see the camera is working. */
import type { AppContext, Screen } from "./app";
import { DebugView } from "./debugView";
import { h } from "./dom";

const UI_INTERVAL_MS = 66;

export class SetupScreen implements Screen {
  private unsub: (() => void) | null = null;

  constructor(private ctx: AppContext) {}

  mount(root: HTMLElement): void {
    const bars = h("div", { class: "bars" });
    const debug = new DebugView(bars);
    const showAll = h("input", { type: "checkbox" });
    showAll.addEventListener("change", () => debug.setShowAll(showAll.checked));
    const hasProfile = this.ctx.profile !== null;

    root.append(
      h("h2", {}, "Step 1: Camera check"),
    );
    if (!this.ctx.source) {
      root.append(h("p", { class: "callout" }, "Press “Start camera” on the left. Your browser will ask for permission."));
    }
    root.append(
      h(
        "p",
        {},
        "Sit so your whole face is in view, with light on your face (not behind you). " +
          "When the three checks on the left are green, move on.",
      ),
      h("label", { class: "toggle" }, showAll, " Show all 51 signals"),
      h("p", { class: "hint" }, "Each bar is how strongly the model thinks you're making that movement, from 0 to 1."),
      bars,
      h(
        "button",
        { class: "big-button", onclick: () => this.ctx.go(hasProfile ? "talk" : "calibrate") },
        hasProfile ? "Continue to Talk" : "Next: Calibrate",
      ),
    );

    let last = 0;
    this.unsub = this.ctx.subscribe((det) => {
      if (det.frame.t - last < UI_INTERVAL_MS || !det.frame.face) return;
      last = det.frame.t;
      debug.update(det.frame.scores);
    });
  }

  unmount(): void {
    this.unsub?.();
    this.unsub = null;
  }
}
