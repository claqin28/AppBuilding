/**
 * Candidate gestures.
 *
 * MediaPipe gives 51 raw "blendshape" scores. A gesture here is a simple
 * formula that turns those scores into ONE number from 0 to 1 meaning "how
 * much is this person doing this gesture right now".
 *
 * This list is only the menu of gestures we TEST. Calibration measures which
 * ones work for each person; nothing here assumes anyone can do any of them.
 *
 * Left/right always means the USER's own left/right. MediaPipe reports
 * blendshapes from the subject's point of view as long as the camera image is
 * not mirrored, and we never mirror it.
 */

export type GestureId =
  | "browRaise"
  | "browLower"
  | "mouthOpen"
  | "smile"
  | "pucker"
  | "cheekPuff"
  | "jawLeft"
  | "jawRight"
  | "winkLeft"
  | "winkRight"
  | "mouthLeft"
  | "mouthRight";

export interface GestureDef {
  id: GestureId;
  /** Short name for buttons and tables. */
  label: string;
  /** Instruction shown during calibration. */
  prompt: string;
  /** Tested by default? (Rarer gestures are opt-in to keep calibration short.) */
  defaultOn: boolean;
  /**
   * Offered in calibration's list at all. Retired gestures (offered: false) stay
   * defined, so profiles and recordings saved before they were retired still load.
   */
  offered: boolean;
  signal: (s: Record<string, number>) => number;
}

const v = (s: Record<string, number>, name: string): number => s[name] ?? 0;

/**
 * For gestures with a left and right side (smile, frown), we take the LARGER
 * side. Someone with weakness on one side of the face can still use it.
 */
const eitherSide = (s: Record<string, number>, left: string, right: string): number =>
  Math.max(v(s, left), v(s, right));

export const GESTURES: readonly GestureDef[] = [
  {
    id: "browRaise",
    offered: true,
    label: "Raise eyebrows",
    prompt: "Raise your eyebrows",
    defaultOn: true,
    signal: (s) => Math.max(v(s, "browInnerUp"), eitherSide(s, "browOuterUpLeft", "browOuterUpRight")),
  },
  {
    id: "browLower",
    offered: true,
    label: "Frown",
    prompt: "Lower your eyebrows into a frown",
    defaultOn: true,
    signal: (s) => eitherSide(s, "browDownLeft", "browDownRight"),
  },
  {
    id: "mouthOpen",
    offered: false,
    label: "Open mouth",
    prompt: "Open your mouth wide",
    defaultOn: false,
    signal: (s) => v(s, "jawOpen"),
  },
  {
    id: "smile",
    offered: true,
    label: "Smile",
    prompt: "Smile big",
    defaultOn: true,
    signal: (s) => eitherSide(s, "mouthSmileLeft", "mouthSmileRight"),
  },
  {
    id: "pucker",
    offered: true,
    label: "Pucker lips",
    prompt: "Pucker your lips, like a kiss",
    defaultOn: false,
    signal: (s) => v(s, "mouthPucker"),
  },
  {
    id: "cheekPuff",
    offered: false,
    label: "Puff cheeks",
    prompt: "Puff out your cheeks",
    defaultOn: false,
    signal: (s) => v(s, "cheekPuff"),
  },
  {
    id: "jawLeft",
    offered: false,
    label: "Jaw to your left",
    prompt: "Slide your jaw toward your left",
    defaultOn: false,
    signal: (s) => v(s, "jawLeft"),
  },
  {
    id: "jawRight",
    offered: false,
    label: "Jaw to your right",
    prompt: "Slide your jaw toward your right",
    defaultOn: false,
    signal: (s) => v(s, "jawRight"),
  },
  {
    // A normal blink closes BOTH eyes, so left minus right stays near 0.
    // Only closing one eye on purpose makes this number go up.
    id: "winkLeft",
    offered: true,
    label: "Close left eye",
    prompt: "Close only your left eye",
    defaultOn: true,
    signal: (s) => Math.max(0, v(s, "eyeBlinkLeft") - v(s, "eyeBlinkRight")),
  },
  {
    id: "winkRight",
    offered: true,
    label: "Close right eye",
    prompt: "Close only your right eye",
    defaultOn: true,
    signal: (s) => Math.max(0, v(s, "eyeBlinkRight") - v(s, "eyeBlinkLeft")),
  },
  {
    id: "mouthLeft",
    offered: true,
    label: "Lips to your left",
    prompt: "Pull your lips toward your left",
    defaultOn: false,
    signal: (s) => v(s, "mouthLeft"),
  },
  {
    id: "mouthRight",
    offered: true,
    label: "Lips to your right",
    prompt: "Pull your lips toward your right",
    defaultOn: false,
    signal: (s) => v(s, "mouthRight"),
  },
];

export const GESTURE_IDS: readonly GestureId[] = GESTURES.map((g) => g.id);

/**
 * The gestures calibration offers. Retired on 2026-10-25 because they were too
 * hard for everyone the owner tried them with: Open mouth, Puff cheeks, Jaw to
 * your left, and Jaw to your right.
 */
export const OFFERED_GESTURES: readonly GestureDef[] = GESTURES.filter((g) => g.offered);

const BY_ID = new Map(GESTURES.map((g) => [g.id, g]));

export function gestureDef(id: GestureId): GestureDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown gesture: ${id}`);
  return def;
}

export function isGestureId(x: unknown): x is GestureId {
  return typeof x === "string" && BY_ID.has(x as GestureId);
}

/** All gesture values for one frame of blendshape scores. */
export function gestureSignals(scores: Record<string, number>): Record<GestureId, number> {
  const out = {} as Record<GestureId, number>;
  for (const g of GESTURES) out[g.id] = g.signal(scores);
  return out;
}
