// What "own" means in Homework & Learning, read at the query (05-roles.md):
// a teacher works with the sections and subjects of their Teacher Allocations
// this year; a class teacher also reads every subject of their own section; a
// student sees only homework given to them, their own section's courses,
// quizzes, boards and classes.
//
// Campuses (00-global.md §5, 04-data-model.md rule 19): a person limited to
// "One campus" sees and changes only the work of that campus's sections. Each
// campus has its own current academic year, so "this year" is each campus's
// own current year (only theirs for a person limited to one campus), and work
// made for a section goes into that section's own year.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { currentYear, yearsFor } from "../academic/years";
import { allocationActiveOn } from "../academic/allocation";
import { campusSectionIds, personCampusId } from "../campus";
import { staffForUser } from "../people";
import type { PermissionMap } from "../permissions";
import { homeworkLevel, HomeworkProblem, pageModes, PAGE_KEYS, type HomeworkLevel, type HomeworkPageKey, type PageMode } from "./access";

export type Pair = { sectionId: string; subjectId: string };

export type HomeworkScope = {
  level: HomeworkLevel;
  /** Edit, view or nothing on each page (overseers watch and remind; teachers do the desk work). */
  modes: Record<HomeworkPageKey, PageMode | null>;
  ctx: SchoolContext;
  /**
   * The current year of the person's own campus: a student's campus; for staff
   * the campus they are limited to, else their Staff record's, else the main
   * campus. The default where a page shows one year.
   */
  yearId: string | null;
  yearClosed: boolean;
  /** The current year of each campus this person works in, one per campus (only their campus's when limited to one). Lists and counts cover them all. */
  yearIds: string[];
  /** Those of yearIds that are not closed. */
  openYearIds: string[];
  /** Limited to "One campus": every section of that campus (any year). Null for the whole school. */
  campusSections: string[] | null;
  staffId: string | null;
  /** The person's name, for posts and comments. */
  name: string;
  /** Own staff: the sections and subjects they teach (Teacher Allocation). Full: empty (everything). */
  pairs: Pair[];
  /** Own staff: sections they are class teacher of (read every subject). */
  ctSections: string[];
  /** Sections this person may see; null for every section (Full reach limited to one campus: that campus's sections). */
  sectionIds: string[] | null;
  /** The signed-in student, with their section this year. */
  student: { id: string; name: string; sectionId: string; classId: string; label: string; rollNo: number | null } | null;
};

type Who = {
  ctx: SchoolContext; permissions: PermissionMap; roles: readonly { key: string | null }[]; user: { displayName: string };
  /** The campus their access is limited to ("One campus"); null or left out for the whole school (Current carries it). */
  campusId?: string | null;
};

const NONE = "00000000-0000-0000-0000-000000000000";
const NO_YEAR = "There is no academic year yet. Ask your School Admin to set one up in Academic Management.";
const CLOSED = "This academic year is closed, so its homework can only be read.";

type YearRow = { id: string; status: string };

/** The year fields of a scope: the person's own year first, then every other current year they work in. */
function yearFields(own: YearRow | null, all: YearRow[]) {
  const list = [...(own ? [own] : []), ...all.filter((y) => y.id !== own?.id)];
  return {
    yearId: own?.id ?? null,
    yearClosed: own?.status === "CLOSED",
    yearIds: list.map((y) => y.id),
    openYearIds: list.filter((y) => y.status !== "CLOSED").map((y) => y.id),
  };
}

export async function homeworkScope(tx: Tx, who: Who, today: Date): Promise<HomeworkScope> {
  const level = homeworkLevel(who.permissions, who.roles);
  if (!level) throw new HomeworkProblem("Your role does not include Homework & Learning.");
  const modes = pageModes(who.permissions, who.roles);
  const campusSections = await campusSectionIds(tx, who);
  const base = { level, modes, ctx: who.ctx, campusSections, name: who.user.displayName, pairs: [] as Pair[], ctSections: [] as string[], student: null as HomeworkScope["student"] };
  if (level === "student") {
    const st = await tx.student.findFirst({ where: { userLoginId: who.ctx.userId ?? "", archivedAt: null }, select: { id: true, fullName: true, campusId: true } });
    // A student's "this year" is their own campus's year.
    const y = yearFields(await currentYear(tx, who.ctx, st?.campusId ?? null), []);
    const enr = st && y.yearId ? await tx.enrolment.findFirst({ where: { studentId: st.id, academicYearId: y.yearId, archivedAt: null }, include: { student: false } }) : null;
    const section = enr ? await tx.section.findFirst({ where: { id: enr.sectionId }, include: { schoolClass: { select: { name: true } } } }) : null;
    return {
      ...base, ...y, staffId: null, sectionIds: section ? [section.id] : [],
      student: st && enr && section ? { id: st.id, name: st.fullName, sectionId: section.id, classId: section.classId, label: `${section.schoolClass.name} ${section.name}`, rollNo: enr.rollNo } : null,
    };
  }
  const staff = await staffForUser(tx, who.ctx);
  const own = await currentYear(tx, who.ctx, await personCampusId(tx, who.ctx, who));
  const y = yearFields(own, await yearsFor(tx, who.ctx, who.campusId));
  // Full reach: every section, or every section of their campus.
  if (level === "full") return { ...base, ...y, staffId: staff?.id ?? null, sectionIds: campusSections };
  if (!staff || !y.yearIds.length) return { ...base, ...y, staffId: staff?.id ?? null, sectionIds: [] };
  const [alloc, ct] = await Promise.all([
    tx.teacherAllocation.findMany({ where: { staffId: staff.id, academicYearId: { in: y.yearIds }, ...allocationActiveOn(today) }, select: { sectionId: true, subjectId: true } }),
    tx.section.findMany({ where: { academicYearId: { in: y.yearIds }, classTeacherId: staff.id, archivedAt: null }, select: { id: true } }),
  ]);
  const here = (sectionId: string) => !campusSections || campusSections.includes(sectionId);
  const pairs = alloc.filter((a) => here(a.sectionId)).map((a) => ({ sectionId: a.sectionId, subjectId: a.subjectId }));
  const ctSections = ct.map((s) => s.id).filter(here);
  return { ...base, ...y, staffId: staff.id, pairs, ctSections, sectionIds: [...new Set([...pairs.map((p) => p.sectionId), ...ctSections])] };
}

/** Is this section on the person's campus? Always, for someone who works across the whole school. */
export const onCampus = (s: Pick<HomeworkScope, "campusSections">, sectionId: string) => !s.campusSections || s.campusSections.includes(sectionId);

/** The person's current years for a where-clause (one per campus); no limit when there is no year at all. */
export const inYears = (s: Pick<HomeworkScope, "yearIds">) => (s.yearIds.length ? { in: s.yearIds } : undefined);

/** One campus: only its sections (for where-clauses on Homework, Quiz, Course, Online Class Session). */
const campusClause = (s: HomeworkScope): { sectionId?: { in: string[] } } => (s.campusSections ? { sectionId: { in: s.campusSections } } : {});

/**
 * For lists, counts and exports: the person's current years (one per campus,
 * so a school with two campuses shows both) and, when limited to one campus,
 * only its sections. A student's own section is added by the list itself.
 */
export function listWhere(s: HomeworkScope): { academicYearId?: { in: string[] }; sectionId?: { in: string[] } } {
  const years = inYears(s);
  return { ...(years ? { academicYearId: years } : {}), ...(s.level === "student" ? {} : campusClause(s)) };
}

const hasPair = (s: HomeworkScope, sectionId: string, subjectId: string) => s.pairs.some((p) => p.sectionId === sectionId && p.subjectId === subjectId);

/** May this person change (edit, grade, archive) work for this section and subject, on this page? */
export function mayWork(s: HomeworkScope, rec: { sectionId: string; subjectId: string; teacherId?: string | null }, page: HomeworkPageKey = "homework") {
  if (s.modes[page] !== "edit" || !onCampus(s, rec.sectionId)) return false;
  if (s.level === "full") return true;
  if (s.level !== "own") return false;
  return hasPair(s, rec.sectionId, rec.subjectId) || (!!s.staffId && rec.teacherId === s.staffId);
}

/** May this person read work for this section and subject? */
export function mayRead(s: HomeworkScope, rec: { sectionId: string; subjectId: string; teacherId?: string | null }) {
  if (!onCampus(s, rec.sectionId)) return false;
  if (s.level === "full") return true;
  if (s.level === "student") return !!s.student && rec.sectionId === s.student.sectionId;
  return mayWork(s, rec) || hasPair(s, rec.sectionId, rec.subjectId) || (!!s.staffId && rec.teacherId === s.staffId) || s.ctSections.includes(rec.sectionId);
}

/**
 * The where-clause for records of one section and subject (homework, quizzes,
 * courses, online classes) this person may read. Students get their section;
 * the homework list narrows students further to homework given to them.
 */
/** One part of a scope where-clause; it fits Homework, Quiz, Course and Online Class Session alike. */
export type ScopeClause = { sectionId?: string | { in: string[] }; subjectId?: string; teacherId?: string };

export function readWhere(s: HomeworkScope): { OR?: ScopeClause[]; sectionId?: string | { in: string[] } } {
  if (s.level === "full") return campusClause(s);
  if (s.level === "student") return { sectionId: s.student?.sectionId ?? NONE };
  const or: ScopeClause[] = s.pairs.map((p) => ({ sectionId: p.sectionId, subjectId: p.subjectId }));
  if (s.staffId) or.push({ teacherId: s.staffId });
  if (s.ctSections.length) or.push({ sectionId: { in: s.ctSections } });
  return { OR: or.length ? or : [{ sectionId: NONE }], ...campusClause(s) };
}

/** Like readWhere, but only what the person may change. */
export function workWhere(s: HomeworkScope): { OR?: ScopeClause[]; sectionId?: { in: string[] } } {
  if (s.level === "full") return campusClause(s);
  if (s.level === "student") return { OR: [{ sectionId: NONE }] };
  const or: ScopeClause[] = s.pairs.map((p) => ({ sectionId: p.sectionId, subjectId: p.subjectId }));
  if (s.staffId) or.push({ teacherId: s.staffId });
  return { OR: or.length ? or : [{ sectionId: NONE }], ...campusClause(s) };
}

export function requireWork(s: HomeworkScope, rec: { sectionId: string; subjectId: string; teacherId?: string | null }, what = "this", page: HomeworkPageKey = "homework") {
  if (s.modes[page] === "view") throw new HomeworkProblem(`Your role reads ${what} but does not change it. The subject teacher does this work.`);
  if (!mayWork(s, rec, page)) throw new HomeworkProblem(`Only the teacher of this class and subject can change ${what}.`);
}

/** Refuses a change on a page this person only reads, or may not open. */
export function requireDesk(s: HomeworkScope, page: HomeworkPageKey) {
  if (s.modes[page] === "edit") return;
  if (s.modes[page] === "view") throw new HomeworkProblem("Your role reads this page but does not change it. The subject teacher does this work.");
  throw new HomeworkProblem("Your role does not include this page.");
}

export const editablePages = (s: HomeworkScope) => PAGE_KEYS.filter((p) => s.modes[p] === "edit");

export function requireStaff(s: HomeworkScope) {
  if (s.level === "student") throw new HomeworkProblem("Only teachers can do this.");
}

/**
 * Before a change. Given a year (the class's own year, or the person's own
 * year for a board with no class), that year must be open. Without one, before
 * the class is known: one of the person's current years must be open (in a
 * school with one campus, the year); the class's own year is checked after.
 */
export function requireYearOpen(s: HomeworkScope, academicYearId?: string | null) {
  const ids = academicYearId === undefined ? s.yearIds : academicYearId ? [academicYearId] : [];
  if (!ids.length) throw new HomeworkProblem(NO_YEAR);
  if (!ids.some((id) => s.openYearIds.includes(id))) throw new HomeworkProblem(CLOSED);
}

/**
 * Sections (with their class and their own year) this person may set work
 * for, with how many students study there: in each campus's current year,
 * only their campus's when limited to one. Classes with no students are left
 * out (02-workflows 9).
 */
export async function workSections(tx: Tx, s: HomeworkScope, page: HomeworkPageKey = "homework") {
  if (!s.yearIds.length || s.level === "student" || s.modes[page] !== "edit") return [];
  const sections = await tx.section.findMany({
    where: {
      academicYearId: { in: s.yearIds }, archivedAt: null,
      ...(s.level === "own" ? { id: { in: [...new Set(s.pairs.map((p) => p.sectionId))] } } : s.sectionIds ? { id: { in: s.sectionIds } } : {}),
    },
    include: { schoolClass: { select: { name: true, sortOrder: true } } },
    orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
  });
  const counts = await tx.enrolment.groupBy({ by: ["sectionId"], where: { academicYearId: { in: s.yearIds }, archivedAt: null, status: "STUDYING", sectionId: { in: sections.map((x) => x.id) }, student: { archivedAt: null } }, _count: true });
  const n = new Map(counts.map((c) => [c.sectionId, c._count]));
  return sections
    .map((x) => ({ id: x.id, yearId: x.academicYearId, classId: x.classId, className: x.schoolClass.name, name: x.name, label: shortSection(x.schoolClass.name, x.name), students: n.get(x.id) ?? 0 }))
    .filter((x) => x.students > 0);
}

/** "Class 7" + "B" to "7 B"; "LKG" + "A" to "LKG A". */
export function shortSection(className: string, sectionName: string) {
  return `${className.replace(/^Class\s+/i, "")} ${sectionName}`;
}

/** The subjects this person may set work in for a section: their own allocations, or every subject taught in the class (full; on their campus). */
export async function workSubjects(tx: Tx, s: HomeworkScope, sectionId: string, classId: string, today: Date) {
  if (!onCampus(s, sectionId)) return [];
  if (s.level === "own") {
    const ids = s.pairs.filter((p) => p.sectionId === sectionId).map((p) => p.subjectId);
    return tx.subject.findMany({ where: { id: { in: ids }, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  }
  const maps = await tx.subjectClass.findMany({ where: { classId, archivedAt: null, OR: [{ fromDate: null }, { fromDate: { lte: today } }], AND: [{ OR: [{ toDate: null }, { toDate: { gte: today } }] }] }, select: { subjectId: true } });
  return tx.subject.findMany({ where: { id: { in: maps.map((m) => m.subjectId) }, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}
