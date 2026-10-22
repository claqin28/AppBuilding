/**
 * First-visit onboarding:
 *   Welcome (what Tessera does) → choose "Create a profile on this device" or
 *   "Try as a guest" → [profile: pick a nickname] → privacy in plain language →
 *   why the camera is needed → the app's camera check, then calibration.
 *
 * A "profile" is NOT an online account: it's a nickname saved only in this
 * browser. Guests save nothing at all.
 *
 * Caregiver-friendly: every step works with big buttons and no typing is
 * required (nickname suggestions, or leave it blank).
 */
import type { PersistenceResult } from "../storage/profileDb";
import { MAX_NICKNAME } from "../storage/schema";
import { h } from "./dom";
import { faceLogo } from "./faceLogo";

export interface OnboardingActions {
  /** Profiles already saved on this device ("Welcome back"). */
  listProfiles(): Promise<{ id: string; nickname: string }[]>;
  continueAs(id: string): Promise<void>;
  startGuest(): void;
  /** Creates a profile and makes it active. Throws with a plain-language message on failure. */
  createProfile(nickname: string): Promise<PersistenceResult>;
  ensureCamera(): Promise<boolean>;
  /** Leaves onboarding and opens the app's camera check. */
  finish(): void;
  /** Returns to the app without changing anything (used when saving a guest session). */
  cancel?(): void;
}

type Mode = "guest" | "profile";

export class Onboarding {
  private mode: Mode = "guest";
  private persistence: PersistenceResult = "unknown";

  constructor(
    private root: HTMLElement,
    private actions: OnboardingActions,
  ) {}

  async showWelcome(): Promise<void> {
    const profiles = await this.actions.listProfiles().catch(() => []);
    const start = h(
      "section",
      { class: "ob-section", id: "ob-start", "aria-labelledby": "ob-start-title", tabindex: "-1" },
      profiles.length
        ? h(
            "div",
            { class: "ob-returning", "aria-label": "Profiles on this device" },
            h("h3", {}, "Welcome back"),
            h(
              "div",
              { class: "button-row" },
              profiles.map((p) =>
                h("button", { class: "mid-button", onclick: () => void this.actions.continueAs(p.id) }, `Continue as ${p.nickname}`),
              ),
            ),
          )
        : "",
      h("h3", { id: "ob-start-title" }, "How do you want to start?"),
      h(
        "div",
        { class: "ob-choices" },
        choice(
          "Create a profile on this device",
          "Saves your setup and progress in this browser only. Just a nickname: no email, no password, no online account.",
          "Create a profile",
          true,
          () => this.showNickname(),
        ),
        choice(
          "Try as a guest",
          "Nothing is saved. Closing or reloading the page erases everything.",
          "Start as a guest",
          false,
          () => {
            this.mode = "guest";
            this.actions.startGuest();
            this.showPrivacy();
          },
        ),
      ),
      h("p", { class: "hint" }, "Setting this up for someone else? Every step works with a mouse, and no typing is needed."),
    );
    const getStarted = h("button", { class: "pill-button" }, "Get started");
    getStarted.addEventListener("click", () => {
      start.scrollIntoView({ block: "start" });
      start.focus();
    });
    this.root.replaceChildren(
      h(
        "div",
        { class: "ob-welcome" },
        h(
          "div",
          { class: "hero" },
          h(
            "section",
            { class: "hero-card hero-text" },
            h("h2", { class: "display" }, "Type and speak with small face movements."),
            h(
              "p",
              { class: "lead" },
              "Tessera finds the face movements that work best for you, then turns them into an on-screen keyboard you control with your face. For people who can't rely on their hands or their voice.",
            ),
            getStarted,
          ),
          h(
            "section",
            { class: "hero-card hero-visual", "aria-label": "Tessera logo" },
            h("span", { class: "chip" }, "Calibrated to you · runs on your device"),
            faceLogo({ size: 360, animate: true, label: "Tessera logo: a geometric face made of triangles" }),
          ),
        ),
        h(
          "ul",
          { class: "ob-features" },
          feature("Finds your best movements", "A short calibration tests movements like raising your eyebrows or closing one eye, and picks the ones that work reliably for you."),
          feature("Type and speak", "Build a message on a scanning keyboard and have it spoken aloud, or pick a quick phrase."),
          feature("Private by design", "Everything runs in this browser tab. Your camera video never leaves your device."),
        ),
        start,
        h(
          "p",
          { class: "hint" },
          "If someone's speech is reliable, voice control may work better. Tessera is for when it isn't.",
        ),
      ),
    );
    this.root.focus();
    window.scrollTo(0, 0);
  }

  /** Step: choose a nickname (optional; suggestions mean no typing is needed). */
  showNickname(opts: { fromGuest?: boolean } = {}): void {
    const input = h("input", {
      type: "text",
      id: "ob-nickname",
      maxlength: MAX_NICKNAME,
      autocomplete: "off",
      placeholder: "For example: Sam",
    });
    const error = h("p", { class: "ob-error", role: "alert" });
    const create = h("button", { class: "big-button" }, opts.fromGuest ? "Save to this profile" : "Create profile");
    create.addEventListener("click", async () => {
      create.disabled = true;
      error.textContent = "";
      try {
        this.persistence = await this.actions.createProfile(input.value);
        this.mode = "profile";
        if (opts.fromGuest) this.actions.cancel?.();
        else this.showPrivacy();
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : String(e);
        create.disabled = false;
      }
    });
    this.render(
      progress(opts.fromGuest ? "Save your session" : "Create a profile"),
      h("h2", {}, opts.fromGuest ? "Save this session to a profile" : "Name your profile"),
      h(
        "p",
        {},
        "The nickname is just so you can find this profile again. It's saved only in this browser on this device.",
      ),
      h("label", { class: "ob-label", for: "ob-nickname" }, "Nickname (optional)"),
      input,
      h(
        "div",
        { class: "button-row" },
        h("span", { class: "hint" }, "Or pick one:"),
        ["Me", "Tester 1", "Tester 2"].map((name) =>
          h("button", { class: "mid-button", onclick: () => ((input.value = name), input.focus()) }, name),
        ),
      ),
      h("p", { class: "hint" }, "Leave it blank to use “Profile 1”. Anyone who uses this browser can open this profile."),
      error,
      h(
        "div",
        { class: "button-row" },
        create,
        h(
          "button",
          { class: "mid-button", onclick: () => (opts.fromGuest ? this.actions.cancel?.() : void this.showWelcome()) },
          "Back",
        ),
      ),
    );
    input.focus();
  }

  /** Step 1 of 2: privacy in plain language. */
  showPrivacy(): void {
    const isGuest = this.mode === "guest";
    this.render(
      progress("Step 1 of 2"),
      h("h2", {}, "Your privacy"),
      h(
        "ul",
        { class: "ob-list" },
        h("li", {}, h("strong", {}, "Your camera video stays in this browser tab. "), "It's never recorded, saved, or sent anywhere."),
        h(
          "li",
          {},
          h("strong", {}, "No account, no server. "),
          isGuest
            ? "As a guest, nothing is saved: closing or reloading the page erases this session."
            : "Your profile is saved only in this browser on this device.",
        ),
        h("li", {}, h("strong", {}, "No microphone. "), "Tessera never listens to your voice."),
        h("li", {}, h("strong", {}, "You decide what to share. "), "Nothing is ever sent automatically. Downloads happen only when you click them."),
      ),
      !isGuest && this.persistence !== "persisted"
        ? h(
            "p",
            { class: "ob-warning", role: "note" },
            h("strong", {}, "Heads up: "),
            "this browser may erase your profile, for example in a private window or when browsing data is cleared.",
          )
        : "",
      h("div", { class: "button-row" }, h("button", { class: "big-button", onclick: () => this.showCamera() }, "Continue")),
    );
  }

  /** Step 2 of 2: why the camera is needed, then turn it on. */
  showCamera(): void {
    const status = h("p", { class: "ob-error", role: "alert" });
    const go = h("button", { class: "big-button" }, "Turn on the camera");
    go.addEventListener("click", async () => {
      go.disabled = true;
      go.textContent = "Starting the camera…";
      if (await this.actions.ensureCamera()) {
        this.actions.finish();
      } else {
        status.textContent = "The camera didn't start. Check the message in the camera panel, then try again, or skip for now.";
        go.disabled = false;
        go.textContent = "Try again";
      }
    });
    this.render(
      progress("Step 2 of 2"),
      h("h2", {}, "Why Tessera needs your camera"),
      h(
        "p",
        {},
        "Tessera watches tiny movements of your face, like raising your eyebrows or closing one eye, and turns them into clicks. ",
        "When Chrome asks for permission, choose ",
        h("strong", {}, "Allow"),
        ".",
      ),
      h(
        "ul",
        { class: "ob-list" },
        h("li", {}, "Sit facing a light, with your whole face in view."),
        h("li", {}, "Next you'll do a quick camera check, then a few minutes of calibration."),
      ),
      status,
      h(
        "div",
        { class: "button-row" },
        go,
        h("button", { class: "mid-button", onclick: () => this.actions.finish() }, "Skip for now"),
      ),
    );
  }

  private render(...children: (Node | string)[]): void {
    this.root.replaceChildren(h("div", { class: "ob-card" }, ...children));
    this.root.focus();
    window.scrollTo(0, 0);
  }
}

function feature(title: string, text: string): HTMLElement {
  return h("li", { class: "ob-feature" }, h("strong", {}, title), h("span", {}, text));
}

function choice(title: string, text: string, button: string, primary: boolean, onClick: () => void): HTMLElement {
  return h(
    "div",
    { class: `ob-choice${primary ? " primary" : ""}` },
    h("h4", {}, title),
    h("p", {}, text),
    h("button", { class: primary ? "big-button" : "big-button secondary", onclick: onClick }, button),
  );
}

function progress(text: string): HTMLElement {
  return h("p", { class: "ob-progress" }, text);
}
