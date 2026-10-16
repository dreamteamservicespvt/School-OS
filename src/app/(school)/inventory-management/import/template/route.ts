// The import templates (items with opening stock, assets): the columns, with an example row.
import { importKind, templateCsv } from "@/lib/importer";
import { ASSETS_IMPORT, ITEMS_IMPORT } from "@/lib/inventory/import";
import { invRoute, plain } from "../../_lib/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const assets = new URL(req.url).searchParams.get("kind") === "assets";
  const x = await invRoute(req, assets ? "assets" : "items", "create");
  if (x instanceof Response) return x;
  if (!(assets ? x.can.assets : x.can.stock)) return plain(assets ? "Only those who keep the asset register import assets." : "Only the store keeper imports items.", 403);
  return new Response(templateCsv(importKind(assets ? ASSETS_IMPORT : ITEMS_IMPORT)!), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inventory-${assets ? "assets" : "items"}-template.csv"`, "Cache-Control": "no-store" },
  });
}
