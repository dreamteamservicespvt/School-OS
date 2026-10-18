// Who may do what in Attendance Management (05-roles.md). Full reach sees and
// changes everything. "Own" means different things for different roles:
// teachers their own sections and periods, class teachers their section's
// register, corrections and student leave, the HR template staff attendance
// only, the Office Staff template student leave only.
//
// One campus (05-roles.md, Users & Permissions): a person whose access is
// limited to one campus sees and changes only that campus's sections,
// students, staff, devices and QR. The limit is in campusLimit, limitSections
// and limitStaff; every "everyone" below means everyone on that campus.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { Reach } from "../permissions";
import type { Current } from "../current";
import { currentYear, yearsFor } from "../academic/years";
import { campusSectionIds } from "../campus";
import { pageMode, type PageMode } from "../duty";

export const MODULE = "attendance-management" as const;
export const BASE = "/attendance-management";

export type AttendanceAccess = {
  userId: string;
  see: Reach;
  change: Reach;
  roleKeys: string[];
  staffId: string | null;
  /** The person's own campus, for defaults and the School Calendar (their limit, else their Staff record's campus). */
  campusId: string | null;
  /** The campus their access is limited to ("One campus"); null for the whole school. */
  campusLimit: string | null;
  /** With a campus limit: every section of that campus, every year; null for the whole school. */
  limitSections: string[] | null;
  /** With a campus limit: the staff of that campus, and their own record; null for the whole school. */
  limitStaff: string[] | null;
  /** The current academic year of the person's own campus (one-year defaults). */
  yearId: string | null;
  /** The current academic year of every campus they may see, one per campus (whole-school lists). */
  yearIds: string[];
  /** Whole-school work: everything. */
  full: boolean;
  /** Student attendance: "all", own sections, or none. */
  students: "all" | "own" | "none";
  /** Sections where they are class teacher (this year). */
  classSections: string[];
  /** Sections they teach (Teacher Allocation, this year). */
  teachingSections: string[];
  /** Staff attendance: everyone, only their own, or none. */
  staff: "all" | "self" | "none";
  /** Student leave: record for everyone, own sections, or none. */
  studentLeave: "all" | "own" | "none";
  /** May change marks after the lock without a correction (Attendance Settings). */
  lockOverride: boolean;
  /** May change settings, devices and QR. */
  admin: boolean;
  /** Has the whole school's fees (Fee Management, see all): may see and choose the "Fees dispute" absence reason. */
  seesFees: boolean;
  /**
   * How the person uses each page (src/lib/duty.ts, owner's prototype changes of
   * 13 Oct 2026): the Principal, School Admin and Vice Principal never take a
   * register or record student leave ("hidden"), and read some pages without
   * filling them in ("view"). View-only roles (Academic Head) see the register
   * and reports only. The server still allows what 05-roles.md gives.
   */
  pages: { take: PageMode; register: PageMode; studentLeave: PageMode; staff: PageMode; devices: PageMode; settings: PageMode };
  /** Sees every section: Attendance opens on the class-wise view of the whole school. */
  classWise: boolean;
};

export type AccessSource = Pick<Current, "permissions" | "roles" | "campusId"> & { user: { id: string } };

/** The pages part of AttendanceAccess, from the person alone. */
export function attendancePages(current: Pick<AccessSource, "roles" | "permissions">): AttendanceAccess["pages"] {
  const p = current.permissions[MODULE];
  const mode = (page: string) => pageMode(current, MODULE, page);
  const isHr = current.roles.some((r) => r.key === "hr");
  // View (Academic Head): the register and reports only (prototype config.js VIEW attendance).
  const viewOnly = p.change === "none" && p.see === "all";
  return {
    take: viewOnly ? "hidden" : mode("take"),
    register: mode("register"),
    studentLeave: viewOnly ? "hidden" : mode("student-leave"),
    staff: viewOnly && !isHr ? "hidden" : mode("staff"),
    devices: mode("devices"),
    settings: mode("settings"),
  };
}

export async function attendanceAccess(tx: Tx, ctx: SchoolContext, current: AccessSource, lockOverrideRoles: string[] = ["principal", "school-admin"]): Promise<AttendanceAccess> {
  const p = current.permissions[MODULE];
  const roleKeys = current.roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  const me = ctx.userId ? await tx.staff.findFirst({ where: { userLoginId: ctx.userId, archivedAt: null }, select: { id: true, campusId: true } }) : null;
  const limit = current.campusId ?? null;
  const year = await currentYear(tx, ctx, limit ?? me?.campusId ?? null);
  const [years, limitSections, campusStaff] = await Promise.all([
    yearsFor(tx, ctx, limit),
    campusSectionIds(tx, { campusId: limit }),
    limit ? tx.staff.findMany({ where: { schoolId: ctx.schoolId, campusId: limit }, select: { id: true } }) : Promise.resolve(null),
  ]);
  const [classSections, teaching] = me && year
    ? await Promise.all([
        tx.section.findMany({ where: { academicYearId: year.id, classTeacherId: me.id, archivedAt: null }, select: { id: true } }),
        tx.teacherAllocation.findMany({ where: { academicYearId: year.id, staffId: me.id, archivedAt: null }, select: { sectionId: true } }),
      ])
    : [[], []];
  const full = p.change === "all";
  const seeAll = p.see === "all";
  const isHr = roleKeys.includes("hr");
  const isOffice = roleKeys.includes("office-staff");
  const teaches = classSections.length > 0 || teaching.length > 0;
  const own = p.see === "own";
  return {
    userId: current.user.id,
    see: p.see,
    change: p.change,
    roleKeys,
    staffId: me?.id ?? null,
    campusId: limit ?? me?.campusId ?? null,
    campusLimit: limit,
    limitSections,
    limitStaff: campusStaff ? [...new Set([...campusStaff.map((s) => s.id), ...(me ? [me.id] : [])])] : null,
    yearId: year?.id ?? null,
    yearIds: [...new Set([...(year ? [year.id] : []), ...years.map((y) => y.id)])],
    full,
    students: seeAll ? "all" : own && (teaches || (!isHr && !isOffice)) ? "own" : "none",
    classSections: classSections.map((s) => s.id),
    teachingSections: [...new Set(teaching.map((t) => t.sectionId))],
    staff: seeAll || (own && isHr) ? "all" : me && p.see !== "none" ? "self" : "none",
    studentLeave: seeAll || (own && isOffice) ? "all" : own && classSections.length > 0 ? "own" : "none",
    lockOverride: full && roleKeys.some((k) => lockOverrideRoles.includes(k)),
    admin: full,
    seesFees: current.permissions["fee-management"]?.see === "all",
    pages: attendancePages(current),
    classWise: seeAll,
  };
}

/** Sections whose register they may open: every section ("all"), or a list (their own, or their campus's). */
export function registerSections(a: AttendanceAccess): string[] | "all" {
  if (a.students === "all") return a.limitSections ?? "all";
  if (a.students === "none") return [];
  return [...new Set([...a.classSections, ...a.teachingSections])];
}

/** Can they take daily attendance for this section? Class teachers for their own sections. */
export function canTakeDaily(a: AttendanceAccess, sectionId: string) {
  if (a.change === "all" && a.students === "all" && sectionAllowed(a, sectionId)) return true;
  return a.change !== "none" && a.classSections.includes(sectionId);
}

const NOBODY = "00000000-0000-0000-0000-000000000000";

/** Is this section on the person's campus? Always true for the whole school. */
export function sectionAllowed(a: Pick<AttendanceAccess, "limitSections">, sectionId: string | null | undefined) {
  return !a.limitSections || Boolean(sectionId && a.limitSections.includes(sectionId));
}

/** Is this staff member on the person's campus, or the person themself? Always true for the whole school. */
export function staffAllowed(a: Pick<AttendanceAccess, "limitStaff">, staffId: string | null | undefined) {
  return !a.limitStaff || Boolean(staffId && a.limitStaff.includes(staffId));
}

/** Rows with a section (marks, corrections): only the person's campus's sections. */
export function sectionLimit(a: Pick<AttendanceAccess, "limitSections">): { sectionId?: { in: string[] } } {
  return a.limitSections ? { sectionId: { in: a.limitSections } } : {};
}

/** Rows with a staff member (marks, overtime): only the person's campus's staff and their own. */
export function staffIdLimit(a: Pick<AttendanceAccess, "limitStaff">): { staffId?: { in: string[] } } {
  return a.limitStaff ? { staffId: { in: a.limitStaff } } : {};
}

/** Staff records: the person's campus's staff and their own record. */
export function staffLimit(a: Pick<AttendanceAccess, "campusLimit" | "staffId">): Prisma.StaffWhereInput {
  return a.campusLimit ? { OR: [{ campusId: a.campusLimit }, { id: a.staffId ?? NOBODY }] } : {};
}

/** Student records: the person's campus's students. */
export function studentLimit(a: Pick<AttendanceAccess, "campusLimit">): { campusId?: string } {
  return a.campusLimit ? { campusId: a.campusLimit } : {};
}

/** The person's campus's students, for rows that carry only a student id (leave, flags); null for the whole school. */
export async function limitStudentIds(tx: Tx, a: Pick<AttendanceAccess, "campusLimit">): Promise<string[] | null> {
  if (!a.campusLimit) return null;
  return (await tx.student.findMany({ where: { campusId: a.campusLimit }, select: { id: true } })).map((s) => s.id);
}

/** Records of one campus or of the whole school (QR sessions): the person's campus's and the school's. */
export function campusOrSchool(a: Pick<AttendanceAccess, "campusLimit">): { OR?: { campusId: string | null }[] } {
  return a.campusLimit ? { OR: [{ campusId: null }, { campusId: a.campusLimit }] } : {};
}

/** Is a record of this campus open to the person? A record of no campus belongs to the whole school. */
export function campusOpen(a: Pick<AttendanceAccess, "campusLimit">, campusId: string | null | undefined) {
  return !a.campusLimit || !campusId || campusId === a.campusLimit;
}

/**
 * May the person see this correction? A student correction's section, and
 * every staff member in a staff correction, must be on their campus.
 */
export function correctionAllowed(a: Pick<AttendanceAccess, "limitSections" | "limitStaff">, c: { forWhom: string; sectionId: string | null; entries: unknown }) {
  if (c.forWhom === "staff") {
    const ids = Array.isArray(c.entries) ? (c.entries as { id?: string }[]).map((e) => e?.id) : [];
    return ids.every((id) => staffAllowed(a, id));
  }
  return sectionAllowed(a, c.sectionId);
}

export class AttendanceProblem extends Error {
  constructor(message: string, public field?: string, public link?: { href: string; label: string }) {
    super(message);
    this.name = "AttendanceProblem";
  }
}

export class NotYoursError extends AttendanceProblem {
  constructor(what = "this class") {
    super(`You can only work with your own classes. Ask the principal if you need ${what}.`);
    this.name = "NotYoursError";
  }
}
