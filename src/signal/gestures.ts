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
    label: "Raise eyebrows",
    prompt: "Raise your eyebrows",
    defaultOn: true,
    signal: (s) => Math.max(v(s, "browInnerUp"), eitherSide(s, "browOuterUpLeft", "browOuterUpRight")),
  },
  {
    id: "browLower",
    label: "Frown",
    prompt: "Lower your eyebrows into a frown",
    defaultOn: true,
    signal: (s) => eitherSide(s, "browDownLeft", "browDownRight"),
  },
  {
    id: "mouthOpen",
    label: "Open mouth",
    prompt: "Open your mouth wide",
    defaultOn: true,
    signal: (s) => v(s, "jawOpen"),
  },
  {
    id: "smile",
    label: "Smile",
    prompt: "Smile big",
    defaultOn: true,
    signal: (s) => eitherSide(s, "mouthSmileLeft", "mouthSmileRight"),
  },
  {
    id: "pucker",
    label: "Pucker lips",
    prompt: "Pucker your lips, like a kiss",
    defaultOn: false,
    signal: (s) => v(s, "mouthPucker"),
  },
  {
    id: "cheekPuff",
    label: "Puff cheeks",
    prompt: "Puff out your cheeks",
    defaultOn: true,
    signal: (s) => v(s, "cheekPuff"),
  },
  {
    id: "jawLeft",
    label: "Jaw to your left",
    prompt: "Slide your jaw toward your left",
    defaultOn: true,
    signal: (s) => v(s, "jawLeft"),
  },
  {
    id: "jawRight",
    label: "Jaw to your right",
    prompt: "Slide your jaw toward your right",
    defaultOn: true,
    signal: (s) => v(s, "jawRight"),
  },
  {
    // A normal blink closes BOTH eyes, so left minus right stays near 0.
    // Only closing one eye on purpose makes this number go up.
    id: "winkLeft",
    label: "Close left eye",
    prompt: "Close only your left eye",
    defaultOn: true,
    signal: (s) => Math.max(0, v(s, "eyeBlinkLeft") - v(s, "eyeBlinkRight")),
  },
  {
    id: "winkRight",
    label: "Close right eye",
    prompt: "Close only your right eye",
    defaultOn: true,
    signal: (s) => Math.max(0, v(s, "eyeBlinkRight") - v(s, "eyeBlinkLeft")),
  },
  {
    id: "mouthLeft",
    label: "Lips to your left",
    prompt: "Pull your lips toward your left",
    defaultOn: false,
    signal: (s) => v(s, "mouthLeft"),
  },
  {
    id: "mouthRight",
    label: "Lips to your right",
    prompt: "Pull your lips toward your right",
    defaultOn: false,
    signal: (s) => v(s, "mouthRight"),
  },
];

export const GESTURE_IDS: readonly GestureId[] = GESTURES.map((g) => g.id);

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
