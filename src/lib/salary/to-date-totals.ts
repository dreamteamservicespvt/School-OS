// Salary to date, brought in when a school starts on School OS part way
// through the financial year (./to-date.ts, gap list G19): read by the year's
// totals (My Salary Slips, the salary reports) and the yearly pay behind the
// "No TDS amount" check in Generate Salary.
import type { Tx } from "../db";
import { addMonths, monthName } from "./words";

const ZERO = BigInt(0);

export type BroughtIn = { staffId: string; fromMonth: Date; upToMonth: Date; months: number; gross: bigint; pf: bigint; esi: bigint; pt: bigint; tds: bigint };

const monthsBetween = (from: Date, to: Date) => (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1;

const shape = (r: { staffId: string; fromMonth: Date; upToMonth: Date; grossPaise: bigint; pfPaise: bigint; esiPaise: bigint; ptPaise: bigint; tdsPaise: bigint }): BroughtIn => ({
  staffId: r.staffId, fromMonth: r.fromMonth, upToMonth: r.upToMonth, months: monthsBetween(r.fromMonth, r.upToMonth),
  gross: r.grossPaise, pf: r.pfPaise, esi: r.esiPaise, pt: r.ptPaise, tds: r.tdsPaise,
});

const SELECT = { staffId: true, fromMonth: true, upToMonth: true, grossPaise: true, pfPaise: true, esiPaise: true, ptPaise: true, tdsPaise: true } as const;

/**
 * Salary brought in that a period holds in whole (its first month on or after
 * the period's start, its last on or before the period's end), added up per
 * staff member. No period (all time): every one.
 */
export async function salaryBroughtIn(tx: Tx, opts: { staffIds?: string[]; from: Date | null; to: Date | null; campusId?: string | null }): Promise<BroughtIn[]> {
  const rows = await tx.salaryToDate.findMany({
    where: {
      archivedAt: null,
      ...(opts.staffIds ? { staffId: { in: opts.staffIds } } : {}),
      ...(opts.from && opts.to ? { fromMonth: { gte: new Date(Date.UTC(opts.from.getUTCFullYear(), opts.from.getUTCMonth(), 1)) }, upToMonth: { lte: opts.to } } : {}),
    },
    select: SELECT,
    orderBy: { fromMonth: "asc" },
  });
  if (!opts.campusId) return rows.map(shape);
  const onCampus = new Set((await tx.staff.findMany({ where: { id: { in: rows.map((r) => r.staffId) }, campusId: opts.campusId }, select: { id: true } })).map((s) => s.id));
  return rows.filter((r) => onCampus.has(r.staffId)).map(shape);
}

/** Salary brought in for the financial year holding this month, per staff member. */
export async function salaryBroughtInForMonth(tx: Tx, staffIds: string[], month: Date): Promise<Map<string, BroughtIn>> {
  const out = new Map<string, BroughtIn>();
  if (!staffIds.length) return out;
  const rows = await tx.salaryToDate.findMany({ where: { archivedAt: null, staffId: { in: staffIds }, fromMonth: { lte: month, gt: addMonths(month, -12) } }, select: SELECT });
  for (const r of rows) out.set(r.staffId, shape(r));
  return out;
}

/** "Before School OS, April to September 2026". */
export const broughtInLabel = (b: Pick<BroughtIn, "fromMonth" | "upToMonth">) =>
  `Before School OS, ${monthName(b.fromMonth).split(" ")[0]}${b.fromMonth.getUTCFullYear() !== b.upToMonth.getUTCFullYear() ? ` ${b.fromMonth.getUTCFullYear()}` : ""} to ${monthName(b.upToMonth)}`;

/**
 * Likely gross for the financial year, for the "No TDS amount" check: the
 * salary brought in, plus this month's full gross for each month it does not
 * cover. Without salary brought in: twelve months of this month's gross.
 */
export function yearlyGross(monthlyGross: bigint, b: BroughtIn | undefined) {
  if (!b) return monthlyGross * BigInt(12);
  return b.gross + monthlyGross * BigInt(Math.max(0, 12 - b.months));
}

export const sumBroughtIn = (list: BroughtIn[]) =>
  list.reduce((a, b) => ({ gross: a.gross + b.gross, pf: a.pf + b.pf, esi: a.esi + b.esi, pt: a.pt + b.pt, tds: a.tds + b.tds }), { gross: ZERO, pf: ZERO, esi: ZERO, pt: ZERO, tds: ZERO });
