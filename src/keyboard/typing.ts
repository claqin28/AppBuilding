/**
 * What happens to the message when a key is chosen. Pure function, so it's
 * easy to test: (message, key) -> new message + anything else to do.
 */
import type { Key } from "./scanner";

export interface KeyEffect {
  text: string;
  /** Text to speak aloud, if any. */
  speak?: string;
  /** Switch to another layout. */
  layout?: "keyboard" | "phrases";
  /** Pause scanning (the person wants a break or is talking). */
  pause?: boolean;
}

export function applyKey(text: string, key: Key): KeyEffect {
  switch (key.kind) {
    case "char": {
      const c = key.text ?? key.label;
      // Capitalize the first letter of a sentence.
      const startOfSentence = /(^|[.?!]\s+)$/.test(text);
      return { text: text + (startOfSentence ? c.toUpperCase() : c) };
    }
    case "space":
      return { text: text + " " };
    case "delete":
      return { text: text.slice(0, -1) };
    case "clear":
      return { text: "" };
    case "speak":
      return { text, speak: text.trim() || undefined };
    case "phrases":
      return { text, layout: "phrases" };
    case "keyboard":
      return { text, layout: "keyboard" };
    case "phrase":
      return { text, speak: key.text ?? key.label, layout: "keyboard" };
    case "pause":
      return { text, pause: true };
  }
}
