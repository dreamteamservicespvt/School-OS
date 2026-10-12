import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { formatDate } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { todayIn } from "@/lib/staff/dates";
import { periodSetup } from "@/lib/period-setup";
import { periodFromSearch } from "@/lib/periods";
import { financeLevel } from "@/lib/finance/access";
import { financeFeaturesOn } from "@/lib/finance/settings";
import { tallyVouchers } from "@/lib/finance/tally";
import { chosenFinancialYear } from "@/lib/finance/years";

export const dynamic = "force-dynamic";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * Tally export (optional, 07 §6): the vouchers for the year and dates on
 * screen as Tally import XML. Full Finance Management only, since it holds
 * every entry, staff pay included.
 */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("finance-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return text("You do not have permission to export for Tally.", 403);
    throw e;
  }
  if (financeLevel(current.permissions) !== "full") return text("Only the accounts team can export for Tally.", 403);
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const today = todayIn(current.school.timeZone);
  const range = periodFromSearch(sp, { ...(await periodSetup(current)), fallback: null });
  const result = await withSchool(current.ctx, async (tx) => {
    if (!(await financeFeaturesOn(tx, current.ctx)).has("finance-tally")) return null;
    const fy = await chosenFinancialYear(tx, current.ctx, sp.fy, today);
    const end = fy.endDate < today ? fy.endDate : today;
    const from = range && new Date(`${range.from}T00:00:00Z`) > fy.startDate ? new Date(`${range.from}T00:00:00Z`) : fy.startDate;
    const to = range && new Date(`${range.to}T00:00:00Z`) < end ? new Date(`${range.to}T00:00:00Z`) : end;
    const { xml, count } = await tallyVouchers(tx, current.ctx, from, to < from ? from : to);
    // Logged like every export (the export log reads these audit entries); Tally files are XML.
    await writeAudit(tx, current.ctx, { action: "exported", recordType: "Export", recordId: null, after: { title: "Tally vouchers", format: "xml", filters: `${formatDate(from)} to ${formatDate(to)}`, rows: count } });
    return { xml, name: `tally-vouchers-${fy.name}-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.xml` };
  });
  if (!result) return text("Tally export is switched off in Finance Settings.", 404);
  return new Response(result.xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${result.name}"`, "Cache-Control": "private, no-store" } });
}
