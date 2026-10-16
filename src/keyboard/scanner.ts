/**
 * Row/column scanning: how someone with one to three "switches" (gestures)
 * can pick any key from a grid.
 *
 *   1. ROW level: the highlight moves down the rows.
 *      SELECT on a row -> go into that row.
 *   2. KEY level: the highlight moves across the keys of that row.
 *      SELECT on a key -> that key is chosen, and we go back to ROW level.
 *      BACK -> leave the row without choosing.
 *
 * AUTO mode: the highlight moves by itself every scanMs. Only SELECT is
 * needed, so this works with a single reliable gesture. If the person lets
 * a row go round twice without choosing, it backs out to ROW level.
 *
 * STEP mode: the highlight moves only on NEXT. Slower to learn but the
 * person sets the pace, which helps if timing is hard or tiring.
 *
 * A row with a single key (like a phrase) is chosen directly from ROW level.
 * The first item after any change stays highlighted longer (firstItemFactor)
 * so the person has time to relax and get ready.
 */
import type { Action } from "../signal/selection";

export type KeyKind = "char" | "space" | "delete" | "speak" | "clear" | "phrases" | "phrase" | "keyboard" | "pause";

export interface Key {
  label: string;
  kind: KeyKind;
  /** Text to insert (char) or speak (phrase). */
  text?: string;
  /** Spoken/accessible name when the label is a symbol. */
  name?: string;
}

export type Layout = Key[][];
export type ScanMode = "auto" | "step";

export const FIRST_ITEM_FACTOR = 1.5;
export const MAX_KEY_LOOPS = 2;

export class Scanner {
  level: "row" | "key" = "row";
  row = 0;
  col = 0;
  private nextStepAt = 0;
  private loops = 0;

  constructor(
    public layout: Layout,
    public mode: ScanMode,
    public scanMs: number,
    now: number,
  ) {
    if (layout.length === 0 || layout.some((r) => r.length === 0)) throw new Error("Layout needs non-empty rows");
    this.reset(now);
  }

  setLayout(layout: Layout, now: number): void {
    this.layout = layout;
    this.reset(now);
  }

  setMode(mode: ScanMode, now: number): void {
    this.mode = mode;
    this.schedule(now, true);
  }

  /**
   * Keeps the highlight where it is and restarts its timer with the longer
   * first-item wait. Used when scanning resumes after the face was lost, so
   * the person gets time to settle before anything moves.
   */
  hold(now: number): void {
    this.schedule(now, true);
  }

  reset(now: number): void {
    this.level = "row";
    this.row = 0;
    this.col = 0;
    this.loops = 0;
    this.schedule(now, true);
  }

  /** In auto mode, moves the highlight when its time is up. Returns true if it moved. */
  tick(now: number): boolean {
    if (this.mode !== "auto" || now < this.nextStepAt) return false;
    this.advance(now);
    return true;
  }

  /** Handles a gesture action. Returns the chosen key, if one was chosen. */
  handle(action: Action, now: number): Key | null {
    switch (action) {
      case "SELECT": {
        const row = this.layout[this.row];
        if (this.level === "row") {
          if (row.length === 1) {
            this.backToRows(now);
            return row[0];
          }
          this.level = "key";
          this.col = 0;
          this.loops = 0;
          this.schedule(now, true);
          return null;
        }
        const key = row[this.col];
        this.backToRows(now);
        return key;
      }
      case "NEXT":
        this.advance(now);
        return null;
      case "BACK":
        if (this.level === "key") {
          this.level = "row";
          this.schedule(now, true);
        }
        return null;
    }
  }

  /** The key a SELECT would choose right now (null at row level for multi-key rows). */
  get highlightedKey(): Key | null {
    const row = this.layout[this.row];
    if (this.level === "key") return row[this.col];
    return row.length === 1 ? row[0] : null;
  }

  private advance(now: number): void {
    if (this.level === "row") {
      this.row = (this.row + 1) % this.layout.length;
    } else {
      this.col++;
      if (this.col >= this.layout[this.row].length) {
        this.col = 0;
        this.loops++;
        if (this.mode === "auto" && this.loops >= MAX_KEY_LOOPS) {
          this.level = "row";
          this.schedule(now, true);
          return;
        }
      }
    }
    this.schedule(now, false);
  }

  private backToRows(now: number): void {
    this.level = "row";
    this.row = 0;
    this.col = 0;
    this.schedule(now, true);
  }

  private schedule(now: number, first: boolean): void {
    this.nextStepAt = now + this.scanMs * (first ? FIRST_ITEM_FACTOR : 1);
  }
}
