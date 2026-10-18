// A question paper as a PDF, with or without the answer key. Only people who
// may work on the paper's class and subject can print it; every print is in
// the audit log.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";
import { htmlToPdf } from "@/lib/pdf";
import { pageYear } from "@/lib/academic/page-campus";
import { classInScope, examScope } from "@/lib/exams/scope";
import { paperHtml, paperView, writesBank } from "@/lib/exams/questions";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const plain = (m: string, status: number) => new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return plain("This paper was not found.", 404);
  const answers = new URL(req.url).searchParams.get("answers") === "1";
  let current;
  try { ({ current } = await requireAction("examination-results", "print")); } catch (e) {
    if (e instanceof PermissionDeniedError) return plain(e.message, 403);
    throw e;
  }
  if (!current.features.has("exam-question-papers")) return plain("Question Papers is switched off for this school.", 403);
  const out = await withSchool(current.ctx, async (tx) => {
    const view = await paperView(tx, id);
    if (!view) return null;
    const { year } = await pageYear(tx, current.ctx, current);
    if (!year) return null;
    const scope = await examScope(tx, current, year.id);
    if (!(await classInScope(tx, scope, view.paper.classId))) return null;
    if (scope.office || !(await writesBank(tx, scope, year.id, view.paper.classId, view.paper.subjectId))) return "denied" as const;
    const school = await tx.school.findUniqueOrThrow({ where: { id: current.ctx.schoolId }, select: { name: true } });
    await writeAudit(tx, current.ctx, { action: "printed", recordType: "Question Paper", recordId: id, after: { answers } });
    return { view, school };
  });
  if (out === "denied") return plain("You can print papers only for the subjects you teach.", 403);
  if (!out) return plain("This paper was not found.", 404);
  try {
    const pdf = await htmlToPdf(paperHtml(out.school.name, out.view, answers), { format: "A4", margin: "14mm" });
    const name = `${out.view.paper.title}${answers ? "-answers" : ""}`.replace(/[^\w-]+/g, "-").toLowerCase();
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "question-paper-pdf", error: e instanceof Error ? e.message : String(e) }));
    return plain("The PDF could not be made right now. Please try again in a minute.", 503);
  }
}
