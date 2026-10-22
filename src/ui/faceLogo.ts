/**
 * The Tessera logo: a low-poly, geometric face, a flat (2D) version of the 3D
 * face mesh used by the face map.
 *
 * The triangles come from src/viz/logoMesh.ts (feature points plus evenly
 * spread fill points, joined by Delaunay triangulation). Here we:
 *   - shade each triangle by which way it faces in 3D, as if lit from the
 *     upper left, so a flat drawing looks sculpted. On a light page, lit
 *     triangles use LESS ink (paler); on a dark page, lit triangles use MORE
 *     light (brighter), so the face looks lit from the same side in both themes.
 *   - fill the eye triangles with the brand accent color, and draw the lips
 *     darker than the skin in both themes.
 * Logos smaller than 96 px use the "small" mesh (fewer, bigger triangles).
 *
 * With `animate`, the triangles fly in from slightly outside and "click"
 * together, once (~1.3 s). Each piece appears once (no flashing), and
 * "reduce motion" turns the animation off.
 */
import { buildLogoMesh, type LogoDetail } from "../viz/logoMesh";

const SVG_NS = "http://www.w3.org/2000/svg";
const ANIM_TOTAL_MS = 1100;

interface LogoTri {
  points: string;
  shade: number;
  eye: boolean;
  mouth: boolean;
  /** Direction to fly in from (unit-ish), and the order it appears in. */
  dx: number;
  dy: number;
  order: number;
}

const cache = new Map<LogoDetail, { tris: LogoTri[]; viewBox: string }>();

function build(detail: LogoDetail): { tris: LogoTri[]; viewBox: string } {
  const hit = cache.get(detail);
  if (hit) return hit;
  const mesh = buildLogoMesh(detail);
  const P2 = mesh.points2;
  const P3 = mesh.points3;

  const xs = P2.map((p) => p[0]);
  const ys = P2.map((p) => p[1]);
  const pad = 0.6;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad;
  const h = Math.max(...ys) - minY + pad;
  const cx = minX + w / 2;
  const cy = minY + h / 2;

  // Light from the upper left, slightly toward the viewer.
  const L = normalize([-0.3, 0.45, 0.85]);
  const out: LogoTri[] = mesh.tris.map(([a, b, c], i) => {
    const [A, B, C] = [P3[a], P3[b], P3[c]];
    let n = normalize(cross(sub(B, A), sub(C, A)));
    if (n[2] < 0) n = [-n[0], -n[1], -n[2]]; // face toward the viewer
    const shade = Math.max(0, dot(n, L));
    const mx = (P2[a][0] + P2[b][0] + P2[c][0]) / 3;
    const my = (P2[a][1] + P2[b][1] + P2[c][1]) / 3;
    const dist = Math.hypot(mx - cx, my - cy) || 1;
    return {
      points: [a, b, c].map((k) => `${P2[k][0].toFixed(2)},${P2[k][1].toFixed(2)}`).join(" "),
      shade,
      eye: mesh.eye[i],
      mouth: mesh.mouth[i],
      dx: (mx - cx) / dist,
      dy: (my - cy) / dist,
      order: 0,
    };
  });
  // Shuffled appearance order, seeded so it looks the same every time.
  // (Fisher-Yates shuffle: swap each item with a random earlier one.)
  const r = seeded(11);
  const idx = out.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  idx.forEach((t, k) => (out[t].order = k));
  const built = { tris: out, viewBox: `${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}` };
  cache.set(detail, built);
  return built;
}

export function faceLogo(opts: { size: number; animate?: boolean; label?: string }): SVGSVGElement {
  const { tris, viewBox } = build(opts.size < 96 ? "small" : "full");
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", String(opts.size));
  svg.setAttribute("height", String(opts.size));
  svg.classList.add("face-logo");
  if (opts.label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", opts.label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  const step = ANIM_TOTAL_MS / tris.length;
  for (const t of tris) {
    const poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("points", t.points);
    if (t.eye) poly.classList.add("eye");
    else if (t.mouth) {
      // Darker than any skin triangle in both themes.
      poly.style.setProperty("--op-light", "0.9");
      poly.style.setProperty("--op-dark", "0.1");
    } else {
      poly.style.setProperty("--op-light", (0.15 + 0.75 * (1 - t.shade)).toFixed(2));
      poly.style.setProperty("--op-dark", (0.15 + 0.75 * t.shade).toFixed(2));
    }
    poly.style.setProperty("--delay", `${Math.round(t.order * step)}ms`);
    poly.style.setProperty("--dx", `${(t.dx * 3).toFixed(2)}px`);
    poly.style.setProperty("--dy", `${(t.dy * 3).toFixed(2)}px`);
    svg.append(poly);
  }
  if (opts.animate) replayLogo(svg);
  return svg;
}

/** Plays the "pieces clicking together" animation again (e.g. while loading). */
export function replayLogo(svg: SVGSVGElement): void {
  svg.classList.remove("assemble");
  void svg.getBoundingClientRect(); // restart the CSS animation
  svg.classList.add("assemble");
}

type V3 = [number, number, number] | number[];
const sub = (a: V3, b: V3): number[] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): number[] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function normalize(v: V3): number[] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
