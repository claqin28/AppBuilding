/**
 * The Tessera logo: a low-poly, geometric face, a flat (2D) version of the 3D
 * face mesh used by the face map.
 *
 * The triangles come from src/viz/logoMesh.ts (feature points plus evenly
 * spread fill points, joined by Delaunay triangulation). Here we:
 *   - shade each triangle by which way it faces in 3D, as if lit from the
 *     upper left, so a flat drawing looks sculpted. Shades are a soft blue
 *     range (CSS tokens --logo-lit to --logo-shadow), with a little seeded
 *     variation per piece so it looks like hand-laid mosaic tiles.
 *   - fill the eyes with dark blue and add a small white highlight to each,
 *     tint the lips a little darker than the skin, and draw a thin smile line
 *     where the lips meet. Together these make the face look friendly.
 * Logos smaller than 96 px use the "small" mesh (fewer, bigger triangles)
 * and skip the eye highlights, which would be too small to see.
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
  /** 0 = in shadow, 1 = fully lit (relative to the rest of the face). */
  tone: number;
  eye: boolean;
  mouth: boolean;
  /** Direction to fly in from (unit-ish), and the order it appears in. */
  dx: number;
  dy: number;
  order: number;
}

interface BuiltLogo {
  tris: LogoTri[];
  /** One small highlight triangle per eye. */
  glints: string[];
  smile: string;
  viewBox: string;
}

const cache = new Map<LogoDetail, BuiltLogo>();

function build(detail: LogoDetail): BuiltLogo {
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
  const jitter = seeded(5);
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
      tone: shade + (jitter() - 0.5) * 0.08, // rescaled to 0..1 below
      eye: mesh.eye[i],
      mouth: mesh.mouth[i],
      dx: (mx - cx) / dist,
      dy: (my - cy) / dist,
      order: 0,
    };
  });
  // Stretch the tones to the full lit..shadow range, so no part of the face is
  // darker than --logo-shadow (a gentle range instead of a harsh black side).
  const skin = out.filter((t) => !t.eye && !t.mouth).map((t) => t.tone);
  const [lo, hi] = [Math.min(...skin), Math.max(...skin)];
  for (const t of out) t.tone = Math.min(1, Math.max(0, (t.tone - lo) / (hi - lo || 1)));

  // Eye highlights: a small triangle in the upper left of each eye (toward the light).
  const glints = mesh.eyes.map(({ cx, cy, w, h }) => {
    const [gx, gy, r] = [cx - w * 0.12, cy - h * 0.12, Math.min(w, h) * 0.28];
    return [
      [gx - r * 0.6, gy + r * 0.5],
      [gx + r * 0.7, gy - r * 0.2],
      [gx - r * 0.1, gy - r * 0.7],
    ]
      .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ");
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
  const smile = mesh.smile.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const built = { tris: out, glints, smile, viewBox: `${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}` };
  cache.set(detail, built);
  return built;
}

export function faceLogo(opts: { size: number; animate?: boolean; label?: string }): SVGSVGElement {
  const small = opts.size < 96;
  const { tris, glints, smile, viewBox } = build(small ? "small" : "full");
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
  // Skin first, then mouth, then eyes, so the eye and mouth outlines aren't covered.
  const layer = (t: LogoTri) => (t.eye ? 2 : t.mouth ? 1 : 0);
  for (const t of [...tris].sort((a, b) => layer(a) - layer(b))) {
    const poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("points", t.points);
    if (t.eye) poly.classList.add("eye");
    else if (t.mouth) poly.classList.add("mouth");
    else poly.style.setProperty("--t", t.tone.toFixed(2));
    poly.style.setProperty("--delay", `${Math.round(t.order * step)}ms`);
    poly.style.setProperty("--dx", `${(t.dx * 3).toFixed(2)}px`);
    poly.style.setProperty("--dy", `${(t.dy * 3).toFixed(2)}px`);
    svg.append(poly);
  }
  // Smile line and eye highlights appear last, once the face is in place.
  const extras = [{ points: smile, cls: "smile" }];
  if (!small) extras.push(...glints.map((points) => ({ points, cls: "glint" })));
  for (const { points, cls } of extras) {
    const poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("points", points);
    poly.classList.add(cls);
    poly.style.setProperty("--delay", `${ANIM_TOTAL_MS}ms`);
    poly.style.setProperty("--dx", "0px");
    poly.style.setProperty("--dy", "0px");
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
