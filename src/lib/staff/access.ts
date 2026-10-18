// Who may see what in Staff & HR (05-roles.md, 09 §1). "Own" reach (teachers
// and most staff) means their own profile, leave and documents. Restricted
// fields (Aadhaar, PAN, bank account) are shown in full only to the roles
// that look after staff records; everyone else sees the last 4 characters.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { Current } from "../current";
import type { Reach } from "../permissions";
import { requirePermission, type Action } from "../permissions";

/** Roles that may see restricted staff fields in full (inferred: the roles that keep staff records). */
export const RESTRICTED_ROLE_KEYS = ["principal", "school-admin", "hr"] as const;

export type Viewer = {
  userId: string;
  /** Which staff records they can see. */
  see: Reach;
  /** Which staff records they can change. */
  change: Reach;
  /** Their own Staff record id, if they are staff. */
  staffId: string | null;
  /** Departments they head (inferred: heads see their department's leave). */
  headOf: string[];
  restricted: boolean;
  salary: Reach;
  roleKeys: string[];
  /** The campus their access is limited to ("One campus"); null for the whole school. */
  campusId: string | null;
  /** With a campus limit: the staff of that campus (their own record is always open to them too). */
  campusStaff: Set<string> | null;
};

export type ViewerSource = Pick<Current, "permissions" | "roles" | "user"> & { campusId?: string | null };

export function canSeeRestricted(roleKeys: readonly (string | null)[]) {
  return roleKeys.some((k) => k !== null && (RESTRICTED_ROLE_KEYS as readonly string[]).includes(k));
}

export async function viewerFor(tx: Tx, ctx: SchoolContext, current: ViewerSource): Promise<Viewer> {
  const me = ctx.userId ? await tx.staff.findFirst({ where: { userLoginId: ctx.userId, archivedAt: null }, select: { id: true } }) : null;
  const heads = me ? await tx.department.findMany({ where: { headStaffId: me.id, archivedAt: null }, select: { id: true } }) : [];
  const roleKeys = current.roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  const campusId = current.campusId ?? null;
  const campusStaff = campusId
    ? new Set((await tx.staff.findMany({ where: { schoolId: ctx.schoolId, campusId }, select: { id: true } })).map((x) => x.id))
    : null;
  return {
    userId: current.user.id,
    see: current.permissions["staff-hr-management"].see,
    change: current.permissions["staff-hr-management"].change,
    staffId: me?.id ?? null,
    headOf: heads.map((h) => h.id),
    restricted: canSeeRestricted(roleKeys),
    salary: current.permissions["salary-management"].see,
    roleKeys,
    campusId,
    campusStaff,
  };
}

const NOBODY = "00000000-0000-0000-0000-000000000000";

/** The staff records a viewer may open: everyone (on their campus, when limited to one), or their own. */
export function staffScope(v: Viewer): Prisma.StaffWhereInput {
  if (v.see === "all") return v.campusId ? { OR: [{ campusId: v.campusId }, { id: v.staffId ?? NOBODY }] } : {};
  return { id: v.staffId ?? NOBODY };
}

/** Is this staff member on the viewer's campus (always true for the whole school)? */
const onCampus = (v: Pick<Viewer, "campusStaff">, staffId: string) => v.campusStaff === null || v.campusStaff.has(staffId);

export function canOpenStaff(v: Viewer, staffId: string) {
  return v.staffId === staffId || (v.see === "all" && onCampus(v, staffId));
}

export function canChangeStaff(v: Viewer, staffId: string) {
  return (v.change === "all" && (onCampus(v, staffId) || v.staffId === staffId)) || (v.change === "own" && v.staffId === staffId);
}

/** Salary shows only to people allowed to see salary: Salary Management for all (on their campus), or their own. */
export function canSeeSalary(v: Viewer, staffId: string) {
  return (v.salary === "all" && (onCampus(v, staffId) || v.staffId === staffId)) || (v.salary === "own" && v.staffId === staffId);
}

/** HR work (other people's records, settings, balances) needs full reach. */
export class HrOnlyError extends Error {
  constructor(what = "this") {
    super(`Only HR, the School Admin or the Principal can do ${what}. Ask them if it needs doing.`);
    this.name = "HrOnlyError";
  }
}

export function requireHr(current: Pick<Current, "permissions">, action: Action = "edit") {
  const reach = requirePermission(current.permissions, "staff-hr-management", action);
  if (reach !== "all") throw new HrOnlyError();
}

/** Logins of the people who look after staff: HR, or the School Admin when the school has no HR login. */
export async function hrPeople(tx: Tx, ctx: SchoolContext): Promise<string[]> {
  const by = async (key: string) =>
    (await tx.schoolAccess.findMany({
      where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { role: { key, isEnabled: true, archivedAt: null } } } },
      select: { userLoginId: true },
    })).map((a) => a.userLoginId);
  const hr = await by("hr");
  return [...new Set(hr.length ? hr : await by("school-admin"))];
}
