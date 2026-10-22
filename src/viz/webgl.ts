/**
 * Checks for WebGL BEFORE downloading Three.js, so a browser without 3D
 * graphics gets a clear message instead of a crash or a wasted download.
 */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
