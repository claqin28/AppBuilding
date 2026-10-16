import { describe, expect, it } from "vitest";
import { DEFAULT_PHRASES, KEYBOARD, phraseLayout } from "../src/keyboard/layouts";
import { FIRST_ITEM_FACTOR, MAX_KEY_LOOPS, Scanner } from "../src/keyboard/scanner";
import { applyKey } from "../src/keyboard/typing";

const SCAN = 1000;

describe("Scanner, auto mode", () => {
  it("waits longer on the first item, then steps every scanMs", () => {
    const s = new Scanner(KEYBOARD, "auto", SCAN, 0);
    expect(s.tick(SCAN)).toBe(false); // still on the first item
    expect(s.tick(SCAN * FIRST_ITEM_FACTOR)).toBe(true);
    expect(s.row).toBe(1);
    expect(s.tick(SCAN * FIRST_ITEM_FACTOR + SCAN)).toBe(true);
    expect(s.row).toBe(2);
  });

  it("SELECT enters a row, SELECT again picks the key", () => {
    const s = new Scanner(KEYBOARD, "auto", SCAN, 0);
    s.tick(1500); // row 1: E T A O I N
    expect(s.handle("SELECT", 1600)).toBeNull();
    expect(s.level).toBe("key");
    s.tick(1600 + 1500); // T
    expect(s.handle("SELECT", 3200)?.label).toBe("T");
    expect(s.level).toBe("row");
    expect(s.row).toBe(0); // back to the top
  });

  it("backs out of a row after it loops without a choice", () => {
    const s = new Scanner(KEYBOARD, "auto", SCAN, 0);
    s.handle("SELECT", 0); // into row 0 (5 keys)
    let t = 0;
    for (let i = 0; i < 5 * MAX_KEY_LOOPS + 2; i++) s.tick((t += 2000));
    expect(s.level).toBe("row");
  });

  it("rows wrap around", () => {
    const s = new Scanner(KEYBOARD, "auto", SCAN, 0);
    let t = 0;
    for (let i = 0; i < KEYBOARD.length; i++) s.tick((t += 2000));
    expect(s.row).toBe(0);
  });

  it("BACK leaves a row without choosing", () => {
    const s = new Scanner(KEYBOARD, "auto", SCAN, 0);
    s.handle("SELECT", 0);
    expect(s.handle("BACK", 10)).toBeNull();
    expect(s.level).toBe("row");
  });
});

describe("Scanner, step mode", () => {
  it("never moves by itself", () => {
    const s = new Scanner(KEYBOARD, "step", SCAN, 0);
    expect(s.tick(1e9)).toBe(false);
  });

  it("NEXT moves, SELECT picks", () => {
    const s = new Scanner(KEYBOARD, "step", SCAN, 0);
    s.handle("NEXT", 0); // row 1
    s.handle("SELECT", 0);
    s.handle("NEXT", 0);
    s.handle("NEXT", 0);
    expect(s.handle("SELECT", 0)?.label).toBe("A");
  });

  it("keys wrap within a row and never auto-exit", () => {
    const s = new Scanner(KEYBOARD, "step", SCAN, 0);
    s.handle("SELECT", 0);
    for (let i = 0; i < 5 * 3; i++) s.handle("NEXT", 0);
    expect(s.level).toBe("key");
    expect(s.col).toBe(0);
  });
});

describe("single-key rows (phrases)", () => {
  it("one SELECT chooses the phrase", () => {
    const s = new Scanner(phraseLayout(DEFAULT_PHRASES), "step", SCAN, 0);
    s.handle("NEXT", 0);
    expect(s.highlightedKey?.label).toBe(DEFAULT_PHRASES[0]);
    expect(s.handle("SELECT", 0)?.text).toBe(DEFAULT_PHRASES[0]);
  });
});

describe("applyKey", () => {
  const key = (label: string) => ({ label, kind: "char" as const, text: label.toLowerCase() });

  it("capitalizes the start of a sentence only", () => {
    let t = applyKey("", key("H")).text;
    t = applyKey(t, key("I")).text;
    expect(t).toBe("Hi");
    t = applyKey(t + ". ", key("O")).text;
    expect(t).toBe("Hi. O");
  });

  it("space, delete, clear", () => {
    expect(applyKey("ab", { label: "Space", kind: "space" }).text).toBe("ab ");
    expect(applyKey("ab", { label: "Delete", kind: "delete" }).text).toBe("a");
    expect(applyKey("", { label: "Delete", kind: "delete" }).text).toBe("");
    expect(applyKey("ab", { label: "Clear", kind: "clear" }).text).toBe("");
  });

  it("speak returns the message, but not an empty one", () => {
    expect(applyKey("hello ", { label: "Speak", kind: "speak" }).speak).toBe("hello");
    expect(applyKey("  ", { label: "Speak", kind: "speak" }).speak).toBeUndefined();
  });

  it("a phrase is spoken without changing the message", () => {
    const e = applyKey("draft", { label: "Yes", kind: "phrase", text: "Yes" });
    expect(e).toEqual({ text: "draft", speak: "Yes", layout: "keyboard" });
  });

  it("pause and layout switching", () => {
    expect(applyKey("", { label: "Pause", kind: "pause" }).pause).toBe(true);
    expect(applyKey("", { label: "Phrases", kind: "phrases" }).layout).toBe("phrases");
  });
});
