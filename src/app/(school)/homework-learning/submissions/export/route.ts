import type { ExportColumn } from "@/lib/exports";
import { formatDateTime } from "@/lib/format";
import { sectionStudents } from "@/lib/homework/homework";
import { mayRead } from "@/lib/homework/scope";
import { isPastDue, submissionWord } from "@/lib/homework/words";
import { homeworkExport } from "../../_lib/export";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

/** One homework's submissions, with the filter and search on screen. */
export async function GET(req: Request) {
  return homeworkExport(req, "submissions", null, async ({ tx, s, g, today, current }) => {
    const id = UUID.test(g("hw")) ? g("hw") : "";
    const hw = id ? await tx.homework.findFirst({ where: { id } }) : null;
    if (!hw || !mayRead(s, hw)) return { title: "Submissions", rows: [], columns: [], filters: ["homework not found"] };
    const f = g("f");
    const q = g("q").trim().toLowerCase();
    const [roster, subs] = await Promise.all([sectionStudents(tx, hw.academicYearId, hw.sectionId), tx.submission.findMany({ where: { homeworkId: hw.id, archivedAt: null } })]);
    const by = new Map(subs.map((x) => [x.studentId, x]));
    const pastDue = isPastDue(hw.dueDate, today);
    type R = { st: (typeof roster)[number]; sub: (typeof subs)[number] };
    const rows: R[] = roster.filter((st) => by.has(st.id)).map((st) => ({ st, sub: by.get(st.id)! }))
      .filter((r) => !f || f === "all" || (f === "check" ? ["SUBMITTED", "LATE"].includes(r.sub.status) : f === "graded" ? r.sub.status === "GRADED" : ["ASSIGNED", "MISSING"].includes(r.sub.status)))
      .filter((r) => !q || r.st.name.toLowerCase().includes(q) || String(r.st.rollNo ?? "") === q);
    const columns: ExportColumn<R>[] = [
      { label: "Roll", value: (r) => r.st.rollNo ?? "" },
      { label: "Student", value: (r) => r.st.name },
      { label: "Admission no.", value: (r) => r.st.admissionNo },
      { label: "Handed in", value: (r) => (r.sub.submittedAt ? formatDateTime(r.sub.submittedAt, current.school.timeZone) : "") },
      { label: "Status", value: (r) => submissionWord(r.sub.status, pastDue) },
      { label: "Result", value: (r) => (r.sub.checkResult === "INCORRECT" ? "Incorrect" : r.sub.checkResult === "COMPLETE" ? "Complete" : "") },
      { label: `Score / ${hw.maxMarks}`, value: (r) => r.sub.score ?? "" },
      { label: "Grade", value: (r) => r.sub.grade ?? "" },
      { label: "Feedback", value: (r) => r.sub.feedback ?? "" },
    ];
    return { title: `Submissions · ${hw.title}`, rows, columns, filters: [f && f !== "all" ? { check: "To check", graded: "Checked", not: "Not handed in" }[f] ?? "" : "Everyone", q && `search "${q}"`].filter((x): x is string => !!x) };
  });
}
