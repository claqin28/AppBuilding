/**
 * Live bar chart of every blendshape score.
 *
 * DOM elements are created once and then only their widths/text change,
 * because rebuilding 51 rows 30 times a second would waste CPU that the
 * face model needs.
 */

/** Blendshapes most likely to become control gestures; shown first. */
const KEY_SHAPES = [
  "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
  "browDownLeft", "browDownRight",
  "jawOpen", "jawLeft", "jawRight",
  "mouthSmileLeft", "mouthSmileRight", "mouthPucker", "cheekPuff",
  "eyeBlinkLeft", "eyeBlinkRight",
];

interface Row {
  fill: HTMLElement;
  value: HTMLElement;
}

export class DebugView {
  private rows = new Map<string, Row>();
  private showAll = false;

  constructor(private container: HTMLElement) {}

  setShowAll(showAll: boolean): void {
    this.showAll = showAll;
    for (const [name, row] of this.rows) {
      const el = row.fill.closest<HTMLElement>(".bs-row")!;
      el.hidden = !showAll && !KEY_SHAPES.includes(name);
    }
  }

  update(scores: Record<string, number>): void {
    if (this.rows.size === 0) this.build(Object.keys(scores));
    for (const [name, row] of this.rows) {
      const s = scores[name] ?? 0;
      row.fill.style.width = `${(s * 100).toFixed(1)}%`;
      row.value.textContent = s.toFixed(2);
    }
  }

  private build(names: string[]): void {
    const ordered = [
      ...KEY_SHAPES.filter((n) => names.includes(n)),
      ...names.filter((n) => !KEY_SHAPES.includes(n)).sort(),
    ];
    for (const name of ordered) {
      const row = document.createElement("div");
      row.className = "bs-row";
      row.innerHTML =
        `<span class="bs-name"></span>` +
        `<span class="bs-track" aria-hidden="true"><span class="bs-fill"></span></span>` +
        `<span class="bs-value">0.00</span>`;
      row.querySelector(".bs-name")!.textContent = name;
      this.container.append(row);
      this.rows.set(name, {
        fill: row.querySelector<HTMLElement>(".bs-fill")!,
        value: row.querySelector<HTMLElement>(".bs-value")!,
      });
    }
    this.setShowAll(this.showAll);
  }
}
