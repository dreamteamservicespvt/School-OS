// Subjects (04 §2): the subject list, the subject map of each class with
// "from" and "to" dates so mid-year changes keep history, and elective
// and language choices with seats.
import "server-only";

import type { Prisma, SubjectType } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { AcademicRuleError, addDays, plural } from "./common";

export const SUBJECT_TYPES: { value: SubjectType; label: string }[] = [
  { value: "CORE", label: "Core" },
  { value: "OPTIONAL", label: "Optional" },
  { value: "ELECTIVE", label: "Elective" },
  { value: "LANGUAGE", label: "Language" },
];
export const subjectTypeLabel = (t: string) => SUBJECT_TYPES.find((x) => x.value === t)?.label ?? t;

/** A code made from the name (inferred): "Mathematics" to MAT, "Social Studies" to SS. */
export function codeFrom(name: string) {
  const words = name.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "SUB";
  if (words.length === 1) return words[0].slice(0, 3);
  return words.map((w) => w[0]).join("").slice(0, 4);
}

async function freeCode(tx: Tx, ctx: SchoolContext, base: string, exceptId?: string) {
  let code = base;
  for (let i = 2; await tx.subject.findFirst({ where: { schoolId: ctx.schoolId, code, id: exceptId ? { not: exceptId } : undefined } }); i++) code = `${base}${i}`;
  return code;
}

/** A subject mapping is in force on a date when it has started and not ended. */
export function mapActiveOn(date: Date): Prisma.SubjectClassWhereInput {
  return { archivedAt: null, OR: [{ fromDate: null }, { fromDate: { lte: date } }], AND: [{ OR: [{ toDate: null }, { toDate: { gte: date } }] }] };
}

export type SubjectInput = { name: string; code: string | null; type: SubjectType; gradeOnly: boolean; classIds: string[]; periodsPerWeek: number; fromDate: Date | null };

export async function addSubject(tx: Tx, ctx: SchoolContext, input: SubjectInput) {
  const name = input.name.trim();
  if (!name) throw new AcademicRuleError("Subject name is needed.", "name");
  const sameName = await tx.subject.findFirst({ where: { schoolId: ctx.schoolId, name: { equals: name, mode: "insensitive" }, archivedAt: null } });
  if (sameName) throw new AcademicRuleError(`${sameName.name} already exists (${sameName.code}).`, "name");
  let code = (input.code ?? "").trim().toUpperCase();
  if (code) {
    const taken = await tx.subject.findFirst({ where: { schoolId: ctx.schoolId, code } });
    if (taken) throw new AcademicRuleError(`The code ${code} is already used by ${taken.name}. Codes must be different.`, "code");
  } else code = await freeCode(tx, ctx, codeFrom(name));
  const subject = await tx.subject.create({ data: { schoolId: ctx.schoolId, name, code, type: input.type, gradeOnly: input.gradeOnly, createdById: ctx.userId } });
  for (const classId of input.classIds) {
    await tx.subjectClass.create({ data: { schoolId: ctx.schoolId, subjectId: subject.id, classId, periodsPerWeek: input.periodsPerWeek, fromDate: input.fromDate } });
  }
  await writeAudit(tx, ctx, { action: "created", recordType: "Subject", recordId: subject.id, after: { name, code, type: input.type, gradeOnly: input.gradeOnly, classes: input.classIds.length } });
  return subject;
}

export async function updateSubject(tx: Tx, ctx: SchoolContext, id: string, input: { name: string; code: string; type: SubjectType; gradeOnly: boolean }) {
  const subject = await tx.subject.findFirst({ where: { id, archivedAt: null } });
  if (!subject) throw new AcademicRuleError("This subject was not found.");
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!name) throw new AcademicRuleError("Subject name is needed.", "name");
  if (!code) throw new AcademicRuleError("Code is needed.", "code");
  const taken = await tx.subject.findFirst({ where: { schoolId: ctx.schoolId, code, id: { not: id } } });
  if (taken) throw new AcademicRuleError(`The code ${code} is already used by ${taken.name}.`, "code");
  const sameName = await tx.subject.findFirst({ where: { schoolId: ctx.schoolId, name: { equals: name, mode: "insensitive" }, archivedAt: null, id: { not: id } } });
  if (sameName) throw new AcademicRuleError(`${sameName.name} already exists.`, "name");
  const updated = await tx.subject.update({ where: { id }, data: { name, code, type: input.type, gradeOnly: input.gradeOnly, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Subject", recordId: id, before: { name: subject.name, code: subject.code, type: subject.type, gradeOnly: subject.gradeOnly }, after: input });
  return updated;
}

export async function archiveSubject(tx: Tx, ctx: SchoolContext, id: string, today: Date) {
  const subject = await tx.subject.findFirst({ where: { id, archivedAt: null } });
  if (!subject) throw new AcademicRuleError("This subject was not found.");
  const now = new Date();
  // Past marks and homework stay linked: the subject is archived, its maps end today.
  await tx.subjectClass.updateMany({ where: { subjectId: id, archivedAt: null, OR: [{ toDate: null }, { toDate: { gt: today } }] }, data: { toDate: today } });
  await tx.subject.update({ where: { id }, data: { archivedAt: now, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Subject", recordId: id, before: { name: subject.name, code: subject.code } });
  return subject;
}

/** Maps a subject to a class from a date, with periods per week. */
export async function mapSubject(tx: Tx, ctx: SchoolContext, input: { subjectId: string; classId: string; periodsPerWeek: number; fromDate: Date | null }) {
  const [subject, cls] = await Promise.all([
    tx.subject.findFirst({ where: { id: input.subjectId, archivedAt: null } }),
    tx.schoolClass.findFirst({ where: { id: input.classId, archivedAt: null } }),
  ]);
  if (!subject) throw new AcademicRuleError("Choose a subject.", "subjectId");
  if (!cls) throw new AcademicRuleError("Choose a class.", "classId");
  if (input.periodsPerWeek < 0 || input.periodsPerWeek > 30) throw new AcademicRuleError("Periods per week must be between 0 and 30.", "periodsPerWeek");
  const current = await tx.subjectClass.findFirst({ where: { subjectId: subject.id, classId: cls.id, archivedAt: null, toDate: null } });
  if (current) throw new AcademicRuleError(`${subject.name} is already taught in ${cls.name}. Change its periods instead.`, "subjectId");
  const row = await tx.subjectClass.create({ data: { schoolId: ctx.schoolId, subjectId: subject.id, classId: cls.id, periodsPerWeek: input.periodsPerWeek, fromDate: input.fromDate } });
  await writeAudit(tx, ctx, { action: "mapped", recordType: "Subject Class Map", recordId: row.id, after: { subject: subject.name, class: cls.name, periodsPerWeek: input.periodsPerWeek, from: input.fromDate?.toISOString().slice(0, 10) ?? null } });
  return { row, label: `${subject.name} in ${cls.name}` };
}

export async function updateMap(tx: Tx, ctx: SchoolContext, mapId: string, input: { periodsPerWeek: number }) {
  const map = await tx.subjectClass.findFirst({ where: { id: mapId, archivedAt: null }, include: { subject: true, schoolClass: true } });
  if (!map) throw new AcademicRuleError("This subject was not found for the class.");
  if (input.periodsPerWeek < 0 || input.periodsPerWeek > 30) throw new AcademicRuleError("Periods per week must be between 0 and 30.", "periodsPerWeek");
  await tx.subjectClass.update({ where: { id: mapId }, data: { periodsPerWeek: input.periodsPerWeek } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Subject Class Map", recordId: mapId, before: { periodsPerWeek: map.periodsPerWeek }, after: input });
  return `${map.subject.name} in ${map.schoolClass.name}`;
}

/** Ends a subject for a class from a date (04 §5 "Subject removed mid-year"). History stays. */
export async function endMap(tx: Tx, ctx: SchoolContext, mapId: string, endsFrom: Date) {
  const map = await tx.subjectClass.findFirst({ where: { id: mapId, archivedAt: null }, include: { subject: true, schoolClass: true } });
  if (!map) throw new AcademicRuleError("This subject was not found for the class.");
  if (map.fromDate && endsFrom <= map.fromDate) {
    // Never taught: the mapping is simply archived.
    await tx.subjectClass.update({ where: { id: mapId }, data: { archivedAt: new Date() } });
  } else {
    await tx.subjectClass.update({ where: { id: mapId }, data: { toDate: addDays(endsFrom, -1) } });
  }
  await writeAudit(tx, ctx, { action: "ended", recordType: "Subject Class Map", recordId: mapId, before: { toDate: map.toDate?.toISOString() ?? null }, after: { endsFrom: endsFrom.toISOString().slice(0, 10) } });
  return `${map.subject.name} ends for ${map.schoolClass.name} from ${formatDate(endsFrom)}`;
}

/** Extends an ended subject again (the recovery for an early "to" date). */
export async function reopenMap(tx: Tx, ctx: SchoolContext, mapId: string) {
  const map = await tx.subjectClass.findFirst({ where: { id: mapId, archivedAt: null }, include: { subject: true, schoolClass: true } });
  if (!map) throw new AcademicRuleError("This subject was not found for the class.");
  const running = await tx.subjectClass.findFirst({ where: { subjectId: map.subjectId, classId: map.classId, archivedAt: null, toDate: null, id: { not: mapId } } });
  if (running) throw new AcademicRuleError(`${map.subject.name} is already running in ${map.schoolClass.name}.`);
  await tx.subjectClass.update({ where: { id: mapId }, data: { toDate: null } });
  await writeAudit(tx, ctx, { action: "extended", recordType: "Subject Class Map", recordId: mapId, before: { toDate: map.toDate?.toISOString() ?? null }, after: { toDate: null } });
  return `${map.subject.name} runs again in ${map.schoolClass.name}`;
}

/** Copies one class's current subject map to other classes (inferred). Existing subjects are kept. */
export async function copySubjectMap(tx: Tx, ctx: SchoolContext, fromClassId: string, toClassIds: string[], today: Date) {
  const maps = await tx.subjectClass.findMany({ where: { classId: fromClassId, ...mapActiveOn(today) } });
  let added = 0;
  for (const to of toClassIds.filter((id) => id !== fromClassId)) {
    for (const m of maps) {
      const exists = await tx.subjectClass.findFirst({ where: { classId: to, subjectId: m.subjectId, archivedAt: null, toDate: null } });
      if (exists) continue;
      await tx.subjectClass.create({ data: { schoolId: ctx.schoolId, subjectId: m.subjectId, classId: to, periodsPerWeek: m.periodsPerWeek, fromDate: today } });
      added++;
    }
  }
  await writeAudit(tx, ctx, { action: "copied", recordType: "Subject Class Map", recordId: fromClassId, after: { toClasses: toClassIds.length, added } });
  return `${plural(added, "subject")} added to ${plural(toClassIds.length, "class", "classes")}.`;
}

/** The subjects of a class on a date, with periods per week. */
export async function subjectsForClass(tx: Tx, classId: string, date: Date) {
  const rows = await tx.subjectClass.findMany({ where: { classId, ...mapActiveOn(date), subject: { archivedAt: null } }, include: { subject: true } });
  return rows.map((r) => ({ id: r.subject.id, name: r.subject.name, code: r.subject.code, type: r.subject.type, gradeOnly: r.subject.gradeOnly, periodsPerWeek: r.periodsPerWeek, mapId: r.id })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Elective option with seats and a prerequisite. */
export async function saveElectiveOption(tx: Tx, ctx: SchoolContext, input: { academicYearId: string; classId: string; subjectId: string; groupName: string; seats: number | null; prerequisite: string | null }, id?: string) {
  const groupName = input.groupName.trim();
  if (!groupName) throw new AcademicRuleError("Name the choice, like Second language.", "groupName");
  if (input.seats !== null && (input.seats < 1 || input.seats > 1000)) throw new AcademicRuleError("Seats must be between 1 and 1000, or empty for no limit.", "seats");
  const dup = await tx.electiveOption.findFirst({ where: { academicYearId: input.academicYearId, classId: input.classId, subjectId: input.subjectId, archivedAt: null, id: id ? { not: id } : undefined } });
  if (dup) throw new AcademicRuleError("This subject is already a choice for the class.", "subjectId");
  if (id) {
    const before = await tx.electiveOption.findFirst({ where: { id, archivedAt: null } });
    if (!before) throw new AcademicRuleError("This choice was not found.");
    const taken = await tx.electiveChoice.count({ where: { optionId: id, archivedAt: null } });
    if (input.seats !== null && taken > input.seats) throw new AcademicRuleError(`${taken} students already chose it. Seats cannot be fewer than that.`, "seats");
    const row = await tx.electiveOption.update({ where: { id }, data: { groupName, seats: input.seats, prerequisite: input.prerequisite } });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Elective Option", recordId: id, before: { groupName: before.groupName, seats: before.seats, prerequisite: before.prerequisite }, after: { groupName, seats: input.seats, prerequisite: input.prerequisite } });
    return row;
  }
  const row = await tx.electiveOption.create({ data: { schoolId: ctx.schoolId, ...input, groupName, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Elective Option", recordId: row.id, after: { ...input, groupName } });
  return row;
}

/**
 * Records students' choices for one option (one by one or in bulk). A student
 * has one choice per group; seats are never exceeded. Also keeps the
 * student's Enrolment optional subjects in step.
 */
export async function recordChoices(tx: Tx, ctx: SchoolContext, optionId: string, studentIds: string[]) {
  const option = await tx.electiveOption.findFirst({ where: { id: optionId, archivedAt: null } });
  if (!option) throw new AcademicRuleError("This choice was not found.");
  const subject = await tx.subject.findUnique({ where: { id: option.subjectId } });
  const already = await tx.electiveChoice.findMany({ where: { optionId, archivedAt: null }, select: { studentId: true } });
  const have = new Set(already.map((a) => a.studentId));
  const fresh = [...new Set(studentIds)].filter((id) => !have.has(id));
  if (option.seats !== null && have.size + fresh.length > option.seats) {
    const left = Math.max(0, option.seats - have.size);
    throw new AcademicRuleError(`${subject?.name ?? "This choice"} has ${plural(left, "seat")} left, and ${plural(fresh.length, "student")} were picked. Pick fewer students or add seats.`);
  }
  const groupOptions = await tx.electiveOption.findMany({ where: { academicYearId: option.academicYearId, classId: option.classId, groupName: option.groupName, archivedAt: null }, select: { id: true, subjectId: true } });
  for (const studentId of fresh) {
    const enrolment = await tx.enrolment.findFirst({ where: { studentId, academicYearId: option.academicYearId, classId: option.classId, archivedAt: null } });
    if (!enrolment) throw new AcademicRuleError("A chosen student is not in this class this year.");
    // One choice per group: a previous choice in the same group is replaced.
    const previous = await tx.electiveChoice.findMany({ where: { studentId, academicYearId: option.academicYearId, optionId: { in: groupOptions.map((g) => g.id) }, archivedAt: null } });
    if (previous.length) await tx.electiveChoice.updateMany({ where: { id: { in: previous.map((p) => p.id) } }, data: { archivedAt: new Date() } });
    const dropSubjects = new Set(groupOptions.filter((g) => previous.some((p) => p.optionId === g.id)).map((g) => g.subjectId));
    await tx.electiveChoice.create({ data: { schoolId: ctx.schoolId, academicYearId: option.academicYearId, studentId, optionId, groupName: option.groupName, createdById: ctx.userId } });
    const subjects = [...enrolment.optionalSubjects.filter((s) => !dropSubjects.has(s)), option.subjectId];
    await tx.enrolment.update({ where: { id: enrolment.id }, data: { optionalSubjects: [...new Set(subjects)] } });
  }
  await writeAudit(tx, ctx, { action: "choices-recorded", recordType: "Elective Choice", recordId: optionId, after: { subject: subject?.name, students: fresh.length } });
  return { added: fresh.length, subject: subject?.name ?? "" };
}

export async function removeChoice(tx: Tx, ctx: SchoolContext, choiceId: string) {
  const choice = await tx.electiveChoice.findFirst({ where: { id: choiceId, archivedAt: null }, include: { option: true } });
  if (!choice) throw new AcademicRuleError("This choice was not found.");
  await tx.electiveChoice.update({ where: { id: choiceId }, data: { archivedAt: new Date() } });
  const enrolment = await tx.enrolment.findFirst({ where: { studentId: choice.studentId, academicYearId: choice.academicYearId, archivedAt: null } });
  if (enrolment) await tx.enrolment.update({ where: { id: enrolment.id }, data: { optionalSubjects: enrolment.optionalSubjects.filter((s) => s !== choice.option.subjectId) } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Elective Choice", recordId: choiceId, before: { studentId: choice.studentId, optionId: choice.optionId } });
  return choice;
}
