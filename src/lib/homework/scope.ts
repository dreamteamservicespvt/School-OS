// What "own" means in Homework & Learning, read at the query (05-roles.md):
// a teacher works with the sections and subjects of their Teacher Allocations
// this year; a class teacher also reads every subject of their own section; a
// student sees only homework given to them, their own section's courses,
// quizzes, boards and classes.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { currentYear } from "../academic/years";
import { allocationActiveOn } from "../academic/allocation";
import { staffForUser } from "../people";
import type { PermissionMap } from "../permissions";
import { homeworkLevel, HomeworkProblem, type HomeworkLevel } from "./access";

export type Pair = { sectionId: string; subjectId: string };

export type HomeworkScope = {
  level: HomeworkLevel;
  ctx: SchoolContext;
  yearId: string | null;
  yearClosed: boolean;
  staffId: string | null;
  /** The person's name, for posts and comments. */
  name: string;
  /** Own staff: the sections and subjects they teach (Teacher Allocation). Full: empty (everything). */
  pairs: Pair[];
  /** Own staff: sections they are class teacher of (read every subject). */
  ctSections: string[];
  /** Sections this person may see; null for every section. */
  sectionIds: string[] | null;
  /** The signed-in student, with their section this year. */
  student: { id: string; name: string; sectionId: string; classId: string; label: string; rollNo: number | null } | null;
};

type Who = { ctx: SchoolContext; permissions: PermissionMap; roles: readonly { key: string | null }[]; user: { displayName: string } };

export async function homeworkScope(tx: Tx, who: Who, today: Date): Promise<HomeworkScope> {
  const level = homeworkLevel(who.permissions, who.roles);
  if (!level) throw new HomeworkProblem("Your role does not include Homework & Learning.");
  const year = await currentYear(tx, who.ctx);
  const yearId = year?.id ?? null;
  const base = { level, ctx: who.ctx, yearId, yearClosed: year?.status === "CLOSED", name: who.user.displayName, pairs: [] as Pair[], ctSections: [] as string[], student: null as HomeworkScope["student"] };
  if (level === "student") {
    const st = await tx.student.findFirst({ where: { userLoginId: who.ctx.userId ?? "", archivedAt: null }, select: { id: true, fullName: true } });
    const enr = st && yearId ? await tx.enrolment.findFirst({ where: { studentId: st.id, academicYearId: yearId, archivedAt: null }, include: { student: false } }) : null;
    const section = enr ? await tx.section.findFirst({ where: { id: enr.sectionId }, include: { schoolClass: { select: { name: true } } } }) : null;
    return {
      ...base, staffId: null, sectionIds: section ? [section.id] : [],
      student: st && enr && section ? { id: st.id, name: st.fullName, sectionId: section.id, classId: section.classId, label: `${section.schoolClass.name} ${section.name}`, rollNo: enr.rollNo } : null,
    };
  }
  const staff = await staffForUser(tx, who.ctx);
  if (level === "full") return { ...base, staffId: staff?.id ?? null, sectionIds: null };
  if (!staff || !yearId) return { ...base, staffId: staff?.id ?? null, sectionIds: [] };
  const [alloc, ct] = await Promise.all([
    tx.teacherAllocation.findMany({ where: { staffId: staff.id, academicYearId: yearId, ...allocationActiveOn(today) }, select: { sectionId: true, subjectId: true } }),
    tx.section.findMany({ where: { academicYearId: yearId, classTeacherId: staff.id, archivedAt: null }, select: { id: true } }),
  ]);
  const pairs = alloc.map((a) => ({ sectionId: a.sectionId, subjectId: a.subjectId }));
  const ctSections = ct.map((s) => s.id);
  return { ...base, staffId: staff.id, pairs, ctSections, sectionIds: [...new Set([...pairs.map((p) => p.sectionId), ...ctSections])] };
}

const hasPair = (s: HomeworkScope, sectionId: string, subjectId: string) => s.pairs.some((p) => p.sectionId === sectionId && p.subjectId === subjectId);

/** May this person change (edit, grade, archive) work for this section and subject? */
export function mayWork(s: HomeworkScope, rec: { sectionId: string; subjectId: string; teacherId?: string | null }) {
  if (s.level === "full") return true;
  if (s.level !== "own") return false;
  return hasPair(s, rec.sectionId, rec.subjectId) || (!!s.staffId && rec.teacherId === s.staffId);
}

/** May this person read work for this section and subject? */
export function mayRead(s: HomeworkScope, rec: { sectionId: string; subjectId: string; teacherId?: string | null }) {
  if (s.level === "full") return true;
  if (s.level === "student") return !!s.student && rec.sectionId === s.student.sectionId;
  return mayWork(s, rec) || s.ctSections.includes(rec.sectionId);
}

/**
 * The where-clause for records of one section and subject (homework, quizzes,
 * courses, online classes) this person may read. Students get their section;
 * the homework list narrows students further to homework given to them.
 */
/** One part of a scope where-clause; it fits Homework, Quiz, Course and Online Class Session alike. */
export type ScopeClause = { sectionId?: string | { in: string[] }; subjectId?: string; teacherId?: string };

export function readWhere(s: HomeworkScope): { OR?: ScopeClause[]; sectionId?: string } {
  if (s.level === "full") return {};
  if (s.level === "student") return { sectionId: s.student?.sectionId ?? "00000000-0000-0000-0000-000000000000" };
  const or: ScopeClause[] = s.pairs.map((p) => ({ sectionId: p.sectionId, subjectId: p.subjectId }));
  if (s.staffId) or.push({ teacherId: s.staffId });
  if (s.ctSections.length) or.push({ sectionId: { in: s.ctSections } });
  return { OR: or.length ? or : [{ sectionId: "00000000-0000-0000-0000-000000000000" }] };
}

/** Like readWhere, but only what the person may change. */
export function workWhere(s: HomeworkScope): { OR?: ScopeClause[] } {
  if (s.level === "full") return {};
  if (s.level === "student") return { OR: [{ sectionId: "00000000-0000-0000-0000-000000000000" }] };
  const or: ScopeClause[] = s.pairs.map((p) => ({ sectionId: p.sectionId, subjectId: p.subjectId }));
  if (s.staffId) or.push({ teacherId: s.staffId });
  return { OR: or.length ? or : [{ sectionId: "00000000-0000-0000-0000-000000000000" }] };
}

export function requireWork(s: HomeworkScope, rec: { sectionId: string; subjectId: string; teacherId?: string | null }, what = "this") {
  if (!mayWork(s, rec)) throw new HomeworkProblem(`Only the teacher of this class and subject, the Academic Head or the Principal can change ${what}.`);
}

export function requireStaff(s: HomeworkScope) {
  if (s.level === "student") throw new HomeworkProblem("Only teachers can do this.");
}

export function requireYearOpen(s: HomeworkScope) {
  if (!s.yearId) throw new HomeworkProblem("There is no academic year yet. Ask your School Admin to set one up in Academic Management.");
  if (s.yearClosed) throw new HomeworkProblem("This academic year is closed, so its homework can only be read.");
}

/** Sections (with their class) this person may set work for, with how many students study there. Classes with no students are left out (02-workflows 9). */
export async function workSections(tx: Tx, s: HomeworkScope) {
  if (!s.yearId || s.level === "student") return [];
  const sections = await tx.section.findMany({
    where: { academicYearId: s.yearId, archivedAt: null, ...(s.level === "own" ? { id: { in: [...new Set(s.pairs.map((p) => p.sectionId))] } } : {}) },
    include: { schoolClass: { select: { name: true, sortOrder: true } } },
    orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
  });
  const counts = await tx.enrolment.groupBy({ by: ["sectionId"], where: { academicYearId: s.yearId, archivedAt: null, status: "STUDYING", sectionId: { in: sections.map((x) => x.id) }, student: { archivedAt: null } }, _count: true });
  const n = new Map(counts.map((c) => [c.sectionId, c._count]));
  return sections
    .map((x) => ({ id: x.id, classId: x.classId, className: x.schoolClass.name, name: x.name, label: shortSection(x.schoolClass.name, x.name), students: n.get(x.id) ?? 0 }))
    .filter((x) => x.students > 0);
}

/** "Class 7" + "B" to "7 B"; "LKG" + "A" to "LKG A". */
export function shortSection(className: string, sectionName: string) {
  return `${className.replace(/^Class\s+/i, "")} ${sectionName}`;
}

/** The subjects this person may set work in for a section: their own allocations, or every subject taught in the class (full). */
export async function workSubjects(tx: Tx, s: HomeworkScope, sectionId: string, classId: string, today: Date) {
  if (s.level === "own") {
    const ids = s.pairs.filter((p) => p.sectionId === sectionId).map((p) => p.subjectId);
    return tx.subject.findMany({ where: { id: { in: ids }, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  }
  const maps = await tx.subjectClass.findMany({ where: { classId, archivedAt: null, OR: [{ fromDate: null }, { fromDate: { lte: today } }], AND: [{ OR: [{ toDate: null }, { toDate: { gte: today } }] }] }, select: { subjectId: true } });
  return tx.subject.findMany({ where: { id: { in: maps.map((m) => m.subjectId) }, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}
