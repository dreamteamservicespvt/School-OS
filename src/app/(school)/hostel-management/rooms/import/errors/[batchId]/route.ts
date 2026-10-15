// The rows a rooms import skipped, with their problems, to fix and import again.
import { withSchool } from "@/lib/db";
import { errorCsv, importKind } from "@/lib/importer";
import { ROOMS_IMPORT } from "@/lib/hostel/import";
import { UUID_RE } from "@/lib/hostel/act";
import { hostelRoute, plain } from "../../../../_lib/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const x = await hostelRoute(req, "rooms", "create");
  if (x instanceof Response) return x;
  if (!x.can.rooms || !UUID_RE.test(batchId)) return plain("This import was not found.", 404);
  const batch = await withSchool(x.current.ctx, (tx) => tx.importBatch.findFirst({ where: { id: batchId, kind: ROOMS_IMPORT } }));
  if (!batch) return plain("This import was not found.", 404);
  const bad = batch.errorReport as { line: number; row: Record<string, string>; problems: string[] }[];
  return new Response(errorCsv(importKind(ROOMS_IMPORT)!, bad), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="hostel-rooms-import-problems.csv"', "Cache-Control": "no-store" },
  });
}
