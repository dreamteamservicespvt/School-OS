// Timed work for Fee Management (A7, A8): late fees after the grace period,
// scheduled reminders, advance used on rows that fall due, expired payment
// links, and reminders scheduled for later. All safe to run twice.
// Imported by src/lib/job-registry.ts.
import "server-only";

import type { Tx } from "../db";
import { defineJob, defineSchedule } from "../jobs";
import { todayIn } from "../staff/dates";
import { addLateFees } from "./late-fees";
import { automaticReminders, sendReminders } from "./reminders";
import { applyAdvance } from "./collect";
import { expireLinks } from "./online";
import "./import";

async function schoolToday(tx: Tx, schoolId: string, now: Date) {
  const s = await tx.school.findUnique({ where: { id: schoolId }, select: { timeZone: true } });
  return todayIn(s?.timeZone ?? "Asia/Kolkata", now);
}

/** The address links in messages point to. Set APP_URL in production. */
export function messageOrigin() {
  return process.env.APP_URL?.replace(/\/+$/, "") ?? "";
}

// Late fees first, then reminders, so a reminder shows the late fee too.
defineSchedule("fee-late-fees", 6 * 60, async (tx, ctx, now) => {
  await addLateFees(tx, ctx, await schoolToday(tx, ctx.schoolId, now));
});

defineSchedule("fee-reminders", 6 * 60, async (tx, ctx, now) => {
  const origin = messageOrigin();
  await automaticReminders(tx, ctx, await schoolToday(tx, ctx.schoolId, now), origin);
});

defineSchedule("fee-advance", 24 * 60, async (tx, ctx, now) => {
  const today = await schoolToday(tx, ctx.schoolId, now);
  const holders = await tx.payment.findMany({ where: { status: "POSTED", advancePaise: { gt: 0 } }, select: { studentId: true }, distinct: ["studentId"] });
  for (const h of holders) await applyAdvance(tx, ctx, h.studentId, today);
});

defineSchedule("fee-expire-links", 60, async (tx, ctx, now) => {
  await expireLinks(tx, ctx, now);
});

/** Reminders a person chose to send later ("Send at"). */
defineJob("fee-reminders-send", "Fee reminders", async (tx, ctx, payload, job) => {
  const p = payload as { studentIds: string[]; channel: string; template: string; includeLink: boolean; origin: string };
  const result = await sendReminders(tx, { ...ctx, userId: job.requestedById }, p);
  return { sent: result.sent, skippedOptedOut: result.skippedOptedOut, skippedNoPhone: result.skippedNoPhone };
});
