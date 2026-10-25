/**
 * Gentle entrance animations for the welcome page:
 *  - splitWords: the headline appears word by word (fades in, rises, un-blurs).
 *  - revealOnScroll: sections and cards fade up the first time they scroll
 *    into view.
 *
 * Rules (from the safety and accessibility constraints):
 *  - Each element animates once. Nothing repeats, flashes, or loops.
 *  - With "reduce motion" on, or without IntersectionObserver, everything is
 *    simply shown.
 *  - Content is only hidden once this script is running (the "reveal-ready"
 *    class), so if anything goes wrong the page is still readable.
 *  - Anything that gets keyboard focus is revealed at once, so focus never
 *    lands on something invisible.
 */
import { h } from "./dom";

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** The text as one span per word (for the word-by-word headline), with spaces between. */
export function splitWords(text: string): (HTMLElement | string)[] {
  const out: (HTMLElement | string)[] = [];
  text.split(" ").forEach((word, i) => {
    if (i > 0) out.push(" ");
    out.push(h("span", { class: "word", style: `--i:${i}` }, word));
  });
  return out;
}

/** The event fired on an element when it's revealed (e.g. to play the logo animation). */
export const REVEALED = "tessera:revealed";

/**
 * Reveals every `.reveal` element inside `root` the first time it scrolls into
 * view. Returns a function that stops watching.
 */
export function revealOnScroll(root: HTMLElement): () => void {
  const items = [...root.querySelectorAll<HTMLElement>(".reveal")];
  const show = (el: Element) => {
    if (el.classList.contains("is-revealed")) return;
    el.classList.add("is-revealed");
    el.dispatchEvent(new CustomEvent(REVEALED));
  };
  if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
    items.forEach(show);
    return () => {};
  }
  root.classList.add("reveal-ready");
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        show(e.target);
        io.unobserve(e.target);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );
  items.forEach((el) => io.observe(el));
  const onFocus = (e: FocusEvent) => {
    for (let el = e.target as HTMLElement | null; el && el !== root; el = el.parentElement) {
      if (el.classList.contains("reveal")) show(el);
    }
  };
  root.addEventListener("focusin", onFocus);
  return () => {
    io.disconnect();
    root.removeEventListener("focusin", onFocus);
  };
}
