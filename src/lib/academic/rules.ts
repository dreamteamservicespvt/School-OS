// Academic Settings records (04 §6): terms, financial years, teacher
// preferences, subject conditions and the optional parts of the module.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { AcademicRuleError, DAY_NAMES } from "./common";
import { checkTerm } from "./lifecycle";
import { ACADEMIC_FEATURES, type AcademicFeature } from "./scope";

// ---------------------------------------------------------------- terms

export async function saveTerm(tx: Tx, ctx: SchoolContext, input: { academicYearId: string; name: string; startDate: Date; endDate: Date }, id?: string) {
  const name = input.name.trim();
  if (!name) throw new AcademicRuleError("Give the term a name, like Term 1.", "name");
  const { warning } = await checkTerm(tx, { ...input, name, exceptId: id });
  if (id) {
    const before = await tx.term.findFirst({ where: { id, archivedAt: null } });
    if (!before) throw new AcademicRuleError("This term was not found.");
    await tx.term.update({ where: { id }, data: { name, startDate: input.startDate, endDate: input.endDate } });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Term", recordId: id, before: { name: before.name, startDate: before.startDate.toISOString().slice(0, 10), endDate: before.endDate.toISOString().slice(0, 10) }, after: { name, startDate: input.startDate.toISOString().slice(0, 10), endDate: input.endDate.toISOString().slice(0, 10) } });
  } else {
    const last = await tx.term.aggregate({ where: { academicYearId: input.academicYearId, archivedAt: null }, _max: { sortOrder: true } });
    const row = await tx.term.create({ data: { schoolId: ctx.schoolId, academicYearId: input.academicYearId, name, startDate: input.startDate, endDate: input.endDate, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
    await writeAudit(tx, ctx, { action: "created", recordType: "Term", recordId: row.id, after: { name, startDate: input.startDate.toISOString().slice(0, 10), endDate: input.endDate.toISOString().slice(0, 10) } });
  }
  return { name, warning };
}

export async function archiveTerm(tx: Tx, ctx: SchoolContext, id: string) {
  const term = await tx.term.findFirst({ where: { id, archivedAt: null } });
  if (!term) throw new AcademicRuleError("This term was already removed.");
  const exams = await countExamsInTerm(tx, id);
  if (exams > 0) throw new AcademicRuleError(`${term.name} has ${exams} exams. Move or archive them in Examination & Results first.`);
  await tx.term.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Term", recordId: id, before: { name: term.name } });
  return term;
}

/** Exams pointing at a term, if the Examination module's table exists yet. */
async function countExamsInTerm(tx: Tx, termId: string) {
  const has = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exam' AND column_name = 'term_id'`;
  if (!Number(has[0]?.n ?? 0)) return 0;
  const rows = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "exam" WHERE term_id = $1::uuid`, termId);
  return Number(rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------- financial years

/** Adds a financial year (1 April to 31 March by default). Fees and accounts use it. */
export async function addFinancialYear(tx: Tx, ctx: SchoolContext, input: { name: string; startDate: Date; endDate: Date }) {
  const name = input.name.trim();
  if (!name) throw new AcademicRuleError("Give the financial year a name, like FY 2027-28.", "name");
  if (input.endDate <= input.startDate) throw new AcademicRuleError("The end date must be after the start date.", "endDate");
  if ((input.endDate.getTime() - input.startDate.getTime()) / 86_400_000 > 370) throw new AcademicRuleError("A financial year is at most one year long.", "endDate");
  const same = await tx.financialYear.findFirst({ where: { schoolId: ctx.schoolId, name, archivedAt: null } });
  if (same) throw new AcademicRuleError(`${name} already exists.`, "name");
  const overlap = await tx.financialYear.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } } });
  if (overlap) throw new AcademicRuleError(`These dates overlap ${overlap.name} (${formatDate(overlap.startDate)} to ${formatDate(overlap.endDate)}).`, "startDate");
  const row = await tx.financialYear.create({ data: { schoolId: ctx.schoolId, name, startDate: input.startDate, endDate: input.endDate, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Financial Year", recordId: row.id, after: { name, startDate: input.startDate.toISOString().slice(0, 10), endDate: input.endDate.toISOString().slice(0, 10) } });
  return row;
}

// ---------------------------------------------------------------- teacher preferences

export async function savePreference(tx: Tx, ctx: SchoolContext, staffId: string, input: { maxPerDay: number | null; maxPerWeek: number | null; unavailable: string[]; note: string | null }) {
  const staff = await tx.staff.findFirst({ where: { id: staffId, archivedAt: null } });
  if (!staff) throw new AcademicRuleError("Choose a teacher.", "staffId");
  if (input.maxPerDay !== null && (input.maxPerDay < 1 || input.maxPerDay > 12)) throw new AcademicRuleError("Periods a day must be between 1 and 12.", "maxPerDay");
  if (input.maxPerWeek !== null && (input.maxPerWeek < 1 || input.maxPerWeek > 72)) throw new AcademicRuleError("Periods a week must be between 1 and 72.", "maxPerWeek");
  if (input.unavailable.some((u) => !/^[1-7]:-?\d{1,2}$/.test(u))) throw new AcademicRuleError("A chosen time is not valid. Reload the page.", "unavailable");
  const before = await tx.teacherPreference.findUnique({ where: { schoolId_staffId: { schoolId: ctx.schoolId, staffId } } });
  const data = { maxPerDay: input.maxPerDay, maxPerWeek: input.maxPerWeek, unavailable: [...new Set(input.unavailable)].sort(), note: input.note, updatedById: ctx.userId };
  await tx.teacherPreference.upsert({ where: { schoolId_staffId: { schoolId: ctx.schoolId, staffId } }, create: { schoolId: ctx.schoolId, staffId, ...data }, update: data });
  await writeAudit(tx, ctx, { action: before ? "changed" : "created", recordType: "Teacher Preference", recordId: staffId, before: before ? { maxPerDay: before.maxPerDay, maxPerWeek: before.maxPerWeek, unavailable: before.unavailable } : null, after: data });
  return staff;
}

// ---------------------------------------------------------------- subject conditions

export async function addCondition(tx: Tx, ctx: SchoolContext, input: { subjectId: string; classId: string | null; dayOfWeek: number | null; periodNo: number }) {
  const subject = await tx.subject.findFirst({ where: { id: input.subjectId, archivedAt: null } });
  if (!subject) throw new AcademicRuleError("Choose a subject.", "subjectId");
  if (input.classId && !(await tx.schoolClass.findFirst({ where: { id: input.classId, archivedAt: null } }))) throw new AcademicRuleError("Choose a class, or all classes.", "classId");
  const same = await tx.subjectCondition.findFirst({ where: { subjectId: input.subjectId, classId: input.classId, dayOfWeek: input.dayOfWeek, periodNo: input.periodNo, archivedAt: null } });
  if (same) throw new AcademicRuleError("This condition is already in the list.", "periodNo");
  const row = await tx.subjectCondition.create({ data: { schoolId: ctx.schoolId, ...input, createdById: ctx.userId } });
  const words = `No ${subject.name} in period ${input.periodNo}${input.dayOfWeek ? ` on ${DAY_NAMES[input.dayOfWeek]}` : ""}`;
  await writeAudit(tx, ctx, { action: "created", recordType: "Subject Condition", recordId: row.id, after: { rule: words, classId: input.classId } });
  return { row, words };
}

export async function archiveCondition(tx: Tx, ctx: SchoolContext, id: string) {
  const row = await tx.subjectCondition.findFirst({ where: { id, archivedAt: null } });
  if (!row) throw new AcademicRuleError("This condition was already removed.");
  await tx.subjectCondition.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Subject Condition", recordId: id });
}

// ---------------------------------------------------------------- optional parts (P19)

export async function setFeature(tx: Tx, ctx: SchoolContext, key: AcademicFeature, on: boolean) {
  const f = ACADEMIC_FEATURES.find((x) => x.key === key);
  if (!f) throw new AcademicRuleError("That option was not found.");
  const before = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } } });
  await tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } }, create: { schoolId: ctx.schoolId, featureKey: key, isOn: on }, update: { isOn: on } });
  await writeAudit(tx, ctx, { action: on ? "switched-on" : "switched-off", recordType: "School Feature", recordId: null, before: { key, on: before?.isOn ?? false }, after: { key, on } });
  return f;
}
