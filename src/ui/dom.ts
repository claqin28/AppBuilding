/**
 * Tiny helper for building DOM elements without a UI framework.
 *
 *   h("button", { class: "big", onclick: go }, "Start")
 *
 * Text is always inserted as text (never as HTML), so nothing a user types
 * or loads from a file can inject markup.
 */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2), value);
    } else if (key === "class") {
      el.className = String(value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

/** Asks the browser to save `text` as a file on this device. Nothing is uploaded. */
export function downloadText(filename: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves an image (or other data URL) as a file on this device. Nothing is uploaded. */
export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = h("a", { href: dataUrl, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
}

/** Lets the user pick a file from this device and returns its text. */
export function pickTextFile(accept = ".json,application/json"): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    });
    input.click();
  });
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

export function timestampForFile(d = new Date()): string {
  return d.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}
