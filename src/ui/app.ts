/**
 * Shared app state and screen switching. Screens get this context so they
 * can reach the active frame source, the saved profile, and each other.
 */
import type { CalibrationResult } from "../signal/calibration";
import type { Profile } from "../signal/profile";
import type { Trace } from "../signal/trace";
import type { DetectionListener, FrameSource } from "../vision/tracker";
import type { Settings } from "./storage";

export type ScreenName = "setup" | "calibrate" | "results" | "talk" | "settings";

export interface Screen {
  mount(root: HTMLElement): void;
  unmount(): void;
}

export interface LastCalibration {
  result: CalibrationResult;
  trace: Trace;
  durationMs: number;
}

export interface AppContext {
  source: FrameSource | null;
  /**
   * Receive every detection from whichever source is active (camera or replay),
   * including sources started later. Returns an unsubscribe function.
   */
  subscribe(fn: DetectionListener): () => void;
  profile: Profile | null;
  settings: Settings;
  lastCalibration: LastCalibration | null;
  go(screen: ScreenName): void;
  /** Starts the webcam (if not already running). Resolves false on failure. */
  ensureCamera(): Promise<boolean>;
  /** Replaces the camera with a recorded trace (for testing). */
  useReplay(trace: Trace): void;
  setProfile(p: Profile): void;
  setSettings(s: Settings): void;
  /** Shows a short message to the user in the status area. */
  notify(msg: string, isError?: boolean): void;
}
