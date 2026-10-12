// Exam Settings (08 §6): exam types, mark categories, grade scales with the
// ready-made presets, pass rules, ranks and the tie rule, weights for the
// final result, co-scholastic areas, competencies and the scale and report
// card format per board. A school that has never opened Exam Settings gets
// the usual Indian defaults the first time any exam screen needs them.
import "server-only";

import type { ExamPattern, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { ExamRuleError } from "./common";
import { checkBands, presetBands, readBands, PRESETS, type Band } from "./grades";
import type { PassRules } from "./compute";

export const DEFAULT_EXAM_TYPES = ["Unit Test 1", "Unit Test 2", "FA 1", "FA 2", "SA 1", "SA 2", "Half Yearly", "Pre-final", "Annual", "Practical", "Internal Assessment"];
export const DEFAULT_CATEGORIES = ["Theory", "Internal", "Practical", "Assignment", "Attendance", "Project"];
export const DEFAULT_AREAS: { name: string; kind: string; grades: string[] }[] = [
  { name: "Work Education", kind: "area", grades: ["A", "B", "C"] },
  { name: "Art Education", kind: "area", grades: ["A", "B", "C"] },
  { name: "Health and Physical Education", kind: "area", grades: ["A", "B", "C"] },
  { name: "Discipline", kind: "skill", grades: ["A", "B", "C"] },
];

/** Creates the usual defaults once, for a school that has none yet. Safe to call often. */
export async function ensureExamDefaults(tx: Tx, ctx: SchoolContext) {
  const settings = await tx.examSettings.findUnique({ where: { schoolId: ctx.schoolId } });
  if (settings) return settings;
  const existingTypes = await tx.examType.count();
  if (existingTypes === 0) {
    await tx.examType.createMany({ data: DEFAULT_EXAM_TYPES.map((name, i) => ({ schoolId: ctx.schoolId, name, sortOrder: i + 1 })), skipDuplicates: true });
  }
  if ((await tx.markCategory.count()) === 0) {
    await tx.markCategory.createMany({ data: DEFAULT_CATEGORIES.map((name, i) => ({ schoolId: ctx.schoolId, name, sortOrder: i + 1 })), skipDuplicates: true });
  }
  if ((await tx.coScholasticArea.count()) === 0) {
    await tx.coScholasticArea.createMany({ data: DEFAULT_AREAS.map((a, i) => ({ schoolId: ctx.schoolId, ...a, sortOrder: i + 1 })), skipDuplicates: true });
  }
  let scale = await tx.gradeScale.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } });
  if (!scale) {
    const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { board: true } });
    const preset = /icse/i.test(school?.board ?? "") ? PRESETS[1] : /state/i.test(school?.board ?? "") ? PRESETS[2] : PRESETS[0];
    scale = await tx.gradeScale.create({ data: { schoolId: ctx.schoolId, name: preset.name, preset: preset.key, bands: preset.bands as unknown as Prisma.InputJsonValue, isDefault: true, createdById: ctx.userId } });
  }
  return tx.examSettings.upsert({
    where: { schoolId: ctx.schoolId },
    create: { schoolId: ctx.schoolId, defaultScaleId: scale.id },
    update: {},
  });
}

export type FinalWeight = { examTypeId: string; weight: number };
export type BoardChoice = { scaleId: string | null; reportBase: string | null };

export type ExamSettingsView = Awaited<ReturnType<typeof examSettings>>;

/** The school's Exam Settings, with defaults made if needed. */
export async function examSettings(tx: Tx, ctx: SchoolContext) {
  const s = await ensureExamDefaults(tx, ctx);
  const weights = (Array.isArray(s.finalWeights) ? s.finalWeights : []) as FinalWeight[];
  return {
    ...s,
    finalWeights: weights.filter((w) => w && typeof w.examTypeId === "string").map((w) => ({ examTypeId: w.examTypeId, weight: Number(w.weight) || 0 })),
    classPatterns: (s.classPatterns ?? {}) as Record<string, ExamPattern>,
    boards: (s.boards ?? {}) as Record<string, BoardChoice>,
    rules: {
      passPercentSubject: s.passPercentSubject,
      passPercentOverall: s.passPercentOverall,
      graceMarks: s.graceMarks,
      compartmentSubjects: s.compartmentSubjects,
      absentRule: s.absentRule,
    } satisfies PassRules,
  };
}

export type RulesInput = {
  ranksOn: boolean;
  tieRule: "skip" | "dense";
  passPercentSubject: number;
  passPercentOverall: number;
  graceMarks: number;
  compartmentSubjects: number;
  absentRule: "zero" | "leave-out";
  gradeOnlyGrades: string[];
  publishRoles: string[];
  marksDueDays: number;
  reminderDaysBefore: number;
  gpaOn: boolean;
  defaultScaleId: string;
};

export async function saveRules(tx: Tx, ctx: SchoolContext, input: RulesInput) {
  const before = await examSettings(tx, ctx);
  if (!(await tx.gradeScale.findFirst({ where: { id: input.defaultScaleId, archivedAt: null } }))) throw new ExamRuleError("Choose the school's grade scale.", "defaultScaleId");
  if (input.gradeOnlyGrades.length < 2) throw new ExamRuleError("Give at least 2 grades for grade-only subjects, such as A, B, C.", "gradeOnlyGrades");
  if (input.publishRoles.length === 0) throw new ExamRuleError("Choose at least one role that may publish results.", "publishRoles");
  const data = { ...input, updatedById: ctx.userId };
  await tx.examSettings.update({ where: { schoolId: ctx.schoolId }, data });
  await writeAudit(tx, ctx, {
    action: "changed", recordType: "Exam Settings", recordId: ctx.schoolId,
    before: pick(before, Object.keys(input)) as Prisma.InputJsonValue,
    after: input as unknown as Prisma.InputJsonValue,
  });
}

function pick(o: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, o[k] as unknown]));
}

export async function saveWeights(tx: Tx, ctx: SchoolContext, weights: FinalWeight[]) {
  const before = await examSettings(tx, ctx);
  const types = await tx.examType.findMany({ where: { id: { in: weights.map((w) => w.examTypeId) } } });
  const clean = weights.filter((w) => w.weight > 0 && types.some((t) => t.id === w.examTypeId));
  for (const w of clean) if (!Number.isInteger(w.weight) || w.weight > 100) throw new ExamRuleError("Each weight must be a whole number from 0 to 100.");
  const sum = clean.reduce((s, w) => s + w.weight, 0);
  if (clean.length > 0 && sum !== 100) throw new ExamRuleError(`The weights add up to ${sum}%. They must add up to 100%, for example Half Yearly 40 and Annual 60.`);
  await tx.examSettings.update({ where: { schoolId: ctx.schoolId }, data: { finalWeights: clean as unknown as Prisma.InputJsonValue, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed-final-weights", recordType: "Exam Settings", recordId: ctx.schoolId, before: before.finalWeights as unknown as Prisma.InputJsonValue, after: clean as unknown as Prisma.InputJsonValue });
}

export async function saveClassPatterns(tx: Tx, ctx: SchoolContext, patterns: Record<string, ExamPattern>) {
  const before = await examSettings(tx, ctx);
  await tx.examSettings.update({ where: { schoolId: ctx.schoolId }, data: { classPatterns: patterns, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed-class-patterns", recordType: "Exam Settings", recordId: ctx.schoolId, before: before.classPatterns, after: patterns });
}

export async function saveBoards(tx: Tx, ctx: SchoolContext, boards: Record<string, BoardChoice>) {
  const before = await examSettings(tx, ctx);
  for (const [board, choice] of Object.entries(boards)) {
    if (choice.scaleId && !(await tx.gradeScale.findFirst({ where: { id: choice.scaleId, archivedAt: null } }))) throw new ExamRuleError(`The grade scale chosen for ${board} was archived. Choose again.`);
    if (choice.reportBase && !["classic", "modern", "cbse"].includes(choice.reportBase)) throw new ExamRuleError("Choose a report card format.");
  }
  await tx.examSettings.update({ where: { schoolId: ctx.schoolId }, data: { boards: boards as unknown as Prisma.InputJsonValue, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed-board-settings", recordType: "Exam Settings", recordId: ctx.schoolId, before: before.boards as unknown as Prisma.InputJsonValue, after: boards as unknown as Prisma.InputJsonValue });
}

// ---------- Grade scales ----------

export async function gradeScales(tx: Tx, ctx: SchoolContext, includeArchived = false) {
  await ensureExamDefaults(tx, ctx);
  const rows = await tx.gradeScale.findMany({ where: includeArchived ? {} : { archivedAt: null }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  return rows.map((r) => ({ ...r, bands: readBands(r.bands) }));
}

/**
 * Saves a grade scale. It must have no gaps or overlaps (rule 15). Each
 * change raises the version; published results keep the bands they were
 * made with, so they never change.
 */
export async function saveGradeScale(tx: Tx, ctx: SchoolContext, input: { id?: string | null; name: string; bands: Band[]; preset?: string | null }) {
  const problem = checkBands(input.bands);
  if (problem) throw new ExamRuleError(problem, "bands");
  const name = input.name.trim();
  if (!name) throw new ExamRuleError("Give the grade scale a name, such as CBSE 9-point.", "name");
  const clash = await tx.gradeScale.findFirst({ where: { name: { equals: name, mode: "insensitive" }, archivedAt: null, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (clash) throw new ExamRuleError(`There is already a grade scale called ${clash.name}. Use another name.`, "name");
  const bands = input.bands.map((b) => ({ ...b, grade: b.grade.trim(), remark: b.remark.trim() })).sort((a, b) => b.from - a.from);
  if (input.id) {
    const before = await tx.gradeScale.findFirst({ where: { id: input.id } });
    if (!before) throw new ExamRuleError("This grade scale was not found. Reload the page.");
    const row = await tx.gradeScale.update({ where: { id: input.id }, data: { name, bands: bands as unknown as Prisma.InputJsonValue, version: before.version + 1, updatedById: ctx.userId } });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Grade Scale", recordId: row.id, before: { name: before.name, version: before.version, bands: before.bands as Prisma.InputJsonValue }, after: { name, version: row.version, bands: bands as unknown as Prisma.InputJsonValue } });
    return row;
  }
  const row = await tx.gradeScale.create({ data: { schoolId: ctx.schoolId, name, preset: input.preset ?? null, bands: bands as unknown as Prisma.InputJsonValue, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Grade Scale", recordId: row.id, after: { name, bands: bands as unknown as Prisma.InputJsonValue } });
  return row;
}

export async function importPreset(tx: Tx, ctx: SchoolContext, key: string) {
  const preset = PRESETS.find((p) => p.key === key);
  const bands = presetBands(key);
  if (!preset || !bands) throw new ExamRuleError("Choose a ready-made scale.");
  let name = preset.name;
  for (let i = 2; await tx.gradeScale.findFirst({ where: { name, archivedAt: null } }); i++) name = `${preset.name} (${i})`;
  return saveGradeScale(tx, ctx, { name, bands, preset: key });
}

export async function archiveGradeScale(tx: Tx, ctx: SchoolContext, id: string) {
  const settings = await examSettings(tx, ctx);
  if (settings.defaultScaleId === id) throw new ExamRuleError("This is the school's grade scale. Choose another one as the school's scale first.");
  const inBoards = Object.entries(settings.boards).find(([, c]) => c.scaleId === id);
  if (inBoards) throw new ExamRuleError(`This scale is used for ${inBoards[0]} classes. Choose another one for that board first.`);
  const usedBy = await tx.exam.findFirst({ where: { gradeScaleId: id, archivedAt: null, status: { not: "RESULTS_PUBLISHED" } } });
  if (usedBy) throw new ExamRuleError(`${usedBy.title} uses this scale. Change the exam's scale first.`);
  const row = await tx.gradeScale.update({ where: { id }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Grade Scale", recordId: id, before: { name: row.name } });
}

/** The scale an exam uses for one class: the exam's own, else the class's board's (when per-board is on), else the school's. */
export async function scaleFor(tx: Tx, ctx: SchoolContext, opts: { examScaleId: string | null; board: string | null; boardsOn: boolean }) {
  const settings = await examSettings(tx, ctx);
  const ids = [opts.examScaleId, opts.boardsOn && opts.board ? settings.boards[opts.board]?.scaleId ?? null : null, settings.defaultScaleId].filter((x): x is string => Boolean(x));
  for (const id of ids) {
    const row = await tx.gradeScale.findFirst({ where: { id } });
    if (row) return { id: row.id, name: row.name, version: row.version, bands: readBands(row.bands) };
  }
  const any = await tx.gradeScale.findFirstOrThrow({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } });
  return { id: any.id, name: any.name, version: any.version, bands: readBands(any.bands) };
}

/** The report card format (ready design) for a class's board. */
export function reportBaseFor(settings: ExamSettingsView, board: string | null, boardsOn: boolean): string | null {
  if (!boardsOn || !board) return null;
  return settings.boards[board]?.reportBase ?? null;
}

// ---------- Lists: exam types, mark categories, co-scholastic areas, competencies ----------

type ListKind = "examType" | "markCategory";
const LIST_WORDS: Record<ListKind, { record: string; what: string }> = {
  examType: { record: "Exam Type", what: "exam type" },
  markCategory: { record: "Mark Category", what: "mark category" },
};

export async function addListItem(tx: Tx, ctx: SchoolContext, kind: ListKind, name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new ExamRuleError(`Type the ${LIST_WORDS[kind].what}.`, "name");
  if (clean.length > 40) throw new ExamRuleError(`The ${LIST_WORDS[kind].what} can be at most 40 characters.`, "name");
  const model = kind === "examType" ? tx.examType : tx.markCategory;
  const existing = await (model as typeof tx.examType).findFirst({ where: { name: { equals: clean, mode: "insensitive" } } });
  if (existing && !existing.archivedAt) throw new ExamRuleError(`${existing.name} is already there.`, "name");
  const last = await (model as typeof tx.examType).findFirst({ orderBy: { sortOrder: "desc" } });
  const row = existing
    ? await (model as typeof tx.examType).update({ where: { id: existing.id }, data: { archivedAt: null } })
    : await (model as typeof tx.examType).create({ data: { schoolId: ctx.schoolId, name: clean, sortOrder: (last?.sortOrder ?? 0) + 1, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: existing ? "restored" : "created", recordType: LIST_WORDS[kind].record, recordId: row.id, after: { name: row.name } });
  return row;
}

export async function archiveListItem(tx: Tx, ctx: SchoolContext, kind: ListKind, id: string) {
  const model = (kind === "examType" ? tx.examType : tx.markCategory) as typeof tx.examType;
  const row = await model.findFirst({ where: { id, archivedAt: null } });
  if (!row) throw new ExamRuleError("This was already archived. Reload the page.");
  if (kind === "examType") {
    const used = await tx.exam.findFirst({ where: { examTypeId: id, archivedAt: null, status: { not: "RESULTS_PUBLISHED" } } });
    if (used) throw new ExamRuleError(`${used.title} is a ${row.name}. Archive or finish that exam first.`);
  }
  await model.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: LIST_WORDS[kind].record, recordId: id, before: { name: row.name } });
}

export async function saveArea(tx: Tx, ctx: SchoolContext, input: { id?: string | null; name: string; kind: string; grades: string[]; description: string | null }) {
  const name = input.name.trim();
  if (!name) throw new ExamRuleError("Type the name of the area, such as Art Education.", "name");
  if (!["area", "skill", "activity"].includes(input.kind)) throw new ExamRuleError("Choose what kind of area this is.", "kind");
  const grades = [...new Set(input.grades.map((g) => g.trim()).filter(Boolean))];
  if (grades.length < 2) throw new ExamRuleError("Give at least 2 grades, such as A, B, C.", "grades");
  if (grades.some((g) => g.length > 10)) throw new ExamRuleError("Each grade can be at most 10 characters.", "grades");
  const clash = await tx.coScholasticArea.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (clash && !clash.archivedAt) throw new ExamRuleError(`${clash.name} is already there.`, "name");
  if (input.id) {
    const before = await tx.coScholasticArea.findFirstOrThrow({ where: { id: input.id } });
    const row = await tx.coScholasticArea.update({ where: { id: input.id }, data: { name, kind: input.kind, grades, description: input.description } });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Co-scholastic Area", recordId: row.id, before: { name: before.name, kind: before.kind, grades: before.grades }, after: { name, kind: input.kind, grades } });
    return row;
  }
  const last = await tx.coScholasticArea.findFirst({ orderBy: { sortOrder: "desc" } });
  const row = await tx.coScholasticArea.create({ data: { schoolId: ctx.schoolId, name, kind: input.kind, grades, description: input.description, sortOrder: (last?.sortOrder ?? 0) + 1, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Co-scholastic Area", recordId: row.id, after: { name, kind: input.kind, grades } });
  return row;
}

export async function archiveArea(tx: Tx, ctx: SchoolContext, id: string) {
  const row = await tx.coScholasticArea.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Co-scholastic Area", recordId: id, before: { name: row.name } });
}

export async function saveCompetency(tx: Tx, ctx: SchoolContext, input: { subjectId: string; name: string; levels: string[] }) {
  const name = input.name.trim();
  if (!name) throw new ExamRuleError("Type the competency, such as Reads with understanding.", "name");
  if (name.length > 120) throw new ExamRuleError("The competency can be at most 120 characters.", "name");
  const subject = await tx.subject.findFirst({ where: { id: input.subjectId, archivedAt: null } });
  if (!subject) throw new ExamRuleError("Choose the subject.", "subjectId");
  const levels = [...new Set(input.levels.map((l) => l.trim()).filter(Boolean))];
  if (levels.length < 2) throw new ExamRuleError("Give at least 2 levels, such as Beginning, Developing, Proficient.", "levels");
  const row = await tx.competency.create({ data: { schoolId: ctx.schoolId, subjectId: subject.id, name, levels, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Competency", recordId: row.id, after: { subject: subject.name, name, levels } });
  return row;
}

export async function archiveCompetency(tx: Tx, ctx: SchoolContext, id: string) {
  const row = await tx.competency.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Competency", recordId: id, before: { name: row.name } });
}

export async function setExamFeature(tx: Tx, ctx: SchoolContext, key: string, on: boolean) {
  const before = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } } });
  await tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } }, create: { schoolId: ctx.schoolId, featureKey: key, isOn: on }, update: { isOn: on } });
  await writeAudit(tx, ctx, { action: on ? "switched-on" : "switched-off", recordType: "School Feature", recordId: key, before: { on: before?.isOn ?? false }, after: { on } });
}
