/**
 * Delaunay triangulation (Bowyer–Watson algorithm): connects a set of 2D
 * points into triangles so that no point lies inside any triangle's
 * circumcircle (the circle through its 3 corners). That rule avoids long,
 * thin "sliver" triangles, which is why it's the standard way to build a
 * low-poly mesh.
 *
 * How Bowyer–Watson works, in plain words:
 *   1. Start with one huge "super triangle" that contains every point.
 *   2. Add the points one at a time. For each new point, find every triangle
 *      whose circumcircle contains it ("bad" triangles), remove them, and
 *      fill the hole by connecting the new point to the hole's edges.
 *   3. At the end, delete every triangle that uses a super-triangle corner.
 *
 * Pure TypeScript, no DOM. Used to build the logo (see src/ui/faceLogo.ts).
 */

export type Pt = readonly [number, number];
export type Tri = [number, number, number];

interface Circle {
  x: number;
  y: number;
  r2: number;
}

function circumcircle(a: Pt, b: Pt, c: Pt): Circle {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return { x: 0, y: 0, r2: Infinity }; // points in a line
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { x, y, r2: (a[0] - x) ** 2 + (a[1] - y) ** 2 };
}

export function inCircumcircle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const cc = circumcircle(a, b, c);
  return (p[0] - cc.x) ** 2 + (p[1] - cc.y) ** 2 < cc.r2 - 1e-9;
}

/** Returns triangles as index triples into `points`. Duplicate points are ignored. */
export function delaunay(points: readonly Pt[]): Tri[] {
  if (points.length < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  // Super triangle, far bigger than the points.
  const all: Pt[] = [...points, [midX - 20 * span, midY - span], [midX, midY + 20 * span], [midX + 20 * span, midY - span]];
  const n = points.length;
  let tris: { t: Tri; c: Circle }[] = [{ t: [n, n + 1, n + 2], c: circumcircle(all[n], all[n + 1], all[n + 2]) }];

  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const p = all[i];
    const key = `${p[0]},${p[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bad: Tri[] = [];
    const keep: { t: Tri; c: Circle }[] = [];
    for (const tri of tris) {
      if ((p[0] - tri.c.x) ** 2 + (p[1] - tri.c.y) ** 2 < tri.c.r2) bad.push(tri.t);
      else keep.push(tri);
    }
    // The hole's boundary = edges that belong to exactly one bad triangle.
    const edgeCount = new Map<string, [number, number]>();
    const counts = new Map<string, number>();
    for (const [a, b, c] of bad) {
      for (const [u, v] of [[a, b], [b, c], [c, a]] as [number, number][]) {
        const k = u < v ? `${u},${v}` : `${v},${u}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
        edgeCount.set(k, [u, v]);
      }
    }
    tris = keep;
    for (const [k, [u, v]] of edgeCount) {
      if (counts.get(k) !== 1) continue;
      const t: Tri = [u, v, i];
      tris.push({ t, c: circumcircle(all[u], all[v], all[i]) });
    }
  }
  return tris.map((x) => x.t).filter((t) => t.every((idx) => idx < n));
}
