/**
 * Saves small things (profile, settings) in this browser's localStorage.
 * This stays on this device; it's never sent anywhere. Storage can be
 * unavailable (private mode, blocked site data), so every access is guarded.
 */
import { parseProfile, type Profile } from "../signal/profile";

const PROFILE_KEY = "fgc.profile.v1";
const SETTINGS_KEY = "fgc.settings.v1";

export function loadProfile(): Profile | null {
  return parseProfile(readJson(PROFILE_KEY));
}

export function saveProfile(p: Profile): boolean {
  return writeJson(PROFILE_KEY, p);
}

export interface Settings {
  scanMode: "auto" | "step";
  /** How long the highlight stays on each item in auto-scan (ms). */
  scanMs: number;
  holdMs: number;
  refractoryMs: number;
  speechRate: number;
  voiceURI: string;
  clearAfterSpeak: boolean;
  /** Show the 3D face map (off = the 3D code isn't even downloaded). */
  show3d: boolean;
  /** Color theme: follow the computer's setting, or force light/dark. */
  theme: "auto" | "light" | "dark";
}

export const DEFAULT_SETTINGS: Settings = {
  scanMode: "auto",
  scanMs: 1200,
  holdMs: 250,
  refractoryMs: 400,
  speechRate: 0.9,
  voiceURI: "",
  clearAfterSpeak: false,
  show3d: true,
  theme: "auto",
};

/** Safety limits for adjustable settings. Scan speed never goes below 500 ms (< 2 changes per second). */
export const LIMITS = {
  scanMs: { min: 500, max: 4000 },
  holdMs: { min: 100, max: 1500 },
  refractoryMs: { min: 100, max: 2000 },
  speechRate: { min: 0.5, max: 1.5 },
};

export function loadSettings(): Settings {
  const raw = readJson(SETTINGS_KEY) as Partial<Settings> | null;
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  if (s.scanMode !== "auto" && s.scanMode !== "step") s.scanMode = "auto";
  if (typeof s.show3d !== "boolean") s.show3d = DEFAULT_SETTINGS.show3d;
  if (!["auto", "light", "dark"].includes(s.theme)) s.theme = "auto";
  for (const [key, { min, max }] of Object.entries(LIMITS) as [keyof typeof LIMITS, { min: number; max: number }][]) {
    const v = Number(s[key]);
    s[key] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : DEFAULT_SETTINGS[key];
  }
  return s;
}

export function saveSettings(s: Settings): boolean {
  return writeJson(SETTINGS_KEY, s);
}

export function clearAll(): void {
  try {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

function readJson(key: string): unknown {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
