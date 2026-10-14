// Who gets work from the desk: the person handling a department's walk-in
// requests, and the staff (with a login) who can be given a follow-up.
import "server-only";

import type { SchoolContext, Tx } from "../db";

export async function loginsWithRole(tx: Tx, ctx: SchoolContext, key: string) {
  const rows = await tx.schoolAccess.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE", archivedAt: null }, roles: { some: { role: { key, isEnabled: true, archivedAt: null } } } },
    select: { userLoginId: true },
    orderBy: { createdAt: "asc" },
  });
  return [...new Set(rows.map((r) => r.userLoginId))];
}

/** The roles that handle each department's requests, first match wins (inferred). */
const DEPARTMENT_ROLES: Record<string, string[]> = {
  Office: ["school-admin", "office-staff"],
  Accounts: ["accountant"],
  Academics: ["vice-principal", "academic-head", "principal"],
  Transport: ["transport-in-charge"],
  Admissions: ["admission-counsellor"],
  Exams: ["exam-in-charge"],
  Hostel: ["hostel-warden"],
  Library: ["librarian"],
  Stores: ["store-keeper"],
};

/** The login that gets a department's walk-in request: by role, else a Department with that name, else the School Admin, else the Principal. */
export async function handlerFor(tx: Tx, ctx: SchoolContext, department: string): Promise<{ loginId: string; name: string } | null> {
  const tryLogins = async (ids: string[]) => {
    for (const id of ids) {
      const u = await tx.userLogin.findUnique({ where: { id }, select: { id: true, displayName: true } });
      if (u) return { loginId: u.id, name: u.displayName };
    }
    return null;
  };
  for (const key of DEPARTMENT_ROLES[department] ?? []) {
    const hit = await tryLogins(await loginsWithRole(tx, ctx, key));
    if (hit) return hit;
  }
  const dept = await tx.department.findFirst({ where: { name: { equals: department, mode: "insensitive" }, archivedAt: null }, select: { headStaffId: true } });
  if (dept?.headStaffId) {
    const head = await tx.staff.findFirst({ where: { id: dept.headStaffId, archivedAt: null, userLoginId: { not: null } }, select: { userLoginId: true } });
    if (head?.userLoginId) {
      const hit = await tryLogins([head.userLoginId]);
      if (hit) return hit;
    }
  }
  for (const key of ["school-admin", "principal"]) {
    const hit = await tryLogins(await loginsWithRole(tx, ctx, key));
    if (hit) return hit;
  }
  return null;
}

/** Staff with a login, for "who follows up" and "for" pickers: name and role. */
export async function staffWithLogins(tx: Tx) {
  const rows = await tx.staff.findMany({
    where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, userLoginId: { not: null } },
    select: { id: true, fullName: true, designation: true, userLoginId: true },
    orderBy: { fullName: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.fullName, role: r.designation, loginId: r.userLoginId! }));
}
