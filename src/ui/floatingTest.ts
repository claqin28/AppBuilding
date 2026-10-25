/**
 * Experimental: a floating test window, using Chrome's Document
 * Picture-in-Picture (a small window that stays on top of other apps).
 *
 * It answers one question on a real computer (PLAN.md, step F): does face
 * tracking keep running while you use another app or minimize Chrome, as long
 * as a floating window is open? It only SHOWS numbers. It doesn't control
 * anything, and nothing is saved or sent.
 *
 * The readout updates on the floating window's own timer, so if the Tessera
 * tab gets slowed down, the window shows that instead of freezing.
 */
import { DEFAULT_ENGINE } from "../signal/engine";
import { trackingHealth, type HealthReason } from "../signal/trackingHealth";
import type { AppContext } from "./app";
import { h } from "./dom";

/** Chrome's Document Picture-in-Picture API (not in TypeScript's built-in types yet). */
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  readonly window: Window | null;
}

function api(): DocumentPictureInPicture | undefined {
  return (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;
}

export function floatingWindowSupported(): boolean {
  return api() !== undefined;
}

const VERDICT: Record<HealthReason, string> = {
  ok: "Yes: gestures can count.",
  "no-face": "No: no face in view.",
  "no-frames": "No: tracking has stopped.",
  "too-slow": "No: frames are too far apart.",
};

/** Ignore the first few seconds after frames start for "lowest so far": the camera is still warming up. */
const WARMUP_MS = 3000;
const UPDATE_MS = 500;

/** Opens the floating test window. Call it from a click: Chrome only allows that right after one. */
export async function openFloatingTest(ctx: AppContext): Promise<void> {
  const pip = api();
  if (!pip) return;
  if (pip.window) {
    pip.window.focus();
    return;
  }
  let w: Window;
  try {
    w = await pip.requestWindow({ width: 380, height: 320 }); // first, while the click still counts
  } catch (e) {
    ctx.notify(`Couldn't open the floating window: ${e instanceof Error ? e.message : String(e)}`, true);
    return;
  }
  // Same look as the app: copy its stylesheets and theme into the new window.
  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) w.document.head.append(node.cloneNode(true));
  if (document.documentElement.dataset.theme) w.document.documentElement.dataset.theme = document.documentElement.dataset.theme;
  w.document.title = "Tessera floating test";

  const fps = h("span", {}, "–");
  const verdict = h("p", { class: "float-verdict", "aria-live": "polite" });
  const gap = h("p", { class: "hint" });
  const summary = h("p", { class: "hint" });
  w.document.body.append(
    h(
      "main",
      { class: "float-test" },
      h("p", { class: "float-label" }, "Floating window test"),
      h("p", { class: "float-fps" }, fps, h("small", {}, " frames/s")),
      verdict,
      gap,
      summary,
      h("p", { class: "hint" }, "Now switch to another app or minimize Chrome, and watch these numbers. This window only shows numbers."),
    ),
  );

  // Record when each frame arrives.
  const times: number[] = [];
  let face = false;
  let firstFrame: number | null = null;
  const unsubscribe = ctx.subscribe((det) => {
    const now = performance.now();
    firstFrame ??= now;
    times.push(now);
    while (times.length > 0 && times[0] < now - 2000) times.shift();
    face = det.frame.face;
  });

  const opened = performance.now();
  const maxGap = DEFAULT_ENGINE.maxFaceGapMs;
  let lowest: number | null = null;
  let blockedMs = 0; // time when gestures couldn't count because tracking was too slow or stopped
  let last = opened;
  const update = () => {
    const now = performance.now();
    const health = trackingHealth(times, now, face, maxGap);
    if (firstFrame !== null && now - firstFrame > WARMUP_MS) {
      lowest = lowest === null ? health.fps : Math.min(lowest, health.fps);
      if (health.reason === "too-slow" || health.reason === "no-frames") blockedMs += now - last;
    }
    last = now;
    fps.textContent = String(health.fps);
    verdict.textContent = VERDICT[health.reason];
    verdict.dataset.ok = String(health.canCount);
    gap.textContent = Number.isFinite(health.longestGapMs)
      ? `Longest wait between frames: ${Math.round(health.longestGapMs)} ms (gestures need ${maxGap} ms or less).`
      : "No frames in the last 2 seconds.";
    summary.textContent = `Lowest so far: ${lowest ?? "–"} frames/s · too slow for gestures: ${Math.round(blockedMs / 1000)} s · open ${clock(now - opened)}`;
  };
  update();
  const timer = w.setInterval(update, UPDATE_MS);
  w.addEventListener("pagehide", () => {
    w.clearInterval(timer);
    unsubscribe();
  });

  if (!(await ctx.ensureCamera())) ctx.notify("The camera didn't start, so the floating window has nothing to measure.", true);
}

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
