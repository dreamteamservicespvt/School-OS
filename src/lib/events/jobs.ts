// Background work for Events & Calendar: event reminders before the day, and
// the PTM reminders the evening before (automatic message rule "ptm"). Both
// run every 30 minutes and are safe to run twice. Imported by
// src/lib/job-registry.ts.
import "server-only";

import { defineSchedule } from "../jobs";
import { MessagingProblem } from "../messaging/send";
import { EventsProblem } from "./problem";
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
  // Event reminders never stop the PTM reminders: each event's own problem is noted on it.
  try {
    await sendDueReminders(tx, ctx, today, hour);
  } catch (e) {
    if (!(e instanceof MessagingProblem) && !(e instanceof EventsProblem)) throw e;
    console.warn(JSON.stringify({ level: "warn", event: "event-reminders-failed", schoolId: ctx.schoolId, reason: e.message }));
  }
  await sendPtmReminders(tx, ctx, today, hour);
});
