// Timed work for Fee Management (A7, A8): late fees after the grace period,
// scheduled reminders, advance used on rows that fall due, expired payment
// links, Promises to Pay kept or broken. Reminders a person schedules for later are
// held by Communication (scheduledAt). All safe to run twice.
// Imported by src/lib/job-registry.ts.
import "server-only";

import type { Tx } from "../db";
import { defineSchedule } from "../jobs";
import { todayIn } from "../staff/dates";
import { addLateFees } from "./late-fees";
import { automaticReminders } from "./reminders";
import { settlePromises } from "./promises";
import { applyAdvance } from "./collect";
import { expireLinks } from "./online";
import "./import";

async function schoolToday(tx: Tx, schoolId: string, now: Date) {
  const s = await tx.school.findUnique({ where: { id: schoolId }, select: { timeZone: true } });
  return todayIn(s?.timeZone ?? "Asia/Kolkata", now);
}

// Late fees first, then reminders, so a reminder shows the late fee too.
defineSchedule("fee-late-fees", 6 * 60, async (tx, ctx, now) => {
  await addLateFees(tx, ctx, await schoolToday(tx, ctx.schoolId, now));
});

// Promises to Pay whose date has passed are marked first, so a broken one gets its reminders again.
defineSchedule("fee-reminders", 6 * 60, async (tx, ctx, now) => {
  const today = await schoolToday(tx, ctx.schoolId, now);
  await settlePromises(tx, ctx, today);
  await automaticReminders(tx, ctx, today);
});

defineSchedule("fee-advance", 24 * 60, async (tx, ctx, now) => {
  const today = await schoolToday(tx, ctx.schoolId, now);
  const holders = await tx.payment.findMany({ where: { status: "POSTED", advancePaise: { gt: 0 } }, select: { studentId: true }, distinct: ["studentId"] });
  for (const h of holders) await applyAdvance(tx, ctx, h.studentId, today);
});

defineSchedule("fee-expire-links", 60, async (tx, ctx, now) => {
  await expireLinks(tx, ctx, now);
});
