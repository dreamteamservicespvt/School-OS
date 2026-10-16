// Attendance, exam, homework, PTM and task reports. Attendance numbers come
// from Attendance Management's own functions (classWise, attendanceSummary
// and its Reports), exam numbers from Exam Analysis, so every total here is
// the module's total.
import "server-only";

import { attendanceAccess, registerSections, type AccessSource, type AttendanceAccess } from "../../attendance/access";
import { classWise } from "../../attendance/classwise";
import { attendanceSummary } from "../../attendance/summary";
import { attendanceSettings } from "../../attendance/settings";
import { runReport, type ReportKey as AttendanceKey, type ReportInput } from "../../attendance/reports";
import { monthStart } from "../../staff/dates";
import { analyse, studentsBehind } from "../../exams/analysis";
import { examScope, type ExamScope } from "../../exams/scope";
import { examSettings } from "../../exams/settings";
import type { SubjectResult } from "../../exams/compute";
import { taskReport } from "../../dashboard/tasks";
import type { ReportEntry, ReportOption, Row, RunCtx, Table } from "../types";
import { fromAttendance, pct, scopeSections, sectionNames, totalsOf } from "./util";

/* ---------- Attendance ---------- */

export async function attendanceFor(rc: Pick<RunCtx, "tx" | "ctx" | "who" | "memo">) {
  return rc.memo("attendance-access", () => attendanceAccess(rc.tx, rc.ctx, rc.who as unknown as AccessSource));
}

/** Sections of the year the person may read in Attendance, after the class and section filters. */
async function attendanceSections(rc: RunCtx, access: AttendanceAccess) {
  const allowed = registerSections(access);
  const filtered = await scopeSections({ ...rc, sections: allowed === "all" ? rc.sections : allowed.filter((s) => !rc.sections || rc.sections.includes(s)) });
  return filtered;
}

function moduleReport(key: AttendanceKey, entry: Omit<ReportEntry, "run" | "category">): ReportEntry {
  return {
    ...entry, category: "Attendance",
    async run(rc) {
      const access = await attendanceFor(rc);
      const input: ReportInput = {
        report: key, date: rc.f.to, month: monthStart(rc.f.to), from: rc.f.from, to: rc.f.to, sectionId: rc.f.sectionId, person: null, period: "month", today: rc.f.today,
        dates: rc.f.range ? { from: rc.f.from, to: rc.f.to, label: rc.f.range.label } : null,
      };
      return fromAttendance(await runReport(rc.tx, rc.ctx, access, input));
    },
  };
}

const atDaily: ReportEntry = {
  key: "at-daily", category: "Attendance", name: "Daily attendance", sub: "Present, absent and late in each class, for a day or a stretch of days", byClass: true, own: true, dated: true, fallback: "today",
  async run(rc) {
    const access = await attendanceFor(rc);
    if (access.students === "none" || !rc.f.year) return { columns: [], rows: [], empty: "Student attendance is not part of your role." };
    const ids = await attendanceSections(rc, access);
    // The same per-section rows as the class-wise view and the Dashboard (Attendance, classwise.ts).
    const cw = await classWise(rc.tx, rc.ctx, { yearId: rc.f.year.id, from: rc.f.from, to: rc.f.to, today: rc.f.today, sectionIds: ids, campusId: rc.f.campusId });
    if (cw.off) return { columns: [], rows: [], empty: cw.off };
    const oneDay = cw.oneDay;
    const rows: Row[] = [...cw.sections].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).filter((s) => s.students > 0 || s.marked > 0)
      .map((s) => ({ cls: s.name, roll: s.students, notMarked: oneDay ? Math.max(0, s.students - s.marked) : null, present: s.present, absent: s.absent, late: s.late, leave: s.leave, percent: s.percent }));
    const t = cw.totals;
    return {
      columns: [{ key: "cls", label: "Class" }, { key: "roll", label: "On roll", kind: "number" }, ...(oneDay ? [{ key: "notMarked", label: "Not marked yet", kind: "number" as const }] : []), { key: "present", label: oneDay ? "Present" : "Present days", kind: "number" }, { key: "absent", label: oneDay ? "Absent" : "Absent days", kind: "number" }, { key: "late", label: "Late", kind: "number" }, { key: "leave", label: "On leave", kind: "number" }, { key: "percent", label: "Present %", kind: "percent" }],
      rows,
      totals: { cls: "All classes", roll: t.students, notMarked: oneDay ? Math.max(0, t.students - t.markedStudents) : null, present: t.present, absent: t.absent, late: t.late, leave: t.leave, percent: t.percent },
      note: oneDay ? null : "For more than one day the numbers are student-days. Holidays and Sundays are left out.",
    };
  },
};

const atMonthly: ReportEntry = {
  key: "at-monthly", category: "Attendance", name: "Monthly attendance register", sub: "Each student's days present and absent in the dates chosen", byClass: true, own: true, dated: true, heavy: true,
  async run(rc) {
    const access = await attendanceFor(rc);
    if (access.students === "none" || !rc.f.year) return { columns: [], rows: [], empty: "Student attendance is not part of your role." };
    const ids = (await attendanceSections(rc, access)) ?? (await rc.tx.section.findMany({ where: { academicYearId: rc.f.year.id, archivedAt: null }, select: { id: true } })).map((s) => s.id);
    const names = await sectionNames(rc);
    const sorted = [...ids].sort((a, b) => (names.get(a)?.sort ?? 0) - (names.get(b)?.sort ?? 0));
    const rows: Row[] = [];
    for (const sectionId of sorted) {
      const sum = await attendanceSummary(rc.tx, rc.ctx, { sectionId, from: rc.f.from, to: rc.f.to, today: rc.f.today });
      const people = await rc.tx.enrolment.findMany({ where: { sectionId, archivedAt: null, status: "STUDYING" }, include: { student: { select: { id: true, fullName: true, admissionNo: true } } }, orderBy: { rollNo: "asc" } });
      for (const e of people) {
        const s = sum.people.get(e.studentId);
        const days = s?.workingDays ?? sum.workingDays;
        const marked = s?.markedDays ?? 0;
        // School days with no mark saved are shown on their own, never hidden inside the %.
        rows.push({ name: e.student.fullName, cls: names.get(sectionId)?.label ?? "", roll: e.rollNo, days, marked, notMarked: Math.max(0, days - marked), counted: s?.countedDays ?? 0, present: s?.present ?? 0, absent: s?.absent ?? 0, late: s?.late ?? 0, leave: s?.leave ?? 0, percent: s?.percent ?? null });
      }
    }
    const unmarked = rows.reduce((a, r) => a + Number(r.notMarked ?? 0), 0);
    return {
      columns: [
        { key: "name", label: "Student" }, { key: "cls", label: "Class" }, { key: "roll", label: "Roll no.", kind: "number" },
        { key: "days", label: "School days", kind: "number" }, { key: "marked", label: "Days marked", kind: "number" }, { key: "notMarked", label: "Not marked", kind: "number" },
        { key: "present", label: "Present", kind: "number" }, { key: "absent", label: "Absent", kind: "number" }, { key: "late", label: "Late", kind: "number" }, { key: "leave", label: "On leave", kind: "number" },
        { key: "counted", label: "Days counted", kind: "number" }, { key: "percent", label: "Present %", kind: "percent" },
      ],
      rows,
      note: `Present % is present days out of days counted: the days marked, without leave (a half day counts half). Holidays and Sundays are not school days.${unmarked ? " Days not marked are left out of the %; take or correct them in Attendance Management." : ""}`,
    };
  },
};

const atLow: ReportEntry = {
  key: "at-low", category: "Attendance", name: "Students near the attendance line", sub: "Who is below or close to the threshold this year", byClass: true, own: true,
  async run(rc) {
    const access = await attendanceFor(rc);
    if (access.students === "none" || !rc.f.year) return { columns: [], rows: [], empty: "Student attendance is not part of your role." };
    const settings = await attendanceSettings(rc.tx, rc.ctx);
    const watch = Math.min(100, settings.thresholdPercent + 5);
    const ids = await attendanceSections(rc, access);
    const enrol = await rc.tx.enrolment.findMany({ where: { academicYearId: rc.f.year.id, archivedAt: null, status: "STUDYING", ...(ids ? { sectionId: { in: ids } } : {}) }, include: { student: { select: { id: true, fullName: true } } } });
    const sum = await attendanceSummary(rc.tx, rc.ctx, { studentIds: enrol.map((e) => e.studentId), from: rc.f.year.startDate, to: rc.f.today, today: rc.f.today });
    const names = await sectionNames(rc);
    const teachers = await rc.tx.section.findMany({ where: { id: { in: [...new Set(enrol.map((e) => e.sectionId))] } }, select: { id: true, classTeacherId: true } });
    const staff = new Map((await rc.tx.staff.findMany({ where: { id: { in: teachers.map((t) => t.classTeacherId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
    const rows: Row[] = enrol
      .map((e) => ({ e, s: sum.people.get(e.studentId) }))
      .filter((x) => x.s?.percent != null && x.s.percent < watch)
      .sort((a, b) => (a.s!.percent ?? 0) - (b.s!.percent ?? 0))
      .map(({ e, s }) => ({ name: e.student.fullName, cls: names.get(e.sectionId)?.label ?? "", percent: s!.percent, absent: s!.absent, strength: s!.percent! < settings.thresholdPercent ? `Below ${settings.thresholdPercent}%` : `Below ${watch}%`, teacher: staff.get(teachers.find((t) => t.id === e.sectionId)?.classTeacherId ?? "") ?? "" }));
    return {
      columns: [{ key: "name", label: "Student" }, { key: "cls", label: "Class" }, { key: "percent", label: "This year", kind: "percent" }, { key: "absent", label: "Days absent", kind: "number" }, { key: "strength", label: "Line" }, { key: "teacher", label: "Class teacher" }],
      rows,
      note: `Threshold ${settings.thresholdPercent}% (Attendance Settings); watch from ${watch}%.`,
      empty: rows.length ? null : `Nobody is below ${watch}% this year.`,
    };
  },
};

const ATTENDANCE: ReportEntry[] = [
  atDaily,
  atMonthly,
  atLow,
  moduleReport("chronic", { key: "at-chronic", name: "Chronic absence", sub: "Open flags: below the threshold, or absent days in a row", own: true }),
  moduleReport("trends", { key: "at-trends", name: "Attendance % by month", sub: "Each class, month by month, for the year", own: true }),
  moduleReport("late", { key: "at-late", name: "Late arrivals", sub: "Students and staff late, in the dates chosen", own: true, dated: true }),
  moduleReport("leave", { key: "at-leave", name: "Student leave", sub: "Leave by type and class", own: true, dated: true }),
  { ...moduleReport("staff-monthly", { key: "at-staff", name: "Staff attendance", sub: "Each staff member for the month: present, late, leave and %", dated: true }), allowed: (a) => a.staffAttendance },
  { ...moduleReport("overtime", { key: "at-overtime", name: "Overtime and shifts", sub: "Staff overtime and attendance by shift", dated: true }), allowed: (a, who) => a.staffAttendance && who.features.has("attendance-overtime") },
  { ...moduleReport("devices", { key: "at-devices", name: "Device health", sub: "Punches received and rejected by device", dated: true }), allowed: (a, who) => a.staffAttendance && who.features.has("attendance-devices") },
];

/* ---------- Exams ---------- */

/** The exam scope for reports: whole-school readers see every section; own readers their own. */
export async function reportExamScope(rc: Pick<RunCtx, "tx" | "who" | "memo" | "f">): Promise<ExamScope> {
  return rc.memo("exam-scope", async () => {
    const s = await examScope(rc.tx, rc.who, rc.f.year?.id ?? null);
    return s.see === "all" ? { ...s, sectionIds: null, teaches: null } : s;
  });
}

/** Exams of the year with results, newest first, and the year's final result. */
async function examChoices(rc: Pick<RunCtx, "tx" | "f">) {
  if (!rc.f.year) return [];
  const exams = await rc.tx.exam.findMany({ where: { academicYearId: rc.f.year.id, archivedAt: null, status: { not: "DRAFT" } }, orderBy: { startDate: "desc" }, select: { id: true, title: true, resultsPublishedAt: true } });
  const withResults = await rc.tx.result.groupBy({ by: ["examId"], where: { academicYearId: rc.f.year.id, complete: true, examId: { in: exams.map((e) => e.id) } } });
  const has = new Set(withResults.map((r) => r.examId));
  return exams.filter((e) => has.has(e.id)).map((e) => ({ value: e.id, label: e.title }));
}

const examOption = async (rc: Omit<RunCtx, "f"> & { f?: RunCtx["f"] }): Promise<ReportOption[]> => {
  if (!rc.f) return [];
  const list = await examChoices({ tx: rc.tx, f: rc.f });
  return [{ param: "exam", label: "Exam", value: rc.f.extra.exam ?? list[0]?.value ?? "", options: [...list, { value: "final", label: "Final result" }] }];
};

async function chosenExam(rc: RunCtx) {
  const e = rc.f.extra.exam;
  if (e === "final") return { examId: null, final: true, label: "Final result" };
  const list = await examChoices(rc);
  const pick = list.find((x) => x.value === e) ?? list[0];
  return pick ? { examId: pick.value, final: false, label: pick.label } : null;
}

async function examAnalysis(rc: RunCtx) {
  if (!rc.f.year) return null;
  const exam = await chosenExam(rc);
  if (!exam) return null;
  const scope = await reportExamScope(rc);
  const ids = rc.sections ? await scopeSections(rc) : null;
  const scoped = ids ? { ...scope, sectionIds: scope.sectionIds ? scope.sectionIds.filter((s) => ids.includes(s)) : ids } : scope;
  const a = await analyse(rc.tx, rc.ctx, scoped, rc.f.year.id, { examId: exam.examId, final: exam.final, classId: rc.f.classId, sectionId: rc.f.sectionId });
  return a ? { a, exam, scope: scoped } : null;
}

const NO_EXAM: Table = { columns: [], rows: [], empty: "No exam has results yet this year." };

const EXAMS: ReportEntry[] = [
  {
    key: "ex-results", category: "Exams", name: "Class results", sub: "Pass % and average marks by class, for one exam", byClass: true, own: true, options: examOption,
    async run(rc) {
      const r = await examAnalysis(rc);
      if (!r) return NO_EXAM;
      const rows: Row[] = r.a.classRows.map((c) => ({ cls: c.section, wrote: c.students, passed: c.students - c.failed, passPercent: c.passPercent, average: c.average, failed: c.failed, topper: c.topper }));
      const o = r.a.overview;
      return {
        columns: [{ key: "cls", label: "Class" }, { key: "wrote", label: "Wrote", kind: "number" }, { key: "passed", label: "Passed", kind: "number" }, { key: "passPercent", label: "Pass %", kind: "percent" }, { key: "average", label: "Average", kind: "percent" }, { key: "failed", label: "Did not pass", kind: "number" }, { key: "topper", label: "Topper" }],
        rows,
        totals: { cls: "All classes", wrote: o.students, passed: o.passed, passPercent: o.passPercent, average: o.average, failed: o.students - o.passed, topper: null },
        note: `${r.exam.label}. The same numbers as Exam Analysis.`,
      };
    },
  },
  {
    key: "ex-below", category: "Exams", name: "Students below the pass mark", sub: "Who did not pass a subject, for one exam", byClass: true, own: true, options: examOption,
    async run(rc) {
      const r = await examAnalysis(rc);
      if (!r) return NO_EXAM;
      const settings = await examSettings(rc.tx, rc.ctx);
      const pass = (settings as { passPercentSubject?: number }).passPercentSubject ?? 33;
      const key = r.a.key;
      const results = await rc.tx.result.findMany({ where: { key, sectionId: { in: r.a.sections.map((s) => s.id) }, complete: true } });
      const names = new Map((await rc.tx.student.findMany({ where: { id: { in: results.map((x) => x.studentId) } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
      const label = new Map(r.a.sections.map((s) => [s.id, s.label]));
      const rows: Row[] = [];
      for (const res of results) {
        const subs = (Array.isArray(res.subjects) ? (res.subjects as unknown as SubjectResult[]) : []).filter((s) => s.passed === false && (r.scope.teaches === null || r.scope.classTeacherOf.includes(res.sectionId) || r.scope.teaches.some((t) => t.sectionId === res.sectionId && t.subjectId === s.subjectId)));
        if (!subs.length) continue;
        const lowest = Math.min(...subs.map((s) => s.percent ?? 0));
        rows.push({ name: names.get(res.studentId) ?? "", cls: label.get(res.sectionId) ?? "", subjects: subs.map((s) => s.name).join(", "), lowest, overall: res.percent });
      }
      rows.sort((a, b) => (a.lowest as number) - (b.lowest as number));
      return { columns: [{ key: "name", label: "Student" }, { key: "cls", label: "Class" }, { key: "subjects", label: `Below ${pass}% in` }, { key: "lowest", label: "Lowest marks", kind: "percent" }, { key: "overall", label: "Overall", kind: "percent" }], rows, note: `${r.exam.label}. Pass mark ${pass}% in a subject (Exam Settings).` };
    },
  },
  {
    key: "ex-toppers", category: "Exams", name: "Toppers", sub: "The top students of each class, for one exam", byClass: true, own: true, options: examOption,
    async run(rc) {
      const r = await examAnalysis(rc);
      if (!rc.f.year || !r) return NO_EXAM;
      const top = await studentsBehind(rc.tx, r.scope, rc.f.year.id, { examId: r.exam.examId, final: r.exam.final, classId: rc.f.classId, sectionId: rc.f.sectionId }, { kind: "top" });
      return { columns: [{ key: "rank", label: "Rank", kind: "number" }, { key: "name", label: "Student" }, { key: "cls", label: "Class" }, { key: "percent", label: "Total", kind: "percent" }, { key: "grade", label: "Grade" }], rows: top.map((t, i) => ({ rank: t.rank ?? i + 1, name: t.name, cls: t.section, percent: t.percent, grade: t.grade ?? "" })), note: r.exam.label };
    },
  },
  {
    key: "ex-subjects", category: "Exams", name: "Subject results", sub: "Average and pass % of each subject in each class, with the teacher", byClass: true, own: true, options: examOption,
    async run(rc) {
      const r = await examAnalysis(rc);
      if (!r) return NO_EXAM;
      return {
        columns: [{ key: "subject", label: "Subject" }, { key: "cls", label: "Class" }, { key: "teacher", label: "Subject teacher" }, { key: "students", label: "Students", kind: "number" }, { key: "average", label: "Average", kind: "percent" }, { key: "passPercent", label: "Pass %", kind: "percent" }, { key: "failed", label: "Did not pass", kind: "number" }],
        rows: r.a.subjectRows.map((s) => ({ subject: s.subject, cls: s.section, teacher: s.teacher, students: s.students, average: s.average, passPercent: s.passPercent, failed: s.failed })),
        note: r.exam.label,
      };
    },
  },
];

/* ---------- Homework, PTM and tasks ---------- */

const HOMEWORK: ReportEntry[] = [
  {
    key: "hw-submit", category: "Homework", name: "Homework handed in on time", sub: "Homework given and the share handed in on time, by class", byClass: true, own: true, dated: true,
    async run(rc) {
      if (!rc.f.year) return { columns: [], rows: [], empty: "No academic year is set up yet." };
      const ids = await scopeSections(rc);
      const hw = await rc.tx.homework.findMany({ where: { academicYearId: rc.f.year.id, archivedAt: null, dueDate: { gte: rc.f.from, lte: rc.f.to }, ...(ids ? { sectionId: { in: ids } } : {}) }, select: { id: true, sectionId: true, dueDate: true } });
      const subs = await rc.tx.submission.findMany({ where: { homeworkId: { in: hw.map((h) => h.id) }, archivedAt: null, status: { not: "EXCUSED" } }, select: { homeworkId: true, status: true, submittedAt: true } });
      const names = await sectionNames(rc);
      const by = new Map<string, { given: number; expected: number; onTime: number; late: number; missing: number }>();
      for (const h of hw) {
        const v = by.get(h.sectionId) ?? { given: 0, expected: 0, onTime: 0, late: 0, missing: 0 };
        v.given++;
        for (const s of subs.filter((x) => x.homeworkId === h.id)) {
          v.expected++;
          if (s.status === "LATE") v.late++;
          else if (s.status === "MISSING") v.missing++;
          else if ((s.status === "SUBMITTED" || s.status === "GRADED") && s.submittedAt) v.onTime++;
        }
        by.set(h.sectionId, v);
      }
      const rows: Row[] = [...by.entries()].sort((a, b) => (names.get(a[0])?.sort ?? 0) - (names.get(b[0])?.sort ?? 0)).map(([sid, v]) => ({ cls: names.get(sid)?.label ?? "", given: v.given, expected: v.expected, onTime: v.onTime, late: v.late, missing: v.missing, share: pct(v.onTime, v.expected) }));
      const t: Table = { columns: [{ key: "cls", label: "Class" }, { key: "given", label: "Homework given", kind: "number" }, { key: "expected", label: "Hand-ins expected", kind: "number" }, { key: "onTime", label: "On time", kind: "number" }, { key: "late", label: "Late", kind: "number" }, { key: "missing", label: "Missing", kind: "number" }, { key: "share", label: "On time %", kind: "percent" }], rows };
      const tot = totalsOf(t, "All classes");
      tot.share = pct(Number(tot.onTime), Number(tot.expected));
      return { ...t, totals: tot, note: "Homework due in the dates chosen." };
    },
  },
];

const EVENTS: ReportEntry[] = [
  {
    key: "ev-ptm", category: "Events", name: "PTM attendance", sub: "Parents who booked a slot and who came, for each PTM day", dated: true, fallback: "acyear", own: true,
    async run(rc) {
      const ptms = await rc.tx.ptm.findMany({ where: { archivedAt: null, date: { gte: rc.f.from, lte: rc.f.to } }, orderBy: { date: "asc" }, include: { slots: { select: { studentId: true, arrivedAt: true, staffId: true } } } });
      // Own reach: only the slots with the person's own students.
      let students: Set<string> | null = null;
      if (rc.sections && rc.f.year) students = new Set((await rc.tx.enrolment.findMany({ where: { academicYearId: rc.f.year.id, sectionId: { in: rc.sections }, archivedAt: null }, select: { studentId: true } })).map((e) => e.studentId));
      const rows: Row[] = ptms.map((p) => {
        const booked = p.slots.filter((s) => s.studentId && (!students || students.has(s.studentId)));
        const came = booked.filter((s) => s.arrivedAt).length;
        return { date: p.date, classes: p.classesLabel, booked: booked.length, came, share: pct(came, booked.length) };
      });
      const t: Table = { columns: [{ key: "date", label: "PTM day", kind: "date" }, { key: "classes", label: "Classes" }, { key: "booked", label: "Parents booked", kind: "number" }, { key: "came", label: "Came", kind: "number" }, { key: "share", label: "Came %", kind: "percent" }], rows };
      const tot = totalsOf(t, "All PTM days");
      tot.share = pct(Number(tot.came), Number(tot.booked));
      return { ...t, totals: rows.length ? tot : null };
    },
  },
];

const TASKS: ReportEntry[] = [
  {
    key: "ta-open", category: "Tasks", name: "Tasks by person", sub: "Open, overdue and done tasks, by person, with days to close",
    allowed: (a) => a.tasks,
    async run(rc) {
      const r = await taskReport(rc.tx, {}, new Date());
      const t: Table = {
        columns: [{ key: "name", label: "Person" }, { key: "open", label: "Open", kind: "number" }, { key: "overdue", label: "Overdue", kind: "number" }, { key: "done", label: "Done", kind: "number" }, { key: "avg", label: "Average days to close", kind: "number" }],
        rows: r.people.map((p) => ({ name: p.name, open: p.open, overdue: p.overdue, done: p.done, avg: p.avgDays })),
      };
      return { ...t, totals: { name: "Everyone", open: r.totals.open, overdue: r.totals.overdue, done: r.totals.done, avg: r.totals.avgDays } };
    },
  },
];

export const ACADEMIC_REPORTS: ReportEntry[] = [...ATTENDANCE, ...EXAMS, ...HOMEWORK, ...EVENTS, ...TASKS];
