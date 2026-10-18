// Teacher Allocation (04 §2): who teaches which subject in which section,
// primary and secondary teachers, changes from a date with history kept,
// and each teacher's workload against the limit.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { inCampus, type CampusLimit } from "../campus";
import { AcademicRuleError, addDays, plural } from "./common";
import { academicSettings } from "./settings";
import { mapActiveOn } from "./subjects";

export function allocationActiveOn(date: Date): Prisma.TeacherAllocationWhereInput {
  return { archivedAt: null, OR: [{ fromDate: null }, { fromDate: { lte: date } }], AND: [{ OR: [{ toDate: null }, { toDate: { gte: date } }] }] };
}

/** Periods per week each staff member is given, from allocations on a date. */
export async function workloadFor(tx: Tx, ctx: SchoolContext, yearId: string, date: Date, staffIds?: string[]) {
  const allocations = await tx.teacherAllocation.findMany({
    where: { academicYearId: yearId, ...allocationActiveOn(date), section: { archivedAt: null }, ...(staffIds ? { staffId: { in: staffIds } } : {}) },
    include: { section: { select: { classId: true } } },
  });
  const maps = await tx.subjectClass.findMany({ where: { classId: { in: [...new Set(allocations.map((a) => a.section.classId))] }, ...mapActiveOn(date) } });
  const ppw = new Map(maps.map((m) => [`${m.classId}:${m.subjectId}`, m.periodsPerWeek]));
  const load = new Map<string, number>();
  for (const a of allocations) {
    if (!a.isMain && a.periodsPerWeek === null) continue; // A secondary teacher adds load only when periods are given.
    const n = a.periodsPerWeek ?? ppw.get(`${a.section.classId}:${a.subjectId}`) ?? 0;
    load.set(a.staffId, (load.get(a.staffId) ?? 0) + n);
  }
  return load;
}

export async function limitsFor(tx: Tx, ctx: SchoolContext, campusId: string, staffIds: string[]) {
  const [settings, prefs] = await Promise.all([
    academicSettings(tx, ctx, campusId),
    tx.teacherPreference.findMany({ where: { schoolId: ctx.schoolId, staffId: { in: staffIds } } }),
  ]);
  const byStaff = new Map(prefs.map((p) => [p.staffId, p]));
  return (staffId: string) => ({
    perWeek: byStaff.get(staffId)?.maxPerWeek ?? settings.maxPeriodsPerWeek,
    perDay: byStaff.get(staffId)?.maxPerDay ?? settings.maxPeriodsPerDay,
    consecutive: settings.maxConsecutive,
  });
}

export type AssignInput = {
  yearId: string;
  campusId: string;
  sectionIds: string[];
  subjectId: string;
  staffId: string;
  role: "primary" | "secondary";
  periodsPerWeek: number | null;
  fromDate: Date;
  /** Given when the person saves over the workload limit on purpose. */
  overLimitReason?: string | null;
};

export class OverLimitError extends AcademicRuleError {
  constructor(message: string) {
    super(message, "overLimitReason");
    this.name = "OverLimitError";
  }
}

/**
 * Assigns a teacher. A new primary teacher for a subject in a section takes
 * over from the old one on the from date; the old assignment ends the day
 * before, so history is kept.
 */
export async function assignTeacher(tx: Tx, ctx: SchoolContext, input: AssignInput) {
  const staff = await tx.staff.findFirst({ where: { id: input.staffId, archivedAt: null } });
  if (!staff) throw new AcademicRuleError("Choose a teacher.", "staffId");
  if (!["ACTIVE", "ON_LEAVE"].includes(staff.status)) throw new AcademicRuleError(`${staff.fullName} is no longer working here.`, "staffId");
  const subject = await tx.subject.findFirst({ where: { id: input.subjectId, archivedAt: null } });
  if (!subject) throw new AcademicRuleError("Choose a subject.", "subjectId");
  if (input.sectionIds.length === 0) throw new AcademicRuleError("Choose a class and section.", "sectionId");
  if (input.periodsPerWeek !== null && (input.periodsPerWeek < 0 || input.periodsPerWeek > 40)) throw new AcademicRuleError("Periods per week must be between 0 and 40.", "periodsPerWeek");
  const sections = await tx.section.findMany({ where: { id: { in: input.sectionIds }, academicYearId: input.yearId, archivedAt: null }, include: { schoolClass: true } });
  if (sections.length !== input.sectionIds.length) throw new AcademicRuleError("A chosen section was not found in this year.", "sectionId");

  for (const s of sections) {
    const mapped = await tx.subjectClass.findFirst({ where: { subjectId: subject.id, classId: s.classId, ...mapActiveOn(input.fromDate) } });
    if (!mapped) throw new AcademicRuleError(`${subject.name} is not taught in ${s.schoolClass.name}. Map it to the class in Subjects first.`, "subjectId");
  }

  // Workload check against the limit (04 §5): warn, or save with a reason.
  const load = (await workloadFor(tx, ctx, input.yearId, input.fromDate, [staff.id])).get(staff.id) ?? 0;
  let adding = 0;
  if (input.role === "primary" || input.periodsPerWeek !== null) {
    for (const s of sections) {
      const already = await tx.teacherAllocation.findFirst({ where: { sectionId: s.id, subjectId: subject.id, staffId: staff.id, ...allocationActiveOn(input.fromDate) } });
      if (already) continue;
      const map = await tx.subjectClass.findFirst({ where: { subjectId: subject.id, classId: s.classId, ...mapActiveOn(input.fromDate) } });
      adding += input.periodsPerWeek ?? map?.periodsPerWeek ?? 0;
    }
  }
  const limit = (await limitsFor(tx, ctx, input.campusId, [staff.id]))(staff.id).perWeek;
  if (load + adding > limit && !input.overLimitReason?.trim()) {
    throw new OverLimitError(`${staff.fullName}: ${load + adding} periods, limit ${limit}. Assign someone else, or give a reason to save anyway.`);
  }

  const created: string[] = [];
  const handedOver: string[] = [];
  for (const s of sections) {
    const label = `${s.schoolClass.name} ${s.name}`;
    const same = await tx.teacherAllocation.findFirst({ where: { sectionId: s.id, subjectId: subject.id, staffId: staff.id, archivedAt: null, OR: [{ toDate: null }, { toDate: { gte: input.fromDate } }] } });
    if (same) {
      if (same.isMain !== (input.role === "primary") || same.periodsPerWeek !== input.periodsPerWeek) {
        await tx.teacherAllocation.update({ where: { id: same.id }, data: { isMain: input.role === "primary", periodsPerWeek: input.periodsPerWeek } });
      }
      continue;
    }
    if (input.role === "primary") {
      const previous = await tx.teacherAllocation.findMany({ where: { sectionId: s.id, subjectId: subject.id, isMain: true, archivedAt: null, OR: [{ toDate: null }, { toDate: { gte: input.fromDate } }] } });
      for (const p of previous) {
        if (p.fromDate && p.fromDate >= input.fromDate) await tx.teacherAllocation.update({ where: { id: p.id }, data: { archivedAt: new Date() } });
        else await tx.teacherAllocation.update({ where: { id: p.id }, data: { toDate: addDays(input.fromDate, -1) } });
        handedOver.push(label);
      }
    }
    const row = await tx.teacherAllocation.create({
      data: { schoolId: ctx.schoolId, academicYearId: input.yearId, staffId: staff.id, sectionId: s.id, subjectId: subject.id, isMain: input.role === "primary", periodsPerWeek: input.periodsPerWeek, fromDate: input.fromDate, createdById: ctx.userId },
    });
    created.push(row.id);
  }
  await writeAudit(tx, ctx, {
    action: handedOver.length ? "handed-over" : "assigned",
    recordType: "Teacher Allocation",
    recordId: created[0] ?? null,
    after: { teacher: staff.fullName, subject: subject.name, sections: sections.map((s) => `${s.schoolClass.name} ${s.name}`), role: input.role, from: input.fromDate.toISOString().slice(0, 10), load: load + adding, limit },
    actorNote: load + adding > limit ? `Saved over the workload limit: ${input.overLimitReason}` : null,
  });
  const where = sections.length === 1 ? `${sections[0].schoolClass.name} ${sections[0].name}` : plural(sections.length, "section");
  return {
    ids: created,
    message: `${staff.fullName} teaches ${subject.name} in ${where} from ${formatDate(input.fromDate)}.${handedOver.length ? " The previous teacher's assignment ends the day before." : ""}`,
    load: load + adding,
    limit,
  };
}

/** Ends an assignment from a date (history kept), or archives it if it never started. */
export async function endAllocation(tx: Tx, ctx: SchoolContext, id: string, from: Date) {
  const a = await tx.teacherAllocation.findFirst({ where: { id, archivedAt: null }, include: { section: { include: { schoolClass: true } }, subject: true } });
  if (!a) throw new AcademicRuleError("This assignment was not found.");
  if (a.fromDate && from <= a.fromDate) await tx.teacherAllocation.update({ where: { id }, data: { archivedAt: new Date() } });
  else await tx.teacherAllocation.update({ where: { id }, data: { toDate: addDays(from, -1) } });
  await writeAudit(tx, ctx, { action: "ended", recordType: "Teacher Allocation", recordId: id, before: { toDate: a.toDate?.toISOString() ?? null }, after: { endsFrom: from.toISOString().slice(0, 10) } });
  return `${a.subject.name} in ${a.section.schoolClass.name} ${a.section.name}`;
}

/** Undo for a just-made assignment: archive it and give back the handed-over one. */
export async function undoAssignment(tx: Tx, ctx: SchoolContext, id: string) {
  const a = await tx.teacherAllocation.findFirst({ where: { id, archivedAt: null } });
  if (!a) throw new AcademicRuleError("This assignment was already changed.");
  await tx.teacherAllocation.update({ where: { id }, data: { archivedAt: new Date() } });
  if (a.isMain && a.fromDate) {
    const prev = await tx.teacherAllocation.findFirst({ where: { sectionId: a.sectionId, subjectId: a.subjectId, isMain: true, archivedAt: null, toDate: addDays(a.fromDate, -1) } });
    if (prev) await tx.teacherAllocation.update({ where: { id: prev.id }, data: { toDate: null } });
  }
  await writeAudit(tx, ctx, { action: "undone", recordType: "Teacher Allocation", recordId: id });
}

export type GridCell = { allocationId: string; staffId: string; staffName: string; isMain: boolean; fromDate: Date | null; toDate: Date | null; upcoming: boolean };

/** The allocation grid: each section against the subjects of its class, with gaps. */
export async function allocationGrid(tx: Tx, ctx: SchoolContext, yearId: string, campusId: string, date: Date, sectionIds?: string[] | null) {
  const sections = await tx.section.findMany({
    where: { academicYearId: yearId, archivedAt: null, schoolClass: { campusId, archivedAt: null }, ...(sectionIds ? { id: { in: sectionIds } } : {}) },
    include: { schoolClass: true },
    orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
  });
  const classIds = [...new Set(sections.map((s) => s.classId))];
  const [maps, allocations] = await Promise.all([
    tx.subjectClass.findMany({ where: { classId: { in: classIds }, ...mapActiveOn(date), subject: { archivedAt: null } }, include: { subject: true } }),
    tx.teacherAllocation.findMany({ where: { sectionId: { in: sections.map((s) => s.id) }, archivedAt: null, OR: [{ toDate: null }, { toDate: { gte: date } }] } }),
  ]);
  const staff = await tx.staff.findMany({ where: { id: { in: [...new Set(allocations.map((a) => a.staffId))] } }, select: { id: true, fullName: true } });
  const nameOf = new Map(staff.map((s) => [s.id, s.fullName]));
  const subjects = [...new Map(maps.map((m) => [m.subject.id, m.subject])).values()].sort((a, b) => a.name.localeCompare(b.name));
  let gaps = 0;
  const rows = sections.map((s) => {
    const cells: Record<string, GridCell[] | null> = {};
    for (const sub of subjects) {
      const taught = maps.some((m) => m.classId === s.classId && m.subjectId === sub.id);
      if (!taught) { cells[sub.id] = null; continue; }
      const list = allocations
        .filter((a) => a.sectionId === s.id && a.subjectId === sub.id)
        .map((a) => ({ allocationId: a.id, staffId: a.staffId, staffName: nameOf.get(a.staffId) ?? "", isMain: a.isMain, fromDate: a.fromDate, toDate: a.toDate, upcoming: Boolean(a.fromDate && a.fromDate > date) }))
        .sort((a, b) => Number(b.isMain) - Number(a.isMain) || Number(a.upcoming) - Number(b.upcoming));
      if (!list.some((c) => c.isMain && !c.upcoming)) gaps++;
      cells[sub.id] = list;
    }
    return { sectionId: s.id, classId: s.classId, label: `${s.schoolClass.name} ${s.name}`, cells };
  });
  return { subjects: subjects.map((s) => ({ id: s.id, name: s.name, code: s.code })), rows, gaps };
}

/** Each teacher's classes and subjects, periods per week and limit. `limit`: only that campus's teachers (One campus). */
export async function teacherWorkloads(tx: Tx, ctx: SchoolContext, yearId: string, campusId: string, date: Date, onlyStaffId?: string | null, limit?: CampusLimit | null) {
  const teachers = await tx.staff.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, staffType: "Teaching", ...(onlyStaffId ? { id: onlyStaffId } : {}), ...inCampus(limit) },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, designation: true },
  });
  const ids = teachers.map((t) => t.id);
  const [load, limit, allocations] = await Promise.all([
    workloadFor(tx, ctx, yearId, date, ids),
    limitsFor(tx, ctx, campusId, ids),
    tx.teacherAllocation.findMany({ where: { academicYearId: yearId, staffId: { in: ids }, ...allocationActiveOn(date), section: { archivedAt: null } }, include: { section: { include: { schoolClass: true } }, subject: true } }),
  ]);
  return teachers.map((t) => {
    const mine = allocations.filter((a) => a.staffId === t.id).sort((a, b) => a.section.schoolClass.sortOrder - b.section.schoolClass.sortOrder || a.section.name.localeCompare(b.section.name));
    const l = limit(t.id);
    return {
      id: t.id, name: t.fullName, designation: t.designation,
      periods: load.get(t.id) ?? 0, limit: l.perWeek,
      teaches: mine.map((a) => ({ id: a.id, label: `${a.section.schoolClass.name} ${a.section.name}`, subject: a.subject.name, isMain: a.isMain })),
    };
  });
}
