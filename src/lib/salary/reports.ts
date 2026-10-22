// Salary reports (10 §5 Salary History, Reports). Each report is rows and
// columns for the shared export (Excel, CSV or PDF). Amounts only when the
// person has full Salary Management; HR's View gets the days report only.
import type { Tx } from "../db";
import type { ExportColumn } from "../exports";
import { formatDate, formatRupees } from "../format";
import { firstOfMonth, monthName } from "./words";
import { broughtInLabel, salaryBroughtIn, sumBroughtIn } from "./to-date-totals";

export const SALARY_REPORTS = [
  { key: "summary", title: "Monthly payroll summary", sub: "Gross, deductions and net for each month", money: true },
  { key: "trends", title: "Monthly trends", sub: "How the salary bill moved over the period", money: true },
  { key: "department", title: "Department and designation breakdown", sub: "Where the salary goes", money: true },
  { key: "employee", title: "Employee salary history", sub: "Every month for one person", money: true },
  { key: "deductions", title: "Deductions by component", sub: "PF, ESI, Professional Tax, TDS, recoveries", money: true },
  { key: "pt-tds", title: "Professional Tax and TDS deducted", sub: "By month and staff member", money: true },
  { key: "days", title: "Attendance, leave and loss of pay", sub: "Paid days, leave and LOP by month and staff member", money: false },
] as const;
export type SalaryReportKey = (typeof SALARY_REPORTS)[number]["key"];

const DONE = ["APPROVED", "PAID", "LOCKED"] as const;
const ZERO = BigInt(0);
const r = (v: bigint) => formatRupees(v);
const n = (v: unknown) => Number(v);

type Built = { title: string; columns: ExportColumn<Record<string, unknown>>[]; rows: Record<string, unknown>[] };
const col = (label: string, key: string): ExportColumn<Record<string, unknown>> => ({ label, value: (x) => x[key] as string | number });

/** Runs whose month falls in the period, oldest first. `campusId` ("One campus"): that campus's runs only. */
export async function runsIn(tx: Tx, from: Date | null, to: Date | null, opts: { done?: boolean; campusId?: string | null } = {}) {
  return tx.payrollRun.findMany({
    where: { ...(from && to ? { month: { gte: firstOfMonth(from), lte: to } } : {}), ...(opts.done ? { status: { in: [...DONE] } } : { status: { not: "OPEN" } }), ...(opts.campusId ? { campusId: opts.campusId } : {}) },
    orderBy: [{ month: "asc" }],
  });
}

export async function buildSalaryReport(tx: Tx, key: SalaryReportKey, o: { from: Date | null; to: Date | null; staffId?: string | null; money: boolean; campusId?: string | null }): Promise<Built | null> {
  const def = SALARY_REPORTS.find((x) => x.key === key);
  if (!def || (def.money && !o.money)) return null;
  const runs = await runsIn(tx, o.from, o.to, { done: key !== "summary" && key !== "days", campusId: o.campusId });
  const campuses = await tx.campus.findMany({ where: o.campusId ? { id: o.campusId } : {}, select: { id: true, name: true } });
  const campus = new Map(campuses.map((c) => [c.id, c.name]));
  const many = campuses.length > 1;
  const runOf = new Map(runs.map((x) => [x.id, x]));
  const label = (runId: string) => { const x = runOf.get(runId)!; return `${monthName(x.month)}${many ? ` · ${campus.get(x.campusId) ?? ""}` : ""}`; };

  if (key === "summary") {
    return {
      title: def.title,
      columns: [col("Month", "m"), ...(many ? [col("Campus", "c")] : []), col("Staff", "s"), col("Gross", "g"), col("Deductions", "d"), col("Net", "n"), col("Employer PF", "epf"), col("Employer ESI", "eesi"), col("Status", "st"), col("Paid on", "p")],
      rows: runs.map((x) => ({ m: monthName(x.month), c: campus.get(x.campusId) ?? "", s: x.staffCount, g: r(x.grossPaise), d: r(x.deductionsPaise), n: r(x.netPaise), epf: r(x.employerPfPaise), eesi: r(x.employerEsiPaise), st: x.status.charAt(0) + x.status.slice(1).toLowerCase(), p: x.paidOn ? formatDate(x.paidOn) : "" })),
    };
  }
  if (key === "trends") {
    const by = new Map<string, { month: Date; staff: number; net: bigint; gross: bigint }>();
    for (const x of runs) { const k = x.month.toISOString().slice(0, 7); const v = by.get(k) ?? { month: x.month, staff: 0, net: ZERO, gross: ZERO }; v.staff += x.staffCount; v.net += x.netPaise; v.gross += x.grossPaise; by.set(k, v); }
    const list = [...by.values()];
    return {
      title: def.title,
      columns: [col("Month", "m"), col("Staff", "s"), col("Gross", "g"), col("Net", "n"), col("Change in net from the month before", "c"), col("Change %", "p")],
      rows: list.map((v, i) => { const prev = list[i - 1]; const diff = prev ? v.net - prev.net : null; return { m: monthName(v.month), s: v.staff, g: r(v.gross), n: r(v.net), c: diff === null ? "" : `${diff < ZERO ? "−" : "+"}${r(diff < ZERO ? -diff : diff)}`, p: diff === null || prev!.net === ZERO ? "" : `${(Number((diff * BigInt(1000)) / prev!.net) / 10).toFixed(1)}%` }; }),
    };
  }
  const lines = await tx.payrollLine.findMany({ where: { runId: { in: runs.map((x) => x.id) }, included: true, ...(key === "employee" ? { staffId: o.staffId ?? "00000000-0000-0000-0000-000000000000" } : {}) } });
  const staff = await tx.staff.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.staffId))] } }, select: { id: true, fullName: true, staffCode: true, designation: true, department: { select: { name: true } } } });
  const who = new Map(staff.map((s) => [s.id, s]));
  const order = (a: (typeof lines)[number], b: (typeof lines)[number]) => runOf.get(a.runId)!.month.getTime() - runOf.get(b.runId)!.month.getTime() || (who.get(a.staffId)?.staffCode ?? "").localeCompare(who.get(b.staffId)?.staffCode ?? "");
  lines.sort(order);

  if (key === "department") {
    const by = new Map<string, { d: string; g: string; staff: Set<string>; gross: bigint; net: bigint }>();
    for (const l of lines) { const s = who.get(l.staffId); const k = `${s?.department?.name ?? "No department"}|${s?.designation ?? ""}`; const v = by.get(k) ?? { d: s?.department?.name ?? "No department", g: s?.designation ?? "", staff: new Set(), gross: ZERO, net: ZERO }; v.staff.add(l.staffId); v.gross += l.grossPaise; v.net += l.netPaise; by.set(k, v); }
    return {
      title: def.title,
      columns: [col("Department", "d"), col("Designation", "g"), col("Staff", "s"), col("Gross", "gr"), col("Net", "n")],
      rows: [...by.values()].sort((a, b) => (b.gross > a.gross ? 1 : b.gross < a.gross ? -1 : 0)).map((v) => ({ d: v.d, g: v.g, s: v.staff.size, gr: r(v.gross), n: r(v.net) })),
    };
  }
  // Salary paid this financial year before School OS (Salary to date, G19): its own row, never a month's.
  const before = key === "employee" || key === "deductions" || key === "pt-tds"
    ? await salaryBroughtIn(tx, { staffIds: key === "employee" ? [o.staffId ?? "00000000-0000-0000-0000-000000000000"] : undefined, from: o.from, to: o.to, campusId: o.campusId })
    : [];
  if (key === "employee") {
    if (!o.staffId) return null;
    const s = who.get(o.staffId) ?? (before.length ? await tx.staff.findUnique({ where: { id: o.staffId }, select: { id: true, fullName: true, staffCode: true, designation: true, department: { select: { name: true } } } }) : null);
    return {
      title: `${def.title}${s ? ` · ${s.fullName}` : ""}`,
      columns: [col("Month", "m"), col("Paid days", "pd"), col("Loss of pay days", "lop"), col("Gross", "g"), col("PF", "pf"), col("ESI", "esi"), col("Professional Tax", "pt"), col("TDS", "tds"), col("Loans and advances", "rec"), col("Other deductions", "cut"), col("Net", "n")],
      rows: [
        ...before.map((b) => ({ m: broughtInLabel(b), pd: "", lop: "", g: r(b.gross), pf: r(b.pf), esi: r(b.esi), pt: r(b.pt), tds: r(b.tds), rec: "", cut: "", n: "" })),
        ...lines.map((l) => ({ m: label(l.runId), pd: n(l.paidDays), lop: n(l.lopDays), g: r(l.grossPaise), pf: r(l.pfPaise), esi: r(l.esiPaise), pt: r(l.ptPaise), tds: r(l.tdsPaise), rec: r(l.recoveryPaise), cut: r(l.cutPaise), n: r(l.netPaise) })),
      ],
    };
  }
  if (key === "deductions") {
    const by = new Map<string, Record<string, bigint>>();
    for (const l of lines) { const k = l.runId; const v = by.get(k) ?? { pf: ZERO, esi: ZERO, pt: ZERO, tds: ZERO, rec: ZERO, cut: ZERO, all: ZERO, epf: ZERO, eesi: ZERO }; v.pf += l.pfPaise; v.esi += l.esiPaise; v.pt += l.ptPaise; v.tds += l.tdsPaise; v.rec += l.recoveryPaise; v.cut += l.cutPaise; v.all += l.deductionsPaise; v.epf += l.erPfPaise; v.eesi += l.erEsiPaise; by.set(k, v); }
    return {
      title: def.title,
      columns: [col("Month", "m"), col("PF", "pf"), col("ESI", "esi"), col("Professional Tax", "pt"), col("TDS", "tds"), col("Loans and advances", "rec"), col("Other deductions", "cut"), col("Total deductions", "all"), col("Employer PF", "epf"), col("Employer ESI", "eesi")],
      rows: [
        ...(before.length ? [(() => { const t = sumBroughtIn(before); return { m: "Before School OS (brought in)", pf: r(t.pf), esi: r(t.esi), pt: r(t.pt), tds: r(t.tds), rec: "", cut: "", all: r(t.pf + t.esi + t.pt + t.tds), epf: "", eesi: "" }; })()] : []),
        ...[...by.entries()].map(([k, v]) => ({ m: label(k), ...Object.fromEntries(Object.entries(v).map(([a, b]) => [a, r(b)])) })),
      ],
    };
  }
  if (key === "pt-tds") {
    return {
      title: def.title,
      columns: [col("Month", "m"), col("Staff ID", "id"), col("Staff member", "s"), col("Gross", "g"), col("Professional Tax", "pt"), col("TDS", "tds")],
      rows: [
        ...(await (async () => {
          const shown = before.filter((b) => b.pt > ZERO || b.tds > ZERO);
          const people = new Map((await tx.staff.findMany({ where: { id: { in: shown.map((b) => b.staffId) } }, select: { id: true, fullName: true, staffCode: true } })).map((p) => [p.id, p]));
          return shown.map((b) => ({ m: broughtInLabel(b), id: people.get(b.staffId)?.staffCode ?? "", s: people.get(b.staffId)?.fullName ?? "", g: r(b.gross), pt: r(b.pt), tds: r(b.tds) }));
        })()),
        ...lines.filter((l) => l.ptPaise > ZERO || l.tdsPaise > ZERO).map((l) => ({ m: label(l.runId), id: who.get(l.staffId)?.staffCode ?? "", s: who.get(l.staffId)?.fullName ?? "", g: r(l.grossPaise), pt: r(l.ptPaise), tds: r(l.tdsPaise) })),
      ],
    };
  }
  // days: no money at all, for HR's View too.
  return {
    title: def.title,
    columns: [col("Month", "m"), col("Staff ID", "id"), col("Staff member", "s"), col("Days in month", "dm"), col("Working days", "w"), col("Paid days", "pd"), col("Paid leave", "lv"), col("Leave without pay", "ul"), col("Leave beyond the balance", "bl"), col("Absent", "ab"), col("Late marks", "lt"), col("Loss of pay days", "lop")],
    rows: lines.map((l) => ({ m: label(l.runId), id: who.get(l.staffId)?.staffCode ?? "", s: who.get(l.staffId)?.fullName ?? "", dm: l.daysInMonth, w: l.workingDays, pd: n(l.paidDays), lv: n(l.leaveDays) - n(l.unpaidLeaveDays) - n(l.leaveLopDays ?? 0), ul: n(l.unpaidLeaveDays), bl: n(l.leaveLopDays ?? 0), ab: n(l.absentDays), lt: l.lateMarks, lop: n(l.lopDays) })),
  };
}
