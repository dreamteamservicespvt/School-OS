// Datesheet (08 §2): creating a datesheet creates the exam. Each subject's
// paper gets a date, start time, duration, room, invigilator and maximum
// marks; subjects with no date are left out. Clashes are blocked: a class
// with two papers at once, or a room or invigilator used twice (workflow 8
// step 3). Publishing (A10) puts the exam days on the School Calendar and in
// the Time Table, makes admit cards ready and tells invigilators and parents.
import "server-only";

import type { ExamPattern, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDate } from "../format";
import { DAY_NAMES, TIME_RE, addDays, isoDay, time12, weekday, wordList, plural } from "../academic/common";
import { assertYearOpen } from "../academic/years";
import { subjectsForClass } from "../academic/subjects";
import { ExamRuleError, overlaps, timeRange, durationWords } from "./common";
import { examSettings } from "./settings";
import { messageParents } from "./notify-parents";

export type ExamDetails = {
  title: string;
  examTypeId: string;
  pattern: ExamPattern;
  termId: string;
  startDate: Date;
  endDate: Date;
  classIds: string[];
  gradeScaleId: string | null;
};

export type ScheduleRow = {
  classId: string;
  subjectId: string;
  /** Empty leaves the subject out of the saved datesheet. */
  date: Date | null;
  startTime: string;
  durationMin: number;
  room: string | null;
  invigilatorId: string | null;
  maxMarks: number;
  pattern: ExamPattern | null;
};

export type Category = { name: string; max: number };

export function readCategories(raw: unknown): Category[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => c && typeof c === "object").map((c) => ({ name: String((c as Category).name ?? ""), max: Number((c as Category).max) })).filter((c) => c.name && Number.isFinite(c.max));
}

/** The categories marks are entered in: the configured split, or one "Marks" column out of the maximum. */
export function categoriesOf(entry: { maxMarks: number; categories: unknown }): Category[] {
  const cats = readCategories(entry.categories);
  return cats.length ? cats : [{ name: "Marks", max: entry.maxMarks }];
}

/** Has anyone entered marks for this exam? Then only the title can change (08 §5). */
export async function marksExist(tx: Tx, examId: string) {
  const entries = await tx.datesheetEntry.findMany({ where: { examId }, select: { id: true } });
  if (entries.length === 0) return false;
  return (await tx.marks.count({ where: { entryId: { in: entries.map((e) => e.id) } } })) > 0;
}

type Named = { id: string; name: string };

async function names(tx: Tx, classIds: string[], subjectIds: string[], staffIds: string[]) {
  const [classes, subjects, staff] = await Promise.all([
    tx.schoolClass.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }),
    tx.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true, gradeOnly: true } }),
    tx.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true } }),
  ]);
  const cls = new Map(classes.map((c) => [c.id, c.name]));
  const sub = new Map(subjects.map((s) => [s.id, s]));
  const stf = new Map(staff.map((s) => [s.id, s.fullName]));
  return { cls, sub, stf };
}

const when = (r: { date: Date; startTime: string }) => `${time12(r.startTime)} on ${formatDate(r.date)}`;

/**
 * The clash checks (workflow 8 step 3): no class has two papers at once,
 * and no room or invigilator is used twice at the same time, in this exam
 * or any other. Returns the first problem in plain words, or null.
 */
export async function findClash(tx: Tx, examId: string | null, rows: (ScheduleRow & { date: Date })[]): Promise<string | null> {
  if (rows.length === 0) return null;
  const dates = [...new Set(rows.map((r) => r.date.getTime()))].map((t) => new Date(t));
  const others = await tx.datesheetEntry.findMany({
    where: { archivedAt: null, date: { in: dates }, exam: { archivedAt: null }, ...(examId ? { examId: { not: examId } } : {}) },
    include: { exam: { select: { title: true } } },
  });
  const all = [
    ...rows.map((r, i) => ({ ...r, key: `new-${i}`, examTitle: null as string | null })),
    ...others.map((o) => ({ classId: o.classId, subjectId: o.subjectId, date: o.date, startTime: o.startTime, durationMin: o.durationMin, room: o.room, invigilatorId: o.invigilatorId, maxMarks: o.maxMarks, pattern: o.pattern, key: o.id, examTitle: o.exam.title })),
  ];
  const n = await names(tx, [...new Set(all.map((r) => r.classId))], [...new Set(all.map((r) => r.subjectId))], [...new Set(all.map((r) => r.invigilatorId).filter((x): x is string => Boolean(x)))]);
  const sub = (id: string) => n.sub.get(id)?.name ?? "another subject";
  const cls = (id: string) => n.cls.get(id) ?? "another class";
  const inExam = (r: { examTitle: string | null }) => (r.examTitle ? ` (${r.examTitle})` : "");

  for (let i = 0; i < rows.length; i++) {
    const a = { ...rows[i], key: `new-${i}` };
    for (const b of all) {
      if (b.key === a.key || !overlaps(a, b)) continue;
      // Rows of this datesheet are compared once each way.
      if (b.key.startsWith("new-") && Number(b.key.slice(4)) < i) continue;
      if (a.classId === b.classId) {
        return `${cls(a.classId)} already has ${sub(b.subjectId)} at ${when(b)}${inExam(b)}. Change the date or time of ${sub(a.subjectId)}.`;
      }
      if (a.room && b.room && a.room.trim().toLowerCase() === b.room.trim().toLowerCase()) {
        return `${a.room} is used by ${cls(b.classId)} (${sub(b.subjectId)}) at that time${inExam(b)}. Choose another room for ${cls(a.classId)} ${sub(a.subjectId)}.`;
      }
      if (a.invigilatorId && a.invigilatorId === b.invigilatorId) {
        return `${n.stf.get(a.invigilatorId) ?? "This teacher"} is already invigilating ${cls(b.classId)} ${sub(b.subjectId)} at ${when(b)}${inExam(b)}. Choose another invigilator for ${cls(a.classId)} ${sub(a.subjectId)}.`;
      }
    }
  }
  return null;
}

function checkDetails(d: ExamDetails) {
  const title = d.title.trim();
  if (!title) throw new ExamRuleError("Give the exam a title, such as Half Yearly.", "title");
  if (title.length > 60) throw new ExamRuleError("The title can be at most 60 characters.", "title");
  if (d.endDate < d.startDate) throw new ExamRuleError(`The end date ${formatDate(d.endDate)} is before the start date ${formatDate(d.startDate)}.`, "endDate");
  if (d.endDate.getTime() - d.startDate.getTime() > 60 * 86_400_000) throw new ExamRuleError("An exam can run for at most 60 days. Check the end date.", "endDate");
  if (d.classIds.length === 0) throw new ExamRuleError("Choose at least one class.", "classIds");
}

async function checkRefs(tx: Tx, yearId: string, d: ExamDetails) {
  const [type, term, year] = await Promise.all([
    tx.examType.findFirst({ where: { id: d.examTypeId, archivedAt: null } }),
    tx.term.findFirst({ where: { id: d.termId, academicYearId: yearId, archivedAt: null } }),
    tx.academicYear.findFirstOrThrow({ where: { id: yearId } }),
  ]);
  if (!type) throw new ExamRuleError("Choose the exam type.", "examTypeId");
  if (!term) throw new ExamRuleError("Choose the term.", "termId");
  if (d.startDate < year.startDate || d.endDate > year.endDate) throw new ExamRuleError(`The exam must fall inside the academic year ${year.name} (${formatDate(year.startDate)} to ${formatDate(year.endDate)}).`, "startDate");
  const sections = await tx.section.findMany({ where: { classId: { in: d.classIds }, academicYearId: yearId, archivedAt: null }, select: { classId: true } });
  const missing = d.classIds.filter((c) => !sections.some((s) => s.classId === c));
  if (missing.length) throw new ExamRuleError("A chosen class has no sections this year. Choose again.", "classIds");
  if (d.gradeScaleId && !(await tx.gradeScale.findFirst({ where: { id: d.gradeScaleId, archivedAt: null } }))) throw new ExamRuleError("The chosen grade scale was archived. Choose again.", "gradeScaleId");
  return { type, term, year };
}

/** Checks each dated row: inside the exam dates, a real time, a duration and maximum marks; subjects of the class. */
async function checkRows(tx: Tx, d: ExamDetails, rows: ScheduleRow[]) {
  const dated = rows.filter((r): r is ScheduleRow & { date: Date } => r.date !== null && d.classIds.includes(r.classId));
  if (dated.length === 0) throw new ExamRuleError("Give a date to at least one subject. Subjects with no date are left out.", "schedule");
  const n = await names(tx, d.classIds, [...new Set(dated.map((r) => r.subjectId))], []);
  const seen = new Set<string>();
  const subjectsByClass = new Map<string, Set<string>>();
  for (const classId of d.classIds) subjectsByClass.set(classId, new Set((await subjectsForClass(tx, classId, d.startDate)).map((s) => s.id)));
  for (const r of dated) {
    const label = `${n.cls.get(r.classId) ?? "Class"} ${n.sub.get(r.subjectId)?.name ?? "subject"}`;
    if (!subjectsByClass.get(r.classId)?.has(r.subjectId)) throw new ExamRuleError(`${label}: this subject is not taught in the class. Check the Subjects page in Academic Management.`, "schedule");
    const key = `${r.classId}:${r.subjectId}`;
    if (seen.has(key)) throw new ExamRuleError(`${label} is in the datesheet twice. Keep one paper per subject.`, "schedule");
    seen.add(key);
    if (r.date < d.startDate || r.date > d.endDate) throw new ExamRuleError(`${label} is on ${formatDate(r.date)}, outside the exam dates ${formatDate(d.startDate)} to ${formatDate(d.endDate)}.`, "schedule");
    if (!TIME_RE.test(r.startTime)) throw new ExamRuleError(`${label}: give a start time, such as 9:30 AM.`, "schedule");
    if (!Number.isInteger(r.durationMin) || r.durationMin < 15 || r.durationMin > 600) throw new ExamRuleError(`${label}: the duration must be between 15 minutes and 10 hours.`, "schedule");
    const gradeOnly = n.sub.get(r.subjectId)?.gradeOnly;
    if (gradeOnly) r.maxMarks = 0;
    else if (!Number.isInteger(r.maxMarks) || r.maxMarks < 1 || r.maxMarks > 1000) throw new ExamRuleError(`${label}: maximum marks must be a whole number from 1 to 1000.`, "schedule");
    if (r.room && r.room.length > 40) throw new ExamRuleError(`${label}: the room name can be at most 40 characters.`, "schedule");
    if (weekday(r.date) === 7) throw new ExamRuleError(`${label} is on a Sunday (${formatDate(r.date)}). Choose a school day.`, "schedule");
  }
  const holidays = await tx.calendarEntry.findMany({ where: { archivedAt: null, type: { in: ["holiday", "vacation"] }, startDate: { lte: d.endDate }, endDate: { gte: d.startDate } } });
  for (const r of dated) {
    const h = holidays.find((x) => x.startDate <= r.date && x.endDate >= r.date);
    if (h) throw new ExamRuleError(`${n.cls.get(r.classId)} ${n.sub.get(r.subjectId)?.name} is on ${formatDate(r.date)}, which is ${h.title} on the School Calendar. Choose another day.`, "schedule");
  }
  const staffIds = [...new Set(dated.map((r) => r.invigilatorId).filter((x): x is string => Boolean(x)))];
  if (staffIds.length) {
    const found = await tx.staff.count({ where: { id: { in: staffIds }, archivedAt: null } });
    if (found !== staffIds.length) throw new ExamRuleError("A chosen invigilator is no longer on the staff list. Choose again.", "schedule");
  }
  return dated;
}

export async function createDatesheet(tx: Tx, ctx: SchoolContext, yearId: string, d: ExamDetails, rows: ScheduleRow[]) {
  await assertYearOpen(tx, yearId);
  checkDetails(d);
  await checkRefs(tx, yearId, d);
  const dated = await checkRows(tx, d, rows);
  const clash = await findClash(tx, null, dated);
  if (clash) throw new ExamRuleError(clash, "schedule");
  const settings = await examSettings(tx, ctx);
  const exam = await tx.exam.create({
    data: {
      schoolId: ctx.schoolId, academicYearId: yearId, termId: d.termId, examTypeId: d.examTypeId, title: d.title.trim(), pattern: d.pattern,
      gradeScaleId: d.gradeScaleId, classIds: d.classIds, startDate: d.startDate, endDate: d.endDate, createdById: ctx.userId,
    },
  });
  for (const r of dated) {
    await tx.datesheetEntry.create({
      data: {
        schoolId: ctx.schoolId, examId: exam.id, classId: r.classId, subjectId: r.subjectId, date: r.date, startTime: r.startTime, durationMin: r.durationMin,
        room: r.room?.trim() || null, invigilatorId: r.invigilatorId, maxMarks: r.maxMarks, pattern: r.pattern && r.pattern !== d.pattern ? r.pattern : null,
        marksDueDate: addDays(r.date, settings.marksDueDays), createdById: ctx.userId,
      },
    });
  }
  await writeAudit(tx, ctx, { action: "created", recordType: "Exam", recordId: exam.id, after: { title: exam.title, classes: d.classIds.length, papers: dated.length, from: isoDay(d.startDate), to: isoDay(d.endDate) } });
  return { exam, papers: dated.length, leftOut: rows.length - dated.length };
}

/**
 * Changes a datesheet. Once marks are entered ("results are uploaded"), only
 * the title can change (08 §5). A published datesheet keeps the calendar in step.
 */
export async function updateDatesheet(tx: Tx, ctx: SchoolContext, examId: string, d: ExamDetails, rows: ScheduleRow[]) {
  const exam = await tx.exam.findFirst({ where: { id: examId, archivedAt: null }, include: { entries: { where: { archivedAt: null } } } });
  if (!exam) throw new ExamRuleError("This exam was not found. It may have been archived.");
  await assertYearOpen(tx, exam.academicYearId);
  checkDetails(d);
  if (await marksExist(tx, examId)) {
    const sameRows = rows.every((r) => {
      const e = exam.entries.find((x) => x.classId === r.classId && x.subjectId === r.subjectId);
      if (!r.date) return !e;
      return e && e.date.getTime() === r.date.getTime() && e.startTime === r.startTime && e.durationMin === r.durationMin && e.maxMarks === r.maxMarks && (e.room ?? "") === (r.room?.trim() ?? "") && (e.invigilatorId ?? null) === (r.invigilatorId ?? null);
    }) && rows.filter((r) => r.date).length === exam.entries.length;
    const sameDetails = d.examTypeId === exam.examTypeId && d.pattern === exam.pattern && d.termId === exam.termId && d.startDate.getTime() === exam.startDate.getTime() && d.endDate.getTime() === exam.endDate.getTime() && d.classIds.length === exam.classIds.length && d.classIds.every((c) => exam.classIds.includes(c)) && (d.gradeScaleId ?? null) === (exam.gradeScaleId ?? null);
    if (!sameRows || !sameDetails) throw new ExamRuleError("Results exist for this datesheet. Only the title can change. Ask the Exam In-charge or the Principal.");
    const title = d.title.trim();
    await tx.exam.update({ where: { id: examId }, data: { title, updatedById: ctx.userId } });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Exam", recordId: examId, before: { title: exam.title }, after: { title } });
    if (exam.status !== "DRAFT") await syncCalendar(tx, ctx, examId);
    return { titleOnly: true };
  }
  await checkRefs(tx, exam.academicYearId, d);
  const dated = await checkRows(tx, d, rows);
  const clash = await findClash(tx, examId, dated);
  if (clash) throw new ExamRuleError(clash, "schedule");
  const settings = await examSettings(tx, ctx);
  const before = { title: exam.title, from: isoDay(exam.startDate), to: isoDay(exam.endDate), papers: exam.entries.length };
  await tx.exam.update({
    where: { id: examId },
    data: { title: d.title.trim(), examTypeId: d.examTypeId, pattern: d.pattern, termId: d.termId, startDate: d.startDate, endDate: d.endDate, classIds: d.classIds, gradeScaleId: d.gradeScaleId, updatedById: ctx.userId },
  });
  const now = new Date();
  for (const e of exam.entries) {
    if (!dated.some((r) => r.classId === e.classId && r.subjectId === e.subjectId)) await tx.datesheetEntry.update({ where: { id: e.id }, data: { archivedAt: now } });
  }
  for (const r of dated) {
    const e = exam.entries.find((x) => x.classId === r.classId && x.subjectId === r.subjectId);
    const data = {
      date: r.date, startTime: r.startTime, durationMin: r.durationMin, room: r.room?.trim() || null, invigilatorId: r.invigilatorId, maxMarks: r.maxMarks,
      pattern: r.pattern && r.pattern !== d.pattern ? r.pattern : null, marksDueDate: addDays(r.date, settings.marksDueDays),
    };
    if (e) {
      const cats = readCategories(e.categories);
      const keep = cats.length > 0 && cats.reduce((s, c) => s + c.max, 0) === r.maxMarks;
      await tx.datesheetEntry.update({ where: { id: e.id }, data: { ...data, categories: keep ? (cats as unknown as Prisma.InputJsonValue) : [], reminderSentAt: e.date.getTime() === r.date.getTime() ? e.reminderSentAt : null } });
    } else {
      await tx.datesheetEntry.create({ data: { schoolId: ctx.schoolId, examId, classId: r.classId, subjectId: r.subjectId, ...data, createdById: ctx.userId } });
    }
  }
  await writeAudit(tx, ctx, { action: "changed", recordType: "Exam", recordId: examId, before, after: { title: d.title.trim(), from: isoDay(d.startDate), to: isoDay(d.endDate), papers: dated.length } });
  if (exam.status !== "DRAFT") {
    await syncCalendar(tx, ctx, examId);
    await ensurePapers(tx, ctx, examId);
  }
  return { titleOnly: false };
}

/** Mark categories for one paper, e.g. Theory 80 and Internal 20; they must add up to the maximum. */
export async function setCategories(tx: Tx, ctx: SchoolContext, entryId: string, categories: Category[], allClasses: boolean) {
  const entry = await tx.datesheetEntry.findFirst({ where: { id: entryId, archivedAt: null }, include: { exam: true } });
  if (!entry) throw new ExamRuleError("This paper was not found. Reload the page.");
  await assertYearOpen(tx, entry.exam.academicYearId);
  const subject = await tx.subject.findFirstOrThrow({ where: { id: entry.subjectId } });
  if (subject.gradeOnly) throw new ExamRuleError(`${subject.name} is graded, not marked, so it has no mark categories.`);
  const clean = categories.map((c) => ({ name: c.name.trim(), max: c.max })).filter((c) => c.name);
  const names = new Set<string>();
  for (const c of clean) {
    if (names.has(c.name.toLowerCase())) throw new ExamRuleError(`${c.name} is used twice. Use each category once.`, "categories");
    names.add(c.name.toLowerCase());
    if (!Number.isInteger(c.max) || c.max < 1) throw new ExamRuleError(`${c.name}: marks must be a whole number of at least 1.`, "categories");
  }
  const targets = allClasses
    ? await tx.datesheetEntry.findMany({ where: { examId: entry.examId, subjectId: entry.subjectId, archivedAt: null } })
    : [entry];
  for (const t of targets) {
    const sum = clean.reduce((s, c) => s + c.max, 0);
    if (clean.length > 0 && sum !== t.maxMarks) throw new ExamRuleError(`The categories add up to ${sum}, but ${subject.name} is out of ${t.maxMarks}. Make them add up to ${t.maxMarks}.`, "categories");
    if ((await tx.marks.count({ where: { entryId: t.id } })) > 0) throw new ExamRuleError(`Marks are already entered for ${subject.name}. Its categories cannot change now.`, "categories");
  }
  if (clean.length === 1) throw new ExamRuleError("Use at least 2 categories, or none for one mark out of the maximum.", "categories");
  for (const t of targets) {
    await tx.datesheetEntry.update({ where: { id: t.id }, data: { categories: clean as unknown as Prisma.InputJsonValue } });
    await writeAudit(tx, ctx, { action: "changed-mark-categories", recordType: "Datesheet Entry", recordId: t.id, before: t.categories as Prisma.InputJsonValue, after: clean as unknown as Prisma.InputJsonValue });
  }
  return { subject: subject.name, count: targets.length };
}

/** One Marks Paper (status Not started) for every paper and section, so progress shows from the start. */
export async function ensurePapers(tx: Tx, ctx: SchoolContext, examId: string) {
  const exam = await tx.exam.findFirstOrThrow({ where: { id: examId }, include: { entries: { where: { archivedAt: null } } } });
  const sections = await tx.section.findMany({ where: { classId: { in: exam.classIds }, academicYearId: exam.academicYearId, archivedAt: null }, select: { id: true, classId: true } });
  const data: Prisma.MarksPaperCreateManyInput[] = [];
  for (const e of exam.entries) for (const s of sections.filter((x) => x.classId === e.classId)) data.push({ schoolId: ctx.schoolId, entryId: e.id, sectionId: s.id });
  if (data.length) await tx.marksPaper.createMany({ data, skipDuplicates: true });
}

/** The exam days on the School Calendar, so the Time Table shows them (A10). Made again on every change. */
export async function syncCalendar(tx: Tx, ctx: SchoolContext, examId: string) {
  const exam = await tx.exam.findFirstOrThrow({ where: { id: examId }, include: { entries: { where: { archivedAt: null } } } });
  const source = `exam:${examId}`;
  await tx.calendarEntry.updateMany({ where: { source, archivedAt: null }, data: { archivedAt: new Date() } });
  if (exam.archivedAt || exam.status === "DRAFT") return 0;
  const classes = await tx.schoolClass.findMany({ where: { id: { in: exam.classIds } }, select: { id: true, name: true, campusId: true, sortOrder: true }, orderBy: { sortOrder: "asc" } });
  const subjects = await tx.subject.findMany({ where: { id: { in: [...new Set(exam.entries.map((e) => e.subjectId))] } }, select: { id: true, name: true } });
  const byDay = new Map<string, typeof exam.entries>();
  for (const e of exam.entries) byDay.set(isoDay(e.date), [...(byDay.get(isoDay(e.date)) ?? []), e]);
  const campusIds = [...new Set(classes.map((c) => c.campusId))];
  for (const [day, list] of [...byDay.entries()].sort()) {
    const subj = [...new Set(list.map((e) => subjects.find((s) => s.id === e.subjectId)?.name ?? ""))].filter(Boolean);
    const sitting = classes.filter((c) => list.some((e) => e.classId === c.id));
    const cls = sitting.map((c) => c.name);
    const date = new Date(`${day}T00:00:00Z`);
    await tx.calendarEntry.create({
      data: {
        schoolId: ctx.schoolId, campusId: campusIds.length === 1 ? campusIds[0] : null, academicYearId: exam.academicYearId, type: "exam_day",
        title: `${exam.title}: ${wordList(subj)} (${wordList(cls)})`.slice(0, 200), startDate: date, endDate: date, attendanceOn: true, source, createdById: ctx.userId,
        // Only the classes that sit a paper that day (an empty list would mean the whole school).
        classIds: sitting.map((c) => c.id),
      },
    });
  }
  return byDay.size;
}

/** Publishes the datesheet (A10). Draft only; the papers must be clash-free. */
export async function publishDatesheet(tx: Tx, ctx: SchoolContext, examId: string, opts: { tellParents: boolean }) {
  const exam = await tx.exam.findFirst({ where: { id: examId, archivedAt: null }, include: { entries: { where: { archivedAt: null } } } });
  if (!exam) throw new ExamRuleError("This exam was not found. It may have been archived.");
  await assertYearOpen(tx, exam.academicYearId);
  if (exam.status !== "DRAFT") throw new ExamRuleError("This datesheet is already published.");
  if (exam.entries.length === 0) throw new ExamRuleError("Add at least one dated subject before publishing.");
  const clash = await findClash(tx, examId, exam.entries.map((e) => ({ ...e, date: e.date })));
  if (clash) throw new ExamRuleError(clash);
  const now = new Date();
  await tx.exam.update({ where: { id: examId }, data: { status: "PUBLISHED", publishedAt: now, publishedById: ctx.userId } });
  const days = await syncCalendar(tx, ctx, examId);
  await ensurePapers(tx, ctx, examId);

  // Invigilators with a login are told their papers.
  const staffIds = [...new Set(exam.entries.map((e) => e.invigilatorId).filter((x): x is string => Boolean(x)))];
  const staff = await tx.staff.findMany({ where: { id: { in: staffIds }, userLoginId: { not: null } }, select: { id: true, userLoginId: true } });
  for (const s of staff) {
    const mine = exam.entries.filter((e) => e.invigilatorId === s.id).sort((a, b) => a.date.getTime() - b.date.getTime());
    await notify(tx, ctx, {
      to: s.userLoginId!, type: "exam-invigilation",
      text: `${exam.title}: you are invigilating ${plural(mine.length, "paper")}, the first at ${time12(mine[0].startTime)} on ${formatDate(mine[0].date)}.`,
      link: `/examination-results/datesheet/${examId}`,
    });
  }
  let parents = 0;
  if (opts.tellParents) {
    const sections = await tx.section.findMany({ where: { classId: { in: exam.classIds }, academicYearId: exam.academicYearId, archivedAt: null }, select: { id: true } });
    const enrolments = await tx.enrolment.findMany({ where: { sectionId: { in: sections.map((s) => s.id) }, academicYearId: exam.academicYearId, archivedAt: null, status: "STUDYING" }, select: { studentId: true } });
    const sent = await messageParents(tx, ctx, {
      template: "datesheet-published",
      studentIds: enrolments.map((e) => e.studentId),
      idempotencyKey: `datesheet-published:${examId}`,
      vars: { exam_name: exam.title, date: formatDate(exam.startDate) }, source: { type: "Exam", id: examId },
      text: `${exam.title} begins on ${formatDate(exam.startDate)}. The datesheet is on your Parent Link.`,
    });
    parents = sent.recipients;
  }
  await writeAudit(tx, ctx, { action: "published", recordType: "Exam", recordId: examId, before: { status: "DRAFT" }, after: { status: "PUBLISHED", calendarDays: days, invigilatorsTold: staff.length, parentsMessaged: parents } });
  return { days, invigilators: staff.length, parents };
}

/** Archives an exam with no marks. Its calendar days go too. */
export async function archiveExam(tx: Tx, ctx: SchoolContext, examId: string) {
  const exam = await tx.exam.findFirst({ where: { id: examId, archivedAt: null } });
  if (!exam) throw new ExamRuleError("This exam was already archived.");
  await assertYearOpen(tx, exam.academicYearId);
  if (await marksExist(tx, examId)) throw new ExamRuleError("Results exist for this datesheet, so it cannot be archived. Its marks and results stay in the history.");
  const now = new Date();
  await tx.exam.update({ where: { id: examId }, data: { archivedAt: now, updatedById: ctx.userId } });
  await tx.calendarEntry.updateMany({ where: { source: `exam:${examId}`, archivedAt: null }, data: { archivedAt: now } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Exam", recordId: examId, before: { title: exam.title, status: exam.status } });
  return exam;
}

export async function restoreExam(tx: Tx, ctx: SchoolContext, examId: string) {
  const exam = await tx.exam.findFirst({ where: { id: examId, archivedAt: { not: null } }, include: { entries: { where: { archivedAt: null } } } });
  if (!exam) throw new ExamRuleError("This exam is not archived.");
  await assertYearOpen(tx, exam.academicYearId);
  const clash = await findClash(tx, examId, exam.entries.map((e) => ({ ...e, date: e.date })));
  if (clash) throw new ExamRuleError(`It cannot come back as it is: ${clash}`);
  await tx.exam.update({ where: { id: examId }, data: { archivedAt: null, updatedById: ctx.userId } });
  if (exam.status !== "DRAFT") await syncCalendar(tx, ctx, examId);
  await writeAudit(tx, ctx, { action: "restored", recordType: "Exam", recordId: examId, after: { title: exam.title } });
  return exam;
}

// ---------- Reading ----------

export type EntryView = {
  id: string; classId: string; className: string; subjectId: string; subjectName: string; gradeOnly: boolean;
  date: Date; day: string; startTime: string; durationMin: number; time: string; duration: string;
  room: string | null; invigilatorId: string | null; invigilator: string | null; maxMarks: number; pattern: ExamPattern | null;
  categories: Category[]; marksDueDate: Date | null;
};

/** One exam with its papers, in date and time order, with names filled in. */
export async function examDetail(tx: Tx, examId: string, opts: { archived?: boolean } = {}) {
  const exam = await tx.exam.findFirst({ where: { id: examId, ...(opts.archived ? {} : { archivedAt: null }) }, include: { entries: { where: { archivedAt: null }, orderBy: [{ date: "asc" }, { startTime: "asc" }] } } });
  if (!exam) return null;
  const n = await names(tx, exam.classIds, [...new Set(exam.entries.map((e) => e.subjectId))], [...new Set(exam.entries.map((e) => e.invigilatorId).filter((x): x is string => Boolean(x)))]);
  const [type, term, classes] = await Promise.all([
    tx.examType.findFirst({ where: { id: exam.examTypeId } }),
    tx.term.findFirst({ where: { id: exam.termId } }),
    tx.schoolClass.findMany({ where: { id: { in: exam.classIds } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, board: true } }),
  ]);
  const entries: EntryView[] = exam.entries.map((e) => ({
    id: e.id, classId: e.classId, className: n.cls.get(e.classId) ?? "", subjectId: e.subjectId, subjectName: n.sub.get(e.subjectId)?.name ?? "", gradeOnly: Boolean(n.sub.get(e.subjectId)?.gradeOnly),
    date: e.date, day: DAY_NAMES[weekday(e.date)], startTime: e.startTime, durationMin: e.durationMin, time: timeRange(e.startTime, e.durationMin), duration: durationWords(e.durationMin),
    room: e.room, invigilatorId: e.invigilatorId, invigilator: e.invigilatorId ? n.stf.get(e.invigilatorId) ?? null : null, maxMarks: e.maxMarks, pattern: e.pattern,
    categories: readCategories(e.categories), marksDueDate: e.marksDueDate,
  }));
  return { exam, entries, typeName: type?.name ?? "", termName: term?.name ?? "", classes };
}

export type ExamFilters = { q?: string; classId?: string; from?: Date | null; to?: Date | null; status?: string; archived?: boolean };

/** The datesheet list as cards (08 §2): title, classes, year, dates, students, subjects and status. */
export async function datesheetList(tx: Tx, yearId: string, f: ExamFilters, onlyClassIds: string[] | null) {
  const where: Prisma.ExamWhereInput = {
    academicYearId: yearId,
    archivedAt: f.archived ? { not: null } : null,
    ...(f.q ? { title: { contains: f.q, mode: "insensitive" } } : {}),
    ...(f.classId ? { classIds: { has: f.classId } } : {}),
    ...(onlyClassIds ? { classIds: { hasSome: onlyClassIds } } : {}),
    ...(f.from ? { endDate: { gte: f.from } } : {}),
    ...(f.to ? { startDate: { lte: f.to } } : {}),
  };
  const exams = await tx.exam.findMany({ where, orderBy: [{ startDate: "desc" }, { title: "asc" }], include: { entries: { where: { archivedAt: null }, select: { subjectId: true, classId: true } } } });
  const classIds = [...new Set(exams.flatMap((e) => e.classIds))];
  const [classes, counts, types] = await Promise.all([
    tx.schoolClass.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true, sortOrder: true } }),
    tx.enrolment.groupBy({ by: ["classId"], where: { academicYearId: yearId, classId: { in: classIds }, archivedAt: null, status: "STUDYING" }, _count: true }),
    tx.examType.findMany({ select: { id: true, name: true } }),
  ]);
  return exams.map((e) => {
    const cls = classes.filter((c) => e.classIds.includes(c.id)).sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      id: e.id, title: e.title, status: e.status, startDate: e.startDate, endDate: e.endDate, archivedAt: e.archivedAt, pattern: e.pattern,
      typeName: types.find((t) => t.id === e.examTypeId)?.name ?? "",
      classNames: cls.map((c) => c.name),
      students: counts.filter((c) => e.classIds.includes(c.classId)).reduce((s, c) => s + c._count, 0),
      subjects: new Set(e.entries.map((x) => x.subjectId)).size,
      papers: e.entries.length,
    };
  });
}

/** The schedule form's starting rows for some classes: every subject, with the subject teacher as invigilator and the class name as room. */
export async function scheduleDefaults(tx: Tx, yearId: string, classIds: string[], date: Date) {
  const out: { classId: string; className: string; subjects: { id: string; name: string; gradeOnly: boolean; teacherId: string | null }[] }[] = [];
  const classes = await tx.schoolClass.findMany({ where: { id: { in: classIds } }, orderBy: { sortOrder: "asc" } });
  for (const c of classes) {
    const subjects = await subjectsForClass(tx, c.id, date);
    const allocs = await tx.teacherAllocation.findMany({ where: { academicYearId: yearId, archivedAt: null, section: { classId: c.id, archivedAt: null } }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }] });
    out.push({
      classId: c.id, className: c.name,
      subjects: subjects.map((s) => ({ id: s.id, name: s.name, gradeOnly: s.gradeOnly, teacherId: allocs.find((a) => a.subjectId === s.id)?.staffId ?? null })),
    });
  }
  return out;
}

export function sameDay(a: Date, b: Date) {
  return isoDay(a) === isoDay(b);
}

export type { Named };
