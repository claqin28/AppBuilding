/**
 * Where the current session's data lives:
 *   GuestStore   - memory only. Nothing is written anywhere; closing or
 *                  reloading the tab erases it.
 *   ProfileStore - a local profile in IndexedDB (see profileDb.ts).
 * Screens read and write through this interface and don't care which it is.
 */
import type { CalibrationResult } from "../signal/calibration";
import type { GestureId } from "../signal/gestures";
import type { Profile } from "../signal/profile";
import type { ProfileDb } from "./profileDb";
import { calibrationSession, cleanNickname, newProfileRecord, type ProfileRecord, type SessionRecord } from "./schema";
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from "./settings";

export interface AppStore {
  readonly kind: "guest" | "profile";
  readonly nickname: string;
  readonly settings: Settings;
  readonly control: Profile | null;
  saveSettings(s: Settings): Promise<void>;
  saveControl(p: Profile): Promise<void>;
  addCalibration(result: CalibrationResult, durationMs: number, chosen: GestureId[]): Promise<void>;
}

function newId(): string {
  return crypto.randomUUID();
}

export class GuestStore implements AppStore {
  readonly kind = "guest";
  readonly nickname = "Guest";
  settings: Settings = { ...DEFAULT_SETTINGS };
  control: Profile | null = null;
  /** Calibration summaries from this session, kept so they can be saved to a profile. */
  sessions: SessionRecord[] = [];

  async saveSettings(s: Settings): Promise<void> {
    this.settings = normalizeSettings(s);
  }

  async saveControl(p: Profile): Promise<void> {
    this.control = p;
  }

  async addCalibration(result: CalibrationResult, durationMs: number, chosen: GestureId[]): Promise<void> {
    this.sessions.push(calibrationSession(newId(), "guest", new Date(), result, durationMs, chosen));
  }
}

export class ProfileStore implements AppStore {
  readonly kind = "profile";

  private constructor(
    private db: ProfileDb,
    private record: ProfileRecord,
  ) {}

  get nickname(): string {
    return this.record.nickname;
  }

  get settings(): Settings {
    return this.record.settings;
  }

  get control(): Profile | null {
    return this.record.control;
  }

  get id(): string {
    return this.record.id;
  }

  static async open(db: ProfileDb, id: string): Promise<ProfileStore | null> {
    const rec = await db.getProfile(id);
    if (!rec) return null;
    await db.setActiveId(id);
    return new ProfileStore(db, rec);
  }

  /** Creates a profile (optionally carrying over a guest's session) and makes it active. */
  static async create(db: ProfileDb, nickname: string, from?: GuestStore): Promise<ProfileStore> {
    const existing = (await db.listProfiles()).map((p) => p.nickname);
    const rec = newProfileRecord(
      newId(),
      cleanNickname(nickname, existing),
      new Date(),
      from?.settings ?? DEFAULT_SETTINGS,
      from?.control ?? null,
    );
    await db.addProfile(rec);
    for (const s of from?.sessions ?? []) await db.addSession({ ...s, id: newId(), profileId: rec.id });
    await db.setActiveId(rec.id);
    return new ProfileStore(db, rec);
  }

  async saveSettings(s: Settings): Promise<void> {
    this.record = { ...this.record, settings: normalizeSettings(s), updatedAt: new Date().toISOString() };
    await this.db.putProfile(this.record);
  }

  async saveControl(p: Profile): Promise<void> {
    this.record = { ...this.record, control: p, updatedAt: new Date().toISOString() };
    await this.db.putProfile(this.record);
  }

  async addCalibration(result: CalibrationResult, durationMs: number, chosen: GestureId[]): Promise<void> {
    await this.db.addSession(calibrationSession(newId(), this.record.id, new Date(), result, durationMs, chosen));
  }
}
