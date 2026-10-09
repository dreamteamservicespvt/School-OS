import { requireAction } from "@/lib/current";
import { templateCsv } from "@/lib/importer";
import { PermissionDeniedError } from "@/lib/permissions";
import { STUDENT_IMPORT, UDISE_IMPORT, studentImport } from "@/lib/students/import";

export const dynamic = "force-dynamic";

/** The import template as a CSV, with the headings and one example row. */
export async function GET(req: Request) {
  try {
    await requireAction("student-management", "create");
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to import students.", { status: 403 });
    throw e;
  }
  const kind = new URL(req.url).searchParams.get("kind") === UDISE_IMPORT ? UDISE_IMPORT : STUDENT_IMPORT;
  const csv = templateCsv(studentImport(kind, { sectionId: null, applyFeePlan: true }));
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-template.csv"`, "Cache-Control": "private, no-store" } });
}
