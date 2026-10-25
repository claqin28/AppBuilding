/**
 * Small dots on the 3D head, one per face region, instead of big text labels
 * that cover the mesh. Red = not tested yet (calibration tests it); a tested
 * region's dot uses its result color. Hovering a dot shows its name and
 * number. The Face map screen's table always has the same information, so
 * nothing depends on hovering or on color.
 *
 * Used by the Face map screen and by the welcome page's 3D demo.
 */
import { REGION_IDS, regionNodes, type RegionId, type RegionScore } from "../signal/movementMap";
import { regionCentre } from "../viz/faceRegions";
import type { Head3D } from "../viz/head3d";
import { h } from "./dom";

export class MapNodes {
  readonly layer: HTMLElement = h("div", { class: "map-nodes", "aria-hidden": "true" });
  private dots = new Map<RegionId, HTMLElement>();

  constructor() {
    for (const r of REGION_IDS) {
      const dot = h("span", { class: "map-node", hidden: true });
      this.dots.set(r, dot);
      this.layer.append(dot);
    }
  }

  /** Moves each dot to the centre of its region, as seen from the current view. */
  place(
    head: Head3D,
    shape: Float32Array,
    regions: Record<RegionId, readonly number[]>,
    scores: Record<RegionId, RegionScore> | null,
  ): void {
    for (const n of regionNodes(scores)) {
      const dot = this.dots.get(n.region)!;
      const p = head.project(regionCentre(shape, regions[n.region]));
      dot.hidden = !p.visible;
      dot.dataset.state = n.state;
      dot.dataset.label = n.label;
      dot.style.background = n.color ?? "";
      dot.style.left = `${p.x}px`;
      dot.style.top = `${p.y}px`;
    }
  }

  hide(): void {
    for (const dot of this.dots.values()) dot.hidden = true;
  }
}
