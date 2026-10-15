// Background work for Homework & Learning: after the due date, work not handed
// in becomes Missing and the pending-homework message goes to parents once
// (when the school has that rule on); and reminders 15 minutes before each
// online class. Both are safe to run twice. Imported by src/lib/job-registry.ts.
import "server-only";

import { defineSchedule } from "../jobs";
import { todayIn } from "../academic/common";
import { markMissing } from "./submissions";
import { sendReminders } from "./online";

defineSchedule("homework-missing", 60, async (tx, ctx, now) => {
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  return markMissing(tx, ctx, todayIn(school?.timeZone ?? "Asia/Kolkata", now));
});

defineSchedule("online-class-reminders", 5, (tx, ctx, now) => sendReminders(tx, ctx, now));
