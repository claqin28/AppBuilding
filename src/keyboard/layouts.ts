/**
 * Keyboard layouts for scanning.
 *
 * Letters are arranged by how often they're used in English (E, T, A, O, I,
 * N first), not QWERTY. With scanning, every step costs time, so putting
 * common letters near the start makes typing faster. The command row
 * (speak, space, delete, ...) comes first because it's needed after almost
 * every word.
 */
import type { Key, Layout } from "./scanner";

const chars = (s: string): Key[] => [...s].map((c) => ({ label: c, kind: "char", text: c.toLowerCase() }));

export const KEYBOARD: Layout = [
  [
    { label: "Speak", kind: "speak" },
    { label: "Space", kind: "space" },
    { label: "Delete", kind: "delete" },
    { label: "Phrases", kind: "phrases" },
    { label: "Pause", kind: "pause" },
  ],
  chars("ETAOIN"),
  chars("SHRDLU"),
  chars("CMWFGY"),
  chars("PBVKJX"),
  [...chars("QZ.,?'"), { label: "Clear all", kind: "clear" }],
];

export const DEFAULT_PHRASES = [
  "I need help",
  "I'm thirsty",
  "I'm in pain",
  "Please move my position",
  "Yes",
  "No",
  "Thank you",
  "Please wait",
  "I love you",
];

/** One phrase per row, so a single SELECT speaks it. */
export function phraseLayout(phrases: readonly string[]): Layout {
  return [
    [{ label: "Back to keyboard", kind: "keyboard" }],
    ...phrases.map((p): Key[] => [{ label: p, kind: "phrase", text: p }]),
  ];
}
