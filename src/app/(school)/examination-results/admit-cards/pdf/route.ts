// Admit cards as a PDF: a batch of up to 50 students of a section, or one
// student. Only for a published datesheet. Each print is logged.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";
import { ExamRuleError } from "@/lib/exams/common";
import { assertYearInScope, examScope } from "@/lib/exams/scope";
import { renderAdmitCards } from "@/lib/exams/admit";

export const dynamic = "force-dynamic";

const plain = (m: string, status: number) => new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const examId = p.get("exam") ?? "";
  const sectionId = p.get("section") ?? "";
  const studentId = p.get("student");
  const batch = Math.max(0, Number.parseInt(p.get("batch") ?? "0", 10) || 0);
  if (!UUID.test(examId) || !UUID.test(sectionId) || (studentId && !UUID.test(studentId))) return plain("Choose the exam and the class first.", 400);
  let current;
  try { ({ current } = await requireAction("examination-results", "print")); } catch (e) {
    if (e instanceof PermissionDeniedError) return plain(e.message, 403);
    throw e;
  }
  try {
    const out = await withSchool(current.ctx, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, archivedAt: null }, select: { academicYearId: true } });
      if (!exam) throw new ExamRuleError("This exam was not found.");
      const scope = await examScope(tx, current, exam.academicYearId);
      assertYearInScope(scope, exam.academicYearId, "exam");
      if (!scope.datesheets && !scope.manage) throw new ExamRuleError("Your role does not print admit cards. Ask the office or the Exam In-charge.");
      const r = await renderAdmitCards(tx, current.ctx, { examId, sectionId, studentId, batch });
      return { pdf: await r.doc.pdf(), name: r.fileName };
    }, { timeout: 120_000 });
    return new Response(new Uint8Array(out.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.name}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ExamRuleError) return plain(e.message, 400);
    console.error(JSON.stringify({ level: "error", event: "admit-card-pdf", error: e instanceof Error ? e.message : String(e) }));
    return plain("The admit cards could not be made right now. Please try again in a minute.", 503);
  }
}
