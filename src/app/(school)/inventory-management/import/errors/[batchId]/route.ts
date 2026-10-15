// The rows an items or assets import skipped, with their problems, to fix and import again.
import { withSchool } from "@/lib/db";
import { errorCsv, importKind } from "@/lib/importer";
import { ASSETS_IMPORT, ITEMS_IMPORT } from "@/lib/inventory/import";
import { invRoute, plain } from "../../../_lib/route";
import { UUID } from "../../../_lib/page";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const assets = new URL(req.url).searchParams.get("kind") === "assets";
  const key = assets ? ASSETS_IMPORT : ITEMS_IMPORT;
  const x = await invRoute(req, assets ? "assets" : "items", "create");
  if (x instanceof Response) return x;
  if (!(assets ? x.can.assets : x.can.stock) || !UUID.test(batchId)) return plain("This import was not found.", 404);
  const batch = await withSchool(x.current.ctx, (tx) => tx.importBatch.findFirst({ where: { id: batchId, kind: key } }));
  if (!batch) return plain("This import was not found.", 404);
  const bad = batch.errorReport as { line: number; row: Record<string, string>; problems: string[] }[];
  return new Response(errorCsv(importKind(key)!, bad), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inventory-${assets ? "assets" : "items"}-import-problems.csv"`, "Cache-Control": "no-store" },
  });
}
