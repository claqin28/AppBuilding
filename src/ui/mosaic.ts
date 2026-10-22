/**
 * The Tessera logo: a simple face made of mosaic tiles ("tesserae").
 *
 * With `animate`, the tiles "click" into place one at a time, in a shuffled
 * order, once (about 1.4 s). Each tile appears exactly once and never blinks,
 * so there's no flashing. With "reduce motion" turned on, the CSS turns the
 * animation off and the finished mosaic just appears.
 *
 * It's drawn as inline SVG: no image files, nothing downloaded.
 */

// The face, one letter per tile:
//   . background   F face   E eye   C cheek   M mouth
const FACE = [
  "..FFFFF..",
  ".FFFFFFF.",
  "FFFFFFFFF",
  "FFEFFFEFF",
  "FFFFFFFFF",
  "FCFFFFFCF",
  "FFMFFFMFF",
  ".FFMMMFF.",
  "..FFFFF..",
];

const COLORS: Record<string, readonly string[]> = {
  ".": ["#3f8f88", "#4c7fa8", "#5aa6b8", "#6fb5a4", "#3c6f8f"],
  F: ["#f2c48d", "#e9b47c", "#f6d4a8", "#edbf86"],
  E: ["#2b4560"],
  C: ["#e8968a", "#eca394"],
  M: ["#c0533a", "#b8472f"],
};

const SVG_NS = "http://www.w3.org/2000/svg";
const CELL = 10;
const TILE = 8.4;
const STAGGER_MS = 15;

/** Small seeded random numbers, so the mosaic looks the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mosaicLogo(opts: { size: number; animate?: boolean; label?: string }): SVGSVGElement {
  const rand = rng(7);
  const svg = document.createElementNS(SVG_NS, "svg");
  const n = FACE.length;
  svg.setAttribute("viewBox", `0 0 ${n * CELL} ${n * CELL}`);
  svg.setAttribute("width", String(opts.size));
  svg.setAttribute("height", String(opts.size));
  svg.classList.add("mosaic");
  if (opts.label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", opts.label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }

  // Shuffled order in which tiles appear.
  const order = Array.from({ length: n * n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const delayOf = new Map(order.map((cell, k) => [cell, k * STAGGER_MS]));

  FACE.forEach((row, r) => {
    [...row].forEach((kind, c) => {
      const palette = COLORS[kind];
      const g = document.createElementNS(SVG_NS, "g");
      // A slight random tilt makes it look hand-laid, like a real mosaic.
      const cx = c * CELL + CELL / 2;
      const cy = r * CELL + CELL / 2;
      g.setAttribute("transform", `rotate(${((rand() - 0.5) * 8).toFixed(1)} ${cx} ${cy})`);
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", (cx - TILE / 2).toFixed(2));
      rect.setAttribute("y", (cy - TILE / 2).toFixed(2));
      rect.setAttribute("width", String(TILE));
      rect.setAttribute("height", String(TILE));
      rect.setAttribute("rx", "1.6");
      rect.setAttribute("fill", palette[Math.floor(rand() * palette.length)]);
      rect.style.setProperty("--delay", `${delayOf.get(r * n + c)}ms`);
      g.append(rect);
      svg.append(g);
    });
  });
  if (opts.animate) replayMosaic(svg);
  return svg;
}

/** Plays the "tiles clicking into place" animation again (e.g. while loading). */
export function replayMosaic(svg: SVGSVGElement): void {
  svg.classList.remove("assemble");
  void svg.getBoundingClientRect(); // restart the CSS animation
  svg.classList.add("assemble");
}
