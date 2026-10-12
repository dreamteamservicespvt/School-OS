import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatRupees } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { todayIn } from "@/lib/staff/dates";
import { budgetsWithUse } from "@/lib/finance/budgets";
import { financeFeaturesOn } from "@/lib/finance/settings";
import { chosenFinancialYear } from "@/lib/finance/years";
import { hiddenPayHeads } from "@/lib/finance/access";

export const dynamic = "force-dynamic";

const ZERO = BigInt(0);
const money = (v: bigint) => (v < ZERO ? `−${formatRupees(-v)}` : formatRupees(v));

/** Budget against spending for one financial year (P8). */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("finance-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export budgets.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const result = await withSchool(current.ctx, async (tx) => {
    if (!(await financeFeaturesOn(tx, current.ctx)).has("finance-budget")) return null;
    const fy = await chosenFinancialYear(tx, current.ctx, url.searchParams.get("fy"), todayIn(current.school.timeZone));
    const [budgets, heads, centres] = await Promise.all([budgetsWithUse(tx, fy.id, await hiddenPayHeads(tx, current.permissions)), tx.accountHead.findMany({ select: { id: true, name: true, code: true } }), tx.costCentre.findMany({ select: { id: true, name: true } })]);
    const rows = budgets.map((b) => ({
      head: heads.find((h) => h.id === b.accountHeadId)?.name ?? "", code: heads.find((h) => h.id === b.accountHeadId)?.code ?? "",
      dept: b.costCentreId ? centres.find((c) => c.id === b.costCentreId)?.name ?? "" : "All departments",
      original: b.originalPaise, budget: b.amountPaise, spent: b.spent, committed: b.committed, left: b.remaining, pct: b.pct, revisions: b.revisions.length,
    }));
    await logExport(tx, current.ctx, { title: "Budget against spending", format, filters: `Financial year ${fy.name}`, rows: rows.length });
    return { rows, year: fy.name };
  });
  if (!result) return new Response("Budgets are switched off.", { status: 404 });
  type Row = (typeof result.rows)[number];
  const columns: ExportColumn<Row>[] = [
    { label: "Expense head", value: (r) => r.head },
    { label: "Code", value: (r) => r.code },
    { label: "Department", value: (r) => r.dept },
    { label: "Original budget", value: (r) => formatRupees(r.original) },
    { label: "Budget now", value: (r) => formatRupees(r.budget) },
    { label: "Spent", value: (r) => formatRupees(r.spent) },
    { label: "Committed", value: (r) => formatRupees(r.committed) },
    { label: "Left", value: (r) => money(r.left) },
    { label: "Used", value: (r) => `${r.pct}%` },
    { label: "Revisions", value: (r) => String(r.revisions) },
  ];
  return exportResponse(await buildExport(format, columns, result.rows, { title: "Budget against spending", schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: current.school.timeZone, filters: `Financial year ${result.year}` }));
}
