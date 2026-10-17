import { requireAction } from "@/lib/current";
import { templateCsv } from "@/lib/importer";
import { PermissionDeniedError } from "@/lib/permissions";
import { STUDENT_IMPORT, STUDENT_IMPORT_KINDS, studentImportFor } from "@/lib/students/import-kinds";

export const dynamic = "force-dynamic";

/** The import template as a CSV, with the headings and one example row. */
export async function GET(req: Request) {
  try {
    await requireAction("student-management", "create");
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to import students.", { status: 403 });
    throw e;
  }
  const asked = new URL(req.url).searchParams.get("kind") ?? "";
  const kind = STUDENT_IMPORT_KINDS.includes(asked) ? asked : STUDENT_IMPORT;
  const csv = templateCsv(studentImportFor(kind, { sectionId: null, applyFeePlan: true }));
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-template.csv"`, "Cache-Control": "private, no-store" } });
}
