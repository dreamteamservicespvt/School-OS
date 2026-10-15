// Academic years: create, start a new year by copying the structure, make a
// year active, close it, and remove one created by mistake (04 §5, §6).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { AcademicRuleError, addDays, plural, wordList } from "./common";

export type NewYearInput = {
  campusId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  /** Copy classes' sections, subjects' allocations and terms from this year. */
  copyFromYearId?: string | null;
  /** Terms to add when nothing is copied: "yearly", "two-terms", "three-terms", "semesters" or "none". */
  termPreset?: string | null;
};

export const TERM_PRESETS = [
  { value: "two-terms", label: "Two terms (Term 1, Term 2)" },
  { value: "three-terms", label: "Three terms" },
  { value: "semesters", label: "Two semesters" },
  { value: "yearly", label: "One yearly term" },
  { value: "none", label: "None now, add later" },
] as const;

/** A sensible year name from its dates: 2026-27. */
export function yearNameFor(start: Date, end: Date) {
  const a = start.getUTCFullYear();
  const b = end.getUTCFullYear();
  return a === b ? String(a) : `${a}-${String(b).slice(-2)}`;
}

export function presetTerms(preset: string | null | undefined, start: Date, end: Date) {
  const total = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const split = (parts: number, prefix: string) =>
    Array.from({ length: parts }, (_, i) => {
      const from = addDays(start, Math.round((total * i) / parts));
      const to = i === parts - 1 ? end : addDays(start, Math.round((total * (i + 1)) / parts) - 1);
      return { name: `${prefix} ${i + 1}`, startDate: from, endDate: to };
    });
  switch (preset) {
    case "three-terms": return split(3, "Term");
    case "semesters": return split(2, "Semester");
    case "yearly": return [{ name: "Annual", startDate: start, endDate: end }];
    case "none": return [];
    default: return split(2, "Term");
  }
}

async function checkYearDates(tx: Tx, campusId: string, start: Date, end: Date, exceptId?: string) {
  if (end <= start) throw new AcademicRuleError("The end date must be after the start date.", "endDate");
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  if (days > 400) throw new AcademicRuleError("An academic year can be at most about 13 months long. Check the end date.", "endDate");
  const overlap = await tx.academicYear.findFirst({
    where: { campusId, archivedAt: null, id: exceptId ? { not: exceptId } : undefined, startDate: { lte: end }, endDate: { gte: start } },
    orderBy: { startDate: "asc" },
  });
  if (overlap) {
    throw new AcademicRuleError(`These dates overlap ${overlap.name} (${formatDate(overlap.startDate)} to ${formatDate(overlap.endDate)}). Change the dates.`, "startDate");
  }
}

/** Creates a year (Upcoming). With copyFromYearId, copies the structure without touching the old year (04 §5). */
export async function createYear(tx: Tx, ctx: SchoolContext, input: NewYearInput) {
  const name = input.name.trim();
  if (!name) throw new AcademicRuleError("Year name is needed.", "name");
  const same = await tx.academicYear.findFirst({ where: { campusId: input.campusId, name, archivedAt: null } });
  if (same) throw new AcademicRuleError(`${name} already exists. Choose another name or open the existing year.`, "name");
  await checkYearDates(tx, input.campusId, input.startDate, input.endDate);

  // A name used by a removed (archived) year is freed by renaming the old record.
  const removed = await tx.academicYear.findFirst({ where: { campusId: input.campusId, name, archivedAt: { not: null } } });
  if (removed) await tx.academicYear.update({ where: { id: removed.id }, data: { name: `${name} (removed ${removed.id.slice(0, 4)})` } });

  const year = await tx.academicYear.create({
    data: { schoolId: ctx.schoolId, campusId: input.campusId, name, startDate: input.startDate, endDate: input.endDate, status: "UPCOMING", createdById: ctx.userId },
  });

  const copied = { classes: 0, sections: 0, allocations: 0, terms: 0 };
  if (input.copyFromYearId) {
    const from = await tx.academicYear.findFirst({ where: { id: input.copyFromYearId, campusId: input.campusId, archivedAt: null } });
    if (!from) throw new AcademicRuleError("The year to copy from was not found.", "copyFromYearId");
    const shift = input.startDate.getTime() - from.startDate.getTime();
    const terms = await tx.term.findMany({ where: { academicYearId: from.id, archivedAt: null }, orderBy: { sortOrder: "asc" } });
    for (const t of terms) {
      const s = new Date(t.startDate.getTime() + shift);
      const e = new Date(Math.min(t.endDate.getTime() + shift, input.endDate.getTime()));
      if (s > input.endDate) continue;
      await tx.term.create({ data: { schoolId: ctx.schoolId, academicYearId: year.id, name: t.name, startDate: s, endDate: e, sortOrder: t.sortOrder } });
      copied.terms++;
    }
    const sections = await tx.section.findMany({ where: { academicYearId: from.id, archivedAt: null, schoolClass: { archivedAt: null } } });
    const map = new Map<string, string>();
    for (const s of sections) {
      const row = await tx.section.create({
        data: { schoolId: ctx.schoolId, classId: s.classId, academicYearId: year.id, name: s.name, seats: s.seats, classTeacherId: s.classTeacherId, room: s.room, streamId: s.streamId, createdById: ctx.userId },
      });
      map.set(s.id, row.id);
    }
    copied.sections = sections.length;
    copied.classes = new Set(sections.map((s) => s.classId)).size;
    // Assignments carry over until changed (inferred: "permanent", as in the old software).
    const allocations = await tx.teacherAllocation.findMany({
      where: { academicYearId: from.id, archivedAt: null, OR: [{ toDate: null }, { toDate: { gte: from.endDate } }] },
    });
    for (const a of allocations) {
      const sectionId = map.get(a.sectionId);
      if (!sectionId) continue;
      await tx.teacherAllocation.create({
        data: { schoolId: ctx.schoolId, academicYearId: year.id, staffId: a.staffId, sectionId, subjectId: a.subjectId, isMain: a.isMain, periodsPerWeek: a.periodsPerWeek, fromDate: input.startDate, createdById: ctx.userId },
      });
      copied.allocations++;
    }
  } else {
    for (const [i, t] of presetTerms(input.termPreset, input.startDate, input.endDate).entries()) {
      await tx.term.create({ data: { schoolId: ctx.schoolId, academicYearId: year.id, name: t.name, startDate: t.startDate, endDate: t.endDate, sortOrder: i + 1 } });
      copied.terms++;
    }
  }

  await writeAudit(tx, ctx, { action: "created", recordType: "Academic Year", recordId: year.id, after: { name, startDate: input.startDate.toISOString().slice(0, 10), endDate: input.endDate.toISOString().slice(0, 10), copiedFrom: input.copyFromYearId ?? null, ...copied } });
  const message = input.copyFromYearId
    ? `Copied ${plural(copied.classes, "class", "classes")}, ${plural(copied.sections, "section")}, ${plural(copied.allocations, "allocation")} into ${name}.`
    : `${name} created with ${plural(copied.terms, "term")}.`;
  return { year, copied, message };
}

/** Changes a year's name or dates. Closed years cannot be changed here. */
export async function updateYear(tx: Tx, ctx: SchoolContext, yearId: string, input: { name: string; startDate: Date; endDate: Date }) {
  const year = await tx.academicYear.findFirst({ where: { id: yearId, archivedAt: null } });
  if (!year) throw new AcademicRuleError("This academic year was not found.");
  if (year.status === "CLOSED") throw new AcademicRuleError(`${year.name} is closed. Its dates cannot change.`);
  const name = input.name.trim();
  const same = await tx.academicYear.findFirst({ where: { campusId: year.campusId, name, archivedAt: null, id: { not: yearId } } });
  if (same) throw new AcademicRuleError(`${name} already exists.`, "name");
  await checkYearDates(tx, year.campusId, input.startDate, input.endDate, yearId);
  const outside = await tx.term.findFirst({ where: { academicYearId: yearId, archivedAt: null, OR: [{ startDate: { lt: input.startDate } }, { endDate: { gt: input.endDate } }] } });
  if (outside) throw new AcademicRuleError(`${outside.name} falls outside these dates. Change the term first.`, "startDate");
  const updated = await tx.academicYear.update({ where: { id: yearId }, data: { name, startDate: input.startDate, endDate: input.endDate, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Academic Year", recordId: yearId, before: { name: year.name, startDate: year.startDate.toISOString(), endDate: year.endDate.toISOString() }, after: { name, startDate: input.startDate.toISOString(), endDate: input.endDate.toISOString() } });
  return updated;
}

/** What opening a year will do, in words, for the confirmation (04 §5 "One active year per campus"). */
export async function openYearPreview(tx: Tx, yearId: string) {
  const year = await tx.academicYear.findFirst({ where: { id: yearId, archivedAt: null } });
  if (!year) throw new AcademicRuleError("This academic year was not found.");
  const active = await tx.academicYear.findFirst({ where: { campusId: year.campusId, status: "ACTIVE", archivedAt: null, id: { not: yearId } } });
  return {
    year,
    active,
    message: active
      ? `${active.name} is active. Opening ${year.name} makes it the active year from ${formatDate(year.startDate)}.`
      : `Opening ${year.name} makes it the active year from ${formatDate(year.startDate)}.`,
  };
}

/** Makes a year the one active year of its campus. The old one is closed or kept open (not active). */
export async function openYear(tx: Tx, ctx: SchoolContext, yearId: string, oldYear: "close" | "keep") {
  const { year, active } = await openYearPreview(tx, yearId);
  if (year.status === "ACTIVE") throw new AcademicRuleError(`${year.name} is already the active year.`);
  if (year.status === "CLOSED") throw new AcademicRuleError(`${year.name} is closed. A closed year cannot be opened again.`);
  if (active) {
    await tx.academicYear.update({
      where: { id: active.id },
      data: oldYear === "close" ? { status: "CLOSED", closedAt: new Date(), updatedById: ctx.userId } : { status: "OPEN", updatedById: ctx.userId },
    });
    await writeAudit(tx, ctx, { action: oldYear === "close" ? "closed" : "kept-open", recordType: "Academic Year", recordId: active.id, before: { status: "ACTIVE" }, after: { status: oldYear === "close" ? "CLOSED" : "OPEN" } });
  }
  await tx.academicYear.update({ where: { id: year.id }, data: { status: "ACTIVE", updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "opened", recordType: "Academic Year", recordId: year.id, before: { status: year.status }, after: { status: "ACTIVE" } });
  return { year, previous: active };
}

/** Things to know before closing a year. */
export async function closeChecks(tx: Tx, yearId: string) {
  const year = await tx.academicYear.findFirst({ where: { id: yearId, archivedAt: null } });
  if (!year) throw new AcademicRuleError("This academic year was not found.");
  const [studying, drafts, otherOpen] = await Promise.all([
    tx.enrolment.count({ where: { academicYearId: yearId, archivedAt: null, status: "STUDYING" } }),
    tx.timetableVersion.count({ where: { academicYearId: yearId, archivedAt: null, status: "DRAFT" } }),
    tx.academicYear.findFirst({ where: { campusId: year.campusId, archivedAt: null, id: { not: yearId }, status: { in: ["UPCOMING", "OPEN"] } }, orderBy: { startDate: "asc" } }),
  ]);
  const notes: string[] = [];
  if (studying > 0) notes.push(`${plural(studying, "student")} in ${year.name} are still marked Studying (not promoted, held back or left). They stay as they are.`);
  if (drafts > 0) notes.push(`${plural(drafts, "draft Time Table")} will stay unpublished.`);
  if (year.status === "ACTIVE") notes.push(otherOpen ? `No year will be active. Open ${otherOpen.name} next.` : "No year will be active until you create and open the next one.");
  return { year, notes };
}

/** Closes a year. It becomes read-only, except authorised corrections (04 §6). */
export async function closeYear(tx: Tx, ctx: SchoolContext, yearId: string) {
  const year = await tx.academicYear.findFirst({ where: { id: yearId, archivedAt: null } });
  if (!year) throw new AcademicRuleError("This academic year was not found.");
  if (year.status === "CLOSED") throw new AcademicRuleError(`${year.name} is already closed.`);
  await tx.academicYear.update({ where: { id: yearId }, data: { status: "CLOSED", closedAt: new Date(), updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "closed", recordType: "Academic Year", recordId: yearId, before: { status: year.status }, after: { status: "CLOSED" } });
  return year;
}

/** Records that make up a year's structure. They are removed with a wrongly created year. */
const STRUCTURE_TABLES = new Set([
  "academic_year", "section", "term", "teacher_allocation", "timetable_version", "calendar_entry",
  "syllabus_item", "elective_option", "leave_balance",
]);

const TABLE_WORDS: Record<string, string> = {
  attendance_mark: "Attendance",
  student_attendance: "Attendance",
  staff_attendance: "Staff attendance",
  student_fee_due: "Fees",
  fee_structure: "Fee structures",
  payment: "Fee payments",
  receipt: "Receipts",
  marks: "Marks",
  mark: "Marks",
  exam: "Exams",
  enrolment: "Students placed in classes",
  leave_request: "Leave",
  lesson_plan: "Lesson plans",
  syllabus_progress_entry: "Syllabus progress",
  elective_choice: "Elective choices",
  homework: "Homework",
  report_card: "Report cards",
};

function words(table: string) {
  return TABLE_WORDS[table] ?? table.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * What has been recorded in a year: any record of another kind pointing at
 * it (attendance, fees, marks, students...). Read through the school walls.
 */
export async function yearUsage(tx: Tx, yearId: string): Promise<{ what: string; count: number }[]> {
  const tables = await tx.$queryRaw<{ table_name: string; has_archived: boolean }[]>`
    SELECT c.table_name,
           EXISTS (SELECT 1 FROM information_schema.columns a WHERE a.table_schema = 'public' AND a.table_name = c.table_name AND a.column_name = 'archived_at') AS has_archived
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.column_name = 'academic_year_id'`;
  const out = new Map<string, number>();
  for (const t of tables) {
    if (STRUCTURE_TABLES.has(t.table_name) || !/^[a-z_][a-z0-9_]*$/.test(t.table_name)) continue;
    const rows = await tx.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "${t.table_name}" WHERE academic_year_id = $1::uuid${t.has_archived ? " AND archived_at IS NULL" : ""}`,
      yearId,
    );
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) out.set(words(t.table_name), (out.get(words(t.table_name)) ?? 0) + n);
  }
  return [...out.entries()].map(([what, count]) => ({ what, count })).sort((a, b) => b.count - a.count);
}

/** Whether "Remove year" may be offered, with the words to show (decided 9 October 2026). */
export async function removeCheck(tx: Tx, yearId: string) {
  const year = await tx.academicYear.findFirst({ where: { id: yearId, archivedAt: null } });
  if (!year) throw new AcademicRuleError("This academic year was not found.");
  if (year.status === "CLOSED") return { year, canRemove: false, message: `${year.name} is closed. A closed year is kept as it is.` };
  if (year.status === "ACTIVE") return { year, canRemove: false, message: `${year.name} is the active year. Open another year first if this one was made by mistake.` };
  const usage = await yearUsage(tx, yearId);
  if (usage.length > 0) {
    const list = wordList(usage.map((u) => u.what));
    return { year, canRemove: false, usage, message: `${list} ${usage.length === 1 && !list.endsWith("s") ? "is" : "are"} already recorded in ${year.name}, so it cannot be removed. You can close it.` };
  }
  return { year, canRemove: true, usage, message: `Remove ${year.name}? Nothing has been recorded in it yet. Its classes, sections and terms will be removed too.` };
}

/** Removes (archives) a year made by mistake, with its sections, terms and allocations. */
export async function removeYear(tx: Tx, ctx: SchoolContext, yearId: string) {
  const check = await removeCheck(tx, yearId);
  if (!check.canRemove) throw new AcademicRuleError(check.message);
  const now = new Date();
  const where = { academicYearId: yearId, archivedAt: null };
  const versions = await tx.timetableVersion.findMany({ where, select: { id: true } });
  const counts = {
    sections: (await tx.section.updateMany({ where, data: { archivedAt: now } })).count,
    terms: (await tx.term.updateMany({ where, data: { archivedAt: now } })).count,
    allocations: (await tx.teacherAllocation.updateMany({ where, data: { archivedAt: now } })).count,
    timetables: (await tx.timetableVersion.updateMany({ where, data: { archivedAt: now } })).count,
  };
  await tx.timetablePeriod.updateMany({ where: { versionId: { in: versions.map((v) => v.id) }, archivedAt: null }, data: { archivedAt: now } });
  await tx.calendarEntry.updateMany({ where, data: { archivedAt: now } });
  await tx.syllabusItem.updateMany({ where, data: { archivedAt: now } });
  await tx.electiveOption.updateMany({ where, data: { archivedAt: now } });
  await tx.leaveBalance.updateMany({ where, data: { archivedAt: now } });
  await tx.academicYear.update({ where: { id: yearId }, data: { archivedAt: now, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "removed", recordType: "Academic Year", recordId: yearId, before: { name: check.year.name, status: check.year.status }, after: counts });
  return { year: check.year, counts };
}

/** Terms sit inside the year with no overlap; gaps are allowed with a warning (04 §5, inferred). */
export async function checkTerm(tx: Tx, input: { academicYearId: string; name: string; startDate: Date; endDate: Date; exceptId?: string }) {
  const year = await tx.academicYear.findFirst({ where: { id: input.academicYearId, archivedAt: null } });
  if (!year) throw new AcademicRuleError("This academic year was not found.");
  if (input.endDate < input.startDate) throw new AcademicRuleError("The term must end on or after its start date.", "endDate");
  if (input.startDate < year.startDate || input.endDate > year.endDate) {
    throw new AcademicRuleError(`Term dates must sit inside ${year.name} (${formatDate(year.startDate)} to ${formatDate(year.endDate)}).`, input.startDate < year.startDate ? "startDate" : "endDate");
  }
  const others = await tx.term.findMany({ where: { academicYearId: year.id, archivedAt: null, id: input.exceptId ? { not: input.exceptId } : undefined }, orderBy: { startDate: "asc" } });
  for (const o of others) {
    if (input.startDate <= o.endDate && input.endDate >= o.startDate) {
      throw new AcademicRuleError(
        input.startDate >= o.startDate ? `${input.name} starts before ${o.name} ends (${formatDate(o.endDate)}).` : `${input.name} ends after ${o.name} starts (${formatDate(o.startDate)}).`,
        input.startDate >= o.startDate ? "startDate" : "endDate",
      );
    }
  }
  const all = [...others, { name: input.name, startDate: input.startDate, endDate: input.endDate }].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const gaps: string[] = [];
  for (let i = 1; i < all.length; i++) {
    const gapStart = addDays(all[i - 1].endDate, 1);
    if (gapStart < all[i].startDate) gaps.push(`${formatDate(gapStart)} to ${formatDate(addDays(all[i].startDate, -1))} is in no term.`);
  }
  return { year, warning: gaps.length ? gaps.join(" ") : null };
}
