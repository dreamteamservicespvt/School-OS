import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportFormat } from "@/lib/exports";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodSetup } from "@/lib/period-setup";
import { periodFromSearch } from "@/lib/periods";
import { salaryLevel } from "@/lib/salary/access";
import { SALARY_REPORTS, buildSalaryReport, type SalaryReportKey } from "@/lib/salary/reports";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

/** One salary report for the period on screen (P8). HR's View gets only the days report; amounts need full Salary Management. */
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
  const key = g("kind") as SalaryReportKey;
  const def = SALARY_REPORTS.find((x) => x.key === key);
  if (!def) return new Response("Choose a report.", { status: 400 });
  if (def.money && level !== "full") return new Response("This report shows salary amounts. HR sees days, leave and loss of pay only.", { status: 403 });
  const dates = await periodSetup(current);
  const range = periodFromSearch(Object.fromEntries(url.searchParams), { ...dates, fallback: "finyear", prefix: "" });
  const from = range ? new Date(`${range.from}T00:00:00Z`) : null;
  const to = range ? new Date(`${range.to}T00:00:00Z`) : null;
  const staffId = UUID.test(g("who")) ? g("who") : null;
  if (key === "employee" && !staffId) return new Response("Choose the staff member.", { status: 400 });
  const out = await withSchool(current.ctx, async (tx) => {
    // One campus: their campus's months only.
    const built = await buildSalaryReport(tx, key, { from, to, staffId, money: level === "full", campusId: current.campusId });
    if (!built) return null;
    const words = range?.label ?? "Any date";
    await logExport(tx, current.ctx, { title: built.title, format, filters: words, rows: built.rows.length });
    return { built, words };
  }, { timeout: 30_000 });
  if (!out) return new Response("This report was not found.", { status: 404 });
  return exportResponse(await buildExport(format, out.built.columns, out.built.rows, { title: out.built.title, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: current.school.timeZone, filters: out.words }));
}
