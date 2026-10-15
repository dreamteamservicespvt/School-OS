// Messages from the hostel (15 §4 Sends, 11 Communication): parents hear
// when their child goes out and comes back, when they are late, and about an
// incident when the warden ticks "Tell the parent" (each switched on or off in
// Hostel Settings). Parents get them through Communication: WhatsApp or SMS
// where set up, else the Parent Link app. Staff alerts (night roll call
// absences, late returns) go to the hostel's wardens and the Principal in the
// app, at once.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { notify } from "../notifications";
import { MessagingProblem, sendMessage } from "../messaging";
import { wardenLogins } from "./settings";
import { BASE } from "./words";

export type SendOutcome = { status: "sent" | "skipped"; how: string; note?: string };

/** One message to a student's parents, at most once for the same key. */
export async function messageParents(tx: Tx, ctx: SchoolContext, student: { id: string; name: string }, text: string, opts: { trigger: string; key: string; source: { type: string; id: string } }): Promise<SendOutcome> {
  const base = { to: { guardiansOf: [student.id] }, text, trigger: opts.trigger, source: opts.source, audienceLabel: `Parents of ${student.name}`, onNoCredits: "fail" as const };
  try {
    const r = await sendMessage(tx, ctx, { ...base, channels: "preferred", idempotencyKey: `hostel:${opts.key}` });
    return r.queued > 0 ? { status: "sent", how: "to the parents" } : { status: "skipped", how: "message", note: "No parent with a phone number" };
  } catch (e) {
    if (!(e instanceof MessagingProblem)) throw e;
    try {
      const r = await sendMessage(tx, ctx, { ...base, channels: ["app"], idempotencyKey: `hostel:${opts.key}:app` });
      return r.queued > 0 ? { status: "sent", how: "to the parents in the app" } : { status: "skipped", how: "app", note: "No parent uses the app" };
    } catch (e2) {
      if (e2 instanceof MessagingProblem) return { status: "skipped", how: "message", note: e2.message.replace(/\.$/, "") };
      throw e2;
    }
  }
}

/** The Principal's logins (alerts that go to the Principal too). */
export async function principalLogins(tx: Tx, ctx: SchoolContext) {
  const rows = await tx.schoolAccess.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, roles: { some: { role: { key: "principal", isEnabled: true } } } }, select: { userLoginId: true } });
  return rows.map((r) => r.userLoginId);
}

/** Tells a hostel's wardens (and the Principal, when asked) in the app, at once. */
export async function alertStaff(tx: Tx, ctx: SchoolContext, hostelId: string, alert: { text: string; link: string; groupKey: string; principal: boolean }) {
  const people = new Set(await wardenLogins(tx, hostelId));
  if (alert.principal) for (const p of await principalLogins(tx, ctx)) people.add(p);
  for (const to of people) {
    await notify(tx, ctx, { to, type: "hostel", text: alert.text, link: alert.link, groupKey: alert.groupKey });
  }
  return people.size;
}

export const rollCallLink = (hostelId: string, date: string, session: string) => `${BASE}?hostel=${hostelId}&date=${date}&session=${session.toLowerCase()}`;
