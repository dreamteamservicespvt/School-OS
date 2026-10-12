// The enquiry import template: the columns, with an example row.
import { requireAction } from "@/lib/current";
import { importKind, templateCsv } from "@/lib/importer";
import "@/lib/admission/import";

export async function GET() {
  await requireAction("admission-management", "create");
  return new Response(templateCsv(importKind("admission-enquiries")!), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="enquiry-import-template.csv"', "Cache-Control": "no-store" },
  });
}
