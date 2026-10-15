// The catalogue import template: the columns, with an example row.
import { importKind, templateCsv } from "@/lib/importer";
import { CATALOGUE_IMPORT } from "@/lib/library/import";
import { libRoute, plain } from "../../../_lib/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await libRoute(req, "books", "create");
  if (x instanceof Response) return x;
  if (!x.can.catalogue) return plain("Only the librarian imports books.", 403);
  return new Response(templateCsv(importKind(CATALOGUE_IMPORT)!), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="library-catalogue-template.csv"', "Cache-Control": "no-store" },
  });
}
