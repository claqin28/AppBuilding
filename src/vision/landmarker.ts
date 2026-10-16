/**
 * Loads MediaPipe Face Landmarker and turns its results into BlendshapeFrames.
 *
 * Setup follows the official MediaPipe Face Landmarker guide for web:
 * https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js
 * (MediaPipe is Apache-2.0, (c) Google). The API names were checked against
 * the type definitions shipped in @mediapipe/tasks-vision 1.1.1.
 *
 * Both the WebAssembly runtime (public/wasm) and the model file
 * (public/models/face_landmarker.task) are served from this app's own origin,
 * so nothing is fetched from a CDN.
 */
import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import type { BlendshapeFrame, Point2 } from "../signal/types";

const BASE = import.meta.env.BASE_URL;

export interface LoadedLandmarker {
  landmarker: FaceLandmarker;
  /** Which backend actually loaded. GPU is faster; CPU is the fallback. */
  delegate: "GPU" | "CPU";
}

export async function loadLandmarker(): Promise<LoadedLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}wasm`);
  let lastError: unknown;
  // Try the GPU first; some machines/browsers can't use it, so fall back to CPU.
  for (const delegate of ["GPU", "CPU"] as const) {
    try {
      const landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${BASE}models/face_landmarker.task`, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      });
      return { landmarker, delegate };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** What we keep from one MediaPipe result: the blendshape frame plus the landmarks for setup checks. */
export interface Detection {
  frame: BlendshapeFrame;
  landmarks: Point2[] | null;
}

export function toDetection(result: FaceLandmarkerResult, t: number): Detection {
  const shapes = result.faceBlendshapes[0];
  const landmarks = result.faceLandmarks[0] ?? null;
  if (!shapes || !landmarks) return { frame: { t, face: false, scores: {} }, landmarks: null };
  const scores: Record<string, number> = {};
  for (const c of shapes.categories) {
    // "_neutral" is a model-internal category, not a facial movement.
    if (c.categoryName !== "_neutral") scores[c.categoryName] = c.score;
  }
  return { frame: { t, face: true, scores }, landmarks };
}
