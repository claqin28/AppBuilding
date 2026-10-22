/**
 * Local profiles in IndexedDB (the browser's built-in database).
 *
 * Everything stays in THIS browser on THIS device. Nothing is sent anywhere.
 * Database "tessera", version 1, with three stores:
 *   meta      { key: "activeProfileId", value }  which profile is in use
 *   profiles  ProfileRecord (key: id)            nickname, settings, gesture setup
 *   sessions  SessionRecord (key: id, index: profileId)   calibration summaries
 *
 * The database is only created when someone creates a profile. Guest mode
 * never opens it, so a guest leaves nothing behind.
 */
import {
  MAX_PROFILES,
  MAX_SESSIONS_PER_PROFILE,
  readProfileRecord,
  type ProfileRecord,
  type SessionRecord,
} from "./schema";

const DB_NAME = "tessera";
const DB_VERSION = 1;

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function idbSupported(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

export class ProfileDb {
  private constructor(private db: IDBDatabase) {}

  /** True if a Tessera database already exists. Checking does NOT create one. */
  static async exists(): Promise<boolean> {
    if (!idbSupported() || typeof indexedDB.databases !== "function") return false;
    try {
      return (await indexedDB.databases()).some((d) => d.name === DB_NAME);
    } catch {
      return false;
    }
  }

  static async open(): Promise<ProfileDb> {
    if (!idbSupported()) throw new Error("This browser can't store profiles.");
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      // Each "if" upgrades from one version to the next; future versions add more.
      if (e.oldVersion < 1) {
        db.createObjectStore("meta", { keyPath: "key" });
        db.createObjectStore("profiles", { keyPath: "id" });
        db.createObjectStore("sessions", { keyPath: "id" }).createIndex("profileId", "profileId");
      }
    };
    return new ProfileDb(await promisify(req));
  }

  /** Deletes the whole database: every profile and session on this device. */
  static async deleteEverything(): Promise<void> {
    if (!idbSupported()) return;
    await promisify(indexedDB.deleteDatabase(DB_NAME));
  }

  close(): void {
    this.db.close();
  }

  async listProfiles(): Promise<ProfileRecord[]> {
    const raw = await promisify(this.db.transaction("profiles").objectStore("profiles").getAll());
    return raw
      .map(readProfileRecord)
      .filter((p): p is ProfileRecord => p !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProfile(id: string): Promise<ProfileRecord | null> {
    return readProfileRecord(await promisify(this.db.transaction("profiles").objectStore("profiles").get(id)));
  }

  async addProfile(rec: ProfileRecord): Promise<void> {
    if ((await this.listProfiles()).length >= MAX_PROFILES) {
      throw new Error(`This device already has ${MAX_PROFILES} profiles. Delete one first.`);
    }
    await this.putProfile(rec);
  }

  async putProfile(rec: ProfileRecord): Promise<void> {
    const tx = this.db.transaction("profiles", "readwrite");
    tx.objectStore("profiles").put(rec);
    await done(tx);
  }

  async deleteProfile(id: string): Promise<void> {
    const tx = this.db.transaction(["profiles", "sessions", "meta"], "readwrite");
    tx.objectStore("profiles").delete(id);
    const index = tx.objectStore("sessions").index("profileId");
    const keys = await promisify(index.getAllKeys(id));
    for (const k of keys) tx.objectStore("sessions").delete(k);
    const active = await promisify(tx.objectStore("meta").get("activeProfileId"));
    if (active?.value === id) tx.objectStore("meta").delete("activeProfileId");
    await done(tx);
  }

  async getActiveId(): Promise<string | null> {
    const row = await promisify(this.db.transaction("meta").objectStore("meta").get("activeProfileId"));
    return typeof row?.value === "string" ? row.value : null;
  }

  async setActiveId(id: string | null): Promise<void> {
    const tx = this.db.transaction("meta", "readwrite");
    if (id) tx.objectStore("meta").put({ key: "activeProfileId", value: id });
    else tx.objectStore("meta").delete("activeProfileId");
    await done(tx);
  }

  /** Adds a calibration summary. Past the cap, the oldest sessions are dropped. */
  async addSession(rec: SessionRecord): Promise<void> {
    const tx = this.db.transaction("sessions", "readwrite");
    const store = tx.objectStore("sessions");
    store.put(rec);
    const all = (await promisify(store.index("profileId").getAll(rec.profileId))) as SessionRecord[];
    const extra = all.length - MAX_SESSIONS_PER_PROFILE;
    if (extra > 0) {
      all.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      for (const old of all.slice(0, extra)) store.delete(old.id);
    }
    await done(tx);
  }

  async sessionsFor(profileId: string): Promise<SessionRecord[]> {
    const all = (await promisify(
      this.db.transaction("sessions").objectStore("sessions").index("profileId").getAll(profileId),
    )) as SessionRecord[];
    return all.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }
}

export type PersistenceResult = "persisted" | "may-be-erased" | "unknown";

/**
 * Asks the browser to keep this site's data instead of clearing it when space
 * runs low. If the browser says no, profiles may be erased later, and the app
 * says so. (Private/incognito windows can't be detected for certain; a refusal
 * is one of the signs.)
 */
export async function requestPersistence(): Promise<PersistenceResult> {
  try {
    if (!navigator.storage?.persist) return "unknown";
    if (await navigator.storage.persisted()) return "persisted";
    return (await navigator.storage.persist()) ? "persisted" : "may-be-erased";
  } catch {
    return "unknown";
  }
}
