// Fee Dashboard (06 §2): today's collection, pending and overdue totals, the
// monthly trend, the payment-method breakdown, the optional forecast, recent
// payments and failed online payments. Brought-in receipts never count.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { addDays, monthEnd, monthStart } from "../staff/dates";
import { classOfStudents } from "./dues";
import { feesByClass } from "./by-class";
import { feeStudentFilter, studentScope, type FeeViewer } from "./access";
import { openPromises, promisedBetween, promisesOnHere } from "./promises";
import { studentIdsForFilter } from "../students/find";

const ZERO = BigInt(0);

/** Fee rows and payments of these students only (feeStudentFilter); {} for the whole school. */
export type OnlyStudents = { studentId?: { in: string[] } };

/**
 * The Fee Dashboard band. Pending (not late yet), overdue and the overdue
 * students add up the per-class rows of ./by-class.ts, so the band, Fees by
 * class, Fee Reports and the Dashboard always agree.
 */
export async function feeTiles(tx: Tx, viewer: FeeViewer, today: Date) {
  const studentFilter: Prisma.PaymentWhereInput = viewer.see === "all" ? await feeStudentFilter(tx, viewer) : { studentId: { in: await scopedStudentIds(tx, viewer) } };
  const [todayAgg, monthAgg, byClass] = await Promise.all([
    tx.payment.aggregate({ where: { ...studentFilter, status: "POSTED", broughtIn: false, paymentDate: today }, _sum: { amountPaise: true }, _count: { _all: true } }),
    tx.payment.aggregate({ where: { ...studentFilter, status: "POSTED", broughtIn: false, paymentDate: { gte: monthStart(today), lte: today } }, _sum: { amountPaise: true }, _count: { _all: true } }),
    feesByClass(tx, viewer, today),
  ]);
  const t = byClass.totals;
  return {
    today: { amount: todayAgg._sum.amountPaise ?? ZERO, count: todayAgg._count._all },
    month: { amount: monthAgg._sum.amountPaise ?? ZERO, count: monthAgg._count._all },
    pending: t.notLate,
    overdue: t.overdue,
    overdueStudents: t.overdueStudents,
    over30: t.over30,
    /** Due so far this year and paid on it. */
    year: { due: t.due, paid: t.paid, percent: t.percent },
    nextDue: byClass.nextDue,
    byClass,
  };
}

async function scopedStudentIds(tx: Tx, viewer: FeeViewer) {
  const rows = await tx.student.findMany({ where: studentScope(viewer), select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * Collected per month in the academic year against the amount due per month.
 * `only`: the students of the person's campus (feeStudentFilter), when limited to one.
 */
export async function monthlyTrend(tx: Tx, yearStart: Date, yearEnd: Date, only: OnlyStudents = {}) {
  const months: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let d = monthStart(yearStart); d <= yearEnd; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    months.push({ key: d.toISOString().slice(0, 7), label: new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(d), start: d, end: monthEnd(d) });
  }
  const paid = await tx.payment.groupBy({ by: ["paymentDate"], where: { ...only, status: "POSTED", broughtIn: false, paymentDate: { gte: yearStart, lte: yearEnd } }, _sum: { amountPaise: true } });
  const due = await tx.studentFeeDue.groupBy({ by: ["dueDate"], where: { ...only, state: "OPEN", kind: { in: ["FEE", "CHARGE"] }, dueDate: { gte: yearStart, lte: yearEnd } }, _sum: { amountPaise: true, concessionPaise: true, adjustmentPaise: true } });
  return months.map((m) => ({
    label: m.label,
    key: m.key,
    collected: paid.filter((p) => p.paymentDate >= m.start && p.paymentDate <= m.end).reduce((s, p) => s + (p._sum.amountPaise ?? ZERO), ZERO),
    due: due.filter((d) => d.dueDate >= m.start && d.dueDate <= m.end).reduce((s, d) => s + (d._sum.amountPaise ?? ZERO) - (d._sum.concessionPaise ?? ZERO) + (d._sum.adjustmentPaise ?? ZERO), ZERO),
  }));
}

export async function modeBreakdown(tx: Tx, from: Date, to: Date, only: OnlyStudents = {}) {
  const rows = await tx.payment.groupBy({ by: ["mode"], where: { ...only, status: "POSTED", broughtIn: false, paymentDate: { gte: from, lte: to } }, _sum: { amountPaise: true }, _count: { _all: true } });
  return rows.map((r) => ({ mode: r.mode, amount: r._sum.amountPaise ?? ZERO, count: r._count._all })).sort((a, b) => Number(b.amount - a.amount));
}

/**
 * Collection forecast (optional, "Suggestion"): for each of the next 3 months,
 * the unpaid amount falling due times the share of dues paid on time in the
 * last 3 months. Shows the numbers used.
 *
 * With Promise to Pay on (the school's switch, or opts.promises), each open promise is counted in full
 * in the month of its promised date (what is left to pay on it), and that
 * family's overdue rows are left out of the share, so nothing counts twice.
 * `opts.only`: the students of the person's campus, when limited to one.
 */
export async function forecast(tx: Tx, today: Date, opts: { promises?: boolean; only?: OnlyStudents } = {}) {
  const only = opts.only ?? {};
  const pastFrom = monthStart(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 3, 1)));
  const pastTo = addDays(monthStart(today), -1);
  const pastDue = await tx.studentFeeDue.aggregate({ where: { ...only, state: "OPEN", kind: { in: ["FEE", "CHARGE"] }, dueDate: { gte: pastFrom, lte: pastTo } }, _sum: { amountPaise: true, concessionPaise: true, adjustmentPaise: true, paidPaise: true } });
  const dueTotal = (pastDue._sum.amountPaise ?? ZERO) - (pastDue._sum.concessionPaise ?? ZERO) + (pastDue._sum.adjustmentPaise ?? ZERO);
  const paidTotal = pastDue._sum.paidPaise ?? ZERO;
  // No dues in the last 3 months to learn from: no estimate, rather than an invented rate (AI rule 2).
  const rate = dueTotal > ZERO ? Number(paidTotal) / Number(dueTotal) : null;
  const promises = (opts.promises ?? (await promisesOnHere(tx))) ? await openPromises(tx, today, undefined, only) : [];
  const promisedIds = [...new Set(promises.map((p) => p.studentId))];
  const out = [];
  for (let k = 0; k < 3; k++) {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k, 1));
    const end = monthEnd(start);
    const agg = await tx.studentFeeDue.aggregate({ where: { ...only, state: "OPEN", balancePaise: { gt: 0 }, dueDate: { gte: start, lte: end } }, _sum: { balancePaise: true } });
    const due = agg._sum.balancePaise ?? ZERO;
    // Overdue rows of families with an open promise: the promise stands for them.
    const covered = promisedIds.length && start < today
      ? (await tx.studentFeeDue.aggregate({ where: { state: "OPEN", balancePaise: { gt: 0 }, studentId: { in: promisedIds }, dueDate: { gte: start, lte: end, lt: today } }, _sum: { balancePaise: true } }))._sum.balancePaise ?? ZERO
      : ZERO;
    const promised = promisedBetween(promises, start, end);
    out.push({
      label: new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(start), due, promised,
      expected: rate === null ? null : BigInt(Math.round(Number(due - covered) * rate)) + promised,
    });
  }
  return { rate, basis: { from: pastFrom, to: pastTo, due: dueTotal, paid: paidTotal }, months: out, promises: promises.length };
}

export type RecentFilter = { from: Date; to: Date; classId?: string | null; feeHeadId?: string | null; mode?: string | null; status?: string | null; collectorId?: string | null; partial?: boolean | null; q?: string | null };

/**
 * Recent Payments, newest first, with the filters of 06 §2. Only the person's
 * campus when limited to one; a class's students are those of its campus's year.
 */
export async function recentPayments(tx: Tx, viewer: FeeViewer, f: RecentFilter, take = 25, skip = 0) {
  const thisYear = viewer.yearIds.length ? { academicYearId: { in: viewer.yearIds } } : {};
  const classStudents = f.classId ? (await tx.enrolment.findMany({ where: { classId: f.classId, archivedAt: null, ...thisYear }, select: { studentId: true } })).map((e) => e.studentId) : null;
  const scoped = viewer.see === "all" && !viewer.campusId ? null : await scopedStudentIds(tx, viewer);
  const ids = classStudents && scoped ? classStudents.filter((x) => scoped.includes(x)) : classStudents ?? scoped;
  // Search: student name or admission number, class name, or receipt number.
  let search: Prisma.PaymentWhereInput = {};
  const q = f.q?.trim();
  if (q) {
    const [byName, byClass, byReceipt] = await Promise.all([
      studentIdsForFilter(tx, q),
      tx.schoolClass.findMany({ where: { name: { equals: q, mode: "insensitive" } }, select: { id: true } }).then((cls) => cls.length
        ? tx.enrolment.findMany({ where: { archivedAt: null, classId: { in: cls.map((c) => c.id) }, ...thisYear }, select: { studentId: true }, take: 3000 })
        : []),
      tx.receipt.findMany({ where: { number: { contains: q, mode: "insensitive" } }, select: { paymentId: true }, take: 200 }),
    ]);
    search = { OR: [{ studentId: { in: [...byName, ...byClass.map((e) => e.studentId)] } }, { id: { in: byReceipt.map((r) => r.paymentId) } }, { reference: { contains: q, mode: "insensitive" } }] };
  }
  const where: Prisma.PaymentWhereInput = {
    ...search,
    broughtIn: false,
    paymentDate: { gte: f.from, lte: f.to },
    ...(ids ? { studentId: { in: ids } } : {}),
    ...(f.mode ? { mode: f.mode as never } : {}),
    ...(f.status ? { status: f.status as never } : { status: { in: ["POSTED", "WAITING", "CANCELLED", "FAILED"] } }),
    ...(f.collectorId ? { collectedById: f.collectorId } : {}),
    ...(f.feeHeadId ? { allocations: { some: { feeHeadId: f.feeHeadId } } } : {}),
    ...(f.partial === true ? { isPartial: true } : f.partial === false ? { isPartial: false } : {}),
  };
  const [rows, total, sumAgg] = await Promise.all([
    tx.payment.findMany({ where, orderBy: { paidAt: "desc" }, take, skip, include: { allocations: { where: { fromAdvance: false }, select: { feeHeadId: true } } } }),
    tx.payment.count({ where }),
    tx.payment.aggregate({ where: { ...where, status: "POSTED" }, _sum: { amountPaise: true } }),
  ]);
  const students = await tx.student.findMany({ where: { id: { in: rows.map((r) => r.studentId) } }, select: { id: true, fullName: true, admissionNo: true } });
  const classes = await classOfStudents(tx, rows.map((r) => r.studentId), viewer.yearIds);
  const receipts = await tx.receipt.findMany({ where: { paymentId: { in: rows.map((r) => r.id) } } });
  const heads = await tx.feeHead.findMany({ where: { id: { in: rows.flatMap((r) => r.allocations.map((a) => a.feeHeadId)) } } });
  return {
    total,
    sum: sumAgg._sum.amountPaise ?? ZERO,
    rows: rows.map((r) => ({
      ...r,
      student: students.find((s) => s.id === r.studentId) ?? null,
      classLabel: classes.get(r.studentId)?.label ?? "",
      receiptNo: receipts.find((x) => x.paymentId === r.id)?.number ?? null,
      heads: [...new Set(r.allocations.map((a) => heads.find((h) => h.id === a.feeHeadId)?.name).filter(Boolean))].join(", ") || (r.advancePaise > ZERO ? "Advance" : ""),
    })),
  };
}
