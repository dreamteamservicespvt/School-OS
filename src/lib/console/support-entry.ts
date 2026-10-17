// A DREAM TEAM support person inside one school (07-super-admin.md §3.4, steps
// 4 to 6): the check made on every request from their browser, the school's
// Audit Log lines for what they look at, and how an allowed request ends.
//
// They never become a school login. Their browser holds a random token whose
// hash is on the allowed Support Access Request; each request checks that the
// request is still allowed and inside its time, that they are still an active
// DREAM TEAM person signed in to the console, and that the school is working.
// What they see goes through the school's own wall (withSchool) for that one
// school only. Kept small, because every school page loads it.
import "server-only";

import type { ConsoleRole, SupportAccessRequest } from "@prisma/client";
import { withConsole, withConsoleSchool, SUPPORT_LOGIN_ID, type SchoolContext, type Tx } from "../db";
import { writeAudit } from "../audit";
import { hashToken } from "../auth/tokens";
import { formatDate, formatTime } from "../format";
import { MODULES } from "../modules";
import { logActivity, SYSTEM_ACTOR, type ConsoleActor } from "./activity";
import { CONSOLE_IDLE_MS } from "./auth";
import { notifyTeam } from "./notify";
import { consoleCan } from "./roles";

export { SUPPORT_COOKIE } from "../support-paths";

export const SUPPORT_RECORD = "Support Access Request";

/** How long a school can allow (07-super-admin.md §3.4 step 1); the first is the default. */
export const SUPPORT_LENGTHS = [
  { minutes: 60, label: "1 hour" },
  { minutes: 240, label: "4 hours" },
  { minutes: 1440, label: "1 day" },
] as const;
export const lengthWords = (minutes: number) => SUPPORT_LENGTHS.find((l) => l.minutes === minutes)?.label ?? `${minutes} minutes`;

export const SUPPORT_STATUS_WORDS = { WAITING: "Waiting for the school", ALLOWED: "Allowed", DECLINED: "Declined", ENDED: "Ended", EXPIRED: "Expired" } as const;

/** A request the school has not answered expires after this long (inferred: 24 hours). */
export const SUPPORT_WAIT_MS = 24 * 60 * 60 * 1000;
export const EXPIRED_WORDS = "Expired: the school did not answer within 24 hours";
/** Has this waiting request waited too long? */
export const waitedTooLong = (r: Pick<SupportAccessRequest, "status" | "createdAt">, now = new Date()) => r.status === "WAITING" && now.getTime() - r.createdAt.getTime() >= SUPPORT_WAIT_MS;

export type EndHow = "time" | "school" | "support" | "withdrawn" | "paused";
export const ENDED_WORDS: Record<EndHow, string> = {
  time: "Ended at the time given",
  school: "Ended early by the school",
  support: "Ended early by DREAM TEAM",
  withdrawn: "Withdrawn by DREAM TEAM before the school answered",
  paused: "Ended because the school was paused",
};

/** Where the school's notification about a request opens: its own line in Approvals. */
export const supportLink = (requestId: string) => `/approvals?support=${requestId}`;

/** "3:40 PM", or "19-10-2026, 3:40 PM" when it ends on another day. */
export function endsWords(endsAt: Date, now = new Date(), timeZone = "Asia/Kolkata") {
  return formatDate(endsAt, timeZone) === formatDate(now, timeZone) ? formatTime(endsAt, timeZone) : `${formatDate(endsAt, timeZone)}, ${formatTime(endsAt, timeZone)}`;
}

export type SupportEntry = {
  requestId: string;
  schoolId: string;
  schoolName: string;
  consoleUserId: string;
  /** The DREAM TEAM person's name, as on their console login. */
  name: string;
  role: ConsoleRole;
  reason: string;
  endsAt: Date;
};

/** The school context a support person works in: no User Login, and their name on every Audit Log line. */
export function supportContext(e: Pick<SupportEntry, "schoolId" | "requestId" | "name">): SchoolContext & { userId: string } {
  return { schoolId: e.schoolId, userId: SUPPORT_LOGIN_ID, support: { requestId: e.requestId, name: e.name } };
}

const consoleActorOf = (e: Pick<SupportEntry, "consoleUserId" | "name" | "role">): ConsoleActor => ({ id: e.consoleUserId, name: e.name, role: e.role });

/**
 * The allowed request behind a support browser's token, or null. A request
 * past its time ends right here (step 5: access ends by itself at the time
 * given), as does one whose school was paused meanwhile.
 */
export async function findSupportEntry(token: string | null | undefined, now = new Date()): Promise<SupportEntry | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const found = await withConsole(async (tx) => {
    const r = await tx.supportAccessRequest.findUnique({ where: { entryTokenHash: hashToken(token) } });
    if (!r || r.status !== "ALLOWED" || !r.endsAt) return null;
    if (r.endsAt <= now) return { end: r, how: "time" as EndHow };
    const card = await tx.consoleSchool.findUnique({ where: { id: r.forSchoolId }, select: { name: true, status: true } });
    if (!card || (card.status !== "TRIAL" && card.status !== "ACTIVE")) return { end: r, how: "paused" as EndHow };
    const user = await tx.superAdminUser.findUnique({ where: { id: r.requestedById } });
    if (!user || user.status !== "ACTIVE" || user.archivedAt || !consoleCan(user.role, "support")) return null;
    // Signing out of the console (or being signed out after 30 idle minutes) ends the entry.
    const session = r.entrySessionId ? await tx.consoleSession.findUnique({ where: { id: r.entrySessionId } }) : null;
    if (!session || session.userId !== user.id || session.revokedAt || session.expiresAt <= now) return null;
    // Working inside the school counts as using the console.
    if (now.getTime() - session.lastUsedAt.getTime() > 60_000) {
      await tx.consoleSession.update({ where: { id: session.id }, data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + CONSOLE_IDLE_MS) } });
    }
    const entry: SupportEntry = { requestId: r.id, schoolId: r.forSchoolId, schoolName: card.name, consoleUserId: user.id, name: user.name, role: user.role, reason: r.reason, endsAt: r.endsAt };
    return { entry, end: null, how: "time" as EndHow };
  });
  if (!found) return null;
  if (found.end) {
    await endSupport(found.end.id, found.how, null, now).catch(() => null);
    return null;
  }
  return found.entry ?? null;
}

/** One page a support person opened, recently written: not written twice within a minute. */
const lastLook = new Map<string, number>();

/** Step 6: the page they opened, in the school's Audit Log ("DREAM TEAM support") and the console's Activity Log. */
export async function logSupportLook(e: SupportEntry, path: string, now = new Date()) {
  const page = path.split("?")[0].slice(0, 300) || "/";
  const key = `${e.requestId}:${page}`;
  const last = lastLook.get(key);
  if (last && now.getTime() - last < 60_000) return;
  if (lastLook.size > 5000) lastLook.clear();
  lastLook.set(key, now.getTime());
  await withConsoleSchool(e.schoolId, async (tx) => {
    await writeAudit(tx, supportContext(e), { action: "support looked", recordType: "Page", recordId: page, after: { request: e.requestId } });
    await logActivity(tx, consoleActorOf(e), { type: "support", school: { id: e.schoolId, name: e.schoolName }, text: `looked at ${page} in ${e.schoolName}, with the school’s support access.` });
  });
}

/** Something the support person tried that support access never allows: refused, and written down. */
export async function logSupportRefused(e: Pick<SupportEntry, "requestId" | "schoolId" | "name">, module: string, action: string) {
  const what = `${action} in ${MODULES.find((m) => m.key === module)?.name ?? module}`;
  const r = await withConsole((tx) => tx.supportAccessRequest.findUnique({ where: { id: e.requestId }, select: { requestedById: true, schoolName: true } }));
  const user = r ? await withConsole((tx) => tx.superAdminUser.findUnique({ where: { id: r.requestedById }, select: { id: true, name: true, role: true } })) : null;
  await withConsoleSchool(e.schoolId, async (tx) => {
    await writeAudit(tx, supportContext(e), { action: "support refused", recordType: SUPPORT_RECORD, recordId: e.requestId, after: { tried: what } });
    if (user) await logActivity(tx, { id: user.id, name: user.name, role: user.role }, { type: "support", school: { id: e.schoolId, name: r?.schoolName ?? "" }, text: `was refused inside ${r?.schoolName ?? "the school"}: ${what}. Support access is for looking only.` });
  });
}

export type EndBy = {
  /** The school context the Audit Log line is written in: the school person, or the support person. */
  ctx: SchoolContext;
  /** For a line written by DREAM TEAM from the console. */
  actorNote?: string | null;
  /** Who it was, for the Activity Log and the "ended by" words. */
  actor: ConsoleActor;
};

/**
 * Ends an allowed request (or withdraws one still waiting), once. Its entry
 * token stops working at once. Written in the school's Audit Log and the
 * console's Activity Log; the person who asked is told when someone else ended it.
 */
export async function endSupport(requestId: string, how: EndHow, by: EndBy | null, now = new Date()) {
  const r = await withConsole((tx) => tx.supportAccessRequest.findUnique({ where: { id: requestId } }));
  if (!r) return false;
  return withConsoleSchool(r.forSchoolId, (tx) => endIn(tx, r, how, by, now));
}

export async function endIn(tx: Tx, r: SupportAccessRequest, how: EndHow, by: EndBy | null, now: Date) {
  const from = how === "withdrawn" ? "WAITING" : "ALLOWED";
  const actor = by?.actor ?? SYSTEM_ACTOR;
  const changed = await tx.supportAccessRequest.updateMany({
    where: { id: r.id, status: from },
    data: { status: "ENDED", endedAt: now, endedHow: how, endedByName: by ? actor.name : "School OS (automatic)", entryTokenHash: null, entryTicketHash: null, entryTicketExpiresAt: null },
  });
  if (changed.count === 0) return false;
  // The school's notifications about this request are done (00-global.md §4, rule 5).
  await tx.notification.updateMany({ where: { link: supportLink(r.id), doneAt: null }, data: { doneAt: now } });
  await writeAudit(tx, by?.ctx ?? { schoolId: r.forSchoolId, userId: null }, {
    action: how === "withdrawn" ? "support access withdrawn" : "support access ended",
    recordType: SUPPORT_RECORD,
    recordId: r.id,
    before: { status: from },
    after: { status: "ENDED", how: ENDED_WORDS[how] },
    actorNote: by ? by.actorNote ?? null : "School OS (automatic)",
  });
  const school = { id: r.forSchoolId, name: r.schoolName };
  const text = {
    time: `Support access for ${r.requestedByName} to ${r.schoolName} ended at the time given.`,
    paused: `Support access for ${r.requestedByName} to ${r.schoolName} ended because the school was paused.`,
    school: `ended support access for ${r.requestedByName} to ${r.schoolName} early.`,
    support: `ended their support access to ${r.schoolName} early.`,
    withdrawn: `withdrew the support access request to ${r.schoolName}.`,
  }[how];
  await logActivity(tx, actor, { type: "support", school, text, from: from === "WAITING" ? "Waiting" : "Allowed", to: "Ended" });
  if (actor.id !== r.requestedById) {
    await notifyTeam(tx, { roles: [], alsoUserId: r.requestedById, text: how === "school" ? `${r.schoolName} ended your support access early.` : `Your support access to ${r.schoolName} has ended.`, link: "/console/support", tone: "info" });
  }
  return true;
}

/**
 * A request still waiting after 24 hours expires, once: it can no longer be
 * allowed, the school's notifications about it are done, and the person who
 * asked is told, so they can ask again.
 */
export async function expireIn(tx: Tx, r: SupportAccessRequest, now: Date) {
  const changed = await tx.supportAccessRequest.updateMany({
    where: { id: r.id, status: "WAITING" },
    data: { status: "EXPIRED", endedAt: now, endedByName: "School OS (automatic)" },
  });
  if (changed.count === 0) return false;
  await tx.notification.updateMany({ where: { link: supportLink(r.id), doneAt: null }, data: { doneAt: now } });
  await writeAudit(tx, { schoolId: r.forSchoolId, userId: null }, {
    action: "support access expired",
    recordType: SUPPORT_RECORD,
    recordId: r.id,
    before: { status: "WAITING" },
    after: { status: "EXPIRED", how: EXPIRED_WORDS, for: r.requestedByName },
    actorNote: "School OS (automatic)",
  });
  await logActivity(tx, SYSTEM_ACTOR, { type: "support", school: { id: r.forSchoolId, name: r.schoolName }, text: `${r.requestedByName}’s support access request to ${r.schoolName} expired: the school did not answer within 24 hours.`, from: "Waiting", to: "Expired" });
  await notifyTeam(tx, { roles: [], alsoUserId: r.requestedById, text: `Your support access request to ${r.schoolName} expired: the school did not answer within 24 hours. Ask again if you still need to help.`, link: "/console/support", tone: "warn" });
  return true;
}

/** Expires one waiting request, if it has waited 24 hours. */
export async function expireIfWaitedTooLong(requestId: string, now = new Date()) {
  const r = await withConsole((tx) => tx.supportAccessRequest.findUnique({ where: { id: requestId } }));
  if (!r || !waitedTooLong(r, now)) return false;
  return withConsoleSchool(r.forSchoolId, (tx) => expireIn(tx, r, now));
}

/**
 * Allowed requests past their time end by themselves, and requests the school
 * has not answered within 24 hours expire (run by the job tick and the worker,
 * as well as on the next request).
 */
export async function endExpiredSupport(now = new Date()) {
  const [due, stale] = await withConsole((tx) => Promise.all([
    tx.supportAccessRequest.findMany({ where: { status: "ALLOWED", endsAt: { lte: now } }, select: { id: true } }),
    tx.supportAccessRequest.findMany({ where: { status: "WAITING", createdAt: { lte: new Date(now.getTime() - SUPPORT_WAIT_MS) } }, select: { id: true } }),
  ]));
  let ended = 0;
  for (const d of due) {
    try {
      if (await endSupport(d.id, "time", null, now)) ended++;
    } catch (e) {
      console.error(JSON.stringify({ level: "error", event: "support-end", request: d.id, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  for (const d of stale) {
    try {
      if (await expireIfWaitedTooLong(d.id, now)) ended++;
    } catch (e) {
      console.error(JSON.stringify({ level: "error", event: "support-expire", request: d.id, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  return ended;
}

/** The support person ends it themselves, from the coloured bar ("End now"). */
export async function endSupportByToken(token: string | null | undefined, now = new Date()) {
  const e = await findSupportEntry(token, now);
  if (!e) return null;
  await endSupport(e.requestId, "support", { ctx: supportContext(e), actor: consoleActorOf(e) }, now);
  return e;
}
