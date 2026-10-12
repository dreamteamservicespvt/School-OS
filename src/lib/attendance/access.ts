// Who may do what in Attendance Management (05-roles.md). Full reach sees and
// changes everything. "Own" means different things for different roles:
// teachers their own sections and periods, class teachers their section's
// register, corrections and student leave, the HR template staff attendance
// only, the Office Staff template student leave only.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { Reach } from "../permissions";
import type { Current } from "../current";
import { currentYear } from "../academic/years";

export const MODULE = "attendance-management" as const;
export const BASE = "/attendance-management";

export type AttendanceAccess = {
  userId: string;
  see: Reach;
  change: Reach;
  roleKeys: string[];
  staffId: string | null;
  campusId: string | null;
  yearId: string | null;
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
};

export type AccessSource = Pick<Current, "permissions" | "roles" | "campusId"> & { user: { id: string } };

export async function attendanceAccess(tx: Tx, ctx: SchoolContext, current: AccessSource, lockOverrideRoles: string[] = ["principal", "school-admin"]): Promise<AttendanceAccess> {
  const p = current.permissions[MODULE];
  const roleKeys = current.roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  const me = ctx.userId ? await tx.staff.findFirst({ where: { userLoginId: ctx.userId, archivedAt: null }, select: { id: true, campusId: true } }) : null;
  const year = await currentYear(tx, ctx, current.campusId ?? me?.campusId ?? null);
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
    campusId: current.campusId ?? me?.campusId ?? null,
    yearId: year?.id ?? null,
    full,
    students: seeAll ? "all" : own && (teaches || (!isHr && !isOffice)) ? "own" : "none",
    classSections: classSections.map((s) => s.id),
    teachingSections: [...new Set(teaching.map((t) => t.sectionId))],
    staff: seeAll || (own && isHr) ? "all" : me && p.see !== "none" ? "self" : "none",
    studentLeave: seeAll || (own && isOffice) ? "all" : own && classSections.length > 0 ? "own" : "none",
    lockOverride: full && roleKeys.some((k) => lockOverrideRoles.includes(k)),
    admin: full,
  };
}

/** Sections whose register they may open. */
export function registerSections(a: AttendanceAccess): string[] | "all" {
  if (a.students === "all") return "all";
  if (a.students === "none") return [];
  return [...new Set([...a.classSections, ...a.teachingSections])];
}

/** Can they take daily attendance for this section? Class teachers for their own sections. */
export function canTakeDaily(a: AttendanceAccess, sectionId: string) {
  if (a.change === "all" && a.students === "all") return true;
  return a.change !== "none" && a.classSections.includes(sectionId);
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
