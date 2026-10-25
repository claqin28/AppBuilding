/**
 * Text-to-speech with the Web Speech API, using ON-DEVICE voices only.
 *
 * Chrome lists some voices (named "Google …") that work by sending the text
 * to Google's servers. Those have `localService === false`. We never use
 * them, because messages can be private. If this device has no local voice,
 * we say so instead of quietly sending text away.
 *
 * Chrome loads its voice list in the background: right after the page opens,
 * the list can be empty for a moment. So we ask for it as soon as the app
 * starts (warmUpVoices), and speak() waits briefly if it's still empty. An
 * empty list must never be mistaken for "this computer has no voices".
 *
 * We do NOT use speech recognition: in Chrome it sends audio to a server.
 */

export function speechSupported(): boolean {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

/** Starts Chrome loading its voice list, so it's ready by the first Speak. Call once at startup. */
export function warmUpVoices(): void {
  if (speechSupported()) speechSynthesis.getVoices();
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

/** The parts of a voice we look at (so the choice can be tested without a browser). */
export interface VoiceInfo {
  voiceURI: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

/**
 * Picks the voice to use, from ON-DEVICE voices only: the one chosen in
 * Settings, else the computer's default, else one in the browser's language,
 * else any. Returns null if there's no on-device voice at all.
 */
export function chooseVoice<V extends VoiceInfo>(voices: readonly V[], preferredURI: string, language: string): V | null {
  const local = voices.filter((v) => v.localService);
  return (
    local.find((v) => v.voiceURI === preferredURI) ??
    local.find((v) => v.default) ??
    local.find((v) => v.lang.startsWith(language.slice(0, 2))) ??
    local[0] ??
    null
  );
}

/**
 * ok          spoken
 * empty       nothing to say
 * unsupported the browser can't speak at all
 * no-voices   the browser gave us no voices, even after waiting
 * online-only there are voices, but every one would send the text to a server
 * blocked     the browser refused to speak (Chrome needs one click on the page first)
 */
export type SpeakResult = "ok" | "empty" | "unsupported" | "no-voices" | "online-only" | "blocked";

/**
 * Speaks `text` with an on-device voice. Waits up to 2 s if the voice list
 * hasn't loaded yet. `onProblem` hears about failures that only show up after
 * speaking starts (for example Chrome blocking speech).
 */
export async function speak(text: string, rate: number, voiceURI: string, onProblem?: (r: SpeakResult) => void): Promise<SpeakResult> {
  if (!speechSupported()) return "unsupported";
  if (!text.trim()) return "empty";
  if (speechSynthesis.getVoices().length === 0) await voicesReady();
  const all = speechSynthesis.getVoices();
  const voice = chooseVoice(all, voiceURI, navigator.language);
  if (!voice) return all.length === 0 ? "no-voices" : "online-only";
  speechSynthesis.cancel(); // a new message replaces anything still being spoken
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice; // always set explicitly, so the browser can't fall back to a server voice
  u.lang = voice.lang;
  u.rate = rate;
  u.addEventListener("error", (e) => {
    if (e.error === "not-allowed") onProblem?.("blocked");
  });
  speechSynthesis.speak(u);
  return "ok";
}

export function speakErrorMessage(r: SpeakResult): string | null {
  switch (r) {
    case "no-voices":
      return "Your browser hasn't given Tessera any voices yet. Wait a few seconds and try Speak again. If this keeps happening, reload the page.";
    case "online-only":
      return "The only voices available here are online voices, which would send your message to a server, so Tessera won't use them. Check that your computer has a text-to-speech voice installed, then reload the page.";
    case "blocked":
      return "Chrome blocked speech because the page hasn't been clicked yet. Click anywhere on the page once, then try Speak again.";
    case "unsupported":
      return "This browser can't speak text aloud.";
    default:
      return null;
  }
}
