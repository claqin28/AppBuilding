/**
 * M1: camera + live blendshape debug view + setup checks.
 * Wires the camera, the face model, and the UI together. All the actual
 * logic lives in src/signal (pure functions) and src/vision (MediaPipe).
 */
import "./styles.css";
import { startCamera } from "./vision/camera";
import { loadLandmarker, toDetection, type LoadedLandmarker } from "./vision/landmarker";
import { checkLighting, checkPosition, faceBoxFromLandmarks, lumaStats } from "./signal/quality";
import { DebugView } from "./ui/debugView";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const video = $<HTMLVideoElement>("video");
const startBtn = $<HTMLButtonElement>("start");
const statusEl = $("status");
const faceEl = $("face-indicator");
const positionEl = $("position-check");
const lightingEl = $("lighting-check");
const perfEl = $("perf");
const showAll = $<HTMLInputElement>("show-all");
const debug = new DebugView($("bars"));

/** MediaPipe's landmark index for the tip of the nose. */
const NOSE_TIP = 1;
/** Redraw the bars at most this often; the model can run faster than people can read. */
const UI_INTERVAL_MS = 66;
const LIGHT_INTERVAL_MS = 500;

// Small canvas used only to measure brightness. It never leaves this page.
const lightCanvas = document.createElement("canvas");
lightCanvas.width = 64;
lightCanvas.height = 48;
const lightCtx = lightCanvas.getContext("2d", { willReadFrequently: true })!;

showAll.addEventListener("change", () => debug.setShowAll(showAll.checked));
startBtn.addEventListener("click", start);

async function start(): Promise<void> {
  startBtn.disabled = true;
  try {
    setStatus("Loading the face model…");
    const loaded = await loadLandmarker();
    setStatus("Starting the camera…");
    await startCamera(video);
    setStatus(`Running. Face model is using the ${loaded.delegate}.`);
    startBtn.hidden = true;
    runLoop(loaded);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
    startBtn.disabled = false;
  }
}

function runLoop({ landmarker }: LoadedLandmarker): void {
  let lastVideoTime = -1;
  let lastUi = 0;
  let lastLight = 0;
  let frames = 0;
  let inferMs = 0;
  let windowStart = performance.now();

  const tick = (): void => {
    const now = performance.now();
    // Only run the model when the camera has produced a new frame.
    if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
      lastVideoTime = video.currentTime;
      const t0 = performance.now();
      const det = toDetection(landmarker.detectForVideo(video, now), now);
      inferMs += performance.now() - t0;
      frames++;

      if (now - lastUi >= UI_INTERVAL_MS) {
        lastUi = now;
        setCheck(faceEl, det.frame.face, det.frame.face ? "Face detected" : "No face detected");
        if (det.landmarks) {
          const box = faceBoxFromLandmarks(det.landmarks);
          const pos = checkPosition(box, det.landmarks[NOSE_TIP].x);
          setCheck(positionEl, pos.ok, pos.message);
          debug.update(det.frame.scores);
        } else {
          setCheck(positionEl, false, "Position: waiting for a face");
        }
      }
    }
    if (now - lastLight >= LIGHT_INTERVAL_MS && video.readyState >= 2) {
      lastLight = now;
      lightCtx.drawImage(video, 0, 0, lightCanvas.width, lightCanvas.height);
      const res = checkLighting(lumaStats(lightCtx.getImageData(0, 0, lightCanvas.width, lightCanvas.height).data));
      setCheck(lightingEl, res.ok, res.message);
    }
    if (now - windowStart >= 1000) {
      const fps = (frames * 1000) / (now - windowStart);
      perfEl.textContent = `${fps.toFixed(0)} frames/s · model ${frames ? (inferMs / frames).toFixed(1) : "–"} ms/frame`;
      frames = 0;
      inferMs = 0;
      windowStart = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function setStatus(msg: string, isError = false): void {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function setCheck(el: HTMLElement, ok: boolean, msg: string): void {
  el.textContent = `${ok ? "✓" : "!"} ${msg}`;
  el.classList.toggle("ok", ok);
  el.classList.toggle("bad", !ok);
}
