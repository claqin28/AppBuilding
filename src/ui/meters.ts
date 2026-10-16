/**
 * Live meters for the person's control gestures. Each bar shows how close
 * the gesture is to firing; the tick mark is the "on" threshold. Seeing this
 * helps people learn how much effort is enough, without straining.
 */
import type { ChannelState } from "../signal/engine";
import { gestureDef } from "../signal/gestures";
import type { Action } from "../signal/selection";
import { h } from "./dom";

/** The bar's full width means 1.5 × the threshold, so the tick sits at 2/3. */
const FULL_SCALE = 1.5;
const FLASH_MS = 700;

export class Meters {
  readonly el = h("div", { class: "meters" });
  private rows = new Map<Action, { fill: HTMLElement; row: HTMLElement }>();
  private lastFired = new Map<Action, number>();

  setChannels(channels: readonly { action: Action; gesture: ChannelState["gesture"] }[]): void {
    this.el.replaceChildren();
    this.rows.clear();
    for (const c of channels) {
      const fill = h("span", { class: "meter-fill" });
      const row = h(
        "div",
        { class: "meter-row" },
        h("span", { class: "meter-label" }, h("strong", {}, c.action), " ", gestureDef(c.gesture).label),
        h(
          "span",
          { class: "meter-track", "aria-hidden": "true" },
          fill,
          h("span", { class: "meter-tick", style: `left:${(100 / FULL_SCALE).toFixed(1)}%` }),
        ),
      );
      this.rows.set(c.action, { fill, row });
      this.el.append(row);
    }
  }

  update(channels: readonly ChannelState[], fired: Action | null, now: number): void {
    if (fired) this.lastFired.set(fired, now);
    for (const c of channels) {
      const r = this.rows.get(c.action);
      if (!r) continue;
      r.fill.style.width = `${(Math.min(1, c.progress / FULL_SCALE) * 100).toFixed(1)}%`;
      r.row.classList.toggle("active", c.phase === "holding" || c.phase === "pending");
      // A steady highlight (not a flash) for a moment after firing.
      r.row.classList.toggle("fired", now - (this.lastFired.get(c.action) ?? -Infinity) < FLASH_MS);
    }
  }
}
