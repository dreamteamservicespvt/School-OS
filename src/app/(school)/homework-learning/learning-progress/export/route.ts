import type { ExportColumn } from "@/lib/exports";
import { classProgress, type ProgressRow } from "@/lib/homework/progress";
import { homeworkExport } from "../../_lib/export";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The homework report: each student of a class, with the subject, dates and search on screen. */
export async function GET(req: Request) {
  return homeworkExport(req, "learning-progress", "thismonth", async ({ tx, s, g, from, to, today }) => {
    const sectionId = UUID.test(g("section")) ? g("section") : "";
    const subjectId = UUID.test(g("subject")) ? g("subject") : null;
    const q = g("q").trim().toLowerCase();
    const pr = sectionId ? await classProgress(tx, s, sectionId, subjectId, from, to, today) : null;
    if (!pr) return { title: "Homework report", rows: [] as ProgressRow[], columns: [], filters: ["class not found"] };
    const subject = subjectId ? (await tx.subject.findUnique({ where: { id: subjectId }, select: { name: true } }))?.name ?? "" : "All subjects";
    const rows = pr.rows.filter((r) => !q || r.name.toLowerCase().includes(q) || String(r.rollNo ?? "") === q);
    const columns: ExportColumn<ProgressRow>[] = [
      { label: "Roll", value: (r) => r.rollNo ?? "" },
      { label: "Student", value: (r) => r.name },
      { label: "Admission no.", value: (r) => r.admissionNo },
      { label: "Homework given", value: (r) => r.given },
      { label: "Homework done", value: (r) => r.done },
      { label: "Missing", value: (r) => r.missing },
      { label: "Average score %", value: (r) => r.scorePct ?? "" },
      { label: "Quizzes taken", value: (r) => r.quizzes },
      { label: "Quiz average %", value: (r) => r.quizPct ?? "" },
      { label: "Lessons done", value: (r) => r.lessonsDone },
      { label: "Lessons in the courses", value: () => pr.totals.lessons },
    ];
    return { title: `Homework report · Class ${pr.section.label}`, rows, columns, filters: [`Class ${pr.section.label}`, subject, q && `search "${q}"`].filter((x): x is string => !!x) };
  });
}
