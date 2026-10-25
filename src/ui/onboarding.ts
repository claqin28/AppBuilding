/**
 * First-visit onboarding:
 *   Welcome (what Tessera does) → choose "Create a profile on this device" or
 *   "Try as a guest" → [profile: pick a nickname] → privacy in plain language →
 *   why the camera is needed → the app's camera check, then calibration.
 *
 * The app always opens here, even for returning profiles: then the main
 * button is "Continue as <nickname>" (the profile used last time).
 *
 * A "profile" is NOT an online account: it's a nickname saved only in this
 * browser. Guests save nothing at all.
 *
 * Caregiver-friendly: every step works with big buttons and no typing is
 * required (nickname suggestions, or leave it blank).
 */
import type { PersistenceResult } from "../storage/profileDb";
import { MAX_NICKNAME } from "../storage/schema";
import type { DetectionListener } from "../vision/tracker";
import { h } from "./dom";
import { faceLogo, replayLogo } from "./faceLogo";
import { LandingFace } from "./landingFace";
import { REVEALED, revealOnScroll, splitWords } from "./reveal";

export interface OnboardingActions {
  /** Profiles already saved on this device ("Welcome back"). */
  listProfiles(): Promise<{ id: string; nickname: string }[]>;
  continueAs(id: string): Promise<void>;
  startGuest(): void;
  /** Creates a profile and makes it active. Throws with a plain-language message on failure. */
  createProfile(nickname: string): Promise<PersistenceResult>;
  ensureCamera(): Promise<boolean>;
  /** Camera detections (for the welcome page's live 3D face). */
  subscribe(fn: DetectionListener): () => void;
  /** Leaves onboarding and opens the app's camera check. */
  finish(): void;
  /** Returns to the app without changing anything (used when saving a guest session). */
  cancel?(): void;
}

type Mode = "guest" | "profile";

export class Onboarding {
  private mode: Mode = "guest";
  private persistence: PersistenceResult = "unknown";
  /** The profile used last time, offered first on the welcome page. */
  private lastId: string | null = null;
  /** Things to stop when the welcome page goes away (3D view, scroll watcher). */
  private teardown: (() => void)[] = [];

  constructor(
    private root: HTMLElement,
    private actions: OnboardingActions,
  ) {}

  async showWelcome(opts: { lastId?: string | null } = {}): Promise<void> {
    if (opts.lastId !== undefined) this.lastId = opts.lastId;
    const profiles = await this.actions.listProfiles().catch(() => []);
    const last = profiles.find((p) => p.id === this.lastId);
    this.stop();

    const demo = new LandingFace({ ensureCamera: () => this.actions.ensureCamera(), subscribe: (fn) => this.actions.subscribe(fn) });
    const demoSection = h(
      "section",
      { class: "landing-section", id: "ob-demo", "aria-labelledby": "ob-demo-title" },
      sectionHead("ob-demo-title", "See what Tessera sees", "Your face, as 468 points. Try it: the mesh follows you."),
      h("div", { class: "reveal" }, demo.el),
    );

    const logo = faceLogo({ size: 132 });
    const logoWrap = h("div", { class: "start-logo reveal" }, logo);
    logoWrap.addEventListener(REVEALED, () => replayLogo(logo));
    const start = h(
      "section",
      { class: "landing-section start-section", id: "ob-start", "aria-labelledby": "ob-start-title", tabindex: "-1" },
      logoWrap,
      h(
        "div",
        { class: "section-head reveal" },
        h("h2", { class: "section-title", id: "ob-start-title" }, "How do you want to start?"),
        h("p", { class: "section-sub" }, "Setting this up for someone else? Every step works with a mouse, and no typing is needed."),
      ),
      profiles.length
        ? h(
            "div",
            { class: "ob-returning reveal", "aria-label": "Profiles on this device" },
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
      h(
        "div",
        { class: "ob-choices" },
        choice(
          0,
          "Create a profile on this device",
          "Saves your setup and progress in this browser only. Just a nickname: no email, no password, no online account.",
          "Create a profile",
          true,
          () => this.showNickname(),
        ),
        choice(
          1,
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
    );

    const scrollTo = (target: HTMLElement) => () => {
      target.scrollIntoView({ block: "start" });
      target.focus({ preventScroll: true });
    };
    // Returning: continue in one click, or see every option. New: get started, or see the demo.
    const heroActions = last
      ? h(
          "div",
          { class: "hero-actions" },
          h("button", { class: "pill-button", onclick: () => void this.actions.continueAs(last.id) }, `Continue as ${last.nickname}`),
          h("button", { class: "pill-button secondary", onclick: scrollTo(start) }, "Other options"),
        )
      : h(
          "div",
          { class: "hero-actions" },
          h("button", { class: "pill-button", onclick: scrollTo(start) }, "Get started"),
          h("button", { class: "pill-button secondary", onclick: scrollTo(demoSection) }, "See it follow your face"),
        );

    const page = h(
      "div",
      { class: "ob-welcome" },
      h(
        "section",
        { class: "landing-hero" },
        h("p", { class: "eyebrow" }, "Calibrated to you · runs on your device"),
        h("h2", { class: "display" }, ...splitWords("Type and speak with small face movements.")),
        h(
          "p",
          { class: "lead" },
          "Tessera finds the face movements that work best for you, then turns them into an on-screen keyboard you control with your face. For people who can't rely on their hands or their voice.",
        ),
        heroActions,
      ),
      demoSection,
      h(
        "section",
        { class: "landing-section", "aria-labelledby": "ob-how-title" },
        sectionHead("ob-how-title", "How it works", "Set up once, then type with your face."),
        h(
          "div",
          { class: "card-grid three" },
          featureCard(
            0,
            "blue",
            "Step 1",
            ["Tessera ", pill("finds"), " your movements"],
            "A short calibration asks for each movement five times, then keeps the ones that work reliably for you.",
            miniResults(),
          ),
          featureCard(
            1,
            "",
            "Step 2",
            ["Type with a ", pill("scanning"), " keyboard"],
            "A highlight moves across the keys. One movement selects; another can move the highlight.",
            miniKeyboard(),
          ),
          featureCard(
            2,
            "",
            "Step 3",
            ["Your words, ", pill("spoken")],
            "Speak what you typed, or pick a saved phrase. Tessera uses voices built into your computer.",
            miniMessage(),
          ),
        ),
      ),
      h(
        "section",
        { class: "landing-section", "aria-labelledby": "ob-privacy-title" },
        sectionHead("ob-privacy-title", "Private by design", "Everything runs in this browser tab."),
        // The privacy message from the top bar (hidden on this page) lives here as the lead card.
        h(
          "article",
          { class: "privacy-lead reveal" },
          h("span", { class: "privacy-lead-icon", "aria-hidden": "true" }, lockIcon()),
          h(
            "div",
            {},
            h("h3", {}, "Your camera video never leaves this browser tab."),
            h("p", {}, "Tessera processes it only inside this tab. No video or images are recorded, stored, or sent anywhere."),
          ),
        ),
        h(
          "div",
          { class: "card-grid three" },
          infoCard(0, "No microphone", "Tessera never listens to your voice."),
          infoCard(1, "No account, no server", "A profile is just a nickname saved in this browser. Guests save nothing at all."),
          infoCard(2, "You choose what to share", "Nothing is sent automatically. Downloads happen only when you click them."),
        ),
      ),
      start,
      h(
        "p",
        { class: "hint landing-note" },
        "If someone's speech is reliable, voice control may work better. Tessera is for when it isn't.",
      ),
    );

    this.root.replaceChildren(page);
    // The top privacy bar is hidden on this page; its message is the "Private by design" lead card.
    document.body.classList.add("on-welcome");
    this.teardown.push(() => demo.dispose(), revealOnScroll(page));
    this.root.focus();
    window.scrollTo(0, 0);
  }

  /** Called when onboarding closes: stops the welcome page's 3D view and animations. */
  leave(): void {
    this.stop();
  }

  private stop(): void {
    document.body.classList.remove("on-welcome");
    for (const fn of this.teardown.splice(0)) fn();
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
    this.stop();
    this.root.replaceChildren(h("div", { class: "ob-card" }, ...children));
    this.root.focus();
    window.scrollTo(0, 0);
  }
}

function sectionHead(id: string, title: string, sub: string): HTMLElement {
  return h("div", { class: "section-head reveal" }, h("h2", { class: "section-title", id }, title), h("p", { class: "section-sub" }, sub));
}

/** A highlighted word inside a card title. */
function pill(text: string): HTMLElement {
  return h("span", { class: "title-pill" }, text);
}

function featureCard(i: number, variant: string, step: string, title: (string | HTMLElement)[], text: string, visual: HTMLElement): HTMLElement {
  return h(
    "article",
    { class: `feature-card reveal ${variant}`.trim(), style: `--i:${i}` },
    h("p", { class: "card-step" }, step),
    h("h3", {}, ...title),
    h("p", {}, text),
    visual,
  );
}

/** The same lock icon as the privacy bar in the header area. */
function lockIcon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z");
  svg.append(path);
  return svg;
}

function infoCard(i: number, title: string, text: string): HTMLElement {
  return h("article", { class: "info-card reveal", style: `--i:${i}` }, h("h3", {}, title), h("p", {}, text));
}

// Small, decorative pictures of the real screens (hidden from screen readers;
// the card text says the same thing).
function miniResults(): HTMLElement {
  const row = (name: string, verdict: string, good: boolean) =>
    h("li", { class: good ? "good" : "" }, h("span", {}, name), h("strong", {}, `${good ? "✓ " : ""}${verdict}`));
  return h(
    "ul",
    { class: "mini mini-results", "aria-hidden": "true" },
    row("Raise eyebrows", "Works well", true),
    row("Smile", "Works well", true),
    row("Frown", "Not used", false),
  );
}

function miniKeyboard(): HTMLElement {
  const row = (keys: string, lit: boolean) =>
    h("div", { class: `mini-row${lit ? " lit" : ""}` }, [...keys].map((k) => h("span", {}, k)));
  return h("div", { class: "mini mini-keyboard", "aria-hidden": "true" }, row("ETAOIN", false), row("SHRDLU", true), row("CMWFGY", false));
}

function miniMessage(): HTMLElement {
  return h(
    "div",
    { class: "mini mini-message", "aria-hidden": "true" },
    h("p", {}, "I need some water"),
    h("span", { class: "mini-speak" }, "Speak"),
  );
}

function choice(i: number, title: string, text: string, button: string, primary: boolean, onClick: () => void): HTMLElement {
  return h(
    "div",
    { class: `ob-choice reveal${primary ? " primary" : ""}`, style: `--i:${i}` },
    h("h3", {}, title),
    h("p", {}, text),
    h("button", { class: primary ? "big-button" : "big-button secondary", onclick: onClick }, button),
  );
}

function progress(text: string): HTMLElement {
  return h("p", { class: "ob-progress" }, text);
}
