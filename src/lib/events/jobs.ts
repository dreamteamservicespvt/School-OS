// Background work for Events & Calendar: event reminders before the day, and
// the PTM reminders the evening before (automatic message rule "ptm"). Both
// run every 30 minutes and are safe to run twice. Imported by
// src/lib/job-registry.ts.
import "server-only";

import { defineSchedule } from "../jobs";
import { sendDueReminders } from "./events";
import { sendPtmReminders } from "./ptm";

/** Today's date and the hour in the school's zone. */
export function localNow(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { today: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

defineSchedule("event-reminders", 30, async (tx, ctx, now) => {
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const { today, hour } = localNow(now, school?.timeZone ?? "Asia/Kolkata");
  await sendDueReminders(tx, ctx, today, hour);
  await sendPtmReminders(tx, ctx, today, hour);
});
