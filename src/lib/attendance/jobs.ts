// Background work for Attendance: automation A4 after each save (absence
// messages after the wait, then flags), and the lock at the cut-off time.
// Both are safe to run twice. Imported by src/lib/job-registry.ts.
import "server-only";

import { defineJob, defineSchedule } from "../jobs";
import { afterAttendanceSaved, lockPastMarks } from "./alerts";
import { attendanceSettings } from "./settings";

defineJob("attendance-after-save", "Absence messages and attendance flags", async (tx, ctx, payload) => {
  return afterAttendanceSaved(tx, ctx, { sectionId: String(payload.sectionId), date: String(payload.date), messages: payload.messages !== false });
});

defineSchedule("attendance-lock", 15, async (tx, ctx, now) => {
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const settings = await attendanceSettings(tx, ctx);
  return lockPastMarks(tx, ctx, now, school?.timeZone ?? "Asia/Kolkata", settings.lockTime);
});
