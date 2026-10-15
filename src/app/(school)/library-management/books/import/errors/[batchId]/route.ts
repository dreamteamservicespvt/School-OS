// The rows a catalogue import skipped, with their problems, to fix and import again.
import { withSchool } from "@/lib/db";
import { errorCsv, importKind } from "@/lib/importer";
import { CATALOGUE_IMPORT } from "@/lib/library/import";
import { libRoute, plain } from "../../../../_lib/route";
import { UUID } from "../../../../_lib/page";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const x = await libRoute(req, "books", "create");
  if (x instanceof Response) return x;
  if (!x.can.catalogue || !UUID.test(batchId)) return plain("This import was not found.", 404);
  const batch = await withSchool(x.current.ctx, (tx) => tx.importBatch.findFirst({ where: { id: batchId, kind: CATALOGUE_IMPORT } }));
  if (!batch) return plain("This import was not found.", 404);
  const bad = batch.errorReport as { line: number; row: Record<string, string>; problems: string[] }[];
  return new Response(errorCsv(importKind(CATALOGUE_IMPORT)!, bad), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="library-import-problems.csv"', "Cache-Control": "no-store" },
  });
}
