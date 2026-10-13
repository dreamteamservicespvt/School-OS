import { requireAction } from "@/lib/current";
import { PermissionDeniedError } from "@/lib/permissions";
import { salaryLevel } from "@/lib/salary/access";

export const dynamic = "force-dynamic";

/** The empty import template: headings and one example row. */
export async function GET() {
  try {
    const { current } = await requireAction("salary-management", "create");
    if (salaryLevel(current.permissions) !== "full") return new Response("Only salary staff can import structures.", { status: 403 });
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to import salary structures.", { status: 403 });
    throw e;
  }
  const body = "staff_id,basic,conveyance,special_allowance,tds,effective_from\nSPS-ST-001,22000,1600,3400,0,01-11-2026\n";
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="salary-structure-template.csv"', "Cache-Control": "no-store" } });
}
