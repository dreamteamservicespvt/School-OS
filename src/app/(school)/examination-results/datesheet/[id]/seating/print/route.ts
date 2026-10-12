// Seating charts for one sitting as a PDF: one page per room.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";
import { htmlToPdf } from "@/lib/pdf";
import { examScope } from "@/lib/exams/scope";
import { seatingHtml, seatingPlan, sittings } from "@/lib/exams/seating";

export const dynamic = "force-dynamic";

const plain = (m: string, status: number) => new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sitting = new URL(req.url).searchParams.get("sitting") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return plain("This datesheet was not found.", 404);
  let current;
  try { ({ current } = await requireAction("examination-results", "print")); } catch (e) {
    if (e instanceof PermissionDeniedError) return plain(e.message, 403);
    throw e;
  }
  const out = await withSchool(current.ctx, async (tx) => {
    const exam = await tx.exam.findFirst({ where: { id, archivedAt: null } });
    if (!exam) return null;
    const scope = await examScope(tx, current, exam.academicYearId);
    if (!scope.datesheets && !scope.manage) return null;
    const s = (await sittings(tx, id)).find((x) => x.key === sitting);
    if (!s) return null;
    const plan = await seatingPlan(tx, id, sitting);
    const school = await tx.school.findUniqueOrThrow({ where: { id: current.ctx.schoolId }, select: { name: true } });
    return plan.length ? seatingHtml(school.name, exam.title, s.label, plan) : null;
  });
  if (!out) return plain("There is no seat plan for this sitting.", 404);
  try {
    const pdf = await htmlToPdf(out, { format: "A4" });
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="seating-${sitting}.pdf"`, "Cache-Control": "no-store" } });
  } catch {
    return plain("The PDF could not be made right now. Please try again in a minute.", 503);
  }
}
