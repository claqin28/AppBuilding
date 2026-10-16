/** Settings: timing, voice, saved data, and test tools (replay a recording). */
import { analyzeCalibration } from "../signal/calibration";
import { parseTrace, traceFrames } from "../signal/trace";
import type { AppContext, Screen } from "./app";
import { h, pickTextFile } from "./dom";
import { onDeviceVoices, speak, speakErrorMessage, voicesReady } from "./speech";
import { clearAll, DEFAULT_SETTINGS, LIMITS, type Settings } from "./storage";

export class SettingsScreen implements Screen {
  constructor(private ctx: AppContext) {}

  mount(root: HTMLElement): void {
    const s = this.ctx.settings;
    const update = (patch: Partial<Settings>) => this.ctx.setSettings({ ...this.ctx.settings, ...patch });

    const slider = (
      label: string,
      key: "holdMs" | "refractoryMs" | "scanMs" | "speechRate",
      step: number,
      fmt: (v: number) => string,
      help: string,
    ) => {
      const input = h("input", { type: "range", min: LIMITS[key].min, max: LIMITS[key].max, step, value: s[key] });
      const out = h("output", {}, fmt(s[key]));
      input.addEventListener("input", () => {
        out.textContent = fmt(Number(input.value));
        update({ [key]: Number(input.value) });
      });
      return h("div", { class: "setting" }, h("label", {}, h("strong", {}, label), " ", input, " ", out), h("p", { class: "hint" }, help));
    };
    const ms = (v: number) => `${(v / 1000).toFixed(2)} s`;

    const voiceSel = h("select", { "aria-label": "Voice" });
    const voiceNote = h("p", { class: "hint" });
    void voicesReady().then(() => {
      const voices = onDeviceVoices();
      voiceSel.append(h("option", { value: "" }, "Default on-device voice"));
      for (const v of voices) voiceSel.append(h("option", { value: v.voiceURI, selected: v.voiceURI === s.voiceURI }, `${v.name} (${v.lang})`));
      voiceNote.textContent = voices.length
        ? `${voices.length} on-device voices available. Online voices are hidden so your messages stay private.`
        : "No on-device voice found in this browser, so speech is off.";
    });
    voiceSel.addEventListener("change", () => update({ voiceURI: voiceSel.value }));

    const clearAfter = h("input", { type: "checkbox", checked: s.clearAfterSpeak });
    clearAfter.addEventListener("change", () => update({ clearAfterSpeak: clearAfter.checked }));

    root.append(
      h("h2", {}, "Settings"),
      h("h3", {}, "Timing"),
      slider("Hold time", "holdMs", 50, ms, "How long a gesture must be held before it counts. Longer = fewer accidents, but slower."),
      slider("Rest between gestures", "refractoryMs", 50, ms, "After a gesture, how long before another one can count."),
      slider("Scan speed", "scanMs", 100, ms, "How long the highlight stays on each item in auto-scan."),
      h("p", { class: "hint" }, "Hold time and rest also apply during calibration's “Try it”. If you change hold time a lot, calibrate again."),
      h("h3", {}, "Voice"),
      h("div", { class: "setting" }, h("label", {}, h("strong", {}, "Voice "), voiceSel), voiceNote),
      slider("Speaking speed", "speechRate", 0.1, (v) => `${v.toFixed(1)}×`, ""),
      h("label", { class: "toggle" }, clearAfter, " Clear the message after speaking it"),
      h(
        "div",
        { class: "button-row" },
        h(
          "button",
          {
            class: "mid-button",
            onclick: () => {
              const err = speakErrorMessage(speak("Hello. This is my voice.", this.ctx.settings.speechRate, this.ctx.settings.voiceURI));
              if (err) this.ctx.notify(err, true);
            },
          },
          "Test voice",
        ),
      ),
      h("h3", {}, "Saved data"),
      h(
        "p",
        { class: "hint" },
        "Your gesture setup and settings are stored only in this browser on this device. No video or images are ever stored.",
      ),
      h(
        "div",
        { class: "button-row" },
        h(
          "button",
          {
            class: "mid-button danger",
            onclick: () => {
              if (!confirm("Delete your saved gestures and settings from this browser?")) return;
              clearAll();
              this.ctx.setSettings({ ...DEFAULT_SETTINGS });
              location.reload();
            },
          },
          "Delete all saved data",
        ),
      ),
      h("h3", {}, "Testing tools"),
      h("p", { class: "hint" }, "Recordings contain only numbers (facial movement scores over time), never images."),
      h(
        "div",
        { class: "button-row" },
        h("button", { class: "mid-button", onclick: () => this.loadReplay() }, "Replay a recording instead of the camera"),
        h("button", { class: "mid-button", onclick: () => this.analyzeFile() }, "Analyze a saved calibration recording"),
      ),
    );
  }

  unmount(): void {}

  private async readTrace() {
    const text = await pickTextFile();
    if (!text) return null;
    try {
      return parseTrace(JSON.parse(text));
    } catch (e) {
      this.ctx.notify(`Couldn't read that file: ${e instanceof Error ? e.message : String(e)}`, true);
      return null;
    }
  }

  private async loadReplay(): Promise<void> {
    const trace = await this.readTrace();
    if (trace) this.ctx.useReplay(trace);
  }

  private async analyzeFile(): Promise<void> {
    const trace = await this.readTrace();
    if (!trace) return;
    try {
      const result = analyzeCalibration(traceFrames(trace), trace.markers);
      const durationMs = Number(trace.meta.durationMs) || 0;
      this.ctx.lastCalibration = { result, trace, durationMs };
      this.ctx.go("results");
    } catch (e) {
      this.ctx.notify(`Couldn't analyze that recording: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  }
}
