// Salary to date (workflow 15, gap list G19). A school that starts on School
// OS part way through the financial year brings in, for each staff member,
// the gross pay, PF, ESI, Professional Tax and TDS already paid this year in
// the old software, up to the month before School OS. Each row becomes one
// Salary to Date for the financial year: the year's totals on My Salary
// Slips and in the salary reports include it, and the "No TDS amount" check
// in Generate Salary reads the year's likely pay from it. It is never posted
// to the Day Book: that money left before School OS.
//
// Brought in from Salary Management, Import, or Switching to School OS, by
// people with full Salary Management only (the Accountant, the Principal, the
// School Admin), as for salary itself. A person limited to one campus brings
// in that campus's staff only. Undo archives the rows. Imported by
// src/lib/import-registry.ts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineImport, type ImportKind } from "../importer";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { parseRupees } from "../fees/act";
import { MoneyProblem } from "../fees/problem";
import { financialYearOf, fyBounds, fyStartMonth } from "../finance/years";
import { campusLimitOf } from "../staff/campus-logins";
import { todayIn } from "../staff/dates";
import { moveInGoLive } from "../move-in/live";
import { addMonths, firstOfMonth, monthName } from "./words";

export const SALARY_TO_DATE = "salary-to-date";

const ZERO = BigInt(0);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

type Row = { staffId: string; staffName: string; fromMonth: Date; upToMonth: Date; gross: bigint; pf: bigint; esi: bigint; pt: bigint; tds: bigint };

/** A month written as "September 2026", "Sep-26", "09-2026", "2026-09" or a date in it; its 1st, or null. */
export function monthOf(raw: string): Date | null {
  const v = raw.trim().toLowerCase().replace(/[,']/g, " ").replace(/\s+/g, " ");
  if (!v) return null;
  const at = (y: number, m: number) => (m >= 1 && m <= 12 && y >= 2000 && y <= 2100 ? new Date(Date.UTC(y, m - 1, 1)) : null);
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  let m = /^(\d{1,2})[-/. ](\d{4})$/.exec(v);
  if (m) return at(Number(m[2]), Number(m[1]));
  m = /^(\d{4})[-/. ](\d{1,2})$/.exec(v);
  if (m) return at(Number(m[1]), Number(m[2]));
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return at(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/.exec(v);
  if (m) return at(Number(m[3]), Number(m[2]));
  m = /^([a-z]+)[-/. ]?(\d{2}|\d{4})$/.exec(v);
  if (m) {
    const i = MONTHS.findIndex((n) => m![1].length >= 3 && n.startsWith(m![1]));
    return i < 0 ? null : at(year(m[2]), i + 1);
  }
  return null;
}

function makeKind(): ImportKind<Row> {
  type Memo = { today: Promise<Date>; goLive: Promise<Date | null>; startMonth: Promise<number>; limit: Promise<string | null>; runs: Map<string, Promise<string[]>> };
  const memo = new WeakMap<Set<string>, Memo>();
  const lookups = (tx: Tx, ctx: SchoolContext, seen: Set<string>) => {
    let m = memo.get(seen);
    if (!m) {
      m = {
        today: tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } }).then((s) => todayIn(s?.timeZone)),
        goLive: moveInGoLive(tx, ctx),
        startMonth: fyStartMonth(tx, ctx),
        limit: campusLimitOf(tx, ctx),
        runs: new Map(),
      };
      memo.set(seen, m);
    }
    return m;
  };
  return {
    key: SALARY_TO_DATE,
    label: "Salary to date",
    columns: [
      { key: "staffId", label: "Staff ID", required: true, example: "SPS-ST-001", help: "The staff ID in Staff & HR.", aliases: ["staff_id", "staff code", "employee id", "emp id", "emp code", "staff no"] },
      { key: "gross", label: "Gross paid", required: true, example: "180000", help: "Gross salary paid this financial year before School OS, in rupees.", aliases: ["gross", "gross salary", "gross pay", "gross earnings", "total earnings", "gross ytd", "ytd gross"] },
      { key: "pf", label: "PF", example: "15840", help: "The staff member's own PF deducted, in rupees.", aliases: ["pf deducted", "employee pf", "epf", "pf ytd", "provident fund"] },
      { key: "esi", label: "ESI", example: "0", help: "The staff member's own ESI deducted, in rupees.", aliases: ["esi deducted", "employee esi", "esic", "esi ytd"] },
      { key: "pt", label: "Professional Tax", example: "1200", aliases: ["pt", "prof tax", "professional tax deducted", "p tax", "pt ytd"] },
      { key: "tds", label: "TDS", example: "6000", help: "Income tax deducted at source, in rupees.", aliases: ["tds deducted", "income tax", "tax deducted", "tds ytd", "it"] },
      { key: "upToMonth", label: "Up to month", example: "September 2026", help: "The last month these totals cover. Leave empty for the month before your go-live date.", aliases: ["up to", "upto", "till month", "to month", "last month", "month"] },
    ],
    withOptions: () => makeKind(),
    async check(tx, ctx, row, seen) {
      const problems: string[] = [];
      const l = lookups(tx, ctx, seen);
      const [today, goLive, startMonth, limit] = await Promise.all([l.today, l.goLive, l.startMonth, l.limit]);
      const code = (row.staffId ?? "").trim();
      // One campus: a staff ID of another campus reads as "no staff with ID", like one that does not exist.
      const staff = code ? await tx.staff.findFirst({ where: { staffCode: { equals: code, mode: "insensitive" }, archivedAt: null, ...(limit ? { campusId: limit } : {}) }, select: { id: true, fullName: true, campusId: true } }) : null;
      if (code && !staff) problems.push(`No staff member has the staff ID ${code}.`);
      if (staff) {
        if (seen.has(`staff:${staff.id}`)) problems.push(`${staff.fullName} is twice in the file. Keep one row for each staff member, with the totals for the year so far.`);
        seen.add(`staff:${staff.id}`);
      }
      const amount = (key: string, label: string) => {
        try {
          return parseRupees(row[key] ?? "", label) ?? ZERO;
        } catch (e) {
          if (e instanceof MoneyProblem) { problems.push(e.message); return null; }
          throw e;
        }
      };
      const gross = amount("gross", "Gross paid");
      const pf = amount("pf", "PF"), esi = amount("esi", "ESI"), pt = amount("pt", "Professional Tax"), tds = amount("tds", "TDS");
      if (gross !== null && gross <= ZERO && !problems.some((p) => p.startsWith("Gross"))) problems.push("Gross paid must be more than ₹0.");
      if (gross !== null && pf !== null && esi !== null && pt !== null && tds !== null && pf + esi + pt + tds > gross) {
        problems.push(`PF, ESI, Professional Tax and TDS together (${formatRupees(pf + esi + pt + tds)}) cannot be more than the gross paid (${formatRupees(gross)}).`);
      }
      let upTo: Date | null = null;
      const typed = (row.upToMonth ?? "").trim();
      if (typed) {
        upTo = monthOf(typed);
        if (!upTo) problems.push("Up to month must be a month like September 2026 or 09-2026.");
      } else if (goLive) upTo = addMonths(firstOfMonth(goLive), -1);
      else problems.push("Up to month is empty and no go-live date is set. Write the last month these totals cover, or set the go-live date on the go-live check.");
      if (upTo && upTo > firstOfMonth(today)) problems.push(`Up to month cannot be after ${monthName(firstOfMonth(today))}.`);
      if (upTo && goLive && upTo >= firstOfMonth(goLive)) problems.push(`Salary from ${monthName(firstOfMonth(goLive))}, the go-live month, is worked out in School OS. Bring in totals up to ${monthName(addMonths(firstOfMonth(goLive), -1))}.`);
      if (problems.length || !staff || !upTo || gross === null || pf === null || esi === null || pt === null || tds === null) return { ok: false, problems };

      const fy = fyBounds(upTo, startMonth);
      const had = await tx.salaryToDate.findFirst({ where: { staffId: staff.id, archivedAt: null, fromMonth: fy.start }, select: { upToMonth: true, grossPaise: true } });
      if (had) return { ok: false, problems: [`Salary to date for ${staff.fullName} is already brought in for ${fy.name} (${formatRupees(had.grossPaise)} gross up to ${monthName(had.upToMonth)}). Undo that import first to bring it in again.`] };
      // Months already worked out in School OS would be counted twice.
      const key = `${fy.start.toISOString()}|${upTo.toISOString()}`;
      if (!l.runs.has(key)) l.runs.set(key, tx.payrollRun.findMany({ where: { month: { gte: fy.start, lte: upTo }, status: { not: "OPEN" } }, select: { id: true } }).then((r) => r.map((x) => x.id)));
      const runIds = await l.runs.get(key)!;
      const done = runIds.length ? await tx.payrollLine.findFirst({ where: { staffId: staff.id, runId: { in: runIds }, included: true }, select: { runId: true } }) : null;
      if (done) {
        const run = await tx.payrollRun.findUnique({ where: { id: done.runId }, select: { month: true } });
        return { ok: false, problems: [`${staff.fullName}'s salary for ${run ? monthName(run.month) : "a month in that time"} is already worked out in School OS. Bring in totals only for the months before it.`] };
      }
      return { ok: true, value: { staffId: staff.id, staffName: staff.fullName, fromMonth: fy.start, upToMonth: upTo, gross, pf, esi, pt, tds } };
    },
    async save(tx, ctx, v) {
      const fy = await financialYearOf(tx, ctx, v.upToMonth);
      const row = await tx.salaryToDate.create({
        data: {
          schoolId: ctx.schoolId, staffId: v.staffId, financialYearId: fy.id, fromMonth: v.fromMonth, upToMonth: v.upToMonth,
          grossPaise: v.gross, pfPaise: v.pf, esiPaise: v.esi, ptPaise: v.pt, tdsPaise: v.tds, createdById: ctx.userId,
        },
      });
      await writeAudit(tx, ctx, {
        action: "brought-in", recordType: "Salary to Date", recordId: row.id,
        after: { staff: v.staffName, financialYear: fy.name, from: monthName(v.fromMonth), upTo: monthName(v.upToMonth), gross: formatRupees(v.gross), pf: formatRupees(v.pf), esi: formatRupees(v.esi), professionalTax: formatRupees(v.pt), tds: formatRupees(v.tds), dayBook: "Not posted: paid before School OS" },
      });
      return { id: row.id, created: true };
    },
    async undo(tx, ctx, ids) {
      const { count } = await tx.salaryToDate.updateMany({ where: { id: { in: ids }, archivedAt: null }, data: { archivedAt: new Date() } });
      await writeAudit(tx, ctx, { action: "archived", recordType: "Salary to Date", recordId: null, after: { reason: "Import undone", staff: count } });
    },
  };
}

defineImport(makeKind());
