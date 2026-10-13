import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatRupees } from "@/lib/format";
import { MoneyProblem } from "@/lib/fees/problem";
import { PermissionDeniedError } from "@/lib/permissions";
import { salaryLevel } from "@/lib/salary/access";
import { ecrText, recordStatement, type StatementRow } from "@/lib/salary/statements";
import { monthName } from "@/lib/salary/words";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

/** PF (EPFO ECR text file) or ESI (Excel) statement for a month; each one made is recorded. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("salary-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export salary.", { status: 403 });
    throw e;
  }
  if (salaryLevel(current.permissions) !== "full") return new Response("Only the Accountant, the Principal or the School Admin can make PF and ESI statements.", { status: 403 });
  const url = new URL(req.url);
  const runId = url.searchParams.get("run") ?? "";
  const kind = url.searchParams.get("kind") === "ESI" ? "ESI" : "PF";
  if (!UUID.test(runId)) return new Response("Choose the salary month.", { status: 400 });
  let made;
  try {
    made = await withSchool(current.ctx, async (tx) => {
      const r = await recordStatement(tx, current.ctx, runId, kind);
      await logExport(tx, current.ctx, { title: `${kind} statement ${monthName(r.run.month)}`, format: kind === "PF" ? "csv" : "xlsx", filters: monthName(r.run.month), rows: r.rows.length });
      return r;
    });
  } catch (e) {
    if (e instanceof MoneyProblem) return new Response(e.message, { status: 409 });
    throw e;
  }
  const tag = made.run.month.toISOString().slice(0, 7);
  if (kind === "PF") {
    return new Response(ecrText(made.rows), { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="PF-ECR-${tag}.txt"`, "Cache-Control": "no-store" } });
  }
  const columns: ExportColumn<StatementRow>[] = [
    { label: "Staff ID", value: (r) => r.code }, { label: "Name", value: (r) => r.name }, { label: "Days paid", value: (r) => r.paidDays },
    { label: "ESI wages", value: (r) => formatRupees(r.wagesPaise) }, { label: "Employee 0.75%", value: (r) => formatRupees(r.employeePaise) }, { label: "Employer 3.25%", value: (r) => formatRupees(r.employerPaise) },
  ];
  return exportResponse(await buildExport("xlsx", columns, made.rows, { title: `ESI statement ${monthName(made.run.month)}`, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: current.school.timeZone, filters: `${made.rows.length} staff · employee ${formatRupees(made.totals.employee)} · employer ${formatRupees(made.totals.employer)}` }));
}
