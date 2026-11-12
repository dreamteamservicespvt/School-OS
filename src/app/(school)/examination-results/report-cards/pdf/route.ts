// Report cards as a PDF, in the class's board format: one student, or a
// section of up to 40 at once (larger sections go to a background job from
// the Report Cards page). Only cards whose results are published print.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { PermissionDeniedError } from "@/lib/permissions";
import { ExamRuleError } from "@/lib/exams/common";
import { assertYearInScope, examScope, resultSubjects, seesSection, writesReportCards } from "@/lib/exams/scope";
import { DIRECT_REPORT_LIMIT, findPeriod, renderReportCards } from "@/lib/exams/report-cards";
import { periodPublished } from "@/lib/exams/report-status";
import { sectionInfo } from "@/lib/exams/results";
import { sectionStudents } from "@/lib/exams/roster";
import { withPdfErrors } from "@/lib/pdf";

export const dynamic = "force-dynamic";
// Starting the PDF browser on a fresh server can take several seconds.
export const maxDuration = 60;


const plain = (m: string, status: number) => new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
// A person whose role does not print these cards sees the app's own "not part of your role" page, with the
// menu and a way back, not a bare line of text (QA LC17).
const noAccess = () => new Response(null, { status: 303, headers: { Location: "/no-access?m=examination-results", "Cache-Control": "no-store" } });
class NotTheirs extends Error {}
const UUID = /^[0-9a-f-]{36}$/i;
const PERIOD = /^(year|exam:[0-9a-f-]{36}|term:[0-9a-f-]{36})$/i;

async function handleGET(req: Request) {
  const p = new URL(req.url).searchParams;
  const sectionId = p.get("section") ?? "";
  const period = p.get("period") ?? "";
  const studentIds = p.getAll("student").filter(Boolean);
  if (!UUID.test(sectionId) || !PERIOD.test(period) || studentIds.some((s) => !UUID.test(s))) return plain("Choose the class and the report card period first.", 400);
  let current;
  try { ({ current } = await requireAction("examination-results", "print")); } catch (e) {
    if (e instanceof PermissionDeniedError) return noAccess();
    throw e;
  }
  try {
    const out = await withSchool(current.ctx, async (tx) => {
      const section = await sectionInfo(tx, sectionId);
      const scope = await examScope(tx, current, section.academicYearId);
      assertYearInScope(scope, section.academicYearId, "section");
      const single = studentIds.length === 1;
      // A whole report card shows every subject, the total and the rank: the class teacher, full reach, or someone who
      // sees every subject's results in this section (as on the Report Cards page and the Student Profile). Not Office
      // Staff, who see no results, and not a subject teacher of the section (G02).
      const seesWholeCard = writesReportCards(scope, sectionId) || (scope.results && resultSubjects(scope, sectionId) === null && seesSection(scope, sectionId));
      if (!(single ? seesWholeCard : writesReportCards(scope, sectionId))) throw new NotTheirs();
      const option = await findPeriod(tx, section.academicYearId, section.classId, period);
      if (!option) throw new ExamRuleError("This report card period was not found.");
      const roster = await sectionStudents(tx, [sectionId], section.academicYearId);
      const wanted = studentIds.length ? roster.filter((s) => studentIds.includes(s.studentId)) : roster;
      if (studentIds.length && wanted.length !== studentIds.length) throw new ExamRuleError("A student chosen is not in this section.");
      const ready: string[] = [];
      for (const s of wanted) if (await periodPublished(tx, s.studentId, option)) ready.push(s.studentId);
      if (ready.length === 0) throw new ExamRuleError(single ? "This report card is not ready: its results are not published yet." : "No report card here is ready: the results are not published yet.");
      if (ready.length > DIRECT_REPORT_LIMIT) throw new ExamRuleError(`That is ${ready.length} report cards. Use "Make PDF" on the Report Cards page; it makes them in the background and tells you when ready.`);
      const doc = await renderReportCards(tx, current.ctx, ready.map((studentId) => ({ studentId, sectionId })), option.key);
      await writeAudit(tx, current.ctx, { action: "report-cards-downloaded", recordType: "Report Card", recordId: `${sectionId}:${option.key}`, after: { section: section.label, period: option.label, count: ready.length } });
      const name = single ? `report-card-${roster.find((r) => r.studentId === ready[0])?.name ?? "student"}-${option.label}` : `report-cards-${section.label}-${option.label}`;
      return { pdf: await doc.pdf(), name: `${name.replace(/[^\w-]+/g, "-").toLowerCase().slice(0, 120)}.pdf` };
    }, { timeout: 120_000 });
    return new Response(new Uint8Array(out.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.name}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof NotTheirs) return noAccess();
    if (e instanceof ExamRuleError) return plain(e.message, 400);
    console.error(JSON.stringify({ level: "error", event: "report-card-pdf", error: e instanceof Error ? e.message : String(e) }));
    return plain("The report cards could not be made right now. Please try again in a minute.", 503);
  }
}

// A PDF that cannot be made shows as a printable page instead (src/lib/pdf.ts).
export const GET = withPdfErrors(handleGET);
