// Stop-wise transport fees on the student's fees (automation A12, 12 §5
// "Transport fee charged twice"). A stop's fee is a monthly amount. The
// academic year's months are put into fee periods (every month, quarter,
// half year or the year, from Transport Settings; months with no transport
// fee, like the summer holidays, are left out). Each period is one Student
// Fee Due row of kind CHARGE under the Transport fee head, linked by a
// Transport Fee Charge, so Fee Management collects it, shows it in dues,
// defaulters and receipts, and nothing else about fees changes.
//   Given a stop from a date: rows for every period that ends on or after
//   the date, counting only the months from that date's month.
//   Stopped (last day E): unpaid rows for periods that start after E are
//   removed with the reason; paid ones are kept and reported.
//   Changed from a date D: the old place ends on D-1, its later unpaid rows
//   go, and the new rate starts from the next period not already charged
//   (12 §10: "new rate from the next installment").
//   One transport fee row per student per period: never charged twice.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { refreshBalances } from "../fees/dues";
import { TransportProblem } from "./problem";
import type { TrSettings } from "./settings";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SPAN: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 };

export type FeePeriod = {
  key: string;
  start: Date;
  end: Date;
  due: Date;
  /** Calendar months (first day of each) in the period that carry a fee. */
  months: Date[];
  label: string;
};

const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m, d));
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0));
const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** The academic year's transport fee periods. */
export function feePeriods(year: { name: string; startDate: Date; endDate: Date }, s: Pick<TrSettings, "feeFrequency" | "feeDueDay" | "noFeeMonths">): FeePeriod[] {
  const months: Date[] = [];
  for (let d = utc(year.startDate.getUTCFullYear(), year.startDate.getUTCMonth()); d <= year.endDate; d = utc(d.getUTCFullYear(), d.getUTCMonth() + 1)) months.push(d);
  const span = SPAN[s.feeFrequency] ?? 1;
  const out: FeePeriod[] = [];
  for (let i = 0; i < months.length; i += span) {
    const group = months.slice(i, i + span);
    const paying = group.filter((m) => !s.noFeeMonths.includes(m.getUTCMonth() + 1));
    if (paying.length === 0) continue;
    const first = group[0];
    const last = group[group.length - 1];
    const start = first < year.startDate ? year.startDate : first;
    const endMonth = lastDay(last.getUTCFullYear(), last.getUTCMonth());
    const end = endMonth > year.endDate ? year.endDate : endMonth;
    const p0 = paying[0];
    const due = utc(p0.getUTCFullYear(), p0.getUTCMonth(), Math.min(28, Math.max(1, s.feeDueDay)));
    const a = paying[0];
    const b = paying[paying.length - 1];
    const label = paying.length === 1 ? `${MONTH[a.getUTCMonth()]} ${a.getUTCFullYear()}`
      : a.getUTCFullYear() === b.getUTCFullYear() ? `${MONTH[a.getUTCMonth()]}–${MONTH[b.getUTCMonth()]} ${b.getUTCFullYear()}`
        : `${MONTH[a.getUTCMonth()]} ${a.getUTCFullYear()}–${MONTH[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
    out.push({ key: `${year.name}:${ym(first)}`, start, end, due, months: paying, label });
  }
  return out;
}

/** What one period costs for a place starting on `from`: only the months from that month on. */
export function periodAmount(p: FeePeriod, from: Date, monthlyPaise: bigint) {
  const firstMonth = utc(from.getUTCFullYear(), from.getUTCMonth());
  const count = p.months.filter((m) => m >= firstMonth).length;
  return { months: count, amountPaise: monthlyPaise * BigInt(count) };
}

/** The periods a place from `from` (to `to`, if it ends) pays for, with amounts and due dates. */
export function chargesFor(periods: FeePeriod[], from: Date, to: Date | null, monthlyPaise: bigint) {
  return periods
    .filter((p) => p.end >= from && (!to || p.start <= to))
    .map((p) => {
      const { months, amountPaise } = periodAmount(p, from, monthlyPaise);
      return { period: p, months, amountPaise, dueDate: p.due < from ? from : p.due };
    })
    .filter((c) => c.months > 0 && c.amountPaise > BigInt(0));
}

/** The Transport fee head: the one chosen, else the first with kind "transport", else a new "Transport" head. */
export async function transportHead(tx: Tx, ctx: SchoolContext) {
  const found = await tx.feeHead.findFirst({ where: { kind: "transport", archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  if (found) return found;
  const taken = await tx.feeHead.findFirst({ where: { name: { equals: "Transport", mode: "insensitive" } } });
  const head = await tx.feeHead.create({ data: { schoolId: ctx.schoolId, name: taken ? "Transport fee" : "Transport", kind: "transport", lateFeeApplies: true, sortOrder: 60, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Fee Head", recordId: head.id, after: { name: head.name, kind: "transport", why: "Needed for stop-wise transport fees" } });
  return head;
}

/** The year a date falls in (the student's campus first), for the fee rows. */
export async function yearFor(tx: Tx, date: Date, campusId: string | null) {
  const where = { archivedAt: null, startDate: { lte: date }, endDate: { gte: date } };
  return (campusId ? await tx.academicYear.findFirst({ where: { ...where, campusId } }) : null) ?? tx.academicYear.findFirst({ where, orderBy: { startDate: "desc" } });
}

/** Rows whose fee row was removed in Fee Management count as removed here too. */
async function syncRemoved(tx: Tx, studentId: string) {
  const live = await tx.transportFeeCharge.findMany({ where: { studentId, removedAt: null }, select: { id: true, dueId: true } });
  if (!live.length) return;
  const gone = await tx.studentFeeDue.findMany({ where: { id: { in: live.map((c) => c.dueId) }, state: "REMOVED" }, select: { id: true } });
  const goneIds = new Set(gone.map((g) => g.id));
  const ids = live.filter((c) => goneIds.has(c.dueId)).map((c) => c.id);
  if (ids.length) await tx.transportFeeCharge.updateMany({ where: { id: { in: ids } }, data: { removedAt: new Date() } });
}

export type ChargeResult = { added: { label: string; amountPaise: bigint; dueDate: Date }[]; skipped: number; totalPaise: bigint };

/**
 * Puts the transport fee of one place on the student's fees (A12). Periods
 * that already have a transport fee row for this student (from any place)
 * are skipped, so a change never charges a period twice.
 */
export async function chargePlace(tx: Tx, ctx: SchoolContext, assignmentId: string, settings: TrSettings, opts: { reason?: string } = {}): Promise<ChargeResult> {
  const a = await tx.transportAssignment.findFirst({ where: { id: assignmentId } });
  if (!a || a.status !== "ACTIVE") throw new TransportProblem("This transport place is not active.");
  const year = await tx.academicYear.findFirst({ where: { id: a.academicYearId } });
  if (!year) throw new TransportProblem("The academic year of this transport place was not found.");
  if (year.status === "CLOSED") throw new TransportProblem(`${year.name} is closed, so its fees cannot change.`);
  const [route, stop] = await Promise.all([
    tx.route.findFirst({ where: { id: a.routeId } }),
    tx.stop.findFirst({ where: { id: a.stopId } }),
  ]);
  const head = await transportHead(tx, ctx);
  await syncRemoved(tx, a.studentId);
  const existing = await tx.transportFeeCharge.findMany({ where: { studentId: a.studentId, removedAt: null }, select: { periodKey: true, periodStart: true, periodEnd: true } });
  const periods = feePeriods(year, settings);
  const plan = chargesFor(periods, a.fromDate, a.toDate, a.monthlyFeePaise);
  const where = `Route ${route?.number ?? ""}${stop ? ` · ${stop.name}` : ""}, ${a.type === "TWO_WAY" ? "two-way" : "one-way"}`;
  const result: ChargeResult = { added: [], skipped: 0, totalPaise: BigInt(0) };
  for (const c of plan) {
    const clash = existing.some((e) => e.periodKey === c.period.key || (e.periodStart <= c.period.end && e.periodEnd >= c.period.start));
    if (clash) { result.skipped++; continue; }
    const label = `Transport · ${c.period.label}`;
    const due = await tx.studentFeeDue.create({
      data: {
        schoolId: ctx.schoolId, studentId: a.studentId, academicYearId: a.academicYearId, feeHeadId: head.id, kind: "CHARGE",
        label, dueDate: c.dueDate, amountPaise: c.amountPaise, balancePaise: c.amountPaise,
        exceptionReason: opts.reason ?? `Transport: ${where}`, createdById: ctx.userId,
      },
    });
    await tx.transportFeeCharge.create({
      data: { schoolId: ctx.schoolId, studentId: a.studentId, assignmentId: a.id, dueId: due.id, periodKey: c.period.key, periodStart: c.period.start, periodEnd: c.period.end, amountPaise: c.amountPaise },
    });
    existing.push({ periodKey: c.period.key, periodStart: c.period.start, periodEnd: c.period.end });
    result.added.push({ label, amountPaise: c.amountPaise, dueDate: c.dueDate });
    result.totalPaise += c.amountPaise;
  }
  if (result.added.length) {
    await writeAudit(tx, ctx, {
      action: "transport-fee-added", recordType: "Transport Assignment", recordId: a.id,
      after: { studentId: a.studentId, rows: result.added.length, total: formatRupees(result.totalPaise), from: a.fromDate.toISOString().slice(0, 10), where },
    });
  }
  return result;
}

export type RemoveResult = { removed: number; removedPaise: bigint; kept: { label: string; why: string }[] };

/**
 * Takes the transport fee off for periods that start after `lastDay` (the
 * last day on the bus). Paid rows, or rows with a concession, stay and are
 * reported, so the office can refund or adjust them in Fee Management.
 */
export async function removeFeesAfter(tx: Tx, ctx: SchoolContext, assignmentId: string, lastDay: Date, reason: string): Promise<RemoveResult> {
  const charges = await tx.transportFeeCharge.findMany({ where: { assignmentId, removedAt: null, periodStart: { gt: lastDay } } });
  const out: RemoveResult = { removed: 0, removedPaise: BigInt(0), kept: [] };
  if (!charges.length) return out;
  const dues = await tx.studentFeeDue.findMany({ where: { id: { in: charges.map((c) => c.dueId) } } });
  const now = new Date();
  for (const c of charges) {
    const d = dues.find((x) => x.id === c.dueId);
    if (!d || d.state === "REMOVED") { await tx.transportFeeCharge.update({ where: { id: c.id }, data: { removedAt: now } }); continue; }
    if (d.paidPaise > BigInt(0)) { out.kept.push({ label: d.label, why: `${formatRupees(d.paidPaise)} already paid` }); continue; }
    const conc = await tx.concessionLine.count({ where: { dueId: d.id } });
    if (conc) { out.kept.push({ label: d.label, why: "a concession is applied" }); continue; }
    await tx.studentFeeDue.update({ where: { id: d.id }, data: { state: "REMOVED", removedReason: reason, removedById: ctx.userId, removedAt: now } });
    const late = await tx.studentFeeDue.findMany({ where: { parentDueId: d.id, state: "OPEN", paidPaise: 0 } });
    for (const l of late) await tx.studentFeeDue.update({ where: { id: l.id }, data: { state: "REMOVED", removedReason: `Row removed: ${reason}`, removedById: ctx.userId, removedAt: now } });
    await refreshBalances(tx, [d.id]);
    await tx.transportFeeCharge.update({ where: { id: c.id }, data: { removedAt: now } });
    out.removed++;
    out.removedPaise += d.amountPaise;
  }
  await writeAudit(tx, ctx, {
    action: "transport-fee-removed", recordType: "Transport Assignment", recordId: assignmentId,
    after: { after: lastDay.toISOString().slice(0, 10), removed: out.removed, amount: formatRupees(out.removedPaise), kept: out.kept.map((k) => `${k.label}: ${k.why}`), reason },
  });
  return out;
}

/** Plain words for what was kept, for the toast. */
export const keptWords = (r: RemoveResult) => (r.kept.length ? ` ${r.kept.length} row${r.kept.length === 1 ? " was" : "s were"} kept (${r.kept.map((k) => `${k.label}: ${k.why}`).join("; ")}). Refund or adjust in Fee Management.` : "");

