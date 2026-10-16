/**
 * Text-to-speech with the Web Speech API, using ON-DEVICE voices only.
 *
 * Chrome lists some voices (named "Google …") that work by sending the text
 * to Google's servers. Those have `localService === false`. We never use
 * them, because messages can be private. If this device has no local voice,
 * we say so instead of quietly sending text away.
 *
 * We do NOT use speech recognition: in Chrome it sends audio to a server.
 */

export function speechSupported(): boolean {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function onDeviceVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  return speechSynthesis.getVoices().filter((v) => v.localService);
}

/** Voices load asynchronously in Chrome; wait for them (up to 2 s). */
export function voicesReady(): Promise<void> {
  if (!speechSupported() || speechSynthesis.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      speechSynthesis.removeEventListener("voiceschanged", done);
      resolve();
    };
    speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, 2000);
  });
}

export type SpeakResult = "ok" | "no-voice" | "unsupported" | "empty";

export function speak(text: string, rate: number, voiceURI: string): SpeakResult {
  if (!speechSupported()) return "unsupported";
  if (!text.trim()) return "empty";
  const voices = onDeviceVoices();
  if (voices.length === 0) return "no-voice";
  const voice =
    voices.find((v) => v.voiceURI === voiceURI) ??
    voices.find((v) => v.default) ??
    voices.find((v) => v.lang.startsWith(navigator.language.slice(0, 2))) ??
    voices[0];
  speechSynthesis.cancel(); // a new message replaces anything still being spoken
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice; // always set explicitly, so the browser can't fall back to a server voice
  u.lang = voice.lang;
  u.rate = rate;
  speechSynthesis.speak(u);
  return "ok";
}

export function speakErrorMessage(r: SpeakResult): string | null {
  switch (r) {
    case "no-voice":
      return "This browser has no on-device voice, so speech is off to keep your messages private. Try Chrome on Windows or macOS.";
    case "unsupported":
      return "This browser can't speak text aloud.";
    default:
      return null;
  }
}
