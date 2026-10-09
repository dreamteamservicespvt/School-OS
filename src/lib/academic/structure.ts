// Classes & Sections (04 §2): classes in teaching order, sections with
// seats, class teachers and streams, and the rules in §5.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { AcademicRuleError, guessLevel, nextSectionName, plural } from "./common";

export type ClassRow = {
  id: string; name: string; sortOrder: number; level: string | null; board: string | null;
  sections: SectionRow[];
};
export type SectionRow = {
  id: string; name: string; seats: number; students: number; classTeacherId: string | null; classTeacherName: string | null;
  room: string | null; streamId: string | null; streamName: string | null;
};

/** Classes with their sections for a year, and student counts from Enrolment. Own reach passes the sections allowed. */
export async function classesForYear(tx: Tx, ctx: SchoolContext, campusId: string, yearId: string, onlySectionIds?: string[] | null, archived = false): Promise<ClassRow[]> {
  const classes = await tx.schoolClass.findMany({
    where: { schoolId: ctx.schoolId, campusId, archivedAt: archived ? { not: null } : null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      sections: {
        where: { academicYearId: yearId, archivedAt: archived ? undefined : null, ...(onlySectionIds ? { id: { in: onlySectionIds } } : {}) },
        orderBy: { name: "asc" },
      },
    },
  });
  const sectionIds = classes.flatMap((c) => c.sections.map((s) => s.id));
  const [counts, teachers, streams] = await Promise.all([
    tx.enrolment.groupBy({ by: ["sectionId"], where: { academicYearId: yearId, sectionId: { in: sectionIds }, archivedAt: null, status: { in: ["STUDYING", "PROMOTED", "HELD_BACK"] } }, _count: { _all: true } }),
    tx.staff.findMany({ where: { id: { in: classes.flatMap((c) => c.sections.map((s) => s.classTeacherId).filter((x): x is string => Boolean(x))) } }, select: { id: true, fullName: true } }),
    tx.stream.findMany({ where: { schoolId: ctx.schoolId, campusId } }),
  ]);
  const countOf = new Map(counts.map((c) => [c.sectionId, c._count._all]));
  const teacherOf = new Map(teachers.map((t) => [t.id, t.fullName]));
  const streamOf = new Map(streams.map((s) => [s.id, s.name]));
  return classes
    .filter((c) => !onlySectionIds || c.sections.length > 0)
    .map((c) => ({
      id: c.id, name: c.name, sortOrder: c.sortOrder, level: c.level, board: c.board,
      sections: c.sections.map((s) => ({
        id: s.id, name: s.name, seats: s.seats, students: countOf.get(s.id) ?? 0,
        classTeacherId: s.classTeacherId, classTeacherName: s.classTeacherId ? teacherOf.get(s.classTeacherId) ?? null : null,
        room: s.room, streamId: s.streamId, streamName: s.streamId ? streamOf.get(s.streamId) ?? null : null,
      })),
    }));
}

export type NewClassInput = {
  campusId: string; yearId: string; name: string; sortOrder?: number | null; level?: string | null;
  sectionNames: string[]; seats: number; board?: string | null;
};

/** Adds a class with its sections for the year (or adds the sections to an existing class of that name). */
export async function addClass(tx: Tx, ctx: SchoolContext, input: NewClassInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new AcademicRuleError("Class name is needed.", "name");
  if (name.length > 60) throw new AcademicRuleError("Class name can be at most 60 characters.", "name");
  if (input.sectionNames.length === 0) throw new AcademicRuleError("Give at least one section, like A.", "sections");
  if (input.seats < 1 || input.seats > 500) throw new AcademicRuleError("Seats per section must be between 1 and 500.", "seats");
  let cls = await tx.schoolClass.findFirst({ where: { schoolId: ctx.schoolId, campusId: input.campusId, name: { equals: name, mode: "insensitive" } } });
  if (cls) {
    const inYear = await tx.section.count({ where: { classId: cls.id, academicYearId: input.yearId, archivedAt: null } });
    if (inYear > 0 && !cls.archivedAt) throw new AcademicRuleError(`${cls.name} already exists in this year. Add a section to it instead.`, "name");
    if (cls.archivedAt) cls = await tx.schoolClass.update({ where: { id: cls.id }, data: { archivedAt: null, updatedById: ctx.userId } });
  } else {
    const last = await tx.schoolClass.aggregate({ where: { schoolId: ctx.schoolId, campusId: input.campusId, archivedAt: null }, _max: { sortOrder: true } });
    const order = input.sortOrder ?? (last._max.sortOrder ?? 0) + 1;
    if (input.sortOrder) {
      await tx.schoolClass.updateMany({ where: { schoolId: ctx.schoolId, campusId: input.campusId, sortOrder: { gte: order } }, data: { sortOrder: { increment: 1 } } });
    }
    cls = await tx.schoolClass.create({
      data: { schoolId: ctx.schoolId, campusId: input.campusId, name, sortOrder: order, level: input.level || guessLevel(name), board: input.board || null, createdById: ctx.userId },
    });
  }
  const created: string[] = [];
  for (const s of input.sectionNames) {
    const existing = await tx.section.findFirst({ where: { classId: cls.id, academicYearId: input.yearId, name: s } });
    if (existing && !existing.archivedAt) continue;
    if (existing) await tx.section.update({ where: { id: existing.id }, data: { archivedAt: null, seats: input.seats, updatedById: ctx.userId } });
    else await tx.section.create({ data: { schoolId: ctx.schoolId, classId: cls.id, academicYearId: input.yearId, name: s, seats: input.seats, createdById: ctx.userId } });
    created.push(s);
  }
  await writeAudit(tx, ctx, { action: "created", recordType: "Class", recordId: cls.id, after: { name: cls.name, level: cls.level, sections: created, seats: input.seats } });
  return { cls, sections: created };
}

/** Several classes at once ("Nursery, LKG, UKG, Class 1 to Class 12"), each with the same sections. */
export async function addClasses(tx: Tx, ctx: SchoolContext, input: Omit<NewClassInput, "name" | "sortOrder"> & { names: string[] }) {
  let classes = 0, sections = 0;
  const skipped: string[] = [];
  for (const name of input.names) {
    const exists = await tx.schoolClass.findFirst({ where: { schoolId: ctx.schoolId, campusId: input.campusId, name: { equals: name, mode: "insensitive" }, archivedAt: null, sections: { some: { academicYearId: input.yearId, archivedAt: null } } } });
    if (exists) { skipped.push(name); continue; }
    const r = await addClass(tx, ctx, { ...input, name, level: guessLevel(name) });
    classes++;
    sections += r.sections.length;
  }
  return { classes, sections, skipped };
}

export async function updateClass(tx: Tx, ctx: SchoolContext, classId: string, input: { name: string; level: string | null; board: string | null }) {
  const cls = await tx.schoolClass.findFirst({ where: { id: classId, archivedAt: null } });
  if (!cls) throw new AcademicRuleError("This class was not found.");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new AcademicRuleError("Class name is needed.", "name");
  const same = await tx.schoolClass.findFirst({ where: { schoolId: ctx.schoolId, campusId: cls.campusId, name: { equals: name, mode: "insensitive" }, id: { not: classId } } });
  if (same) throw new AcademicRuleError(`${same.name} already exists. Class names must be different.`, "name");
  const updated = await tx.schoolClass.update({ where: { id: classId }, data: { name, level: input.level || null, board: input.board || null, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Class", recordId: classId, before: { name: cls.name, level: cls.level, board: cls.board }, after: { name, level: input.level, board: input.board } });
  return { cls: updated, boardChanged: (cls.board ?? null) !== (input.board || null) };
}

/** New teaching order after dragging or moving up and down. */
export async function reorderClasses(tx: Tx, ctx: SchoolContext, campusId: string, orderedIds: string[]) {
  const classes = await tx.schoolClass.findMany({ where: { schoolId: ctx.schoolId, campusId, archivedAt: null }, select: { id: true, sortOrder: true, name: true } });
  const known = new Set(classes.map((c) => c.id));
  const ids = orderedIds.filter((id) => known.has(id));
  for (const c of classes) if (!ids.includes(c.id)) ids.push(c.id);
  for (const [i, id] of ids.entries()) await tx.schoolClass.update({ where: { id }, data: { sortOrder: i + 1 } });
  await writeAudit(tx, ctx, { action: "reordered", recordType: "Class", recordId: null, before: classes.sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.name), after: ids.map((id) => classes.find((c) => c.id === id)!.name) });
}

export type SectionInput = { name: string; seats: number; classTeacherId: string | null; streamId: string | null; room: string | null };

/** The warning when seats are set below the students now (04 §5). */
export function seatsWarning(className: string, sectionName: string, students: number, seats: number) {
  return students > seats ? `${className} ${sectionName} has ${students} students. Seats set to ${seats}.` : null;
}

export async function addSection(tx: Tx, ctx: SchoolContext, classId: string, yearId: string, input: Partial<SectionInput>) {
  const cls = await tx.schoolClass.findFirst({ where: { id: classId, archivedAt: null } });
  if (!cls) throw new AcademicRuleError("This class was not found.");
  const siblings = await tx.section.findMany({ where: { classId, academicYearId: yearId } });
  const name = (input.name?.trim() || nextSectionName(siblings.filter((s) => !s.archivedAt).map((s) => s.name))).slice(0, 30);
  const clash = siblings.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (clash && !clash.archivedAt) throw new AcademicRuleError(`${cls.name} ${name} already exists.`, "name");
  const seats = input.seats ?? siblings.find((s) => !s.archivedAt)?.seats ?? 40;
  if (seats < 1 || seats > 500) throw new AcademicRuleError("Seats must be between 1 and 500.", "seats");
  await checkClassTeacher(tx, input.classTeacherId ?? null);
  const data = { seats, classTeacherId: input.classTeacherId ?? null, streamId: input.streamId ?? null, room: input.room?.trim() || null };
  const section = clash
    ? await tx.section.update({ where: { id: clash.id }, data: { ...data, archivedAt: null, updatedById: ctx.userId } })
    : await tx.section.create({ data: { schoolId: ctx.schoolId, classId, academicYearId: yearId, name, ...data, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Section", recordId: section.id, after: { class: cls.name, name, ...data } });
  return { section, label: `${cls.name} ${name}` };
}

async function checkClassTeacher(tx: Tx, staffId: string | null) {
  if (!staffId) return;
  const staff = await tx.staff.findFirst({ where: { id: staffId, archivedAt: null } });
  if (!staff) throw new AcademicRuleError("Choose a class teacher from the staff list.", "classTeacherId");
  if (staff.status !== "ACTIVE" && staff.status !== "ON_LEAVE") throw new AcademicRuleError(`${staff.fullName} is no longer working here. Choose another class teacher.`, "classTeacherId");
}

export async function updateSection(tx: Tx, ctx: SchoolContext, sectionId: string, input: SectionInput) {
  const section = await tx.section.findFirst({ where: { id: sectionId, archivedAt: null }, include: { schoolClass: true } });
  if (!section) throw new AcademicRuleError("This section was not found.");
  const name = input.name.trim();
  if (!name) throw new AcademicRuleError("Section name is needed.", "name");
  const clash = await tx.section.findFirst({ where: { classId: section.classId, academicYearId: section.academicYearId, name: { equals: name, mode: "insensitive" }, id: { not: sectionId }, archivedAt: null } });
  if (clash) throw new AcademicRuleError(`${section.schoolClass.name} ${name} already exists.`, "name");
  if (input.seats < 1 || input.seats > 500) throw new AcademicRuleError("Seats must be between 1 and 500.", "seats");
  await checkClassTeacher(tx, input.classTeacherId);
  const students = await studentsIn(tx, sectionId, section.academicYearId);
  const data = { name, seats: input.seats, classTeacherId: input.classTeacherId, streamId: input.streamId, room: input.room?.trim() || null };
  const updated = await tx.section.update({ where: { id: sectionId }, data: { ...data, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Section", recordId: sectionId, before: { name: section.name, seats: section.seats, classTeacherId: section.classTeacherId, streamId: section.streamId, room: section.room }, after: data });
  return { section: updated, label: `${section.schoolClass.name} ${name}`, warning: seatsWarning(section.schoolClass.name, name, students, input.seats) };
}

export async function studentsIn(tx: Tx, sectionId: string, yearId: string) {
  return tx.enrolment.count({ where: { sectionId, academicYearId: yearId, archivedAt: null, status: { in: ["STUDYING", "PROMOTED", "HELD_BACK"] } } });
}

/** Archiving a section with students is blocked (04 §5). */
export async function archiveSection(tx: Tx, ctx: SchoolContext, sectionId: string) {
  const section = await tx.section.findFirst({ where: { id: sectionId, archivedAt: null }, include: { schoolClass: true } });
  if (!section) throw new AcademicRuleError("This section was not found.");
  const students = await studentsIn(tx, sectionId, section.academicYearId);
  if (students > 0) throw new AcademicRuleError(`Move or promote the ${plural(students, "student")} in ${section.schoolClass.name} ${section.name} first.`);
  const now = new Date();
  await tx.section.update({ where: { id: sectionId }, data: { archivedAt: now, updatedById: ctx.userId } });
  await tx.teacherAllocation.updateMany({ where: { sectionId, archivedAt: null }, data: { archivedAt: now } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Section", recordId: sectionId, before: { label: `${section.schoolClass.name} ${section.name}` } });
  return { label: `${section.schoolClass.name} ${section.name}`, archivedAt: now };
}

/** Archiving a class: only when no section of it has students this year (04 §2). */
export async function archiveClass(tx: Tx, ctx: SchoolContext, classId: string, yearId: string) {
  const cls = await tx.schoolClass.findFirst({ where: { id: classId, archivedAt: null } });
  if (!cls) throw new AcademicRuleError("This class was not found.");
  const students = await tx.enrolment.count({ where: { classId, academicYearId: yearId, archivedAt: null, status: { in: ["STUDYING", "PROMOTED", "HELD_BACK"] } } });
  if (students > 0) throw new AcademicRuleError(`Move or promote the ${plural(students, "student")} in ${cls.name} first.`);
  const now = new Date();
  const sections = await tx.section.findMany({ where: { classId, academicYearId: yearId, archivedAt: null }, select: { id: true } });
  await tx.section.updateMany({ where: { id: { in: sections.map((s) => s.id) } }, data: { archivedAt: now } });
  await tx.teacherAllocation.updateMany({ where: { sectionId: { in: sections.map((s) => s.id) }, archivedAt: null }, data: { archivedAt: now } });
  // The class stays for other years if it has sections there.
  const elsewhere = await tx.section.count({ where: { classId, archivedAt: null } });
  if (elsewhere === 0) await tx.schoolClass.update({ where: { id: classId }, data: { archivedAt: now, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Class", recordId: classId, before: { name: cls.name }, after: { sections: sections.length, classArchived: elsewhere === 0 } });
  return { cls, sectionIds: sections.map((s) => s.id), at: now };
}

/** Teachers with their current class-teacher duties, for the staff picker. */
export async function teacherChoices(tx: Tx, ctx: SchoolContext, yearId: string) {
  const [staff, duties] = await Promise.all([
    tx.staff.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, staffType: "Teaching" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true } }),
    tx.section.findMany({ where: { academicYearId: yearId, archivedAt: null, classTeacherId: { not: null } }, select: { classTeacherId: true, name: true, schoolClass: { select: { name: true } } } }),
  ]);
  return staff.map((s) => {
    const mine = duties.filter((d) => d.classTeacherId === s.id).map((d) => `${d.schoolClass.name} ${d.name}`);
    return { id: s.id, name: s.fullName, designation: s.designation, duties: mine };
  });
}

export async function addStream(tx: Tx, ctx: SchoolContext, campusId: string, name: string) {
  const clean = name.trim();
  if (!clean) throw new AcademicRuleError("Stream name is needed.", "name");
  const existing = await tx.stream.findFirst({ where: { schoolId: ctx.schoolId, campusId, name: { equals: clean, mode: "insensitive" } } });
  if (existing && !existing.archivedAt) throw new AcademicRuleError(`${existing.name} already exists.`, "name");
  const row = existing
    ? await tx.stream.update({ where: { id: existing.id }, data: { archivedAt: null } })
    : await tx.stream.create({ data: { schoolId: ctx.schoolId, campusId, name: clean, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Stream", recordId: row.id, after: { name: clean } });
  return row;
}

export async function archiveStream(tx: Tx, ctx: SchoolContext, id: string) {
  const s = await tx.stream.findFirst({ where: { id, archivedAt: null } });
  if (!s) throw new AcademicRuleError("This stream was not found.");
  const used = await tx.section.count({ where: { streamId: id, archivedAt: null } });
  if (used) throw new AcademicRuleError(`${plural(used, "section")} use ${s.name}. Change their stream first.`);
  await tx.stream.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Stream", recordId: id, before: { name: s.name } });
  return s;
}
