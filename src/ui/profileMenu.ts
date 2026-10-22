/**
 * The small profile control in the header.
 *   Guest:   "Save to a profile on this device", "Leave guest mode"
 *   Profile: "Switch profile", "Delete this profile", "Delete all Tessera data"
 * History charts and backup export/import are planned (see PLAN.md, step P).
 */
import { h } from "./dom";

export interface ProfileMenuActions {
  saveGuestToProfile(): void;
  leaveGuest(): void;
  switchProfile(): void;
  deleteThisProfile(): void;
  deleteEverything(): void;
}

export function renderProfileMenu(
  host: HTMLElement,
  state: { kind: "guest" | "profile"; nickname: string },
  actions: ProfileMenuActions,
): void {
  const isGuest = state.kind === "guest";
  const item = (label: string, onclick: () => void, danger = false) =>
    h("button", { class: `menu-item${danger ? " danger" : ""}`, onclick: () => (close(), onclick()) }, label);
  const details = h(
    "details",
    { class: "profile-menu" },
    h(
      "summary",
      { "aria-label": `Profile: ${state.nickname}. Open profile menu` },
      h("span", { class: "avatar", "aria-hidden": "true" }, state.nickname.slice(0, 1).toUpperCase()),
      h("span", { class: "profile-name" }, state.nickname),
    ),
    h(
      "div",
      { class: "menu" },
      h(
        "p",
        { class: "menu-note" },
        isGuest
          ? "You're a guest. Nothing is saved: closing or reloading the page erases this session."
          : "Saved only in this browser on this device. Clearing browsing data erases it.",
      ),
      isGuest
        ? [
            item("Save to a profile on this device…", actions.saveGuestToProfile),
            item("Leave guest mode", actions.leaveGuest, true),
          ]
        : [
            item("Switch profile", actions.switchProfile),
            item("Delete this profile…", actions.deleteThisProfile, true),
            item("Delete all Tessera data on this device…", actions.deleteEverything, true),
          ],
    ),
  );
  function close() {
    details.open = false;
  }
  host.replaceChildren(details);
}
