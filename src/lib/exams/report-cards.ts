// Report Cards (08 §2): marks and grades per subject and exam, attendance,
// co-scholastic grades, skills, activities and competencies, the final result
// and both remarks, in the format of the class's board. Class teachers write
// remarks for their own section; the Principal writes principal remarks.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { assertYearOpen } from "../academic/years";
import { renderDocument, type DocumentData } from "../documents";
import { currentDesign } from "../documents/designs";
import type { TableColumn } from "../documents/types";
import { ExamRuleError, examKey, finalKey, parsePeriod, patternLabel, showMarks, showPercent, type Period } from "./common";
import type { SubjectResult } from "./compute";
import { examSettings, reportBaseFor } from "./settings";
import { sectionStudents } from "./roster";
import { sectionInfo } from "./results";
import { periodsForClass, refreshReportCards, type PeriodOption } from "./report-status";
import { attendanceFor } from "./attendance";
import { writesReportCards, type ExamScope } from "./scope";

export { periodsForClass, refreshReportCards } from "./report-status";

async function features(tx: Tx, ctx: SchoolContext) {
  const rows = await tx.schoolFeature.findMany({ where: { schoolId: ctx.schoolId, isOn: true, featureKey: { in: ["exam-co-scholastic", "exam-competencies", "exam-boards", "ai-assistant", "ai-teacher-assistant"] } } });
  const on = new Set(rows.map((r) => r.featureKey));
  return { coScholastic: on.has("exam-co-scholastic"), competencies: on.has("exam-competencies"), boards: on.has("exam-boards"), aiRemarks: on.has("ai-assistant") && on.has("ai-teacher-assistant") };
}

export async function findPeriod(tx: Tx, yearId: string, classId: string, key: string): Promise<PeriodOption | null> {
  const p = parsePeriod(key);
  if (!p) return null;
  return (await periodsForClass(tx, yearId, classId)).find((o) => o.key === key) ?? null;
}

/** The report card list for a section and period: status per student and what is missing (08 §2). */
export async function reportBoard(tx: Tx, ctx: SchoolContext, sectionId: string, periodKey: string) {
  const section = await sectionInfo(tx, sectionId);
  const option = await findPeriod(tx, section.academicYearId, section.classId, periodKey);
  if (!option) return null;
  await refreshReportCards(tx, ctx, section.academicYearId, [sectionId]);
  const f = await features(tx, ctx);
  const [students, cards, areas, grades, results] = await Promise.all([
    sectionStudents(tx, [sectionId], section.academicYearId),
    tx.reportCard.findMany({ where: { sectionId, period: option.key } }),
    f.coScholastic ? tx.coScholasticArea.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }) : Promise.resolve([]),
    f.coScholastic ? tx.coScholasticGrade.findMany({ where: { period: option.key, academicYearId: section.academicYearId } }) : Promise.resolve([]),
    tx.result.findMany({ where: { sectionId, key: { in: option.resultKeys } } }),
  ]);
  const attendance = await attendanceFor(tx, ctx, students.map((s) => s.studentId), await periodDates(tx, option, section.academicYearId));
  const rows = students.map((s) => {
    const card = cards.find((c) => c.studentId === s.studentId);
    const mine = results.filter((r) => r.studentId === s.studentId);
    const needed = option.period.kind === "year" ? option.resultKeys.filter((k) => k.startsWith("final:")) : option.resultKeys;
    const missing: string[] = [];
    const unpublished = needed.filter((k) => !mine.some((r) => r.key === k && r.status === "PUBLISHED"));
    if (unpublished.length) missing.push(mine.some((r) => needed.includes(r.key) && !r.complete) || mine.length < needed.length ? "Marks" : "Result not published");
    if (!card?.classTeacherRemark) missing.push("Class teacher remark");
    if (!card?.principalRemark) missing.push("Principal remark");
    if (f.coScholastic && areas.some((a) => !grades.some((g) => g.studentId === s.studentId && g.areaId === a.id && g.grade))) missing.push("Co-scholastic grades");
    const att = attendance.get(s.studentId);
    if (!att && (card?.attendanceWorking === null || card?.attendanceWorking === undefined)) missing.push("Attendance");
    return {
      ...s, cardId: card?.id ?? null, status: card?.status ?? "NOT_READY", classTeacherRemark: card?.classTeacherRemark ?? "", principalRemark: card?.principalRemark ?? "",
      attendancePresent: att?.present ?? card?.attendancePresent ?? null, attendanceWorking: att?.working ?? card?.attendanceWorking ?? null, attendanceFromRegister: Boolean(att),
      missing, printedAt: card?.printedAt ?? null, sentAt: card?.sentAt ?? null,
      published: unpublished.length === 0,
    };
  });
  return { section, option, rows, areas, grades, features: f };
}

/** The first and last day a report card's attendance covers. */
async function periodDates(tx: Tx, option: PeriodOption, yearId: string): Promise<{ from: Date; to: Date }> {
  if (option.period.kind === "term") {
    const t = await tx.term.findFirstOrThrow({ where: { id: option.period.termId } });
    return { from: t.startDate, to: t.endDate };
  }
  const year = await tx.academicYear.findFirstOrThrow({ where: { id: yearId } });
  if (option.period.kind === "exam") {
    const e = await tx.exam.findFirstOrThrow({ where: { id: option.period.examId } });
    return { from: year.startDate, to: e.endDate };
  }
  return { from: year.startDate, to: year.endDate };
}

export type RemarkRow = { studentId: string; classTeacherRemark?: string | null; principalRemark?: string | null; attendancePresent?: number | null; attendanceWorking?: number | null };

/** Saves remarks and typed attendance for many students at once (the bulk entry grid). */
export async function saveRemarks(tx: Tx, ctx: SchoolContext, scope: ExamScope, input: { sectionId: string; period: string; rows: RemarkRow[]; principal: boolean }) {
  const section = await sectionInfo(tx, input.sectionId);
  await assertYearOpen(tx, section.academicYearId);
  if (!writesReportCards(scope, input.sectionId) && !input.principal) throw new ExamRuleError(`Only the class teacher of ${section.label}, the Exam In-charge or the Principal can write these remarks.`);
  const option = await findPeriod(tx, section.academicYearId, section.classId, input.period);
  if (!option) throw new ExamRuleError("Choose the exam or term first.");
  const students = await sectionStudents(tx, [input.sectionId], section.academicYearId);
  const changes: unknown[] = [];
  for (const row of input.rows) {
    const st = students.find((s) => s.studentId === row.studentId);
    if (!st) throw new ExamRuleError("A student here is no longer in this section. Reload the page.");
    for (const [k, v] of [["class teacher remark", row.classTeacherRemark], ["principal remark", row.principalRemark]] as const) {
      if (v && v.length > 500) throw new ExamRuleError(`${st.name}: the ${k} can be at most 500 characters.`);
    }
    if (row.principalRemark !== undefined && !input.principal) throw new ExamRuleError("Only the Principal writes principal remarks.");
    if (row.classTeacherRemark !== undefined && !writesReportCards(scope, input.sectionId)) throw new ExamRuleError(`Only the class teacher of ${section.label} writes class teacher remarks.`);
    const p = row.attendancePresent;
    const w = row.attendanceWorking;
    if (p !== undefined || w !== undefined) {
      if ((p === null) !== (w === null)) throw new ExamRuleError(`${st.name}: give both days present and working days, or neither.`);
      if (p !== null && w !== null && p !== undefined && w !== undefined) {
        if (!Number.isInteger(p) || !Number.isInteger(w) || p < 0 || w < 1 || w > 366) throw new ExamRuleError(`${st.name}: attendance must be whole days, with at most 366 working days.`);
        if (p > w) throw new ExamRuleError(`${st.name}: days present (${p}) cannot be more than working days (${w}).`);
      }
    }
    const before = await tx.reportCard.findUnique({ where: { schoolId_studentId_academicYearId_period: { schoolId: ctx.schoolId, studentId: st.studentId, academicYearId: section.academicYearId, period: option.key } } });
    const data: Prisma.ReportCardUncheckedUpdateInput = { updatedById: ctx.userId, sectionId: input.sectionId };
    if (row.classTeacherRemark !== undefined) data.classTeacherRemark = row.classTeacherRemark?.trim() || null;
    if (row.principalRemark !== undefined) data.principalRemark = row.principalRemark?.trim() || null;
    if (p !== undefined) data.attendancePresent = p;
    if (w !== undefined) data.attendanceWorking = w;
    const same = before && (data.classTeacherRemark === undefined || data.classTeacherRemark === before.classTeacherRemark) && (data.principalRemark === undefined || data.principalRemark === before.principalRemark)
      && (data.attendancePresent === undefined || data.attendancePresent === before.attendancePresent) && (data.attendanceWorking === undefined || data.attendanceWorking === before.attendanceWorking);
    if (same) continue;
    if (before) await tx.reportCard.update({ where: { id: before.id }, data });
    else await tx.reportCard.create({ data: { schoolId: ctx.schoolId, academicYearId: section.academicYearId, studentId: st.studentId, sectionId: input.sectionId, period: option.key, ...(data as object) } as Prisma.ReportCardUncheckedCreateInput });
    changes.push({ student: st.name, before: before ? { classTeacherRemark: before.classTeacherRemark, principalRemark: before.principalRemark, attendancePresent: before.attendancePresent, attendanceWorking: before.attendanceWorking } : null, after: data });
  }
  if (changes.length) {
    await refreshReportCards(tx, ctx, section.academicYearId, [input.sectionId]);
    await writeAudit(tx, ctx, { action: "report-card-remarks", recordType: "Report Card", recordId: `${input.sectionId}:${option.key}`, after: { section: section.label, period: option.label, changes } as unknown as Prisma.InputJsonValue });
  }
  return changes.length;
}

/** Saves co-scholastic grades: one grade per student per area (bulk grid). */
export async function saveCoScholastic(tx: Tx, ctx: SchoolContext, scope: ExamScope, input: { sectionId: string; period: string; rows: { studentId: string; areaId: string; grade: string | null }[] }) {
  const section = await sectionInfo(tx, input.sectionId);
  await assertYearOpen(tx, section.academicYearId);
  if (!writesReportCards(scope, input.sectionId)) throw new ExamRuleError(`Only the class teacher of ${section.label}, the Exam In-charge or the Principal can enter these grades.`);
  const option = await findPeriod(tx, section.academicYearId, section.classId, input.period);
  if (!option) throw new ExamRuleError("Choose the exam or term first.");
  const [students, areas] = await Promise.all([sectionStudents(tx, [input.sectionId], section.academicYearId), tx.coScholasticArea.findMany({ where: { archivedAt: null } })]);
  let n = 0;
  const changes: unknown[] = [];
  for (const row of input.rows) {
    const st = students.find((s) => s.studentId === row.studentId);
    const area = areas.find((a) => a.id === row.areaId);
    if (!st || !area) throw new ExamRuleError("A student or area here was changed. Reload the page.");
    if (row.grade && !area.grades.includes(row.grade)) throw new ExamRuleError(`${st.name}: ${area.name} grades are ${area.grades.join(", ")}.`);
    const where = { schoolId_studentId_areaId_period: { schoolId: ctx.schoolId, studentId: st.studentId, areaId: area.id, period: option.key } };
    const before = await tx.coScholasticGrade.findUnique({ where });
    if ((before?.grade ?? null) === (row.grade || null)) continue;
    if (!row.grade) {
      // Clearing a grade keeps the row with an empty value would break the unique rule; a blank grade is stored as "".
      if (before) await tx.coScholasticGrade.update({ where: { id: before.id }, data: { grade: "", enteredById: ctx.userId } });
    } else {
      await tx.coScholasticGrade.upsert({ where, create: { schoolId: ctx.schoolId, academicYearId: section.academicYearId, period: option.key, studentId: st.studentId, areaId: area.id, grade: row.grade, enteredById: ctx.userId }, update: { grade: row.grade, enteredById: ctx.userId } });
    }
    changes.push({ student: st.name, area: area.name, before: before?.grade ?? null, after: row.grade || null });
    n++;
  }
  if (n) await writeAudit(tx, ctx, { action: "co-scholastic-grades", recordType: "Co-scholastic Grade", recordId: `${input.sectionId}:${option.key}`, after: { section: section.label, period: option.label, changes } as unknown as Prisma.InputJsonValue });
  return n;
}

/** Saves competency levels for a section and period. */
export async function saveCompetencyLevels(tx: Tx, ctx: SchoolContext, scope: ExamScope, input: { sectionId: string; period: string; rows: { studentId: string; competencyId: string; level: string | null }[] }) {
  const section = await sectionInfo(tx, input.sectionId);
  await assertYearOpen(tx, section.academicYearId);
  if (!writesReportCards(scope, input.sectionId)) throw new ExamRuleError(`Only the class teacher of ${section.label}, the Exam In-charge or the Principal can enter competency levels.`);
  const option = await findPeriod(tx, section.academicYearId, section.classId, input.period);
  if (!option) throw new ExamRuleError("Choose the exam or term first.");
  const comps = await tx.competency.findMany({ where: { archivedAt: null } });
  let n = 0;
  for (const row of input.rows) {
    const c = comps.find((x) => x.id === row.competencyId);
    if (!c) throw new ExamRuleError("A competency here was changed. Reload the page.");
    if (row.level && !c.levels.includes(row.level)) throw new ExamRuleError(`Levels for ${c.name} are ${c.levels.join(", ")}.`);
    const where = { schoolId_studentId_competencyId_period: { schoolId: ctx.schoolId, studentId: row.studentId, competencyId: c.id, period: option.key } };
    const before = await tx.competencyLevel.findUnique({ where });
    if ((before?.level ?? "") === (row.level ?? "")) continue;
    await tx.competencyLevel.upsert({ where, create: { schoolId: ctx.schoolId, academicYearId: section.academicYearId, period: option.key, studentId: row.studentId, competencyId: c.id, level: row.level ?? "", enteredById: ctx.userId }, update: { level: row.level ?? "", enteredById: ctx.userId } });
    n++;
  }
  if (n) await writeAudit(tx, ctx, { action: "competency-levels", recordType: "Competency Level", recordId: `${input.sectionId}:${option.key}`, after: { section: section.label, count: n } });
  return n;
}

/**
 * Drafts a remark per student from their real marks and attendance (teacher
 * assistant). Always a "Suggestion": nothing is saved until the teacher
 * edits or accepts it (00-global.md §2.1).
 */
export async function draftRemarks(tx: Tx, ctx: SchoolContext, sectionId: string, periodKey: string) {
  const board = await reportBoard(tx, ctx, sectionId, periodKey);
  if (!board) return [];
  const results = await tx.result.findMany({ where: { sectionId, key: { in: board.option.resultKeys } } });
  return board.rows.map((s) => {
    const mine = results.filter((r) => r.studentId === s.studentId && r.complete);
    if (mine.length === 0) return { studentId: s.studentId, text: null as string | null, why: "No complete marks yet, so there is nothing to draft from." };
    const subjects = mine.flatMap((r) => (r.subjects as unknown as SubjectResult[]).filter((x) => !x.gradeOnly && x.percent !== null));
    const bySubject = new Map<string, number[]>();
    for (const x of subjects) bySubject.set(x.name, [...(bySubject.get(x.name) ?? []), x.percent!]);
    const avg = [...bySubject.entries()].map(([name, list]) => ({ name, p: list.reduce((a, b) => a + b, 0) / list.length })).sort((a, b) => b.p - a.p);
    const overall = mine.reduce((a, r) => a + (r.percent ?? 0), 0) / mine.length;
    const first = s.name.split(" ")[0];
    const best = avg.slice(0, 2).filter((x) => x.p >= 60).map((x) => x.name);
    const weak = avg.filter((x) => x.p < Math.min(60, overall - 5)).slice(-2).map((x) => x.name);
    const parts: string[] = [];
    if (overall >= 85) parts.push(`${first} has done very well this term.`);
    else if (overall >= 65) parts.push(`${first} has done well this term.`);
    else if (overall >= 45) parts.push(`${first} is making steady progress.`);
    else parts.push(`${first} needs more support and regular practice.`);
    if (best.length) parts.push(`Strong in ${best.join(" and ")}.`);
    if (weak.length) parts.push(`Should give more time to ${weak.join(" and ")}.`);
    if (s.attendanceWorking && s.attendancePresent !== null) {
      const att = (s.attendancePresent / s.attendanceWorking) * 100;
      if (att < 75) parts.push("Attendance is low and needs to improve.");
      else if (att >= 95) parts.push("Regular in attendance.");
    }
    return { studentId: s.studentId, text: parts.join(" "), why: `From ${mine.length === 1 ? "this exam's" : "these exams'"} marks${s.attendanceWorking ? " and attendance" : ""}.` };
  });
}

/** Marks report cards as printed or sent (for a PTM or after sending to parents). */
export async function markCards(tx: Tx, ctx: SchoolContext, scope: ExamScope, input: { sectionId: string; period: string; studentIds: string[]; as: "PRINTED" | "SENT" }) {
  const section = await sectionInfo(tx, input.sectionId);
  if (!writesReportCards(scope, input.sectionId)) throw new ExamRuleError(`Only the class teacher of ${section.label}, the Exam In-charge or the Principal can do this.`);
  const now = new Date();
  const changed = await tx.reportCard.updateMany({
    where: { sectionId: input.sectionId, period: input.period, studentId: { in: input.studentIds }, status: { not: "NOT_READY" } },
    data: input.as === "PRINTED" ? { status: "PRINTED", printedAt: now } : { status: "SENT", sentAt: now },
  });
  if (changed.count) await writeAudit(tx, ctx, { action: input.as === "PRINTED" ? "report-cards-printed" : "report-cards-sent", recordType: "Report Card", recordId: `${input.sectionId}:${input.period}`, after: { count: changed.count } });
  return changed.count;
}

// ---------- The printed report card ----------

const STUDENT_FIELDS = async (tx: Tx, studentId: string) => {
  const st = await tx.student.findFirstOrThrow({ where: { id: studentId }, include: { guardians: { where: { archivedAt: null }, include: { guardian: true }, orderBy: [{ isPrimary: "desc" }] } } });
  const father = st.guardians.find((g) => /father/i.test(g.relationship))?.guardian.name ?? "";
  const mother = st.guardians.find((g) => /mother/i.test(g.relationship))?.guardian.name ?? "";
  const primary = st.guardians[0]?.guardian;
  return {
    st,
    fields: {
      student_name: st.fullName, admission_no: st.admissionNo, date_of_birth: st.dateOfBirth ?? null, gender: st.gender ?? "",
      father_name: father, mother_name: mother, guardian_name: primary?.name ?? "", guardian_phone: primary?.phone ?? "", address: st.address ?? "", blood_group: st.bloodGroup ?? "",
    },
  };
};

/** The data of one student's report card for renderDocument, with the board's format. */
export async function reportCardData(tx: Tx, ctx: SchoolContext, studentId: string, sectionId: string, periodKey: string) {
  const section = await sectionInfo(tx, sectionId);
  const option = await findPeriod(tx, section.academicYearId, section.classId, periodKey);
  if (!option) throw new ExamRuleError("This report card period was not found.");
  const f = await features(tx, ctx);
  const settings = await examSettings(tx, ctx);
  const [{ st, fields }, enrolment, card, results, exams, year, classTeacher] = await Promise.all([
    STUDENT_FIELDS(tx, studentId),
    tx.enrolment.findFirst({ where: { studentId, academicYearId: section.academicYearId } }),
    tx.reportCard.findFirst({ where: { studentId, period: option.key, academicYearId: section.academicYearId } }),
    tx.result.findMany({ where: { studentId, key: { in: option.resultKeys } } }),
    tx.exam.findMany({ where: { id: { in: option.examIds } }, orderBy: { startDate: "asc" } }),
    tx.academicYear.findFirstOrThrow({ where: { id: section.academicYearId } }),
    section.classTeacherId ? tx.staff.findFirst({ where: { id: section.classTeacherId }, select: { fullName: true } }) : Promise.resolve(null),
  ]);
  const att = (await attendanceFor(tx, ctx, [studentId], await periodDates(tx, option, section.academicYearId))).get(studentId);
  const present = att?.present ?? card?.attendancePresent ?? null;
  const working = att?.working ?? card?.attendanceWorking ?? null;

  const resultOf = (examId: string) => results.find((r) => r.key === examKey(examId));
  const final = results.find((r) => r.key === finalKey(section.academicYearId));
  const headline = option.period.kind === "exam" ? resultOf(option.examIds[0]) : option.period.kind === "year" ? final : null;
  const pattern = exams[0]?.pattern ?? "PERCENTAGE";

  let columns: TableColumn[];
  let rows: Record<string, string>[];
  if (option.period.kind === "exam") {
    const r = resultOf(option.examIds[0]);
    const subjects = (r?.subjects ?? []) as unknown as SubjectResult[];
    const showMarksCol = pattern !== "GRADING";
    columns = [{ key: "subject", label: "Subject" }, ...(showMarksCol ? [{ key: "max", label: "Max marks", align: "right" as const }, { key: "marks", label: "Marks", align: "right" as const }] : []), { key: "grade", label: "Grade", align: "center" }, ...(pattern === "CGPA" ? [{ key: "points", label: "Points", align: "right" as const }] : [])];
    rows = subjects.map((s) => ({
      subject: s.parts && Object.keys(s.parts).length > 1 ? `${s.name} (${Object.entries(s.parts).map(([k, v]) => `${k} ${showMarks(v)}`).join(", ")})` : s.name,
      max: s.gradeOnly ? "" : String(s.max), marks: s.absent ? "AB" : s.gradeOnly ? "" : showMarks(s.marks), grade: s.grade ?? "", points: s.points === null ? "" : String(s.points),
    }));
  } else {
    columns = [{ key: "subject", label: "Subject" }, ...exams.map((e) => ({ key: e.id, label: e.title, align: "right" as const })), ...(option.period.kind === "year" ? [{ key: "final", label: "Final %", align: "right" as const }] : []), { key: "grade", label: "Grade", align: "center" }];
    const names = new Map<string, string>();
    for (const r of results) for (const s of (r.subjects as unknown as SubjectResult[]) ?? []) names.set(s.subjectId, s.name);
    rows = [...names.entries()].map(([subjectId, name]) => {
      const row: Record<string, string> = { subject: name };
      let last: SubjectResult | undefined;
      for (const e of exams) {
        const s = ((resultOf(e.id)?.subjects ?? []) as unknown as SubjectResult[]).find((x) => x.subjectId === subjectId);
        row[e.id] = !s ? "" : s.absent ? "AB" : s.gradeOnly ? s.grade ?? "" : pattern === "GRADING" ? s.grade ?? "" : `${showMarks(s.marks)}/${s.max}`;
        if (s) last = s;
      }
      const fs = ((final?.subjects ?? []) as unknown as SubjectResult[]).find((x) => x.subjectId === subjectId);
      if (option.period.kind === "year") row.final = fs?.percent !== null && fs?.percent !== undefined ? showPercent(fs.percent) : "";
      row.grade = (option.period.kind === "year" ? fs?.grade : last?.grade) ?? "";
      return row;
    });
  }

  const extraTables: NonNullable<DocumentData["extraTables"]> = [];
  if (f.coScholastic) {
    const [areas, grades] = await Promise.all([
      tx.coScholasticArea.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }),
      tx.coScholasticGrade.findMany({ where: { studentId, period: option.key } }),
    ]);
    for (const [kind, title] of [["area", "Co-scholastic areas"], ["skill", "Skills"], ["activity", "Activities"]] as const) {
      const list = areas.filter((a) => a.kind === kind);
      if (list.length) extraTables.push({ title, columns: [{ key: "area", label: kind === "area" ? "Area" : kind === "skill" ? "Skill" : "Activity" }, { key: "grade", label: "Grade", align: "center" }], rows: list.map((a) => ({ area: a.name, grade: grades.find((g) => g.areaId === a.id)?.grade || "" })) });
    }
  }
  if (f.competencies) {
    const levels = await tx.competencyLevel.findMany({ where: { studentId, period: option.key } });
    if (levels.length) {
      const comps = await tx.competency.findMany({ where: { id: { in: levels.map((l) => l.competencyId) } } });
      const subjects = await tx.subject.findMany({ where: { id: { in: comps.map((c) => c.subjectId) } }, select: { id: true, name: true } });
      extraTables.push({ title: "Competencies", columns: [{ key: "subject", label: "Subject" }, { key: "competency", label: "Competency" }, { key: "level", label: "Level", align: "center" }], rows: comps.map((c) => ({ subject: subjects.find((s) => s.id === c.subjectId)?.name ?? "", competency: c.name, level: levels.find((l) => l.competencyId === c.id)?.level ?? "" })) });
    }
  }

  const data: DocumentData = {
    fields: {
      ...fields,
      class_section: section.label, roll_no: enrolment?.rollNo ?? "",
      exam_name: `${option.period.kind === "year" ? "Annual report" : option.label}, ${year.name}`,
      attendance: working ? `${present} of ${working} days` : "",
      total_marks: headline && pattern !== "GRADING" && headline.maxTotal ? `${showMarks(headline.total)} / ${showMarks(headline.maxTotal)}` : "",
      percentage: headline?.percent !== null && headline?.percent !== undefined && pattern !== "GRADING" ? showPercent(headline.percent) : "",
      overall_grade: headline?.grade ?? "",
      rank: settings.ranksOn && headline?.rank ? String(headline.rank) : "",
      result: headline?.outcome ?? "",
      class_teacher: classTeacher?.fullName ?? "",
      remarks: card?.classTeacherRemark ?? "",
      principal_remarks: card?.principalRemark ?? "",
      ...(pattern === "CGPA" && headline?.points !== null && headline?.points !== undefined ? { overall_grade: `${headline.grade ?? ""} (CGPA ${headline.points.toFixed(1)})` } : {}),
    },
    rows, columns, extraTables, photoFileId: st.photoFileId, campusId: st.campusId,
    verifyText: `${st.admissionNo} ${option.label} ${year.name}`,
  };
  return { data, board: section.board, label: `${st.fullName}, ${option.label}`, pattern: patternLabel(pattern) };
}

/** Renders report cards as one PDF in the board's format (08 Done when 10 and 12). */
export async function renderReportCards(tx: Tx, ctx: SchoolContext, items: { studentId: string; sectionId: string }[], periodKey: string) {
  if (items.length === 0) throw new ExamRuleError("There are no report cards to print.");
  const f = await features(tx, ctx);
  const settings = await examSettings(tx, ctx);
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { board: true } });
  const datas: DocumentData[] = [];
  let board: string | null = null;
  for (const it of items) {
    const d = await reportCardData(tx, ctx, it.studentId, it.sectionId, periodKey);
    datas.push(d.data);
    board = d.board ?? school?.board ?? null;
  }
  const base = reportBaseFor(settings, board, f.boards);
  const design = base ? await currentDesign(tx, "report-card") : null;
  return renderDocument(tx, ctx, "report-card", datas, design && base ? { design: { base: base as "classic" | "modern" | "cbse", options: design.options } } : {});
}

export function periodWords(p: Period) {
  return p.kind === "year" ? "the whole year" : p.kind === "term" ? "the term" : "the exam";
}

export function generatedOn(tz: string) {
  return formatDate(new Date(), tz);
}
