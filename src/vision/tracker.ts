/**
 * Frame sources: something that produces a stream of face detections.
 *
 * - CameraTracker: live webcam + MediaPipe (the normal case).
 * - ReplayTracker: plays back a recorded trace, with no camera at all. Used
 *   for testing the app, for demos, and for evaluation.
 *
 * Screens subscribe to whichever source is active and don't care which it is.
 */
import { checkLighting, lumaStats, type CheckResult } from "../signal/quality";
import { traceFrames, type Trace } from "../signal/trace";
import { startCamera, stopCamera } from "./camera";
import { loadLandmarker, toDetection, type Detection } from "./landmarker";

export type DetectionListener = (det: Detection) => void;

export interface FrameSource {
  readonly kind: "camera" | "replay";
  subscribe(fn: DetectionListener): () => void;
  stop(): void;
  /** Latest lighting check (camera only). */
  readonly lighting: CheckResult | null;
  /** Frames per second over the last second. */
  readonly fps: number;
  /** Average model time per frame over the last second (camera only). */
  readonly inferMs: number;
}

abstract class BaseSource {
  protected listeners = new Set<DetectionListener>();
  lighting: CheckResult | null = null;
  fps = 0;
  inferMs = 0;

  subscribe(fn: DetectionListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  protected emit(det: Detection): void {
    for (const fn of this.listeners) fn(det);
  }
}

const LIGHT_INTERVAL_MS = 500;

export class CameraTracker extends BaseSource implements FrameSource {
  readonly kind = "camera";
  delegate: "GPU" | "CPU" = "CPU";
  private stream: MediaStream | null = null;
  private stopped = false;
  private lightCanvas = document.createElement("canvas");

  constructor(private video: HTMLVideoElement) {
    super();
    // Tiny canvas used only to measure brightness. Pixels never leave this page.
    this.lightCanvas.width = 64;
    this.lightCanvas.height = 48;
  }

  async start(onStatus: (msg: string) => void): Promise<void> {
    onStatus("Loading the face model…");
    const loaded = await loadLandmarker();
    this.delegate = loaded.delegate;
    onStatus("Starting the camera…");
    this.stream = await startCamera(this.video);
    const landmarker = loaded.landmarker;
    const lightCtx = this.lightCanvas.getContext("2d", { willReadFrequently: true })!;

    let lastVideoTime = -1;
    let lastLight = 0;
    let frames = 0;
    let inferTotal = 0;
    let windowStart = performance.now();

    const tick = (): void => {
      if (this.stopped) return;
      const now = performance.now();
      // Only run the model when the camera has produced a new frame.
      if (this.video.currentTime !== lastVideoTime && this.video.readyState >= 2) {
        lastVideoTime = this.video.currentTime;
        const t0 = performance.now();
        const det = toDetection(
          landmarker.detectForVideo(this.video, now),
          now,
          this.video.videoWidth,
          this.video.videoHeight,
        );
        inferTotal += performance.now() - t0;
        frames++;
        this.emit(det);
      }
      if (now - lastLight >= LIGHT_INTERVAL_MS && this.video.readyState >= 2) {
        lastLight = now;
        lightCtx.drawImage(this.video, 0, 0, 64, 48);
        this.lighting = checkLighting(lumaStats(lightCtx.getImageData(0, 0, 64, 48).data));
      }
      if (now - windowStart >= 1000) {
        this.fps = (frames * 1000) / (now - windowStart);
        this.inferMs = frames ? inferTotal / frames : 0;
        frames = 0;
        inferTotal = 0;
        windowStart = now;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop(): void {
    this.stopped = true;
    if (this.stream) stopCamera(this.stream);
  }
}

/**
 * Plays a trace in real time. Frame times are shifted to "now" so that
 * timing-based logic (hold time, scanning) behaves as if it were live.
 */
export class ReplayTracker extends BaseSource implements FrameSource {
  readonly kind = "replay";
  private timer: number | null = null;

  constructor(
    private trace: Trace,
    private loop = true,
  ) {
    super();
  }

  start(): void {
    const frames = traceFrames(this.trace);
    if (frames.length === 0) return;
    const t0 = frames[0].t;
    let offset = performance.now() - t0;
    let i = 0;
    let count = 0;
    let windowStart = performance.now();
    const step = (): void => {
      const now = performance.now();
      while (i < frames.length && frames[i].t + offset <= now) {
        const f = frames[i++];
        this.emit({ frame: { ...f, t: f.t + offset }, landmarks: null, imageWidth: 0, imageHeight: 0 });
        count++;
      }
      if (now - windowStart >= 1000) {
        this.fps = (count * 1000) / (now - windowStart);
        count = 0;
        windowStart = now;
      }
      if (i >= frames.length) {
        if (!this.loop) return;
        i = 0;
        offset = now - t0 + 33;
      }
      this.timer = window.setTimeout(step, 10);
    };
    step();
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
