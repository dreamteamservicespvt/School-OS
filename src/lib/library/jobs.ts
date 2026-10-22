// Timed work for Library Management: the daily reminders (due tomorrow,
// overdue) and keeping student fines in step with Fee Management. Runs only
// for schools with the library switched on. Safe to run twice. Imported by
// src/lib/job-registry.ts.
import "server-only";

import type { Tx } from "../db";
import { defineSchedule } from "../jobs";
import { todayIn } from "../staff/dates";
import { dailyReminders } from "./reminders";
import { syncFeeFines } from "./fines";
import { MODULE } from "./words";
import "./import";

async function libraryOn(tx: Tx) {
  const m = await tx.schoolModule.findFirst({ where: { moduleKey: MODULE, isOn: true }, select: { moduleKey: true } });
  return Boolean(m);
}

async function schoolToday(tx: Tx, schoolId: string, now: Date) {
  const s = await tx.school.findUnique({ where: { id: schoolId }, select: { timeZone: true } });
  return todayIn(s?.timeZone ?? "Asia/Kolkata", now);
}

defineSchedule("library-reminders", 24 * 60, async (tx, ctx, now) => {
  if (!(await libraryOn(tx))) return;
  await dailyReminders(tx, ctx, await schoolToday(tx, ctx.schoolId, now));
  // One message per book (about 30 queries each, up to 1,000 books): the long transaction, not the usual 15 seconds (G37).
}, { heldWhileMovingIn: true, ownTransaction: true });

defineSchedule("library-fee-fines", 6 * 60, async (tx, ctx) => {
  if (!(await libraryOn(tx))) return;
  await syncFeeFines(tx, ctx);
}, { heldWhileMovingIn: true });
