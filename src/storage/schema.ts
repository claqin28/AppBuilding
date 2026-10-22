/**
 * What a local profile looks like when stored, and how old versions are
 * upgraded. Pure TypeScript (no IndexedDB, no DOM), so it's unit tested.
 *
 * A "profile" here is a nickname + settings + gesture setup + calibration
 * summaries, stored ONLY in this browser on this device. It is not an online
 * account: there's no email, no password, and no server.
 *
 * Never stored: video, images, face landmarks (face shape), raw recordings,
 * or typed messages. Calibration is stored as summary numbers only.
 */
import type { CalibrationResult } from "../signal/calibration";
import type { GestureId } from "../signal/gestures";
import { parseProfile, type Profile } from "../signal/profile";
import { normalizeSettings, type Settings } from "./settings";

/** Bump this when the stored shape changes, and add a migration below. */
export const SCHEMA_VERSION = 1;
export const MAX_PROFILES = 20;
export const MAX_SESSIONS_PER_PROFILE = 500;
export const MAX_NICKNAME = 40;

export interface ProfileRecord {
  schemaVersion: number;
  id: string;
  nickname: string;
  createdAt: string;
  updatedAt: string;
  settings: Settings;
  /** The person's gesture → action setup and thresholds (null until calibrated). */
  control: Profile | null;
}

export interface GestureSummary {
  id: GestureId;
  usable: boolean;
  hitRate: number;
  auc: number;
  gap: number;
  restLevel: number;
  typicalPeak: number;
  on: number;
  off: number;
  reactionMs: number | null;
}

/** One calibration, as summary numbers (about 2 KB), never a recording. */
export interface SessionRecord {
  schemaVersion: number;
  id: string;
  profileId: string;
  startedAt: string;
  calibration: {
    durationMs: number;
    chosen: GestureId[];
    gestures: GestureSummary[];
  };
}

/** Cleans up a nickname. An empty one becomes "Profile N". */
export function cleanNickname(name: string, existing: readonly string[]): string {
  // Collapse whitespace and drop control characters.
  const trimmed = [...name.replace(/\s+/g, " ").trim()].filter((c) => c >= " ").join("").slice(0, MAX_NICKNAME);
  if (trimmed) return trimmed;
  let n = existing.length + 1;
  while (existing.includes(`Profile ${n}`)) n++;
  return `Profile ${n}`;
}

export function newProfileRecord(id: string, nickname: string, now: Date, settings: Settings, control: Profile | null): ProfileRecord {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    nickname,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    settings: normalizeSettings(settings),
    control,
  };
}

export function calibrationSession(
  id: string,
  profileId: string,
  now: Date,
  result: CalibrationResult,
  durationMs: number,
  chosen: GestureId[],
): SessionRecord {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    profileId,
    startedAt: now.toISOString(),
    calibration: {
      durationMs: Math.round(durationMs),
      chosen: [...chosen],
      gestures: result.gestures.map((g) => ({
        id: g.id,
        usable: g.usable,
        hitRate: g.hitRate,
        auc: g.auc,
        gap: g.gap,
        restLevel: g.restLevel,
        typicalPeak: g.typicalPeak,
        on: g.on,
        off: g.off,
        reactionMs: g.reactionMs,
      })),
    },
  };
}

/**
 * Migrations: each one upgrades a record by exactly one version. They run in
 * order (v1 → v2 → v3 ...) when old data is read or a backup is imported.
 * There's only version 1 so far, so this list is empty; it exists so that
 * future changes have one obvious place to go.
 */
const PROFILE_MIGRATIONS: Record<number, (r: Record<string, unknown>) => Record<string, unknown>> = {};

/**
 * Reads a stored profile safely: upgrades old versions, fixes bad settings,
 * and returns null (instead of crashing) for damaged or too-new data.
 */
export function readProfileRecord(raw: unknown): ProfileRecord | null {
  if (!raw || typeof raw !== "object") return null;
  let r = { ...(raw as Record<string, unknown>) };
  let v = Number(r.schemaVersion);
  if (!Number.isInteger(v) || v < 1 || v > SCHEMA_VERSION) return null;
  while (v < SCHEMA_VERSION) {
    const step = PROFILE_MIGRATIONS[v];
    if (!step) return null;
    r = step(r);
    v++;
    r.schemaVersion = v;
  }
  if (typeof r.id !== "string" || !r.id || typeof r.nickname !== "string") return null;
  if (typeof r.createdAt !== "string" || typeof r.updatedAt !== "string") return null;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: r.id,
    nickname: cleanNickname(r.nickname, []),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    settings: normalizeSettings(r.settings),
    control: r.control == null ? null : parseProfile(r.control),
  };
}
