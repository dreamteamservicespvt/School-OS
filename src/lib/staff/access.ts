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
};

export type ViewerSource = Pick<Current, "permissions" | "roles" | "user">;

export function canSeeRestricted(roleKeys: readonly (string | null)[]) {
  return roleKeys.some((k) => k !== null && (RESTRICTED_ROLE_KEYS as readonly string[]).includes(k));
}

export async function viewerFor(tx: Tx, ctx: SchoolContext, current: ViewerSource): Promise<Viewer> {
  const me = ctx.userId ? await tx.staff.findFirst({ where: { userLoginId: ctx.userId, archivedAt: null }, select: { id: true } }) : null;
  const heads = me ? await tx.department.findMany({ where: { headStaffId: me.id, archivedAt: null }, select: { id: true } }) : [];
  const roleKeys = current.roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  return {
    userId: current.user.id,
    see: current.permissions["staff-hr-management"].see,
    change: current.permissions["staff-hr-management"].change,
    staffId: me?.id ?? null,
    headOf: heads.map((h) => h.id),
    restricted: canSeeRestricted(roleKeys),
    salary: current.permissions["salary-management"].see,
    roleKeys,
  };
}

/** The staff records a viewer may open. */
export function staffScope(v: Viewer): Prisma.StaffWhereInput {
  if (v.see === "all") return {};
  return { id: v.staffId ?? "00000000-0000-0000-0000-000000000000" };
}

export function canOpenStaff(v: Viewer, staffId: string) {
  return v.see === "all" || v.staffId === staffId;
}

export function canChangeStaff(v: Viewer, staffId: string) {
  return v.change === "all" || (v.change === "own" && v.staffId === staffId);
}

/** Salary shows only to people allowed to see salary: Salary Management for all, or their own. */
export function canSeeSalary(v: Viewer, staffId: string) {
  return v.salary === "all" || (v.salary === "own" && v.staffId === staffId);
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
