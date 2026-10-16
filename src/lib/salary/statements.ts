// PF and ESI statements for a month (10 §2, Done when 8): the files the
// school uploads to the EPFO and ESIC portals, made from the frozen payroll
// lines. Each statement made is kept as a Statutory Statement record.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { MoneyProblem } from "../fees/problem";
import { formatRupees } from "../format";
import { monthName } from "./words";

const ZERO = BigInt(0);
const rupees = (p: bigint) => String(p / BigInt(100));
/** Pension (EPS) share of the employer's PF: 8.33% of PF wages, at most ₹1,250 on the ₹15,000 ceiling. */
export const epsOf = (pfWage: bigint) => {
  const capped = pfWage < BigInt(1500000) ? pfWage : BigInt(1500000);
  return ((capped * BigInt(833)) / BigInt(10000) + BigInt(50)) / BigInt(100) * BigInt(100);
};

export type StatementRow = { staffId: string; name: string; code: string; number: string; wagesPaise: bigint; grossPaise: bigint; employeePaise: bigint; employerPaise: bigint; epsPaise: bigint; ncpDays: number; paidDays: number };

export async function statementRows(tx: Tx, runId: string, kind: "PF" | "ESI") {
  const run = await tx.payrollRun.findFirst({ where: { id: runId } });
  if (!run) throw new MoneyProblem("This salary month was not found.");
  if (!["APPROVED", "PAID", "LOCKED"].includes(run.status)) throw new MoneyProblem(`${monthName(run.month)} is not approved yet. Statements are made from approved salary.`);
  const lines = await tx.payrollLine.findMany({ where: { runId, included: true, ...(kind === "PF" ? { pfPaise: { gt: ZERO } } : { esiApplies: true }) } });
  const staff = await tx.staff.findMany({ where: { id: { in: lines.map((l) => l.staffId) } }, select: { id: true, fullName: true, staffCode: true, uan: true } });
  const rows: StatementRow[] = lines.map((l) => {
    const s = staff.find((x) => x.id === l.staffId)!;
    const eps = kind === "PF" ? epsOf(l.pfWagePaise) : ZERO;
    return {
      staffId: l.staffId, name: s.fullName, code: s.staffCode, number: kind === "PF" ? s.uan ?? "" : "",
      wagesPaise: kind === "PF" ? l.pfWagePaise : l.esiWagePaise, grossPaise: l.grossPaise,
      employeePaise: kind === "PF" ? l.pfPaise : l.esiPaise, employerPaise: kind === "PF" ? l.erPfPaise : l.erEsiPaise, epsPaise: eps,
      ncpDays: Number(l.lopDays), paidDays: Number(l.paidDays),
    };
  }).sort((a, b) => a.code.localeCompare(b.code));
  const total = (k: "wagesPaise" | "employeePaise" | "employerPaise") => rows.reduce((s, r) => s + r[k], ZERO);
  return { run, rows, totals: { wages: total("wagesPaise"), employee: total("employeePaise"), employer: total("employerPaise") } };
}

/** The EPFO ECR text file: one line per member, fields joined by #~#, amounts in whole rupees. */
export function ecrText(rows: StatementRow[]) {
  return rows.map((r) => [
    r.number, r.name.toUpperCase(), rupees(r.grossPaise), rupees(r.wagesPaise), rupees(r.wagesPaise < BigInt(1500000) ? r.wagesPaise : BigInt(1500000)), rupees(r.wagesPaise < BigInt(1500000) ? r.wagesPaise : BigInt(1500000)),
    rupees(r.employeePaise), rupees(r.epsPaise), rupees(r.employerPaise - r.epsPaise), String(Math.round(r.ncpDays)), "0",
  ].join("#~#")).join("\n");
}

/** Records a statement made, with its totals (kept for the audit and Salary History). */
export async function recordStatement(tx: Tx, ctx: SchoolContext, runId: string, kind: "PF" | "ESI") {
  const { run, rows, totals } = await statementRows(tx, runId, kind);
  if (!rows.length) throw new MoneyProblem(kind === "PF" ? "Nobody had PF in this month." : "Nobody had ESI in this month.");
  const missing = kind === "PF" ? rows.filter((r) => !r.number).length : 0;
  const saved = await tx.statutoryStatement.create({
    data: {
      schoolId: ctx.schoolId, runId, campusId: run.campusId, month: run.month, kind, staffCount: rows.length, wagesPaise: totals.wages, employeePaise: totals.employee, employerPaise: totals.employer,
      lines: rows.map((r) => ({ staffId: r.staffId, wages: String(r.wagesPaise), employee: String(r.employeePaise), employer: String(r.employerPaise) })), madeById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: `${kind.toLowerCase()}-statement-made`, recordType: "Statutory Statement", recordId: saved.id, after: { month: monthName(run.month), staff: rows.length, employee: formatRupees(totals.employee), employer: formatRupees(totals.employer) } });
  return { run, rows, totals, missing, saved };
}
