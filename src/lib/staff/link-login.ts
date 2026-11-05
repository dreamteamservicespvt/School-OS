// Logins with no staff record (live test issue 11, 04-data-model.md rule 32):
// a login made by invite from Settings or the console (the Principal, the
// School Admin) belongs to nobody on the Staff List, so it is missing from the
// staff counts and "Staff present". Add Staff can make the staff record for
// such a login and link it; no second login is made, and the roles stay as
// they are in Settings, Users & Permissions.
import "server-only";
import type { SchoolContext, Tx } from "../db";

/** Logins of these roles only belong to a Student or Driver record, never to a staff record. */
const NOT_STAFF_ROLES = new Set(["student", "driver"]);

export type LoginWithoutStaff = {
  id: string; username: string; displayName: string; phone: string | null; email: string | null;
  /** Role names in this school, in words ("Principal, Teacher"). */
  roleNames: string[];
  roleKeys: string[];
};

/**
 * Logins that can open this school but have no staff record here (archived
 * staff records count as a record: the login was theirs). Logins of a Student
 * or Driver record, and logins with only the Student or Driver role, are left
 * out. Someone limited to one campus sees only the logins of that campus.
 */
export async function loginsWithoutStaff(tx: Tx, ctx: SchoolContext, opts: { campusLimit?: string | null; loginId?: string } = {}): Promise<LoginWithoutStaff[]> {
  const accesses = await tx.schoolAccess.findMany({
    where: {
      schoolId: ctx.schoolId, archivedAt: null, userLogin: { archivedAt: null },
      ...(opts.loginId ? { userLoginId: opts.loginId } : {}),
      ...(opts.campusLimit ? { campusId: opts.campusLimit } : {}),
    },
    include: { userLogin: true, roles: { include: { role: { select: { key: true, name: true, archivedAt: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  if (accesses.length === 0) return [];
  const ids = accesses.map((a) => a.userLoginId);
  const [staff, students, drivers] = await Promise.all([
    tx.staff.findMany({ where: { schoolId: ctx.schoolId, userLoginId: { in: ids } }, select: { userLoginId: true } }),
    tx.student.findMany({ where: { schoolId: ctx.schoolId, userLoginId: { in: ids } }, select: { userLoginId: true } }),
    tx.driver.findMany({ where: { schoolId: ctx.schoolId, userLoginId: { in: ids } }, select: { userLoginId: true } }),
  ]);
  const linked = new Set([...staff, ...students, ...drivers].map((r) => r.userLoginId));
  const out: LoginWithoutStaff[] = [];
  const seen = new Set<string>();
  for (const a of accesses) {
    if (linked.has(a.userLoginId) || seen.has(a.userLoginId)) continue;
    const roles = a.roles.map((r) => r.role).filter((r) => !r.archivedAt);
    if (roles.length > 0 && roles.every((r) => r.key && NOT_STAFF_ROLES.has(r.key))) continue;
    seen.add(a.userLoginId);
    const u = a.userLogin;
    out.push({ id: u.id, username: u.username, displayName: u.displayName, phone: u.phone, email: u.email, roleNames: roles.map((r) => r.name), roleKeys: roles.map((r) => r.key ?? "").filter(Boolean) });
  }
  return out;
}

/** The login Add Staff may link, or the reason it may not (in words). */
export async function linkableLogin(tx: Tx, ctx: SchoolContext, loginId: string, campusLimit: string | null): Promise<LoginWithoutStaff | string> {
  const [found] = await loginsWithoutStaff(tx, ctx, { loginId, campusLimit });
  if (found) return found;
  const has = await tx.staff.findFirst({ where: { schoolId: ctx.schoolId, userLoginId: loginId }, select: { fullName: true, staffCode: true } });
  if (has) return `This login already belongs to ${has.fullName} (${has.staffCode}).`;
  return "That login cannot be linked here. Open the Staff List and choose from the people who have no staff record.";
}
