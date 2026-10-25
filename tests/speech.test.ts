import { describe, expect, it } from "vitest";
import { chooseVoice, speakErrorMessage, type VoiceInfo } from "../src/ui/speech";

const v = (voiceURI: string, localService: boolean, lang = "en-US", isDefault = false): VoiceInfo => ({ voiceURI, localService, lang, default: isDefault });

// Like Chrome on a Mac: the computer's own voices plus Google's online ones.
const mac = [v("Google US English", false, "en-US", true), v("Samantha", true), v("Daniel", true, "en-GB"), v("Amélie", true, "fr-CA")];

describe("chooseVoice (on-device voices only)", () => {
  it("never picks an online voice, even if it's the browser's default", () => {
    expect(chooseVoice(mac, "", "en-US")?.voiceURI).toBe("Samantha");
    expect(chooseVoice(mac, "Google US English", "en-US")?.voiceURI).toBe("Samantha");
  });

  it("uses the voice chosen in Settings when it's on the device", () => {
    expect(chooseVoice(mac, "Daniel", "en-US")?.voiceURI).toBe("Daniel");
  });

  it("prefers the computer's default on-device voice, then the browser's language", () => {
    expect(chooseVoice([v("Amélie", true, "fr-CA"), v("Daniel", true, "en-GB", true)], "", "fr-FR")?.voiceURI).toBe("Daniel");
    expect(chooseVoice([v("Amélie", true, "fr-CA"), v("Daniel", true, "en-GB")], "", "en-US")?.voiceURI).toBe("Daniel");
  });

  it("returns nothing when there's no on-device voice", () => {
    expect(chooseVoice([v("Google US English", false)], "", "en-US")).toBeNull();
    expect(chooseVoice([], "", "en-US")).toBeNull();
  });
});

describe("speech messages", () => {
  it("tells apart 'no voices yet', 'only online voices', and 'blocked'", () => {
    expect(speakErrorMessage("no-voices")).toMatch(/hasn't given Tessera any voices yet/);
    expect(speakErrorMessage("online-only")).toMatch(/online voices/);
    expect(speakErrorMessage("blocked")).toMatch(/Click anywhere/);
    expect(speakErrorMessage("ok")).toBeNull();
  });

  it("no longer tells Mac users to try a Mac", () => {
    for (const r of ["no-voices", "online-only", "blocked", "unsupported"] as const) expect(speakErrorMessage(r)).not.toMatch(/macOS/);
  });
});
