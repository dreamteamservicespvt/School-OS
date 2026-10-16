// The rows an import skipped, with their problems, to fix and import again.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { errorCsv, importKind } from "@/lib/importer";
import { UUID_RE } from "@/lib/staff/act";
import "@/lib/staff/import";

export async function GET(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const { current, reach } = await requireAction("staff-hr-management", "create");
  const missing = new Response("This import was not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (reach !== "all" || !UUID_RE.test(batchId)) return missing;
  const batch = await withSchool(current.ctx, (tx) => tx.importBatch.findFirst({ where: { id: batchId, kind: "staff" } }));
  if (!batch) return missing;
  const bad = batch.errorReport as { line: number; row: Record<string, string>; problems: string[] }[];
  return new Response(errorCsv(importKind("staff")!, bad), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="staff-import-problems.csv"', "Cache-Control": "no-store" },
  });
}
