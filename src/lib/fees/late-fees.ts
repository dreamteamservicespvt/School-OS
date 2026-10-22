// Late fees (06 §6, A7): after the grace period the late fee is added as its
// own row on the student's fees, so it can be seen, paid or waived with a
// reason. Amount: flat, per day late, or a percent of the unpaid balance,
// never above the maximum. Safe to run more than once a day.
import "server-only";

import type { StudentFeeDue } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { addDays, DAY_MS } from "../staff/dates";
import { formatDate, formatRupees } from "../format";
import { refreshBalances } from "./dues";
import { feeSettings, type FeeSettings } from "./settings";
import { moveInGoLive } from "../move-in/live";

/** The late fee for a row on a day: 0 inside the grace period. */
export function lateFeeFor(s: Pick<FeeSettings, "lateFeeOn" | "lateFeeType" | "lateFeePaise" | "lateFeePercentBp" | "graceDays" | "lateFeeMaxPaise">, d: Pick<StudentFeeDue, "dueDate" | "balancePaise">, today: Date): bigint {
  if (!s.lateFeeOn) return BigInt(0);
  const daysLate = Math.floor((today.getTime() - d.dueDate.getTime()) / DAY_MS);
  if (daysLate <= s.graceDays || d.balancePaise <= BigInt(0)) return BigInt(0);
  let fee: bigint;
  if (s.lateFeeType === "per-day") fee = s.lateFeePaise * BigInt(daysLate - s.graceDays);
  else if (s.lateFeeType === "percent") fee = (d.balancePaise * BigInt(s.lateFeePercentBp) + BigInt(5000)) / BigInt(10000);
  else fee = s.lateFeePaise;
  if (s.lateFeeMaxPaise !== null && s.lateFeeMaxPaise > BigInt(0) && fee > s.lateFeeMaxPaise) fee = s.lateFeeMaxPaise;
  return fee > BigInt(0) ? fee : BigInt(0);
}

/**
 * Adds or grows late fee rows for every overdue row past the grace period.
 * One late fee row per row; per-day late fees grow until the row is paid.
 * For a school that moved in from old software, days before the go-live date
 * are never counted: those months were the old software's, and any late fee
 * it charged came in with the old dues (workflow 15).
 * Returns how many rows were added and grown.
 */
export async function addLateFees(tx: Tx, ctx: SchoolContext, today: Date) {
  const s = await feeSettings(tx, ctx);
  if (!s.lateFeeOn) return { added: 0, grown: 0 };
  const head = await tx.feeHead.findFirst({ where: { schoolId: ctx.schoolId, systemKey: "late-fee" } });
  if (!head) return { added: 0, grown: 0 };
  const heads = await tx.feeHead.findMany({ where: { lateFeeApplies: true } });
  const allowed = new Set(heads.filter((h) => s.lateFeeHeadIds.length === 0 || s.lateFeeHeadIds.includes(h.id)).map((h) => h.id));
  const overdue = await tx.studentFeeDue.findMany({
    where: { state: "OPEN", kind: { in: ["FEE", "CHARGE"] }, balancePaise: { gt: 0 }, dueDate: { lt: addDays(today, -s.graceDays) }, broughtIn: false },
    orderBy: { dueDate: "asc" },
  });
  const existing = await tx.studentFeeDue.findMany({ where: { kind: "LATE_FEE", parentDueId: { in: overdue.map((d) => d.id) } } });
  const byParent = new Map(existing.map((e) => [e.parentDueId!, e]));
  const goLive = await moveInGoLive(tx, ctx);
  let added = 0, grown = 0;
  for (const d of overdue) {
    if (!allowed.has(d.feeHeadId)) continue;
    const fee = lateFeeFor(s, goLive && d.dueDate < goLive ? { ...d, dueDate: goLive } : d, today);
    if (fee <= BigInt(0)) continue;
    const row = byParent.get(d.id);
    if (!row) {
      const made = await tx.studentFeeDue.create({
        data: {
          schoolId: ctx.schoolId, studentId: d.studentId, academicYearId: d.academicYearId, feeHeadId: head.id, kind: "LATE_FEE",
          label: `Late fee: ${d.label}`, dueDate: today, amountPaise: fee, balancePaise: fee, parentDueId: d.id,
          note: `Late fee ${formatRupees(fee)} added on ${formatDate(today)}`,
        },
      });
      await writeAudit(tx, ctx, { action: "late-fee-added", recordType: "Student Fee Due", recordId: made.id, after: { on: d.id, amount: formatRupees(fee), date: formatDate(today) } });
      added++;
    } else if (s.lateFeeType === "per-day" && row.state === "OPEN" && fee > row.amountPaise) {
      await tx.studentFeeDue.update({ where: { id: row.id }, data: { amountPaise: fee, note: `Late fee ${formatRupees(fee)} on ${formatDate(today)}` } });
      await refreshBalances(tx, [row.id]);
      grown++;
    }
  }
  return { added, grown };
}
