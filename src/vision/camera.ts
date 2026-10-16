/** Starts the webcam and explains failures in plain language. */

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error("The camera only works on a secure (https://) page or on localhost.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser can't access a camera. Please use a recent version of Chrome.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (err) {
    throw new Error(cameraErrorMessage(err));
  }
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
      return "Camera permission was blocked. Click the camera icon in the address bar, allow the camera, then try again.";
    case "NotFoundError":
      return "No camera was found. Connect a webcam and try again.";
    case "NotReadableError":
      return "The camera is busy. Close other apps or tabs that use the camera (Zoom, Meet, etc.) and try again.";
    case "OverconstrainedError":
      return "The camera doesn't support the requested settings.";
    default:
      return `The camera could not start (${err instanceof Error ? err.message : String(err)}).`;
  }
}
