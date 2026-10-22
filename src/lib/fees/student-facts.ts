// What Fee Management tells Student Management (06 §4 Sends): fees due for
// the promotion suggestion ("no fee dues allowed"), each student's fee status
// on the Student List and Parent 360 with the "Has dues" and "Overdue"
// filter, a family's latest payments for Parent 360, and whether fees are
// paid for a student in a year (which stops a promotion being undone).
// Listed in src/lib/students/fact-sources.ts.
//
// The Student List's amounts are Fees by class's own (./by-class.ts): fees
// fallen due by today + 30 days and not paid, so the two screens agree.
// Promotion counts the whole year instead, as the year is over.
import "server-only";

import type { Tx } from "../db";
import type { ActivitySource, FactViewer, FeeFilterSource, ListFacts, ListSource, PromotionSource } from "../students/hooks";
import { todayIn } from "../staff/dates";
import { feeViewer, seesStudentFees, studentScope } from "./access";
import { feesDueOf, studentsOwing } from "./by-class";

const ZERO = BigInt(0);

async function schoolToday(tx: Tx, schoolId: string) {
  const school = await tx.school.findUnique({ where: { id: schoolId }, select: { timeZone: true } });
  return todayIn(school?.timeZone);
}

/** Of these students, those whose fees this person may see: everyone (on their campus, for a "One campus" login), or (Own) the students of their own sections this year. */
async function feeVisible(tx: Tx, who: FactViewer, ids: string[]): Promise<string[]> {
  if (!ids.length || !seesStudentFees(who)) return [];
  if (who.permissions["fee-management"].see === "all" && !who.campusId) return ids;
  const viewer = await feeViewer(tx, who.ctx, { ...who, user: { id: who.ctx.userId ?? "" } });
  const rows = await tx.student.findMany({ where: { id: { in: ids }, ...studentScope(viewer) }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Everything still to pay for the year being finished and any earlier year (old dues brought in), whatever its due date. */
export const promotionFacts: PromotionSource = async (tx, _ctx, q) => {
  const year = await tx.academicYear.findUnique({ where: { id: q.academicYearId }, select: { startDate: true, endDate: true, campusId: true } });
  if (!year) return new Map();
  // Later years: this campus's next years, and any year starting after this one
  // ends. Another campus's same school year (it may start a few weeks later)
  // still counts, for a student who moved campus during the year.
  const later = await tx.academicYear.findMany({
    where: { OR: [{ campusId: year.campusId, startDate: { gt: year.startDate } }, { startDate: { gt: year.endDate } }] },
    select: { id: true },
  });
  const sums = await tx.studentFeeDue.groupBy({
    by: ["studentId"],
    where: { studentId: { in: q.studentIds }, state: "OPEN", balancePaise: { gt: 0 }, ...(later.length ? { academicYearId: { notIn: later.map((y) => y.id) } } : {}) },
    _sum: { balancePaise: true },
  });
  const owed = new Map(sums.map((s) => [s.studentId, s._sum.balancePaise ?? ZERO]));
  return new Map(q.studentIds.map((id) => [id, { feeDuePaise: owed.get(id) ?? ZERO }]));
};

/** The Fees column (Paid, Due, Overdue): only for people allowed to see fees (03 §2, Student List). */
export const listFacts: ListSource = {
  covers: "fees",
  allowed: (who) => seesStudentFees(who),
  load: async (tx, who, q) => {
    const out = new Map<string, ListFacts>();
    const ids = await feeVisible(tx, who, q.studentIds);
    if (!ids.length) return out;
    const dues = await feesDueOf(tx, q.academicYearId, await schoolToday(tx, who.ctx.schoolId), ids);
    for (const [id, d] of dues) out.set(id, { feeDuePaise: d.pending, feeOverdue: d.overdue > ZERO });
    return out;
  },
};

/** The "Has dues" and "Overdue" filter: one read for the whole school, then (Own reach) only their sections' students. */
export const studentsWithDues: FeeFilterSource = async (tx, who, q) => {
  if (!seesStudentFees(who)) return null;
  const owing = await studentsOwing(tx, await schoolToday(tx, who.ctx.schoolId), q.kind);
  return who.permissions["fee-management"].see === "all" && !who.campusId ? owing : feeVisible(tx, who, owing);
};

/** Payments for the new year's fees stop a promotion being undone (03 §2: "no attendance, no payment"). */
export const yearActivity: ActivitySource = async (tx, _ctx, q) => {
  const dues = await tx.studentFeeDue.findMany({ where: { studentId: { in: q.studentIds }, academicYearId: q.academicYearId }, select: { id: true } });
  const paid = await tx.payment.findMany({
    where: {
      studentId: { in: q.studentIds },
      status: { in: ["POSTED", "WAITING"] },
      OR: [{ academicYearId: q.academicYearId }, ...(dues.length ? [{ allocations: { some: { dueId: { in: dues.map((d) => d.id) } } } }] : [])],
    },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  if (paid.length === 0) return null;
  return `fees are paid for ${paid.length} ${paid.length === 1 ? "student" : "students"}`;
};

/** A family's latest payments, newest first, for the students whose fees this person may see (Parent 360). */
export async function recentPayments(tx: Tx, who: FactViewer, studentIds: string[], take = 10) {
  const ids = await feeVisible(tx, who, studentIds);
  if (!ids.length) return [];
  const payments = await tx.payment.findMany({
    where: { studentId: { in: ids }, status: { in: ["POSTED", "CANCELLED", "WAITING"] } },
    orderBy: { paidAt: "desc" },
    take,
    select: { id: true, studentId: true, paymentDate: true, amountPaise: true, mode: true, status: true, broughtIn: true },
  });
  const receipts = payments.length ? await tx.receipt.findMany({ where: { paymentId: { in: payments.map((p) => p.id) } }, select: { paymentId: true, number: true } }) : [];
  const numbers = new Map(receipts.map((r) => [r.paymentId, r.number]));
  return payments.map((p) => ({ ...p, receiptNo: numbers.get(p.id) ?? null }));
}
