/**
 * App shell: navigation, the always-visible camera panel, and shared state.
 * The real logic lives in src/signal and src/keyboard (pure, tested) and
 * src/vision (camera + MediaPipe). Screens live in src/ui.
 */
// Fonts are bundled with the app (served from this site), not loaded from Google.
import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "./styles.css";
import { checkPosition, faceBoxFromLandmarks } from "./signal/quality";
import type { Trace } from "./signal/trace";
import type { Activity, AppContext, Screen, ScreenName } from "./ui/app";
import { CalibrationScreen } from "./ui/calibrationScreen";
import { FaceMapScreen } from "./ui/faceMapScreen";
import { ResultsScreen } from "./ui/resultsScreen";
import { SettingsScreen } from "./ui/settingsScreen";
import { SetupScreen } from "./ui/setupScreen";
import { TalkScreen } from "./ui/talkScreen";
import { faceLogo, replayLogo } from "./ui/faceLogo";
import { Onboarding } from "./ui/onboarding";
import { renderProfileMenu } from "./ui/profileMenu";
import { clearLegacy, readLegacy } from "./storage/legacy";
import { ProfileDb, requestPersistence } from "./storage/profileDb";
import { DEFAULT_SETTINGS } from "./storage/settings";
import { GuestStore, ProfileStore, type AppStore } from "./storage/store";
import { CameraTracker, ReplayTracker, type DetectionListener, type FrameSource } from "./vision/tracker";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const video = $<HTMLVideoElement>("video");
const startBtn = $<HTMLButtonElement>("start");
const statusEl = $("status");
const faceEl = $("face-indicator");
const positionEl = $("position-check");
const lightingEl = $("lighting-check");
const perfEl = $("perf");
const replayLabel = $("replay-label");
const screenRoot = $("screen");
const navButtons = [...document.querySelectorAll<HTMLButtonElement>("nav [data-screen]")];
const onboardingRoot = $("onboarding");
const profileMenuHost = $("profile-menu");
const cameraPlaceholder = $("camera-placeholder");
const placeholderText = $("camera-placeholder-text");

// The logo in the header (static) and in the empty camera panel (animates while loading).
$("logo").replaceChildren(faceLogo({ size: 48, label: "Tessera logo" }));
const placeholderLogo = faceLogo({ size: 112 });
cameraPlaceholder.prepend(placeholderLogo);

/** MediaPipe's landmark index for the tip of the nose. */
const NOSE_TIP = 1;
const STATUS_INTERVAL_MS = 100;
/** No face for this long = the badge says "No face". */
const FACE_LOST_MS = 700;

const badge = $("tracking-badge");
const badgeText = badge.querySelector<HTMLElement>(".badge-text")!;
const themeSelect = $<HTMLSelectElement>("theme");
let activity: Activity | null = null;
let lastFaceSeen = 0;

// Every screen subscribes here; detections from the current source are forwarded.
const listeners = new Set<DetectionListener>();
let sourceUnsub: (() => void) | null = null;
let starting: Promise<boolean> | null = null;

/** Where this session's data lives. Starts as a guest (memory only) until onboarding decides. */
let store: AppStore = new GuestStore();
let db: ProfileDb | null = null;

function storageError(err: unknown): void {
  notify(
    `Couldn't save to this browser's storage (${err instanceof Error ? err.message : String(err)}). Changes may be lost when you close the page.`,
    true,
  );
}

const ctx: AppContext = {
  source: null,
  profile: null,
  settings: { ...DEFAULT_SETTINGS },
  lastCalibration: null,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  go: (name) => show(name),
  ensureCamera() {
    if (ctx.source) return Promise.resolve(true);
    return (starting ??= startCamera().finally(() => (starting = null)));
  },
  useReplay(trace: Trace) {
    const replay = new ReplayTracker(trace);
    setSource(replay);
    replay.start();
    replayLabel.hidden = false;
    startBtn.hidden = true;
    cameraPlaceholder.hidden = true;
    notify("Replaying a recording. The camera is not being used.");
  },
  setProfile(p) {
    ctx.profile = p;
    store.saveControl(p).catch(storageError);
  },
  setSettings(s) {
    ctx.settings = s;
    store.saveSettings(s).catch(storageError);
  },
  recordCalibration(result, durationMs, chosen) {
    store.addCalibration(result, durationMs, chosen).catch(storageError);
  },
  async deleteAllData() {
    db?.close();
    db = null;
    await ProfileDb.deleteEverything();
    clearLegacy();
    location.reload();
  },
  notify: (msg, isError) => notify(msg, isError),
  setActivity(a) {
    activity = a;
    updateBadge();
  },
};

function setSource(source: FrameSource): void {
  ctx.source?.stop();
  sourceUnsub?.();
  ctx.source = source;
  sourceUnsub = source.subscribe((det) => {
    for (const fn of listeners) fn(det);
  });
}

async function startCamera(): Promise<boolean> {
  startBtn.disabled = true;
  placeholderText.textContent = "Loading the face model…";
  replayLogo(placeholderLogo);
  try {
    const cam = new CameraTracker(video);
    await cam.start((msg) => notify(msg));
    setSource(cam);
    notify(`Camera running. Face model is using the ${cam.delegate}.`);
    startBtn.hidden = true;
    cameraPlaceholder.hidden = true;
    return true;
  } catch (err) {
    notify(err instanceof Error ? err.message : String(err), true);
    placeholderText.textContent = "Camera off";
    startBtn.disabled = false;
    return false;
  }
}

// ----- Tracking badge (always visible, required by the safety rules) ---------

/**
 * One word that's always true about the control state. Priority: no camera,
 * then no face (the most important safety signal), then paused, then
 * calibrating, then tracking. Each state also has its own dot shape (CSS), so
 * it never depends on color alone.
 */
function updateBadge(): void {
  let state: string;
  let text: string;
  if (!ctx.source) {
    state = "off";
    text = "Camera off";
  } else if (performance.now() - lastFaceSeen > FACE_LOST_MS) {
    state = "noface";
    text = "No face: control paused";
  } else if (activity === "paused") {
    state = "paused";
    text = "Paused";
  } else if (activity === "calibrating") {
    state = "calibrating";
    text = "Calibrating";
  } else {
    state = "tracking";
    text = ctx.source.kind === "replay" ? "Tracking (replay)" : "Tracking";
  }
  if (badge.dataset.state !== state) {
    badge.dataset.state = state;
    badgeText.textContent = text;
  }
}
setInterval(updateBadge, 250);

// ----- Theme ------------------------------------------------------------------

function applyTheme(theme: "auto" | "light" | "dark"): void {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  themeSelect.value = theme;
}
applyTheme(ctx.settings.theme);
themeSelect.addEventListener("change", () => {
  const theme = themeSelect.value as "auto" | "light" | "dark";
  ctx.setSettings({ ...ctx.settings, theme });
  applyTheme(theme);
});

function notify(msg: string, isError = false): void {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

// ----- Screens ---------------------------------------------------------------

let current: Screen | null = null;

function show(name: ScreenName): void {
  current?.unmount();
  screenRoot.replaceChildren();
  const make: Record<ScreenName, () => Screen> = {
    setup: () => new SetupScreen(ctx),
    calibrate: () => new CalibrationScreen(ctx),
    results: () => new ResultsScreen(ctx),
    talk: () => new TalkScreen(ctx),
    facemap: () => new FaceMapScreen(ctx),
    settings: () => new SettingsScreen(ctx),
  };
  current = make[name]();
  current.mount(screenRoot);
  const navName = name === "results" ? "calibrate" : name;
  for (const b of navButtons) {
    if (b.dataset.screen === navName) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  screenRoot.focus();
}

for (const b of navButtons) b.addEventListener("click", () => show(b.dataset.screen as ScreenName));
startBtn.addEventListener("click", () => void ctx.ensureCamera());

// ----- Camera panel status (face, position, lighting) ------------------------

let lastStatus = 0;
ctx.subscribe((det) => {
  if (det.frame.face) lastFaceSeen = performance.now();
  if (det.frame.t - lastStatus < STATUS_INTERVAL_MS) return;
  lastStatus = det.frame.t;
  setCheck(faceEl, det.frame.face, det.frame.face ? "Face detected" : "No face detected");
  if (det.landmarks) {
    const pos = checkPosition(faceBoxFromLandmarks(det.landmarks), det.landmarks[NOSE_TIP].x);
    setCheck(positionEl, pos.ok, pos.message);
  } else if (ctx.source?.kind === "replay") {
    setCheck(positionEl, true, "Position: not checked during replay");
  } else {
    setCheck(positionEl, false, "Position: waiting for a face");
  }
  const light = ctx.source?.lighting;
  if (light) setCheck(lightingEl, light.ok, light.message);
  else if (ctx.source?.kind === "replay") setCheck(lightingEl, true, "Lighting: not checked during replay");
  const src = ctx.source;
  if (src) {
    perfEl.textContent =
      src.kind === "camera"
        ? `${src.fps.toFixed(0)} frames/s · model ${src.inferMs.toFixed(1)} ms/frame`
        : `${src.fps.toFixed(0)} frames/s (replay)`;
  }
});

/** A setup check: a tick when it's fine, otherwise an arrow pointing to the next step (calm, not an alarm). */
function setCheck(el: HTMLElement, ok: boolean, msg: string): void {
  el.textContent = `${ok ? "✓" : "→"} ${msg}`;
  el.classList.toggle("ok", ok);
  el.classList.toggle("adjust", !ok);
}

// ----- Profiles, guest mode, onboarding ----------------------------------------

function useStore(next: AppStore): void {
  store = next;
  ctx.settings = next.settings;
  ctx.profile = next.control;
  applyTheme(next.settings.theme);
  renderMenu();
}

async function getDb(): Promise<ProfileDb> {
  if (db) return db;
  try {
    db = await ProfileDb.open();
    return db;
  } catch {
    throw new Error(
      "This browser can't save profiles right now (it may be in a private window, or site data may be blocked). You can still try Tessera as a guest.",
    );
  }
}

function renderMenu(): void {
  renderProfileMenu(profileMenuHost, { kind: store.kind, nickname: store.nickname }, {
    saveGuestToProfile: () => {
      document.body.classList.add("is-onboarding");
      onboarding.showNickname({ fromGuest: true });
    },
    leaveGuest: () => {
      if (confirm("Leave guest mode? This session will be erased (nothing was saved).")) location.reload();
    },
    switchProfile: async () => {
      await (await getDb()).setActiveId(null);
      location.reload();
    },
    deleteThisProfile: async () => {
      if (!(store instanceof ProfileStore)) return;
      if (!confirm(`Delete the profile “${store.nickname}” and all its saved results from this device? This can't be undone.`)) return;
      await (await getDb()).deleteProfile(store.id);
      location.reload();
    },
    deleteEverything: () => {
      if (confirm("Delete ALL Tessera profiles and settings from this browser? This can't be undone.")) void ctx.deleteAllData();
    },
  });
}

const onboarding = new Onboarding(onboardingRoot, {
  async listProfiles() {
    if (!(await ProfileDb.exists())) return []; // checking doesn't create a database
    return (await (await getDb()).listProfiles()).map((p) => ({ id: p.id, nickname: p.nickname }));
  },
  async continueAs(id) {
    const s = await ProfileStore.open(await getDb(), id);
    if (!s) {
      notify("That profile couldn't be opened.", true);
      return;
    }
    useStore(s);
    enterApp();
  },
  startGuest() {
    useStore(new GuestStore());
  },
  async createProfile(nickname) {
    const from = store instanceof GuestStore ? store : new GuestStore();
    // Carry over a setup saved by an older version of the app (localStorage), once.
    const legacy = readLegacy();
    if (legacy?.control && !from.control) from.control = legacy.control;
    if (legacy?.settings && from.sessions.length === 0) from.settings = { ...legacy.settings, theme: from.settings.theme };
    const created = await ProfileStore.create(await getDb(), nickname, from);
    if (legacy) clearLegacy();
    useStore(created);
    return requestPersistence();
  },
  ensureCamera: () => ctx.ensureCamera(),
  subscribe: (fn) => ctx.subscribe(fn),
  finish: () => enterApp(),
  cancel: () => {
    onboarding.leave();
    document.body.classList.remove("is-onboarding");
    show("setup");
  },
});

$("header-signup").addEventListener("click", () => onboarding.showNickname());

function enterApp(): void {
  onboarding.leave();
  document.body.classList.remove("is-onboarding");
  show(ctx.profile ? "talk" : "setup");
}

/**
 * On load: always open on the welcome (landing) page. If a profile was in use
 * last time, the page offers "Continue as <nickname>" first, and already uses
 * that profile's theme, so nothing changes color when they continue.
 */
async function boot(): Promise<void> {
  renderMenu();
  let lastId: string | null = null;
  try {
    if (await ProfileDb.exists()) {
      const d = await getDb();
      const active = await d.getActiveId();
      const rec = active ? await d.getProfile(active) : null;
      if (rec) {
        lastId = rec.id;
        applyTheme(rec.settings.theme);
      }
    }
  } catch {
    /* storage unavailable: the welcome page still offers guest mode */
  }
  document.body.classList.add("is-onboarding");
  await onboarding.showWelcome({ lastId });
}

void boot();
