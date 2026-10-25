/**
 * The live 3D face on the welcome page: "See what Tessera sees".
 *
 * - Shows the standard face as a wireframe, swaying slowly left and right,
 *   with a red dot on each face area that hasn't been tested yet (the same
 *   dots as the Face map screen).
 * - "Try it with your camera" starts the camera. Then the mesh follows the
 *   person's face, using the same code as the Face map (liveToModel).
 * - Three.js is only downloaded when this part of the page is about to come
 *   into view, and only if the browser has WebGL. Until then (or without
 *   WebGL), the mosaic face logo shows instead.
 * - Reduced motion: no sway. The sway also stops while it's off screen.
 * - Nothing is saved. The live face shape is only drawn, never stored.
 */
import { pointColors } from "../signal/movementMap";
import type { DetectionListener } from "../vision/tracker";
import { CANONICAL_POINT_COUNT } from "../viz/canonicalFace";
import { buildRegions, meshEdges } from "../viz/faceRegions";
import type { Head3D } from "../viz/head3d";
import { liveToModel, standardShape } from "../viz/liveShape";
import { webglAvailable } from "../viz/webgl";
import { h } from "./dom";
import { faceLogo } from "./faceLogo";
import { MapNodes } from "./mapNodes";
import { prefersReducedMotion } from "./reveal";

export interface LandingFaceDeps {
  ensureCamera(): Promise<boolean>;
  subscribe(fn: DetectionListener): () => void;
}

const LIVE_INTERVAL_MS = 50; // at most 20 shape updates a second, like the Face map
const FACE_LOST_MS = 700;
const SWAY_RADIANS = 0.38; // about 22° each way
const SWAY_PERIOD_MS = 9000;
const SWAY_FRAME_MS = 33; // about 30 frames a second is plenty for a slow sway

export class LandingFace {
  readonly el: HTMLElement;
  private stage: HTMLElement;
  private placeholder: HTMLElement;
  private chip: HTMLElement;
  private tryBtn: HTMLButtonElement;
  private head: Head3D | null = null;
  private nodes = new MapNodes();
  private regions = buildRegions();
  private shape = standardShape();
  private live = false;
  private lastFaceT = 0;
  private onScreen = false;
  private disposed = false;
  private swayFrame = 0;
  private lastSway = 0;
  private statusTimer: number | null = null;
  private unsubscribe: (() => void) | null = null;
  private observer: IntersectionObserver | null = null;

  constructor(private deps: LandingFaceDeps) {
    this.placeholder = h("div", { class: "demo-placeholder" }, faceLogo({ size: 200, animate: true }));
    this.chip = h("p", { class: "demo-chip", role: "status" }, "Standard face · 468 points");
    this.stage = h("div", { class: "demo-stage" }, this.placeholder, this.nodes.layer, this.chip);
    this.tryBtn = h("button", { class: "pill-button", hidden: true, onclick: () => void this.tryCamera() }, "Try it with your camera");
    this.el = h(
      "div",
      { class: "demo" },
      this.stage,
      h(
        "div",
        { class: "demo-bar" },
        this.tryBtn,
        h("p", { class: "demo-note" }, "Your video stays in this browser tab. Nothing is recorded or sent."),
        h("p", { class: "demo-legend" }, h("span", { class: "node-swatch", "aria-hidden": "true" }), "Red dots: face areas you haven't tested yet. Calibration tests each one."),
      ),
    );

    if (!webglAvailable()) {
      this.chip.textContent = "This browser can't show the 3D face. Tessera still works without it.";
      return;
    }
    // Load the 3D view when it's about to scroll into view; sway only while it's on screen.
    if ("IntersectionObserver" in window) {
      this.observer = new IntersectionObserver(
        ([e]) => {
          this.onScreen = e.isIntersecting;
          if (this.onScreen) void this.start();
          this.updateSway();
        },
        { rootMargin: "200px 0px" },
      );
      this.observer.observe(this.stage);
    } else {
      this.onScreen = true;
      void this.start();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.observer?.disconnect();
    cancelAnimationFrame(this.swayFrame);
    if (this.statusTimer !== null) clearInterval(this.statusTimer);
    this.unsubscribe?.();
    this.head?.dispose();
    this.head = null;
  }

  private async start(): Promise<void> {
    if (this.head || this.disposed) return;
    let mod: typeof import("../viz/head3d");
    try {
      mod = await import("../viz/head3d");
    } catch {
      this.chip.textContent = "The 3D face couldn't load. Tessera still works without it.";
      return;
    }
    if (this.head || this.disposed) return;
    try {
      this.head = new mod.Head3D(this.stage, meshEdges(), CANONICAL_POINT_COUNT);
    } catch {
      this.chip.textContent = "The 3D face couldn't start on this device. Tessera still works without it.";
      return;
    }
    this.head.setInteractive(false);
    this.head.setLabel("A 3D wireframe of a face, with a dot on each face area. Red dots are areas not tested yet.");
    this.stage.append(this.nodes.layer, this.chip); // keep the dots and the label above the canvas
    this.placeholder.remove();
    this.head.onRender = () => this.head && this.nodes.place(this.head, this.shape, this.regions, null);
    this.head.setShape(this.shape);
    this.head.setColors(pointColors(null, this.regions, CANONICAL_POINT_COUNT));
    this.tryBtn.hidden = false;
    this.updateSway();
  }

  // ----- Slow sway (welcome page only) --------------------------------------

  private updateSway(): void {
    const run = !!this.head && this.onScreen && !this.live && !prefersReducedMotion();
    cancelAnimationFrame(this.swayFrame);
    if (!run) return;
    const step = (t: number) => {
      if (t - this.lastSway >= SWAY_FRAME_MS) {
        this.lastSway = t;
        this.head?.setTurn(SWAY_RADIANS * Math.sin((2 * Math.PI * t) / SWAY_PERIOD_MS));
      }
      this.swayFrame = requestAnimationFrame(step);
    };
    this.swayFrame = requestAnimationFrame(step);
  }

  // ----- Following the person's face ----------------------------------------

  private async tryCamera(): Promise<void> {
    this.tryBtn.disabled = true;
    this.tryBtn.textContent = "Starting the camera…";
    this.chip.textContent = "Starting the camera…";
    const ok = await this.deps.ensureCamera();
    if (this.disposed) return;
    if (!ok) {
      this.tryBtn.disabled = false;
      this.tryBtn.textContent = "Try again";
      this.chip.textContent = "The camera didn't start. You can still continue without it.";
      return;
    }
    this.live = true;
    this.updateSway();
    this.head?.setTurn(0); // the person's own head movement takes over
    this.tryBtn.hidden = true;
    this.lastFaceT = performance.now();
    let last = 0;
    this.unsubscribe = this.deps.subscribe((det) => {
      if (!det.landmarks || det.frame.t - last < LIVE_INTERVAL_MS) return;
      last = det.frame.t;
      this.lastFaceT = performance.now();
      this.shape = liveToModel(det.landmarks, det.imageWidth || 4, det.imageHeight || 3);
      this.head?.setShape(this.shape);
    });
    const update = () => {
      const lost = performance.now() - this.lastFaceT > FACE_LOST_MS;
      this.chip.textContent = lost ? "Can't see your face. Showing the last shape." : "Following your face · 468 points";
      this.chip.classList.toggle("lost", lost);
    };
    update();
    this.statusTimer = window.setInterval(update, 300);
  }
}
