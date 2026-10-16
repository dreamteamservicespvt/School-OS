// Timed work for Inventory Management (A15): warranty and AMC reminders and
// the low-stock sweep, once a day. Runs only for schools with the module
// switched on. Safe to run twice. Imported by src/lib/job-registry.ts.
import "server-only";

import type { Tx } from "../db";
import { defineSchedule } from "../jobs";
import { todayIn } from "../staff/dates";
import { lowStockSweep, warrantyReminders } from "./alerts";
import { MODULE } from "./words";
import "./import";

async function inventoryOn(tx: Tx) {
  const m = await tx.schoolModule.findFirst({ where: { moduleKey: MODULE, isOn: true }, select: { moduleKey: true } });
  return Boolean(m);
}

defineSchedule("inventory-reminders", 24 * 60, async (tx, ctx, now) => {
  if (!(await inventoryOn(tx))) return;
  const s = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  await warrantyReminders(tx, ctx, todayIn(s?.timeZone ?? "Asia/Kolkata", now));
  await lowStockSweep(tx, ctx);
});
