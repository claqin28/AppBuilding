/**
 * Earlier versions of the app saved the gesture setup and settings in
 * localStorage. This reads them ONCE so they can be moved into the first
 * profile created, then deletes them. Nothing new is ever written there.
 */
import { parseProfile, type Profile } from "../signal/profile";
import { normalizeSettings, type Settings } from "./settings";

const KEYS = ["fgc.profile.v1", "fgc.settings.v1"];

export function readLegacy(): { control: Profile | null; settings: Settings | null } | null {
  try {
    const p = localStorage.getItem(KEYS[0]);
    const s = localStorage.getItem(KEYS[1]);
    if (!p && !s) return null;
    return {
      control: p ? parseProfile(JSON.parse(p)) : null,
      settings: s ? normalizeSettings(JSON.parse(s)) : null,
    };
  } catch {
    return null;
  }
}

export function clearLegacy(): void {
  try {
    for (const k of KEYS) localStorage.removeItem(k);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
