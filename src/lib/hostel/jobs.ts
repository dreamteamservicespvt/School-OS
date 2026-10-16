// Timed work for Hostel Management: every 15 minutes, students out on a pass
// and not back by the return time (after the wait set in Hostel Settings)
// alert the hostel's wardens and the Principal, and their parents when that
// message is on. Runs only for schools with the hostel switched on. Safe to
// run twice: each pass is alerted once. Imported by src/lib/job-registry.ts.
import "server-only";

import { defineSchedule } from "../jobs";
import { alertLateReturns } from "./outings";
import { MODULE } from "./words";
import "./import";

defineSchedule("hostel-late-returns", 15, async (tx, ctx, now) => {
  const on = await tx.schoolModule.findFirst({ where: { moduleKey: MODULE, isOn: true }, select: { moduleKey: true } });
  if (!on) return;
  const s = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  await alertLateReturns(tx, ctx, now, s?.timeZone ?? "Asia/Kolkata");
});
