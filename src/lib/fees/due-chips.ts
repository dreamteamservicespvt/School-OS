// The due chip beside a student in search results and student pickers (adopt
// item 8, docs/research/inkwelly-2026-11-15.md): "₹17,550 overdue" (red),
// "₹8,200 due" (amber) or "No dues" (green). Only for people who may see
// students' fees (seesStudentFees: never a teacher without fee access, never
// the Admission Counsellor), and only for students inside their fee reach
// ("own" reach: their own sections). Everyone else gets no chips at all.
// "Due" is what the counter calls due now: rows due within the next 30 days.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { Current } from "../current";
import { formatRupees } from "../format";
import { addDays } from "../staff/dates";
import { feeViewer, seesStudentFees, studentScope } from "./access";
import { DUE_WINDOW_DAYS } from "./dues";

export type DueChip = { text: string; tone: "bad" | "warn" | "ok" };

/** The chip for what a student owes now. */
export function dueChipOf(duePaise: bigint, overdue: boolean): DueChip {
  if (duePaise <= BigInt(0)) return { text: "No dues", tone: "ok" };
  return overdue ? { text: `${formatRupees(duePaise)} overdue`, tone: "bad" } : { text: `${formatRupees(duePaise)} due`, tone: "warn" };
}

type Who = Pick<Current, "permissions" | "roles" | "user" | "campusId">;

/** The due chip of each student this person may see the fees of; an empty map for anyone else. */
export async function dueChipsFor(tx: Tx, ctx: SchoolContext, current: Who, studentIds: string[], today: Date): Promise<Map<string, DueChip>> {
  const out = new Map<string, DueChip>();
  const ids = [...new Set(studentIds)];
  if (!ids.length || !seesStudentFees(current)) return out;
  const viewer = await feeViewer(tx, ctx, current);
  if (viewer.see === "none") return out;
  const allowed = (await tx.student.findMany({ where: { AND: [{ id: { in: ids } }, studentScope(viewer)] }, select: { id: true } })).map((s) => s.id);
  if (!allowed.length) return out;
  const dues = await tx.studentFeeDue.findMany({
    where: { studentId: { in: allowed }, state: "OPEN", balancePaise: { gt: 0 }, dueDate: { lte: addDays(today, DUE_WINDOW_DAYS) } },
    select: { studentId: true, balancePaise: true, dueDate: true },
  });
  for (const id of allowed) {
    const mine = dues.filter((d) => d.studentId === id);
    out.set(id, dueChipOf(mine.reduce((a, d) => a + d.balancePaise, BigInt(0)), mine.some((d) => d.dueDate < today)));
  }
  return out;
}
