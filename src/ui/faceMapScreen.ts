/**
 * Face map: a 3D wireframe head, live from the camera or the standard face,
 * colored by the person's calibration numbers.
 *
 * Prototype visualization, NOT a medical or clinical assessment.
 *
 * - Three.js is downloaded only when the 3D view is on (dynamic import).
 * - Live shape updates are throttled (at most 20 per second) and the view
 *   renders only when something changes.
 * - Small dots on the head instead of text labels that would cover the mesh:
 *   red = not tested yet, otherwise the result color. Hover a dot for its name
 *   and number. Color is never the only signal: the legend and the table
 *   show everything as text.
 * - The live face shape is used only to draw the screen. Nothing is saved, and
 *   "Export image" uses the standard face, not the person's own face shape.
 */
import {
  legendEntries,
  METRIC_LABELS,
  percent,
  pointColors,
  REGION_IDS,
  REGION_LABELS,
  TESTABLE_REGIONS,
  regionScores,
  regionText,
  type MapMetric,
  type RegionId,
  type RegionScore,
} from "../signal/movementMap";
import { gestureDef } from "../signal/gestures";
import { CANONICAL_POINT_COUNT } from "../viz/canonicalFace";
import { buildRegions, meshEdges, regionCentre } from "../viz/faceRegions";
import type { Head3D } from "../viz/head3d";
import { liveToModel, standardShape } from "../viz/liveShape";
import { webglAvailable } from "../viz/webgl";
import type { AppContext, Screen } from "./app";
import { downloadDataUrl, h, timestampForFile } from "./dom";
import { MapNodes } from "./mapNodes";

const LIVE_INTERVAL_MS = 50;
const FACE_LOST_MS = 700;
const PROTOTYPE_NOTE = "Prototype visualization, not a medical or clinical assessment.";

type ShapeMode = "live" | "standard";

export class FaceMapScreen implements Screen {
  private head: Head3D | null = null;
  private mounted = false;
  private unsub: (() => void) | null = null;
  private faceTimer: number | null = null;
  private shapeMode: ShapeMode = "standard";
  private metric: MapMetric = "reliability";
  private regions = buildRegions();
  private shape: Float32Array = standardShape();
  private lastFaceT = 0;
  private nodes = new MapNodes();
  private els!: {
    view: HTMLElement;
    status: HTMLElement;
    legend: HTMLElement;
    table: HTMLTableSectionElement;
    note: HTMLElement;
    exportBtn: HTMLButtonElement;
    resetBtn: HTMLButtonElement;
    liveRadio: HTMLInputElement;
  };

  constructor(private ctx: AppContext) {}

  mount(root: HTMLElement): void {
    this.mounted = true;
    const hasCamera = this.ctx.source?.kind === "camera";
    this.shapeMode = hasCamera ? "live" : "standard";

    const show3d = h("input", { type: "checkbox", checked: this.ctx.settings.show3d });
    show3d.addEventListener("change", () => {
      this.ctx.setSettings({ ...this.ctx.settings, show3d: show3d.checked });
      if (show3d.checked) void this.start3d();
      else this.stop3d();
    });

    const radio = (name: string, value: string, checked: boolean, label: string, disabled = false) => {
      const input = h("input", { type: "radio", name, value, checked, disabled });
      return { input, el: h("label", { class: "check-item" }, input, " ", label) };
    };
    const live = radio("shape", "live", this.shapeMode === "live", hasCamera ? "Live (your face)" : "Live (start the camera first)", !hasCamera);
    const std = radio("shape", "standard", this.shapeMode === "standard", "Standard face");
    for (const r of [live, std]) {
      r.input.addEventListener("change", () => {
        this.shapeMode = r.input.value as ShapeMode;
        if (this.shapeMode === "standard") this.showShape(standardShape());
        this.updateStatus();
      });
    }
    const rel = radio("metric", "reliability", true, METRIC_LABELS.reliability);
    const rng = radio("metric", "range", false, METRIC_LABELS.range);
    for (const r of [rel, rng]) {
      r.input.addEventListener("change", () => {
        this.metric = r.input.value as MapMetric;
        this.applyColors();
      });
    }

    const view = h("div", { class: "facemap-view" });
    const status = h("p", { class: "map-status", role: "status" });
    view.append(this.nodes.layer, status);

    const resetBtn = h("button", { class: "mid-button", onclick: () => this.head?.resetView() }, "Reset view");
    const exportBtn = h("button", { class: "mid-button", onclick: () => this.exportImage() }, "Export image (PNG)");

    this.els = {
      view,
      status,
      legend: h("ul", { class: "map-legend", "aria-label": "Color legend" }),
      table: h("tbody"),
      note: h("p", { class: "hint" }),
      exportBtn,
      resetBtn,
      liveRadio: live.input,
    };

    root.append(
      h("h2", {}, "Face map (3D)"),
      h("p", { class: "callout" }, h("strong", {}, "Prototype. "), PROTOTYPE_NOTE),
      h("label", { class: "toggle" }, show3d, " Show 3D view"),
      h(
        "div",
        { class: "map-controls" },
        h("fieldset", {}, h("legend", {}, "Face shape"), live.el, std.el),
        h("fieldset", {}, h("legend", {}, "Color by"), rel.el, rng.el),
      ),
      view,
      h(
        "div",
        { class: "button-row" },
        h("span", { class: "hint" }, "Drag to rotate. Scroll or pinch to zoom. Point at a dot to see its name and number."),
        resetBtn,
        exportBtn,
      ),
      h("h3", {}, "Legend"),
      this.els.legend,
      h("h3", {}, "Numbers by face region"),
      h(
        "table",
        { class: "map-table" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Region"), h("th", { scope: "col" }, "Best"), h("th", { scope: "col" }, "Movements tested"))),
        this.els.table,
      ),
      this.els.note,
      h(
        "p",
        { class: "hint" },
        "Your live face shape is used only to draw this view and is never saved. " +
          "“Export image” uses the standard face, not your face shape. Left and right mean your own left and right; the head is shown like a mirror.",
      ),
    );

    this.renderLegend();
    this.renderTable();
    if (this.ctx.settings.show3d) void this.start3d();
    else this.setStatus("3D view is off. The table below shows the same numbers.");
  }

  unmount(): void {
    this.mounted = false;
    this.stop3d();
  }

  // ----- 3D lifecycle ------------------------------------------------------

  private async start3d(): Promise<void> {
    if (this.head) return;
    if (!webglAvailable()) {
      this.setStatus("This browser can't show 3D graphics (WebGL is off or unavailable). The table below shows the same numbers.");
      return;
    }
    this.setStatus("Loading the 3D view…");
    let mod: typeof import("../viz/head3d");
    try {
      mod = await import("../viz/head3d");
    } catch {
      this.setStatus("The 3D view couldn't load. The table below shows the same numbers.");
      return;
    }
    if (!this.mounted || !this.ctx.settings.show3d || this.head) return;
    try {
      this.head = new mod.Head3D(this.els.view, meshEdges(), CANONICAL_POINT_COUNT);
    } catch {
      this.setStatus("The 3D view couldn't start on this device. The table below shows the same numbers.");
      return;
    }
    this.els.view.append(this.nodes.layer, this.els.status); // keep overlays above the canvas
    this.head.onRender = () => this.placeNodes();
    this.showShape(this.shape);
    this.applyColors();
    this.lastFaceT = performance.now();

    let last = 0;
    this.unsub = this.ctx.subscribe((det) => {
      if (this.shapeMode !== "live" || !det.landmarks || det.frame.t - last < LIVE_INTERVAL_MS) return;
      last = det.frame.t;
      this.lastFaceT = performance.now();
      this.showShape(liveToModel(det.landmarks, det.imageWidth || 4, det.imageHeight || 3));
    });
    this.faceTimer = window.setInterval(() => this.updateStatus(), 250);
    this.updateStatus();
  }

  private stop3d(): void {
    this.unsub?.();
    this.unsub = null;
    if (this.faceTimer !== null) clearInterval(this.faceTimer);
    this.faceTimer = null;
    this.head?.dispose();
    this.head = null;
    this.nodes.hide();
    this.setStatus("3D view is off. The table below shows the same numbers.");
  }

  private showShape(points: Float32Array): void {
    this.shape = points;
    this.head?.setShape(points);
  }

  private scores(): Record<RegionId, RegionScore> | null {
    const result = this.ctx.lastCalibration?.result;
    return result ? regionScores(result, this.metric) : null;
  }

  private applyColors(): void {
    this.head?.setColors(pointColors(this.scores(), this.regions, CANONICAL_POINT_COUNT));
    this.renderTable();
  }

  private updateStatus(): void {
    if (!this.head) return;
    const lost = this.shapeMode === "live" && performance.now() - this.lastFaceT > FACE_LOST_MS;
    this.setStatus(lost ? "No face in view. Showing the last shape." : "");
    this.els.status.classList.toggle("corner", lost);
  }

  private setStatus(msg: string): void {
    this.els.status.textContent = msg;
    this.els.status.hidden = msg === "";
  }

  // ----- Dots, legend, table -----------------------------------------------

  /** Text label for the exported image (a downloaded picture can't be hovered). */
  private labelText(r: RegionId, scores: Record<RegionId, RegionScore> | null): string {
    const v = scores?.[r].value ?? null;
    return `${REGION_LABELS[r]} ${v === null ? "· not tested" : percent(v)}`;
  }

  private placeNodes(): void {
    if (this.head) this.nodes.place(this.head, this.shape, this.regions, this.scores());
  }

  private renderLegend(): void {
    this.els.legend.replaceChildren(
      ...legendEntries().map((e) =>
        h("li", {}, h("span", { class: "swatch", style: `background:${e.color}`, "aria-hidden": "true" }), e.label),
      ),
      h("li", {}, h("span", { class: "node-swatch", "aria-hidden": "true" }), "Red dot on the head: not tested yet"),
    );
  }

  private renderTable(): void {
    const scores = this.scores();
    this.els.table.replaceChildren(
      ...REGION_IDS.map((r) => {
        const s = scores?.[r];
        const best = s?.value ?? null;
        const detail =
          s && s.gestures.length
            ? s.gestures.map((g) => `${gestureDef(g.id).label} ${percent(g.value)}${g.usable ? "" : " (not reliable)"}`).join(", ")
            : TESTABLE_REGIONS.has(r)
              ? "not tested"
              : "no test for this area";
        return h("tr", {}, h("th", { scope: "row" }, REGION_LABELS[r]), h("td", {}, best === null ? "–" : percent(best)), h("td", {}, detail));
      }),
    );
    const has = scores !== null;
    this.els.note.textContent = has
      ? `Colors show ${this.metric === "reliability" ? "reliability (how often each movement worked)" : "range (how strong a typical try was)"} from this session's calibration.`
      : "No calibration in this session yet, so every region shows “not tested”. Calibrate (step 2), or load a saved calibration recording in Settings.";
    this.els.exportBtn.disabled = !has || !this.head;
    this.els.exportBtn.title = has ? "" : "Calibrate first: there's nothing to export yet.";
    this.head?.requestRender();
  }

  // ----- Export (user-initiated, local download only) ----------------------

  private exportImage(): void {
    const head = this.head;
    const scores = this.scores();
    if (!head || !scores) return;
    const keep = this.shape;
    const view = head.saveView();
    this.showShape(standardShape()); // never export the person's own face shape
    head.resetView(); // always export the front view
    const snap = head.snapshot();
    const { width: vw, height: vh } = head.size;

    const W = 1200;
    const H = 720;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#0f1115";
    g.fillRect(0, 0, W, H);
    const box = 680;
    const scale = Math.min(box / vw, box / vh);
    const ox = 20 + (box - vw * scale) / 2;
    const oy = 20 + (box - vh * scale) / 2;
    g.drawImage(snap, ox, oy, vw * scale, vh * scale);

    g.font = "14px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const r of REGION_IDS) {
      const p = head.project(regionCentre(this.shape, this.regions[r]));
      if (!p.visible) continue;
      const text = this.labelText(r, scores);
      const x = ox + p.x * scale;
      const y = oy + p.y * scale;
      const w = g.measureText(text).width + 10;
      g.fillStyle = "rgba(15,17,21,0.85)";
      g.fillRect(x - w / 2, y - 10, w, 20);
      g.fillStyle = "#f4f6fa";
      g.fillText(text, x, y);
    }

    let y = 40;
    const x0 = 730;
    const line = (text: string, font = "16px system-ui, sans-serif", color = "#f4f6fa", gap = 24) => {
      g.font = font;
      g.fillStyle = color;
      g.textAlign = "left";
      for (const part of wrap(g, text, W - x0 - 20)) {
        g.fillText(part, x0, y);
        y += gap;
      }
    };
    line("Tessera face map", "bold 24px system-ui, sans-serif", "#ffd34d", 34);
    line(this.metric === "reliability" ? METRIC_LABELS.reliability : METRIC_LABELS.range, "16px system-ui, sans-serif", "#b8c0cc");
    y += 6;
    for (const e of legendEntries()) {
      g.fillStyle = e.color;
      g.fillRect(x0, y - 9, 18, 18);
      g.font = "15px system-ui, sans-serif";
      g.fillStyle = "#f4f6fa";
      g.fillText(e.label, x0 + 28, y);
      y += 24;
    }
    y += 8;
    for (const r of REGION_IDS) line(regionText(scores[r]), "14px system-ui, sans-serif", "#f4f6fa", 20);
    y += 10;
    line(PROTOTYPE_NOTE, "bold 14px system-ui, sans-serif", "#ffd34d", 20);
    line("Standard face shape, not the person's own face. Mirror view: the person's left is on the left.", "13px system-ui, sans-serif", "#b8c0cc", 18);
    line(`Exported ${new Date().toLocaleDateString()}. No video or images of the person are included.`, "13px system-ui, sans-serif", "#b8c0cc", 18);

    downloadDataUrl(`tessera-face-map-${timestampForFile()}.png`, canvas.toDataURL("image/png"));
    this.showShape(this.shapeMode === "live" ? keep : standardShape());
    head.restoreView(view);
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (g.measureText(next).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
