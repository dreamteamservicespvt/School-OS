// Who may see which students, and which parts of a student's record
// (05-roles.md, 03 §1 "Used by"). Every page, action, search and export of
// this module goes through these, so the limits are the same everywhere.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { PermissionMap } from "../permissions";
import { PermissionDeniedError } from "../permissions";
import { ownSectionIds } from "../people";
import { currentYear } from "../academic/years";
import type { ResolvedSettings } from "./settings";

/** The parts of the signed-in person this module needs (Current satisfies it). */
export type Who = {
  ctx: SchoolContext;
  permissions: PermissionMap;
  roles: { key: string | null }[];
};

/**
 * View roles that follow students' progress (05-roles.md: Academic Head, Exam
 * In-charge). Every other view-only role (Accountant, Front Office, Librarian,
 * Gate Security...) opens Student Management only to look a student up.
 */
const ACADEMIC_VIEW_ROLES = new Set(["academic-head", "exam-in-charge", "vice-principal"]);
/** Roles that see the restricted fields (Aadhaar and other identifiers) in full. */
const RESTRICTED_ROLES = new Set(["school-admin", "principal"]);
/** The only role that reads confidential counselling notes (05-roles.md, Counsellor). */
export const COUNSELLOR_ROLE = "counsellor";

export type StudentAbilities = {
  /** Which students: every student, or only their own (sections taught, cases given). */
  reach: "all" | "own" | "none";
  /** Add, edit, change status, link guardians, certificates, promotion, leaving. */
  manage: boolean;
  /** Report incidents and add notes (teachers for their own students). */
  contribute: boolean;
  /** Only a student's basic details: the accountant, front office, librarian. */
  lookupOnly: boolean;
  seeRestricted: boolean;
  seeBehaviour: boolean;
  seeDocuments: boolean;
  /** Counselling cases (when switched on): roles in Student Settings. */
  seeCounselling: boolean;
  /** Confidential counselling notes: the Counsellor role only. */
  seeCounsellingNotes: boolean;
  exportList: boolean;
  roleKeys: string[];
};

export function abilities(who: Who, settings?: Pick<ResolvedSettings, "counsellingOn" | "counsellingRoles">): StudentAbilities {
  const access = who.permissions["student-management"];
  const roleKeys = who.roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  const reach = access?.see ?? "none";
  const change = access?.change ?? "none";
  // View-only people see a student's basic record; the academic view roles also see behaviour and documents.
  const lookupOnly = reach !== "none" && change === "none" && !roleKeys.some((k) => ACADEMIC_VIEW_ROLES.has(k));
  const manage = change === "all";
  const counsellingAllowed = Boolean(settings?.counsellingOn) && (roleKeys.includes(COUNSELLOR_ROLE) || roleKeys.some((k) => settings?.counsellingRoles.includes(k)));
  return {
    reach,
    manage,
    contribute: change !== "none",
    lookupOnly,
    seeRestricted: roleKeys.some((k) => RESTRICTED_ROLES.has(k)),
    seeBehaviour: reach !== "none" && !lookupOnly,
    seeDocuments: reach !== "none" && !lookupOnly,
    seeCounselling: counsellingAllowed,
    seeCounsellingNotes: Boolean(settings?.counsellingOn) && roleKeys.includes(COUNSELLOR_ROLE),
    exportList: reach !== "none",
    roleKeys,
  };
}

/**
 * The limit on Student rows for this person. With "own" reach: students
 * enrolled this year in the sections they teach or are class teacher of, and
 * students whose counselling cases are given to them.
 */
export async function studentScope(tx: Tx, who: Who, yearId?: string | null): Promise<Prisma.StudentWhereInput> {
  const a = abilities(who);
  if (a.reach === "none") return { id: { in: [] } };
  if (a.reach === "all") return {};
  const year = yearId ?? (await currentYear(tx, who.ctx))?.id;
  const sections = year ? await ownSectionIds(tx, who.ctx, year) : [];
  const cases = who.ctx.userId
    ? await tx.counsellingCase.findMany({ where: { counsellorId: who.ctx.userId, archivedAt: null }, select: { studentId: true } })
    : [];
  const or: Prisma.StudentWhereInput[] = [];
  if (sections.length && year) or.push({ enrolments: { some: { academicYearId: year, sectionId: { in: sections }, archivedAt: null } } });
  if (cases.length) or.push({ id: { in: cases.map((c) => c.studentId) } });
  return or.length ? { OR: or } : { id: { in: [] } };
}

export class StudentNotFound extends Error {
  constructor() {
    super("This student was not found, or is not one of your students.");
    this.name = "StudentNotFound";
  }
}

/** Throws unless the person may see this student. Returns the student. */
export async function loadVisibleStudent(tx: Tx, who: Who, studentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) throw new StudentNotFound();
  const scope = await studentScope(tx, who);
  const student = await tx.student.findFirst({ where: { AND: [{ id: studentId }, scope] } });
  if (!student) throw new StudentNotFound();
  return student;
}

/** For actions: the person must be able to change student records (Full). */
export function requireManage(who: Who) {
  if (!abilities(who).manage) throw new PermissionDeniedError("student-management");
}

/** Notes marked private show only to the chosen roles and to the person who wrote them. */
export function noteVisible(note: { visibleToRoles: string[]; authorId: string | null }, who: Who) {
  if (note.visibleToRoles.length === 0) return true;
  if (note.authorId && note.authorId === who.ctx.userId) return true;
  const keys = who.roles.map((r) => r.key);
  return note.visibleToRoles.some((k) => keys.includes(k));
}
