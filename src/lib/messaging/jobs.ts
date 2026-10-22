// Communication's background work, registered with the worker
// (src/lib/job-registry.ts imports this file).
import "server-only";

import { defineJob, defineSchedule } from "../jobs";
import { formatDate } from "../format";
import type { SchoolContext, Tx } from "../db";
import { deliverMessage, runSmsBackup } from "./deliver";
import { DELIVER_JOB } from "./send";
import { ruleStates, sendAutomatic } from "./automatic";

defineJob(DELIVER_JOB, "Sending messages", async (tx, ctx, payload) => {
  const p = payload as { messageId: string; round?: string; chunk?: number };
  return deliverMessage(tx, ctx, { messageId: p.messageId, round: p.round ?? "0", chunk: p.chunk ?? 0 });
});

defineSchedule("sms-backup", 5, (tx, ctx, now) => runSmsBackup(tx, ctx, now));

/** Hour and minute now in the school's time zone, and today's date as YYYY-MM-DD. */
function localNow(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, month: Number(get("month")), day: Number(get("day")), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Birthday wishes to students (through their parents) and staff, once a day at the set time. */
export async function sendBirthdayWishes(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const local = localNow(now, school.timeZone);
  const rules = (await ruleStates(tx, ctx)).filter((r) => r.key === "birthday-student" || r.key === "birthday-staff");
  let sent = 0;
  for (const rule of rules) {
    if (!rule.isOn || local.minutes < toMinutes(rule.timing.time ?? "08:00")) continue;
    if (rule.key === "birthday-student") {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM student WHERE school_id = ${ctx.schoolId}::uuid AND archived_at IS NULL AND status IN ('ACTIVE', 'ADMITTED')
          AND date_of_birth IS NOT NULL AND extract(month FROM date_of_birth) = ${local.month} AND extract(day FROM date_of_birth) = ${local.day}`;
      for (const s of rows) {
        const r = await sendAutomatic(tx, ctx, { rule: rule.key, event: { key: `birthday:${local.date}:${s.id}`, label: `Birthday on ${formatDate(now, school.timeZone)}` }, to: { guardiansOf: [s.id] }, perStudent: { [s.id]: {} } });
        if (r.status === "sent") sent++;
      }
    } else {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM staff WHERE school_id = ${ctx.schoolId}::uuid AND archived_at IS NULL AND status IN ('ACTIVE', 'ON_LEAVE')
          AND date_of_birth IS NOT NULL AND extract(month FROM date_of_birth) = ${local.month} AND extract(day FROM date_of_birth) = ${local.day}`;
      for (const s of rows) {
        const r = await sendAutomatic(tx, ctx, { rule: rule.key, event: { key: `birthday:${local.date}:${s.id}`, label: `Birthday on ${formatDate(now, school.timeZone)}` }, to: { staffIds: [s.id] } });
        if (r.status === "sent") sent++;
      }
    }
  }
  return sent;
}

// One message per birthday (about 30 queries each): a big school's day can pass the usual 15 seconds, so it gets the long transaction (G37).
defineSchedule("birthday-wishes", 15, (tx, ctx, now) => sendBirthdayWishes(tx, ctx, now), { heldWhileMovingIn: true, ownTransaction: true });
