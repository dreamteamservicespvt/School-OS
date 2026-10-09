// Timed work for Staff & HR: document expiry reminders (A15) and closing the
// login of staff on their last working day. Both are safe to run twice.
// Imported by src/lib/job-registry.ts.
import "server-only";

import type { Tx } from "../db";
import { defineSchedule } from "../jobs";
import { sendExpiryReminders } from "./documents";
import { closeLoginsOnLastDay } from "./exit";
import { todayIn } from "./dates";
import "./import";

async function schoolToday(tx: Tx, schoolId: string, now: Date) {
  const s = await tx.school.findUnique({ where: { id: schoolId }, select: { timeZone: true } });
  return todayIn(s?.timeZone ?? "Asia/Kolkata", now);
}

defineSchedule("staff-document-expiry", 6 * 60, async (tx, ctx, now) => sendExpiryReminders(tx, ctx, await schoolToday(tx, ctx.schoolId, now)));
defineSchedule("staff-exit-last-day", 60, async (tx, ctx, now) => closeLoginsOnLastDay(tx, ctx, await schoolToday(tx, ctx.schoolId, now)));
