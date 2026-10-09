import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { errorCsv } from "@/lib/importer";
import { PermissionDeniedError } from "@/lib/permissions";
import { STUDENT_IMPORT, UDISE_IMPORT, studentImport } from "@/lib/students/import";

export const dynamic = "force-dynamic";

/** The rows an import skipped, with their problems, as a CSV to fix and import again. */
export async function GET(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  let current;
  try {
    ({ current } = await requireAction("student-management", "create"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to import students.", { status: 403 });
    throw e;
  }
  const { batchId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) return new Response("This import was not found.", { status: 404 });
  const batch = await withSchool(current.ctx, (tx) => tx.importBatch.findUnique({ where: { id: batchId } }));
  if (!batch || ![STUDENT_IMPORT, UDISE_IMPORT].includes(batch.kind)) return new Response("This import was not found.", { status: 404 });
  const csv = errorCsv(studentImport(batch.kind, { sectionId: null, applyFeePlan: false }), batch.errorReport as { line: number; row: Record<string, string>; problems: string[] }[]);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="skipped-rows.csv"`, "Cache-Control": "private, no-store" } });
}
