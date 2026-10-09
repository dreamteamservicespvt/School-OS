// The staff import template: the columns, with an example row.
import { requireAction } from "@/lib/current";
import { importKind, templateCsv } from "@/lib/importer";
import "@/lib/staff/import";

export async function GET() {
  await requireAction("staff-hr-management", "create");
  return new Response(templateCsv(importKind("staff")!), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="staff-import-template.csv"', "Cache-Control": "no-store" },
  });
}
