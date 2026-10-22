/**
 * App settings: what they are, their defaults, and their safe limits.
 * Pure TypeScript (no storage, no DOM), so it can be unit tested.
 */

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

/** Turns anything (old data, a damaged file) into valid settings: bad values fall back to defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const s: Settings = { ...DEFAULT_SETTINGS, ...r };
  if (s.scanMode !== "auto" && s.scanMode !== "step") s.scanMode = DEFAULT_SETTINGS.scanMode;
  if (typeof s.show3d !== "boolean") s.show3d = DEFAULT_SETTINGS.show3d;
  if (typeof s.clearAfterSpeak !== "boolean") s.clearAfterSpeak = DEFAULT_SETTINGS.clearAfterSpeak;
  if (typeof s.voiceURI !== "string") s.voiceURI = DEFAULT_SETTINGS.voiceURI;
  if (!["auto", "light", "dark"].includes(s.theme)) s.theme = DEFAULT_SETTINGS.theme;
  for (const [key, { min, max }] of Object.entries(LIMITS) as [keyof typeof LIMITS, { min: number; max: number }][]) {
    const v = Number(s[key]);
    s[key] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : DEFAULT_SETTINGS[key];
  }
  // Keep only known keys, so nothing unexpected gets stored.
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, s[k as keyof Settings]])) as unknown as Settings;
}
