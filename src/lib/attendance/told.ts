// Take Attendance, after saving: one line of proof, "Saved · 2 parents told"
// (adopt item 3, docs/research/inkwelly-2026-11-15.md). Only parents a
// message really reached count as told: a message still with the provider is
// waiting, Test mode is not told, and a refused one is not told. When nobody
// can be told, the line says why ("not told: messages off"). Read only.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { ruleReady } from "../messaging/automatic";

export type ToldCount = { told: number; waiting: number; notTold: number; test: number };

const REACHED = new Set(["SENT", "DELIVERED", "READ"]);
const ON_ITS_WAY = new Set(["QUEUED", "SENDING"]);

/** Parents of this section's students told about the day's absent or late marks, counted once each. */
export async function parentsTold(tx: Tx, date: Date, sectionId: string): Promise<ToldCount> {
  const out: ToldCount = { told: 0, waiting: 0, notTold: 0, test: 0 };
  const marked = await tx.attendanceMark.findMany({ where: { sectionId, date, archivedAt: null, studentId: { not: null } }, select: { studentId: true }, distinct: ["studentId"] });
  if (!marked.length) return out;
  const alerts = await tx.attendanceAlert.findMany({
    where: { date, kind: { in: ["absence", "late"] }, studentId: { in: marked.map((m) => m.studentId!) } },
    select: { studentId: true, guardianId: true, status: true, messageRef: true },
  });
  const refs = alerts.map((a) => a.messageRef).filter((x): x is string => Boolean(x));
  const recipients = refs.length
    ? await tx.messageRecipient.findMany({ where: { messageId: { in: refs }, recipientType: "guardian" }, select: { messageId: true, guardianId: true, studentId: true, status: true, provider: true } })
    : [];
  // One state per parent: told wins over waiting, waiting over Test mode, Test mode over not told.
  const RANK = { told: 3, waiting: 2, test: 1, notTold: 0 } as const;
  type State = keyof typeof RANK;
  const best = new Map<string, State>();
  const put = (who: string, s: State) => { const was = best.get(who); if (!was || RANK[s] > RANK[was]) best.set(who, s); };
  for (const a of alerts) {
    if (a.status === "waiting") { put(a.guardianId ?? `student:${a.studentId}`, "waiting"); continue; }
    if (a.status !== "sent") { put(a.guardianId ?? `student:${a.studentId}`, "notTold"); continue; }
    // "Already sent for this day": the first message of the day carried it.
    if (!a.messageRef) { put(a.guardianId ?? `student:${a.studentId}`, "told"); continue; }
    const mine = recipients.filter((r) => r.messageId === a.messageRef && (!r.studentId || r.studentId === a.studentId));
    if (!mine.length) { put(a.guardianId ?? `student:${a.studentId}`, "waiting"); continue; }
    for (const r of mine) {
      const who = r.guardianId ?? a.guardianId ?? `student:${a.studentId}`;
      put(who, r.provider === "sandbox" && r.status !== "FAILED" ? "test" : REACHED.has(r.status) ? "told" : ON_ITS_WAY.has(r.status) ? "waiting" : "notTold");
    }
  }
  for (const s of best.values()) out[s] += 1;
  return out;
}

/** Why parents cannot be told today, or null when messages can go. */
export type NotToldWhy = "messages-off" | "no-channel" | "not-live" | null;

export async function whyNotTold(tx: Tx, ctx: SchoolContext, settings: { absenceAlertOn: boolean }): Promise<NotToldWhy> {
  if (!settings.absenceAlertOn) return "messages-off";
  const r = await ruleReady(tx, ctx, "absence");
  if (!r.on) return "messages-off";
  if (r.held) return "not-live";
  return r.ready ? null : "no-channel";
}

const parents = (n: number) => (n === 1 ? "1 parent" : `${n} parents`);

/**
 * The words after "Saved": "2 parents told", "2 parents told, 1 waiting",
 * "not told: messages off", "parents told at 9:19 AM" (the absence wait),
 * or null when nobody was absent or late and no message was due.
 */
export function toldLine(c: ToldCount, f: { absent: number; why: NotToldWhy; sendAtText: string | null }): string | null {
  const rest = [c.waiting ? `${c.waiting} waiting` : null, c.test ? `${c.test} not told (Test mode)` : null, c.notTold ? `${c.notTold} not told` : null].filter(Boolean);
  if (c.told) return [`${parents(c.told)} told`, ...rest].join(", ");
  if (!c.waiting && !c.test && !c.notTold) {
    if (!f.absent) return null;
    if (f.why === "messages-off") return "not told: messages off";
    if (f.why === "no-channel") return "not told: no message channel is connected";
    if (f.why === "not-live") return "not told: messages start when the school goes live";
    return f.sendAtText ? `parents are told at ${f.sendAtText}` : "parents not told yet";
  }
  if (c.waiting) return [`${parents(c.waiting)} waiting to be told`, c.test ? `${c.test} not told (Test mode)` : null, c.notTold ? `${c.notTold} not told` : null].filter(Boolean).join(", ");
  if (c.test) return [`${parents(c.test)} not told: Test mode`, c.notTold ? `${c.notTold} not told` : null].filter(Boolean).join(", ");
  return `${parents(c.notTold)} not told`;
}
