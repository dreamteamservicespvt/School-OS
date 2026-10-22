import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { PermissionDeniedError } from "@/lib/permissions";
import { salaryLevel } from "@/lib/salary/access";
import { monthName } from "@/lib/salary/words";
import { runsOnCampus } from "@/lib/salary/campus";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

/** The bank transfer list for an approved month: account, IFSC and net pay for each person. Full Salary Management only; logged. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("salary-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export salary.", { status: 403 });
    throw e;
  }
  if (salaryLevel(current.permissions) !== "full") return new Response("Only the Accountant, the Principal or the School Admin can make the bank transfer file.", { status: 403 });
  const url = new URL(req.url);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const runId = url.searchParams.get("run") ?? "";
  if (!UUID.test(runId)) return new Response("Choose the salary month.", { status: 400 });
  const data = await withSchool(current.ctx, async (tx) => {
    // One campus: another campus's month is not found.
    const run = await tx.payrollRun.findFirst({ where: { id: runId, ...runsOnCampus(current) } });
    if (!run) return { error: "This salary month was not found." };
    if (!["APPROVED", "PAID", "LOCKED"].includes(run.status)) return { error: `${monthName(run.month)} is not approved yet. The bank file is made from approved salary.` };
    const lines = await tx.payrollLine.findMany({ where: { runId, included: true } });
    const staff = await tx.staff.findMany({ where: { id: { in: lines.map((l) => l.staffId) } }, select: { id: true, fullName: true, staffCode: true, bankAccountEnc: true, bankIfsc: true, bankName: true } });
    const rows = lines.map((l) => {
      const s = staff.find((x) => x.id === l.staffId)!;
      return { code: s.staffCode, name: s.fullName, bank: s.bankName ?? "", account: s.bankAccountEnc ? decryptField(s.bankAccountEnc) : "", ifsc: s.bankIfsc ?? "", amount: (Number(l.netPaise) / 100).toFixed(2), how: s.bankAccountEnc ? "Bank transfer" : "Cheque or cash: no bank account on file" };
    }).sort((a, b) => a.code.localeCompare(b.code));
    await logExport(tx, current.ctx, { title: `Bank transfer list ${monthName(run.month)}`, format, filters: monthName(run.month), rows: rows.length });
    return { run, rows };
  });
  if ("error" in data) return new Response(data.error, { status: 409 });
  type R = (typeof data.rows)[number];
  const columns: ExportColumn<R>[] = [
    { label: "Staff ID", value: (r) => r.code }, { label: "Name", value: (r) => r.name }, { label: "Bank", value: (r) => r.bank },
    { label: "Account number", value: (r) => r.account }, { label: "IFSC", value: (r) => r.ifsc }, { label: "Amount (₹)", value: (r) => r.amount }, { label: "How", value: (r) => r.how },
  ];
  const title = `Salary ${monthName(data.run.month)} bank transfer`;
  return exportResponse(await buildExport(format, columns, data.rows, { title, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: current.school.timeZone, filters: monthName(data.run.month) }));
}
