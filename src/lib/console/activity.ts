// The console's Activity Log (07-super-admin.md §3.7): one line for every
// action anyone in the console takes, written in the same transaction as the
// change. The database refuses to change or delete a line once written.
import type { ConsoleRole, Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { roleLabel } from "./roles";

/**
 * Who did it: a DREAM TEAM person, or the software itself. A school's own
 * person answering DREAM TEAM (a Support Access Request) is named the same
 * way as the software: no console id, their name and school in words.
 */
export type ConsoleActor = { id: string; name: string; role: ConsoleRole; ipAddress?: string | null } | { id: null; name: string; role: null; ipAddress?: null };

export const SYSTEM_ACTOR: ConsoleActor = { id: null, name: "School OS", role: null };

export const ACTIVITY_TYPES = {
  school: "School added",
  invite: "Invite",
  login: "Admin login",
  status: "Status",
  billing: "Billing",
  note: "Note",
  team: "Team",
  details: "Details",
  signin: "Console sign-in",
  support: "Support access",
  export: "Export",
  system: "System",
} as const;
export type ActivityType = keyof typeof ACTIVITY_TYPES;

export type ActivityInput = {
  type: ActivityType;
  text: string;
  school?: { id: string; name: string } | null;
  from?: string | null;
  to?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
};

export async function logActivity(tx: Tx, actor: ConsoleActor, entry: ActivityInput) {
  return tx.consoleActivityEntry.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role ? roleLabel(actor.role) : null,
      type: entry.type,
      text: entry.text,
      forSchoolId: entry.school?.id ?? null,
      schoolName: entry.school?.name ?? null,
      fromValue: entry.from ?? null,
      toValue: entry.to ?? null,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      ipAddress: actor.ipAddress ?? null,
    },
  });
}

/** "Ravi (Onboarding)" for a line's text. */
export function actorWords(actor: ConsoleActor) {
  return actor.role ? `${actor.name.split(" ")[0]} (${roleLabel(actor.role)})` : actor.name;
}

/** "98xxx xx123": a mobile number as the Activity Log and messages show it. */
export function maskMobile(phone: string | null | undefined) {
  const d = String(phone ?? "").replace(/\D/g, "").slice(-10);
  if (d.length < 10) return d ? `xx${d.slice(-3)}` : "";
  return `${d.slice(0, 2)}xxx xx${d.slice(-3)}`;
}

/** "+91 98480 31123" from any typed Indian mobile, or null. */
export function tenDigits(phone: string | null | undefined): string | null {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export const showMobile = (d: string) => `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
