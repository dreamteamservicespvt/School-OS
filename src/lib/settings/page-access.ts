// Which Settings pages a person works on and which they only read
// (src/lib/duty.ts, prototype config.js DUTY): the Principal reads School
// Profile, Users & Permissions, Document Designs and Modules On/Off (the
// School Admin changes them) and keeps Forms & Approvals. A page the person
// only reads shows its settings as text or disabled fields with no save
// buttons, and the server refuses any change from them, whatever their
// role's Settings level.
//
// Pages duty.ts hides (the Principal's Payment Gateways, message channels and
// Data Backup & Security) only leave the Settings tabs, as everywhere else in
// duty.ts: links from setup steps and alerts still lead there, and in a
// paused school the Principal downloads the school's data from there.
import "server-only";

import { redirect } from "next/navigation";
import { requireAction, requirePage, type Current } from "../current";
import { pageMode, type PageMode } from "../duty";
import { can, PermissionDeniedError, type Action } from "../permissions";
import { SETTINGS_PAGES } from "../settings-pages";

export type SettingsPageKey = "school-profile" | "users" | "payment-gateways" | "messaging" | "document-designs" | "forms-approvals" | "modules" | "data-security";

type Person = Pick<Current, "roles" | "permissions">;

const label = (page: SettingsPageKey) => SETTINGS_PAGES.find((p) => p.href === `/settings/${page}`)?.label ?? "This page";

/** How this person uses one Settings page: does the work, reads it, or (out of the tabs) never uses it. */
export function settingsMode(person: Person, page: SettingsPageKey): PageMode {
  return pageMode(person, "settings", page);
}

/** What the person may do on the page: the role's Settings level, narrowed by the page mode. */
export function settingsMay(person: Person, page: SettingsPageKey) {
  const full = settingsMode(person, page) !== "view";
  const c = (a: Action) => can(person.permissions, "settings", a);
  const edit = full && c("edit");
  return { edit, create: full && c("create"), archive: full && c("archive"), export: c("export"), readOnly: !edit };
}

/** Reading (and exporting) is all a read-only page allows. */
const READS: readonly Action[] = ["view", "export", "print"];

/** Why the person may not do this on the page, in plain words, or null when they may. */
export function settingsRefusal(person: Person, page: SettingsPageKey, action: Action): string | null {
  if (settingsMode(person, page) === "view" && !READS.includes(action)) return `You can read ${label(page)} but not change it. The School Admin makes changes here.`;
  return null;
}

/** Refused because of the page, not the module: carries the plain words above. */
export class SettingsPageRefused extends PermissionDeniedError {
  constructor(message: string) {
    super("settings");
    this.message = message;
    this.name = "SettingsPageRefused";
  }
}

/** For server actions: the module permission, then the page. Throws PermissionDeniedError (or SettingsPageRefused). */
export async function requireSettingsAction(page: SettingsPageKey, action: Action) {
  const r = await requireAction("settings", action);
  const why = settingsRefusal(r.current, page, action);
  if (why) throw new SettingsPageRefused(why);
  return r;
}

/**
 * For pages: the signed-in person and what they may do. A page for making
 * something (Invite a user, Create a role) on a page they only read goes back
 * to the page itself.
 */
export async function requireSettingsPage(page: SettingsPageKey, action: Action = "view") {
  const current = await requirePage("settings", action);
  const mode = settingsMode(current, page);
  if (mode === "view" && !READS.includes(action)) redirect(`/settings/${page}`);
  return { current, mode, may: settingsMay(current, page) };
}
