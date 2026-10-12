// Examination & Results exports (P8): Excel, CSV or PDF with the filters on
// screen, including the date filter. Each export checks the Export permission
// on the server, keeps a teacher to their own sections, and is logged.
import { requireAction, type Current } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { dateWhere, momentWhere, periodFromSearch } from "@/lib/periods";
import { time12 } from "@/lib/academic/common";
import { chosenYear } from "@/lib/academic/years";
import { PAPER_STATUS_WORDS, classRange, patternLabel, shownExamStatus, showMarks } from "@/lib/exams/common";
import { examScope, type ExamScope } from "@/lib/exams/scope";
import { papersFor, moderationList } from "@/lib/exams/marks";
import { finalSheet, resultSheet } from "@/lib/exams/results";
import { analyse } from "@/lib/exams/analysis";
import { examOverlaps } from "../_lib/period";

type Row = Record<string, string | number | null>;
type Built = { title: string; filters: string; labels: string[]; rows: Row[] };
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const format: ExportFormat = p.get("format") === "csv" ? "csv" : p.get("format") === "pdf" ? "pdf" : "xlsx";
  let current: Current;
  try {
    ({ current } = await requireAction("examination-results", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("Your role cannot export from Examination & Results.", { status: 403 });
    throw e;
  }
  const built = await withSchool(current.ctx, async (tx) => {
    const year = await chosenYear(tx, current.ctx, p.get("year"));
    if (!year) return null;
    const scope = await examScope(tx, current, year.id);
    const out = await build(tx, current, scope, year.id, p);
    if (out && out !== "denied") await logExport(tx, current.ctx, { title: out.title, format, filters: out.filters, rows: out.rows.length });
    return out;
  }, { timeout: 60_000 });
  if (built === "denied") return new Response("Your role cannot export this.", { status: 403 });
  if (!built) return new Response("That export was not found, or there is nothing to export for your role.", { status: 404 });
  const columns: ExportColumn<Row>[] = built.labels.map((label) => ({ label, value: (r) => r[label] }));
  const file = await buildExport(format, columns, built.rows, { title: built.title, schoolName: current.school.name, filters: built.filters, exportedBy: current.user.displayName, timeZone: current.school.timeZone });
  return exportResponse(file);
}

async function build(tx: Tx, current: Current, scope: ExamScope, yearId: string, p: URLSearchParams): Promise<Built | "denied" | null> {
  const tz = current.school.timeZone;
  const raw = Object.fromEntries(p.entries());
  const range = periodFromSearch(raw, { timeZone: tz });
  const dates = range ? `${range.label}` : "All dates";
  const kind = p.get("kind") ?? "";
  const sectionOk = (id: string) => !scope.sectionIds || scope.sectionIds.includes(id);

  if (kind === "datesheets") {
    let onlyClassIds: string[] | null = null;
    if (scope.sectionIds) onlyClassIds = (await tx.section.findMany({ where: { id: { in: scope.sectionIds } }, select: { classId: true } })).map((x) => x.classId);
    const cls = p.get("class") ?? "";
    const exams = await tx.exam.findMany({
      where: { academicYearId: yearId, archivedAt: null, ...examOverlaps(range), ...(onlyClassIds ? { classIds: { hasSome: onlyClassIds } } : {}), ...(UUID.test(cls) ? { classIds: { has: cls } } : {}) },
      orderBy: { startDate: "asc" }, include: { entries: { where: { archivedAt: null } } },
    });
    const classes = await tx.schoolClass.findMany({ select: { id: true, name: true } });
    const subjects = await tx.subject.findMany({ where: { id: { in: [...new Set(exams.flatMap((e) => e.entries.map((x) => x.subjectId)))] } }, select: { id: true, name: true } });
    const today = new Date();
    const q = (p.get("q") ?? "").toLowerCase();
    const st = p.get("status") ?? "";
    const rows: Row[] = [];
    for (const e of exams) {
      const shown = shownExamStatus(e, today);
      if (st && shown !== st) continue;
      if (q && !e.title.toLowerCase().includes(q)) continue;
      for (const x of [...e.entries].sort((a, b) => a.date.getTime() - b.date.getTime() || a.startTime.localeCompare(b.startTime))) {
        if (onlyClassIds && !onlyClassIds.includes(x.classId)) continue;
        rows.push({
          Exam: e.title, Status: shown, Pattern: patternLabel(e.pattern), Class: classes.find((c) => c.id === x.classId)?.name ?? "", Subject: subjects.find((s) => s.id === x.subjectId)?.name ?? "",
          Date: formatDate(x.date), Start: time12(x.startTime), "Duration (min)": x.durationMin, Room: x.room ?? "", "Max marks": x.maxMarks,
        });
      }
    }
    return { title: "Datesheets", filters: [dates, st, q && `"${q}"`].filter(Boolean).join(" · "), labels: ["Exam", "Status", "Pattern", "Class", "Subject", "Date", "Start", "Duration (min)", "Room", "Max marks"], rows };
  }

  if (kind === "entry-status") {
    if (scope.office) return "denied";
    const examId = p.get("exam") ?? "";
    const all = await papersFor(tx, current.ctx, scope, yearId, { examId: UUID.test(examId) ? examId : undefined });
    const w = range ? dateWhere(range) : null;
    const rows = all.filter((r) => !w || (r.date >= w.gte && r.date <= w.lte)).map((r) => ({
      Exam: r.examTitle, Paper: `${r.subjectName} · ${r.sectionLabel}`, "Exam date": formatDate(r.date, tz), "Marks due": r.due ? formatDate(r.due, tz) : "", Entered: r.done, Students: r.of, Status: PAPER_STATUS_WORDS[r.status],
    }));
    return { title: "Marks entry status", filters: dates, labels: ["Exam", "Paper", "Exam date", "Marks due", "Entered", "Students", "Status"], rows };
  }

  if (kind === "moderation") {
    if (!scope.manage) return "denied";
    const examId = p.get("exam") ?? "";
    const list = await moderationList(tx, { yearId, examId: UUID.test(examId) ? examId : undefined, status: p.get("status") || undefined });
    const span = range ? momentWhere(range, tz) : null;
    const rows = list.filter((r) => !span || (r.askedOn >= span.gte && r.askedOn < span.lt)).map((r) => ({
      Student: r.student, "Admission no": r.admissionNo, Section: r.section, Exam: r.exam, Subject: r.subject, Before: r.oldMarks, After: r.newMarks, Reason: r.reason,
      "Asked by": r.askedBy, "Asked on": formatDate(r.askedOn, tz), Status: r.status, "Decided by": r.decidedBy, "Decided on": r.decidedOn ? formatDate(r.decidedOn, tz) : "",
    }));
    return { title: "Moderation report", filters: dates, labels: ["Student", "Admission no", "Section", "Exam", "Subject", "Before", "After", "Reason", "Asked by", "Asked on", "Status", "Decided by", "Decided on"], rows };
  }

  if (kind === "result-sheet" || kind === "final-sheet") {
    if (!scope.results) return "denied";
    const sectionId = p.get("section") ?? "";
    if (!UUID.test(sectionId) || !sectionOk(sectionId)) return "denied";
    if (kind === "result-sheet") {
      const examId = p.get("exam") ?? "";
      if (!UUID.test(examId)) return null;
      const sheet = await resultSheet(tx, current.ctx, examId, sectionId);
      if (!sheet) return null;
      const labels = ["Roll", "Student", "Admission no", ...sheet.columns.map((c) => c.gradeOnly ? c.name : `${c.name} (${c.max})`), "Total", "%", "Grade", "Rank", "Result", "Status"];
      const rows = sheet.rows.map((r) => {
        const row: Row = { Roll: r.rollNo, Student: r.name, "Admission no": r.admissionNo, Total: `${showMarks(r.total)} / ${r.maxTotal}`, "%": r.percent, Grade: r.grade ?? "", Rank: r.rank, Result: r.outcome ?? "", Status: r.status === "PUBLISHED" ? "Published" : "Draft" };
        for (const c of sheet.columns) {
          const cell = r.cells[c.id];
          row[c.gradeOnly ? c.name : `${c.name} (${c.max})`] = !cell ? "" : cell.absent ? (cell.medical ? "ML" : "AB") : c.gradeOnly ? cell.grade ?? "" : cell.marks === null ? "" : showMarks(cell.marks);
        }
        return row;
      });
      return { title: `${sheet.exam.title} · ${sheet.section.label}`, filters: "Class result sheet", labels, rows };
    }
    const f = await finalSheet(tx, current.ctx, yearId, sectionId);
    const labels = ["Roll", "Student", "Admission no", ...f.exams.map((e) => `${e.title} %`), "Final %", "Grade", "Rank", "Result"];
    const rows = f.rows.map((r) => {
      const row: Row = { Roll: r.rollNo, Student: r.name, "Admission no": r.admissionNo, "Final %": r.percent, Grade: r.grade ?? "", Rank: r.rank, Result: r.outcome ?? "" };
      for (const e of f.exams) row[`${e.title} %`] = r.exams[e.id]?.percent ?? null;
      return row;
    });
    return { title: `Final result · ${f.section.label}`, filters: "Final result sheet", labels, rows };
  }

  if (kind === "analysis") {
    if (!scope.results) return "denied";
    const exam = p.get("exam") ?? "";
    const sc = p.get("scope") ?? "";
    const subjectId = p.get("subject") ?? "";
    const a = await analyse(tx, current.ctx, scope, yearId, {
      examId: UUID.test(exam) ? exam : null, final: exam === "final",
      classId: sc.startsWith("c:") && UUID.test(sc.slice(2)) ? sc.slice(2) : null, sectionId: sc.startsWith("s:") && UUID.test(sc.slice(2)) ? sc.slice(2) : null,
      subjectId: UUID.test(subjectId) ? subjectId : null,
    });
    if (!a) return null;
    const title = exam === "final" ? "Final result" : (await tx.exam.findFirst({ where: { id: exam }, select: { title: true } }))?.title ?? "Exam";
    const rows = a.subjectRows.map((r) => ({ Subject: r.subject, Section: r.section, Teacher: r.teacher, Students: r.students, "Average %": r.average, "Pass %": r.passPercent, Failed: r.failed, Absent: r.absent }));
    return { title: `Exam analysis · ${title}`, filters: classRange(a.sections.map((x) => x.label)), labels: ["Subject", "Section", "Teacher", "Students", "Average %", "Pass %", "Failed", "Absent"], rows };
  }
  return null;
}
