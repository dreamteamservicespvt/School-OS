// Exam Analysis (08 §2, §7): results overview, subject-wise and class-wise
// performance, toppers and students needing help, one student's progress
// across exams and years, and marks entry status by teacher. Every number can
// open the students behind it. Only the sections a person may see are used.
import "server-only";

import type { Result } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { examKey, finalKey } from "./common";
import { round2, type SubjectResult } from "./compute";
import { isDone } from "./marks";
import { sectionStudents, sitters } from "./roster";
import { resultSubjects, type ExamScope } from "./scope";

export type AnalysisFilters = { examId?: string | null; final?: boolean; classId?: string | null; sectionId?: string | null; subjectId?: string | null };

type SectionRow = { id: string; label: string; classId: string; className: string; sortOrder: number };

async function sectionsInScope(tx: Tx, scope: ExamScope, yearId: string, f: AnalysisFilters): Promise<SectionRow[]> {
  const rows = await tx.section.findMany({
    where: { academicYearId: yearId, archivedAt: null, ...(f.classId ? { classId: f.classId } : {}), ...(f.sectionId ? { id: f.sectionId } : {}), ...(scope.sectionIds ? { id: { in: f.sectionId ? scope.sectionIds.filter((s) => s === f.sectionId) : scope.sectionIds } } : {}) },
    include: { schoolClass: true },
    orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
  });
  return rows.map((s) => ({ id: s.id, label: `${s.schoolClass.name} ${s.name}`, classId: s.classId, className: s.schoolClass.name, sortOrder: s.schoolClass.sortOrder }));
}

/** Teacher Allocations of some sections with the teacher's name, main teacher first. */
async function allocations(tx: Tx, yearId: string, sectionIds: string[]) {
  const rows = await tx.teacherAllocation.findMany({ where: { academicYearId: yearId, sectionId: { in: sectionIds }, archivedAt: null }, orderBy: { isMain: "desc" } });
  const staff = await tx.staff.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.staffId))] } }, select: { id: true, fullName: true } });
  return rows.map((r) => ({ ...r, staff: { fullName: staff.find((s) => s.id === r.staffId)?.fullName ?? "" } }));
}

const subjectsOf = (r: Result) => (Array.isArray(r.subjects) ? (r.subjects as unknown as SubjectResult[]) : []);
const avg = (list: number[]) => (list.length ? round2(list.reduce((a, b) => a + b, 0) / list.length) : null);
const pct = (n: number, of: number) => (of ? round2((n / of) * 100) : null);

export type Drill = { kind: "all" | "pass" | "fail" | "grade" | "section" | "subject-pass" | "subject-fail" | "top" | "help"; value?: string };

/** The analysis for one exam (or the final result) and the chosen classes. */
export async function analyse(tx: Tx, ctx: SchoolContext, scope: ExamScope, yearId: string, f: AnalysisFilters) {
  const sections = await sectionsInScope(tx, scope, yearId, f);
  const key = f.final ? finalKey(yearId) : f.examId ? examKey(f.examId) : null;
  if (!key || sections.length === 0) return null;
  const all = await tx.result.findMany({ where: { key, sectionId: { in: sections.map((s) => s.id) }, complete: true } });
  // A subject teacher sees only their own subjects (owner's rules, 12 Oct 2026): overall numbers come only from
  // sections they see whole (their own class), and subject numbers only from the subjects they teach.
  const results = all.filter((r) => resultSubjects(scope, r.sectionId) === null);
  const subjectOk = (sectionId: string, subjectId: string) => { const only = resultSubjects(scope, sectionId); return only === null || only.includes(subjectId); };
  const students = await tx.student.findMany({ where: { id: { in: all.map((r) => r.studentId) } }, select: { id: true, fullName: true, admissionNo: true } });
  const nameOf = (id: string) => students.find((s) => s.id === id)?.fullName ?? "";
  const labelOf = (id: string) => sections.find((s) => s.id === id)?.label ?? "";

  // Overview.
  const withPercent = results.filter((r) => r.percent !== null);
  const passed = results.filter((r) => r.outcome === "Pass").length;
  const grades = new Map<string, number>();
  for (const r of results) if (r.grade) grades.set(r.grade, (grades.get(r.grade) ?? 0) + 1);
  const sorted = [...withPercent].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0) || b.total - a.total);
  const person = (r: Result) => ({ studentId: r.studentId, name: nameOf(r.studentId), section: labelOf(r.sectionId), percent: r.percent, grade: r.grade, rank: r.rank, outcome: r.outcome });
  const overview = {
    students: results.length,
    passed,
    failed: results.filter((r) => r.outcome === "Fail").length,
    compartment: results.filter((r) => r.outcome === "Compartment").length,
    passPercent: pct(passed, results.length),
    average: avg(withPercent.map((r) => r.percent!)),
    highest: sorted[0]?.percent ?? null,
    lowest: sorted.at(-1)?.percent ?? null,
    grades: [...grades.entries()].map(([grade, count]) => ({ grade, count })).sort((a, b) => a.grade.localeCompare(b.grade)),
    top: sorted.slice(0, 5).map(person),
    help: [...sorted].reverse().filter((r) => r.outcome !== "Pass" || (r.percent ?? 0) < 50).slice(0, 5).map(person),
  };

  // Subject-wise, per section, with the subject teacher.
  const allocs = await allocations(tx, yearId, sections.map((s) => s.id));
  type Acc = { subjectId: string; name: string; sectionId: string; percents: number[]; passed: number; counted: number; absent: number };
  const acc = new Map<string, Acc>();
  for (const r of all) for (const s of subjectsOf(r)) {
    if (f.subjectId && s.subjectId !== f.subjectId) continue;
    if (!subjectOk(r.sectionId, s.subjectId)) continue;
    if (s.gradeOnly) continue;
    const k = `${s.subjectId}|${r.sectionId}`;
    const a = acc.get(k) ?? { subjectId: s.subjectId, name: s.name, sectionId: r.sectionId, percents: [], passed: 0, counted: 0, absent: 0 };
    if (s.absent) a.absent++;
    if (s.percent !== null) a.percents.push(s.percent);
    if (s.passed !== null) { a.counted++; if (s.passed) a.passed++; }
    acc.set(k, a);
  }
  const subjectRows = [...acc.values()].map((a) => ({
    subjectId: a.subjectId, subject: a.name, sectionId: a.sectionId, section: labelOf(a.sectionId),
    teacher: allocs.find((x) => x.sectionId === a.sectionId && x.subjectId === a.subjectId)?.staff.fullName ?? "",
    average: avg(a.percents), passPercent: pct(a.passed, a.counted), failed: a.counted - a.passed, absent: a.absent, students: a.counted,
  })).sort((x, y) => x.subject.localeCompare(y.subject) || x.section.localeCompare(y.section, undefined, { numeric: true }));

  // Subject totals across the chosen sections.
  const bySubject = new Map<string, { subjectId: string; subject: string; average: number[]; passed: number; counted: number }>();
  for (const a of acc.values()) {
    const b = bySubject.get(a.subjectId) ?? { subjectId: a.subjectId, subject: a.name, average: [], passed: 0, counted: 0 };
    b.average.push(...a.percents); b.passed += a.passed; b.counted += a.counted;
    bySubject.set(a.subjectId, b);
  }
  const subjects = [...bySubject.values()].map((b) => ({ subjectId: b.subjectId, subject: b.subject, average: avg(b.average), passPercent: pct(b.passed, b.counted), students: b.counted })).sort((a, b) => (a.average ?? 0) - (b.average ?? 0));

  // Class-wise: sections compared.
  const classRows = sections.map((s) => {
    const mine = results.filter((r) => r.sectionId === s.id);
    const p = mine.filter((r) => r.outcome === "Pass").length;
    const best = [...mine].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0];
    return { sectionId: s.id, section: s.label, students: mine.length, average: avg(mine.filter((r) => r.percent !== null).map((r) => r.percent!)), passPercent: pct(p, mine.length), failed: mine.length - p, topper: best ? `${nameOf(best.studentId)} (${best.percent ?? ""}%)` : "" };
  }).filter((r) => r.students > 0);

  return { key, overview, subjects, subjectRows, classRows, sections };
}

/** The students behind a number on the analysis page. */
export async function studentsBehind(tx: Tx, scope: ExamScope, yearId: string, f: AnalysisFilters, drill: Drill) {
  const sections = await sectionsInScope(tx, scope, yearId, f);
  const key = f.final ? finalKey(yearId) : f.examId ? examKey(f.examId) : null;
  if (!key) return [];
  const all = await tx.result.findMany({ where: { key, sectionId: { in: sections.map((s) => s.id) }, complete: true }, orderBy: [{ percent: "desc" }] });
  const subjectCell = (r: Result) => subjectsOf(r).find((s) => s.subjectId === drill.value);
  const bySubject = drill.kind.startsWith("subject");
  // Subject teachers: subject lists only for their own subjects; overall lists only for sections they see whole.
  let results = all.filter((r) => {
    const only = resultSubjects(scope, r.sectionId);
    return only === null || (bySubject && Boolean(drill.value) && only.includes(drill.value!));
  });
  switch (drill.kind) {
    case "pass": results = results.filter((r) => r.outcome === "Pass"); break;
    case "fail": results = results.filter((r) => r.outcome !== "Pass"); break;
    case "grade": results = results.filter((r) => r.grade === drill.value); break;
    case "section": results = results.filter((r) => r.sectionId === drill.value); break;
    case "subject-pass": results = results.filter((r) => subjectCell(r)?.passed === true); break;
    case "subject-fail": results = results.filter((r) => subjectCell(r)?.passed === false); break;
    case "top": results = results.slice(0, 10); break;
    case "help": results = results.filter((r) => r.outcome !== "Pass" || (r.percent ?? 0) < 50).reverse(); break;
    default: break;
  }
  const students = await tx.student.findMany({ where: { id: { in: results.map((r) => r.studentId) } }, select: { id: true, fullName: true, admissionNo: true } });
  return results.map((r) => {
    const st = students.find((s) => s.id === r.studentId);
    const cell = drill.value && drill.kind.startsWith("subject") ? subjectCell(r) : null;
    return {
      studentId: r.studentId, name: st?.fullName ?? "", admissionNo: st?.admissionNo ?? "", section: sections.find((s) => s.id === r.sectionId)?.label ?? "",
      percent: cell ? cell.percent : r.percent, grade: cell ? cell.grade : r.grade,
      // The overall rank and result are made from every subject: not shown where only some subjects may be seen.
      ...(resultSubjects(scope, r.sectionId) === null ? { rank: r.rank, outcome: r.outcome } : { rank: null, outcome: null }),
    };
  });
}

/** One student's results across every exam and year, oldest first, for the progress trend. */
export async function studentProgress(tx: Tx, studentId: string) {
  const results = await tx.result.findMany({ where: { studentId, examId: { not: null } }, orderBy: { computedAt: "asc" } });
  const exams = await tx.exam.findMany({ where: { id: { in: results.map((r) => r.examId!) } }, select: { id: true, title: true, startDate: true, academicYearId: true } });
  const years = await tx.academicYear.findMany({ where: { id: { in: [...new Set(exams.map((e) => e.academicYearId))] } }, select: { id: true, name: true } });
  return results
    .map((r) => {
      const e = exams.find((x) => x.id === r.examId);
      return { examId: r.examId!, exam: e?.title ?? "", year: years.find((y) => y.id === e?.academicYearId)?.name ?? "", date: e?.startDate ?? r.computedAt, percent: r.percent, grade: r.grade, rank: r.rank, outcome: r.outcome, published: r.status === "PUBLISHED", complete: r.complete, subjects: subjectsOf(r) };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Marks entry status: which papers are pending, by teacher (08 §7). */
export async function entryStatus(tx: Tx, scope: ExamScope, yearId: string, f: { examId?: string | null; classId?: string | null }) {
  const exams = await tx.exam.findMany({ where: { academicYearId: yearId, archivedAt: null, status: { not: "DRAFT" }, ...(f.examId ? { id: f.examId } : {}) }, include: { entries: { where: { archivedAt: null, ...(f.classId ? { classId: f.classId } : {}) } } } });
  const sections = await sectionsInScope(tx, scope, yearId, { classId: f.classId });
  const entries = exams.flatMap((e) => e.entries.map((x) => ({ ...x, examTitle: e.title })));
  const [subjects, papers, marks, allocs, roster] = await Promise.all([
    tx.subject.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.subjectId))] } } }),
    tx.marksPaper.findMany({ where: { entryId: { in: entries.map((e) => e.id) } } }),
    tx.marks.findMany({ where: { entryId: { in: entries.map((e) => e.id) } }, select: { entryId: true, sectionId: true, studentId: true, absent: true, total: true, grade: true } }),
    allocations(tx, yearId, sections.map((s) => s.id)),
    sectionStudents(tx, sections.map((s) => s.id), yearId),
  ]);
  const rows: { exam: string; section: string; subject: string; teacher: string; status: string; done: number; of: number; due: Date | null; entryId: string; sectionId: string }[] = [];
  for (const e of entries) for (const s of sections.filter((x) => x.classId === e.classId)) {
    const subject = subjects.find((x) => x.id === e.subjectId);
    if (!subject) continue;
    const sits = sitters(roster.filter((r) => r.sectionId === s.id), subject);
    const mine = marks.filter((m) => m.entryId === e.id && m.sectionId === s.id);
    rows.push({
      exam: e.examTitle, section: s.label, subject: subject.name, entryId: e.id, sectionId: s.id, due: e.marksDueDate,
      teacher: allocs.filter((a) => a.sectionId === s.id && a.subjectId === e.subjectId).map((a) => a.staff.fullName).join(", ") || "Not given",
      status: papers.find((p) => p.entryId === e.id && p.sectionId === s.id)?.status ?? "NOT_STARTED",
      done: sits.filter((x) => isDone(mine.find((m) => m.studentId === x.studentId), subject.gradeOnly)).length, of: sits.length,
    });
  }
  const byTeacher = new Map<string, { teacher: string; pending: number; submitted: number; total: number }>();
  for (const r of rows) {
    const t = byTeacher.get(r.teacher) ?? { teacher: r.teacher, pending: 0, submitted: 0, total: 0 };
    t.total++;
    if (r.status === "SUBMITTED" || r.status === "LOCKED") t.submitted++; else t.pending++;
    byTeacher.set(r.teacher, t);
  }
  return { rows: rows.sort((a, b) => a.teacher.localeCompare(b.teacher) || a.section.localeCompare(b.section, undefined, { numeric: true })), teachers: [...byTeacher.values()].sort((a, b) => b.pending - a.pending) };
}
