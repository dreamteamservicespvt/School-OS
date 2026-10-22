// Who may see and do what in Admission Management (05-roles.md).
// "Own" (Receptionist / Front Office) adds new enquiries and works on the
// ones they own or added; applications, documents, tests and decisions need
// full reach (Principal, School Admin, Office Staff, Admission Counsellor).
// A person limited to one campus (Users & Permissions, "One campus") sees and
// works on that campus's enquiries and applications only, and adds them only
// for that campus (src/lib/campus.ts).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { Current } from "../current";
import type { Reach } from "../permissions";
import { campusAllows } from "../campus";
import { AdmissionProblem } from "./act";

export type Viewer = {
  userId: string;
  see: Reach;
  change: Reach;
  staffId: string | null;
  /** Aadhaar-related fields only for these roles (00-global.md §5). */
  restricted: boolean;
  /** Admit beyond the seats: only the Principal and School Admin (inferred "admit over capacity" permission). */
  overCapacity: boolean;
  roleKeys: string[];
  /** The campus the person is limited to ("One campus"); null for the whole school. */
  campusId: string | null;
};

/** Current satisfies it; `campusId` is optional so older callers keep working (no campus = whole school). */
export type ViewerSource = Pick<Current, "permissions" | "roles" | "user"> & { campusId?: string | null };

const RESTRICTED = ["principal", "school-admin"];

export async function viewerFor(tx: Tx, ctx: SchoolContext, current: ViewerSource): Promise<Viewer> {
  const me = ctx.userId ? await tx.staff.findFirst({ where: { userLoginId: ctx.userId, archivedAt: null }, select: { id: true } }) : null;
  const roleKeys = current.roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  return {
    userId: current.user.id,
    see: current.permissions["admission-management"].see,
    change: current.permissions["admission-management"].change,
    staffId: me?.id ?? null,
    restricted: roleKeys.some((k) => RESTRICTED.includes(k)),
    overCapacity: roleKeys.some((k) => RESTRICTED.includes(k)),
    roleKeys,
    campusId: current.campusId ?? null,
  };
}

const NOBODY = "00000000-0000-0000-0000-000000000000";

type CampusOf = { campusId?: string | null };

/** The enquiries a viewer may see: all (of their campus), or the ones they own or added. */
export function enquiryScope(v: Pick<Viewer, "see" | "staffId" | "userId"> & CampusOf): Prisma.EnquiryWhereInput {
  const campus: Prisma.EnquiryWhereInput | null = v.campusId ? { campusId: v.campusId } : null;
  if (v.see === "all") return campus ?? {};
  const own: Prisma.EnquiryWhereInput = { OR: [{ ownerStaffId: v.staffId ?? NOBODY }, { createdById: v.userId }] };
  return campus ? { AND: [campus, own] } : own;
}

/** The applications a viewer may see: every one, or their campus's when limited to one campus. */
export function applicationScope(v: CampusOf | null | undefined): Prisma.ApplicationWhereInput {
  return v?.campusId ? { campusId: v.campusId } : {};
}

export function canWorkOn(v: Pick<Viewer, "change" | "staffId" | "userId"> & CampusOf, e: { ownerStaffId: string | null; createdById: string | null; campusId?: string | null }) {
  if (!campusAllows(v, e.campusId)) return false;
  if (v.change === "all") return true;
  if (v.change === "own") return (v.staffId !== null && e.ownerStaffId === v.staffId) || e.createdById === v.userId;
  return false;
}

/** A person limited to one campus adds enquiries and applications only for it. */
export function requireOwnCampus(v: CampusOf, campusId: string | null | undefined, field?: string) {
  if (!campusAllows(v, campusId)) throw new AdmissionProblem("You can add admissions only for your own campus. Choose a class of your campus.", field);
}

/**
 * The academic years of the viewer's campus, for records that carry only a
 * year (admission tests); null for the whole school.
 */
export async function campusYearIds(tx: Tx, v: CampusOf): Promise<string[] | null> {
  if (!v.campusId) return null;
  return (await tx.academicYear.findMany({ where: { campusId: v.campusId }, select: { id: true } })).map((y) => y.id);
}

export class FullOnlyError extends AdmissionProblem {
  constructor(what = "this") {
    super(`Only the admission team (Principal, School Admin, Office Staff or Admission Counsellor) can do ${what}. Your role can add enquiries and work on your own.`);
  }
}

export function requireFull(v: Pick<Viewer, "change">, what?: string) {
  if (v.change !== "all") throw new FullOnlyError(what);
}
