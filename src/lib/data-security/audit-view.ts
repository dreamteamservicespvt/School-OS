// Reading the audit log (Settings, Data Backup & Security): who changed what,
// when, from which device, with before and after values. The same filters
// drive the screen and the export, and a person whose reach is "own" sees
// only their own entries (00-global.md P14).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Reach } from "../permissions";

export type AuditFilters = {
  person?: string;
  recordType?: string;
  action?: string;
  record?: string;
  from?: string;
  to?: string;
  q?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Turns a date typed as YYYY-MM-DD in the school's time zone into the start of that day. */
export function dayStart(day: string, timeZone = "Asia/Kolkata"): Date {
  const utc = new Date(`${day}T00:00:00Z`);
  const local = new Date(utc.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(utc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utc.getTime() - (local.getTime() - asUtc.getTime()));
}

export function auditWhere(f: AuditFilters, reach: Reach, me: string, timeZone: string, extra: Prisma.AuditLogEntryWhereInput = {}): Prisma.AuditLogEntryWhereInput {
  if (reach === "none") return { id: "00000000-0000-0000-0000-000000000000" };
  const and: Prisma.AuditLogEntryWhereInput[] = [extra];
  if (reach === "own") and.push({ userLoginId: me });
  if (f.person === "system") and.push({ userLoginId: null });
  else if (f.person && UUID.test(f.person)) and.push({ userLoginId: f.person });
  if (f.recordType) and.push({ recordType: f.recordType });
  if (f.action) and.push({ action: f.action });
  if (f.record && f.record.length <= 100) and.push({ recordId: f.record });
  if (f.from && DAY.test(f.from)) and.push({ at: { gte: dayStart(f.from, timeZone) } });
  if (f.to && DAY.test(f.to)) and.push({ at: { lt: new Date(dayStart(f.to, timeZone).getTime() + 86_400_000) } });
  if (f.q) and.push({ OR: [{ recordType: { contains: f.q, mode: "insensitive" } }, { action: { contains: f.q, mode: "insensitive" } }, { actorNote: { contains: f.q, mode: "insensitive" } }, { recordId: f.q }] });
  return { AND: and };
}

const WORDS: Record<string, string> = {
  created: "Added",
  changed: "Changed",
  archived: "Archived",
  restored: "Restored",
  imported: "Imported",
  "import-undone": "Import undone",
  exported: "Exported",
  "signed-in": "Signed in",
  "signed-in-new-device": "Signed in on a new device",
  "sign-in-failed": "Wrong password",
  "locked-after-wrong-passwords": "Locked after wrong passwords",
  "two-step-code-sent": "One-time code sent",
  "two-step-failed": "Wrong one-time code",
  "two-step-locked": "Too many wrong codes",
  "two-step-passed": "One-time code accepted",
  "signed-out": "Signed out",
  "signed-out-everywhere": "Signed out everywhere",
  "signed-out-device": "Signed out a device",
  "changed-password": "Changed password",
  "asked-approval": "Asked for approval",
  "approval-approve": "Approved",
  "approval-reject": "Not approved",
  "approval-ask-change": "Sent back for a change",
  "approval-withdraw": "Withdrew a request",
  "approval-escalated": "Moved to the next approver",
  tested: "Tested",
  "switched-on": "Switched on",
  "switched-off": "Switched off",
  "webhook-received": "Gateway confirmation received",
  "webhook-refused": "Gateway confirmation refused",
  "data-export-requested": "Asked for a full data export",
  "data-export-ready": "Full data export ready",
  "data-export-downloaded": "Downloaded the full data export",
  "person-exported": "Exported one person's data",
  "deletion-requested": "Asked to delete a person's data",
  "deletion-completed": "Removed a person's data",
  "deletion-rejected": "Deletion request not approved",
  "consent-text-saved": "Saved a consent text version",
  "retention-changed": "Changed how long records are kept",
  "feature-switched": "Switched a feature",
};

export function actionWords(action: string): string {
  if (WORDS[action]) return WORDS[action];
  if (action.startsWith("restored-version-")) return `Used version ${action.slice(17)} again`;
  const s = action.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type DiffRow = { field: string; before: string; after: string; changed: boolean };

function text(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Before and after values side by side, changed fields first. */
export function diff(before: unknown, after: unknown): DiffRow[] {
  const b = before && typeof before === "object" && !Array.isArray(before) ? (before as Record<string, unknown>) : before === null || before === undefined ? {} : { value: before };
  const a = after && typeof after === "object" && !Array.isArray(after) ? (after as Record<string, unknown>) : after === null || after === undefined ? {} : { value: after };
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const rows = keys.map((k) => ({ field: k, before: text(b[k]), after: text(a[k]), changed: text(b[k]) !== text(a[k]) }));
  return [...rows.filter((r) => r.changed), ...rows.filter((r) => !r.changed)];
}

/** "Chrome on Android phone", from a browser's user agent. */
export function describeDevice(userAgent: string | null | undefined) {
  if (!userAgent) return "Unknown device";
  const os = /Android/.test(userAgent) ? "Android phone" : /iPhone|iPad/.test(userAgent) ? "iPhone or iPad" : /Windows/.test(userAgent) ? "Windows computer" : /Mac OS/.test(userAgent) ? "Mac" : /Linux/.test(userAgent) ? "Linux computer" : "device";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : null;
  return browser ? `${browser} on ${os}` : userAgent.slice(0, 60);
}

export const LOGIN_ACTIONS = ["signed-in", "signed-in-new-device", "sign-in-failed", "locked-after-wrong-passwords", "two-step-failed", "two-step-locked", "two-step-passed", "signed-out", "signed-out-everywhere"];
export const FAILED_LOGIN_ACTIONS = ["sign-in-failed", "locked-after-wrong-passwords", "two-step-failed", "two-step-locked"];
/** The audit filters from a page address. */
export function readAuditFilters(sp: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (k: string) => {
    const v = sp[k];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim().slice(0, 100) || undefined;
  };
  return { person: one("person"), recordType: one("recordType"), action: one("action"), record: one("record"), from: one("from"), to: one("to"), q: one("q") };
}

/** The filters in words, for the top of an exported file. */
export function filterWords(f: AuditFilters, names: Map<string, string>) {
  return [
    f.person ? `Person: ${f.person === "system" ? "School OS" : names.get(f.person) ?? f.person}` : "",
    f.recordType ? `Record type: ${f.recordType}` : "",
    f.action ? `Action: ${actionWords(f.action)}` : "",
    f.record ? `Record: ${f.record}` : "",
    f.from ? `From ${f.from}` : "",
    f.to ? `To ${f.to}` : "",
    f.q ? `Search: ${f.q}` : "",
  ].filter(Boolean).join("; ");
}

export const EXPORT_ACTIONS =["exported", "data-export-requested", "data-export-downloaded", "person-exported"];
