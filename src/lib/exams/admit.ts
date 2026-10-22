// Admit Cards (08 §2): for a whole class (in batches of up to 50, P9) or one
// student, only for a published datesheet. Each card has the photo, the
// subjects with their mark split, dates, days, times, maximum marks and the
// invigilator, the instructions and the signature lines. The design comes
// from Settings, Document Designs.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { renderDocument, type DocumentData } from "../documents";
import { currentDesign } from "../documents/designs";
import { formatDate } from "../format";
import { ExamRuleError } from "./common";
import { examDetail, type EntryView } from "./datesheet";
import { sectionStudents, sitters, type RosterStudent } from "./roster";
import { sectionInfo } from "./results";

export const ADMIT_BATCH = 50;

/** Who gets an admit card for an exam in a section, in roll order, with those missing a photo. */
export async function admitRoster(tx: Tx, examId: string, sectionId: string) {
  const detail = await examDetail(tx, examId);
  if (!detail) throw new ExamRuleError("This exam was not found.");
  if (detail.exam.status === "DRAFT") throw new ExamRuleError("Publish the datesheet first. Admit cards are made only from a published datesheet.");
  const section = await sectionInfo(tx, sectionId);
  if (!detail.exam.classIds.includes(section.classId)) throw new ExamRuleError(`${section.label} is not in ${detail.exam.title}.`);
  const students = await sectionStudents(tx, [sectionId], detail.exam.academicYearId);
  return { detail, section, students, noPhoto: students.filter((s) => !s.photoFileId) };
}

function rowsFor(entries: EntryView[], student: RosterStudent, subjects: { id: string; type: string }[]) {
  const mine = entries.filter((e) => {
    const s = subjects.find((x) => x.id === e.subjectId);
    return e.classId === student.classId && (!s || sitters([student], s).length > 0);
  });
  return mine.map((e, i) => ({
    no: String(i + 1),
    subject: e.categories.length ? `${e.subjectName} (${e.categories.map((c) => `${c.name} ${c.max}`).join(", ")})` : e.subjectName,
    date: formatDate(e.date), day: e.day, time: e.time, max: e.gradeOnly ? "Graded" : String(e.maxMarks), invigilator: e.invigilator ?? "",
  }));
}

/** Renders admit cards: a section (one batch of up to 50) or one student. Logged as an Admit Card Print. */
export async function renderAdmitCards(tx: Tx, ctx: SchoolContext, input: { examId: string; sectionId: string; studentId?: string | null; batch?: number }) {
  const { detail, section, students } = await admitRoster(tx, input.examId, input.sectionId);
  let chosen = students;
  if (input.studentId) {
    chosen = students.filter((s) => s.studentId === input.studentId);
    if (chosen.length === 0) throw new ExamRuleError("This student is not in this section for the exam.");
  } else {
    const b = Math.max(0, input.batch ?? 0);
    chosen = students.slice(b * ADMIT_BATCH, (b + 1) * ADMIT_BATCH);
    if (chosen.length === 0) throw new ExamRuleError(`${section.label} has no students to print for.`);
  }
  const subjects = await tx.subject.findMany({ where: { id: { in: detail.entries.map((e) => e.subjectId) } }, select: { id: true, type: true } });
  const year = await tx.academicYear.findFirstOrThrow({ where: { id: detail.exam.academicYearId } });
  const guardians = await tx.studentGuardian.findMany({ where: { studentId: { in: chosen.map((s) => s.studentId) }, archivedAt: null }, include: { guardian: { select: { name: true } } } });
  const campus = await tx.student.findMany({ where: { id: { in: chosen.map((s) => s.studentId) } }, select: { id: true, campusId: true } });
  // 08 Admit Cards: signature lines for the student, the class teacher and the school's chosen
  // signatory. The signatories chosen in Document Designs print with their names; with none chosen,
  // a line for the Principal.
  const design = await currentDesign(tx, "admit-card");
  const signatories = design.options.signatoryIds.length ? await tx.signatory.count({ where: { id: { in: design.options.signatoryIds }, archivedAt: null } }) : 0;
  const signLines = ["Student", "Class teacher", ...(signatories ? [] : ["Principal"])];
  const records: DocumentData[] = chosen.map((s) => {
    const mine = guardians.filter((g) => g.studentId === s.studentId);
    return {
      fields: {
        student_name: s.name, admission_no: s.admissionNo, roll_no: s.rollNo ?? "", class_section: section.label, date_of_birth: s.dateOfBirth, gender: s.gender ?? "",
        father_name: mine.find((g) => /father/i.test(g.relationship))?.guardian.name ?? "", mother_name: mine.find((g) => /mother/i.test(g.relationship))?.guardian.name ?? "",
        exam_name: `${detail.exam.title}, ${year.name} (${detail.termName})`, exam_centre: "",
      },
      rows: rowsFor(detail.entries, s, subjects),
      photoFileId: s.photoFileId,
      campusId: campus.find((c) => c.id === s.studentId)?.campusId ?? null,
      signLines,
    };
  });
  const doc = await renderDocument(tx, ctx, "admit-card", records);
  await tx.admitCardPrint.create({ data: { schoolId: ctx.schoolId, examId: input.examId, sectionId: input.sectionId, studentId: input.studentId ?? null, count: records.length, printedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "printed", recordType: "Admit Card", recordId: input.examId, after: { exam: detail.exam.title, section: section.label, count: records.length, student: input.studentId ? chosen[0].name : null } });
  return { doc, count: records.length, fileName: `admit-cards-${detail.exam.title}-${section.label}${input.studentId ? `-${chosen[0].name}` : ""}`.replace(/[^\w-]+/g, "-").toLowerCase() + ".pdf" };
}
