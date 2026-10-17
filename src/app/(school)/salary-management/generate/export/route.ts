import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatRupees } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { salaryLevel } from "@/lib/salary/access";
import { lineDays } from "@/lib/salary/payroll";
import { monthName } from "@/lib/salary/words";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

/** A month's salary rows with the filters on screen (P8). HR's View exports days only, never amounts. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("salary-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export salary.", { status: 403 });
    throw e;
  }
  const level = salaryLevel(current.permissions);
  if (level !== "full" && level !== "view") return new Response("You can see only your own salary slips.", { status: 403 });
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(g("format")) ? g("format") : "xlsx") as ExportFormat;
  if (!UUID.test(g("run"))) return new Response("Choose the salary month.", { status: 400 });
  const q = g("q").trim().toLowerCase().slice(0, 80);
  const show = g("show");
  const data = await withSchool(current.ctx, async (tx) => {
    const run = await tx.payrollRun.findFirst({ where: { id: g("run") } });
    if (!run) return null;
    const lines = await tx.payrollLine.findMany({ where: { runId: run.id } });
    const staff = await tx.staff.findMany({ where: { id: { in: lines.map((l) => l.staffId) } }, select: { id: true, fullName: true, staffCode: true, designation: true } });
    const by = new Map(staff.map((s) => [s.id, s]));
    const rows = lines.map((l) => ({ l, s: by.get(l.staffId)!, d: lineDays(l) }))
      .filter((r) => !q || [r.s.fullName, r.s.staffCode, r.s.designation].some((x) => x.toLowerCase().includes(q)))
      .filter((r) => !show || (show === "flag" && r.l.flags.length > 0) || (show === "lop" && r.d.lop > 0) || (show === "adj" && r.l.flags.includes("Adjustment added")))
      .sort((a, b) => a.s.staffCode.localeCompare(b.s.staffCode));
    const words = [monthName(run.month), q && `search "${q}"`, show && { flag: "flagged", lop: "loss of pay", adj: "adjusted" }[show]].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title: `${monthName(run.month)} salary`, format, filters: words, rows: rows.length });
    return { run, rows, words };
  });
  if (!data) return new Response("This salary month was not found.", { status: 404 });
  type R = (typeof data.rows)[number];
  const r = (v: bigint) => formatRupees(v);
  const columns: ExportColumn<R>[] = [
    { label: "Staff ID", value: (x) => x.s.staffCode },
    { label: "Staff member", value: (x) => x.s.fullName },
    { label: "Designation", value: (x) => x.s.designation },
    { label: "Working days", value: (x) => x.l.workingDays },
    { label: "Paid days", value: (x) => x.d.paid },
    { label: "Paid leave", value: (x) => x.d.leave },
    { label: "Leave without pay", value: (x) => x.d.unpaid },
    { label: "Leave beyond the balance", value: (x) => x.d.beyond },
    { label: "Absent", value: (x) => x.d.absent },
    { label: "Late marks", value: (x) => x.l.lateMarks },
    { label: "Loss of pay days", value: (x) => x.d.lop },
    ...(level === "full" ? [
      { label: "Gross", value: (x: R) => r(x.l.grossPaise) },
      { label: "PF", value: (x: R) => r(x.l.pfPaise) },
      { label: "ESI", value: (x: R) => r(x.l.esiPaise) },
      { label: "Professional Tax", value: (x: R) => r(x.l.ptPaise) },
      { label: "TDS", value: (x: R) => r(x.l.tdsPaise) },
      { label: "Loans and advances", value: (x: R) => r(x.l.recoveryPaise) },
      { label: "Other deductions", value: (x: R) => r(x.l.cutPaise) },
      { label: "Net", value: (x: R) => r(x.l.netPaise) },
      { label: "Employer PF", value: (x: R) => r(x.l.erPfPaise) },
      { label: "Employer ESI", value: (x: R) => r(x.l.erEsiPaise) },
    ] : []),
    { label: "Flags", value: (x) => x.l.flags.join("; ") },
  ];
  return exportResponse(await buildExport(format, columns, data.rows, { title: `${monthName(data.run.month)} salary`, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: current.school.timeZone, filters: data.words }));
}
