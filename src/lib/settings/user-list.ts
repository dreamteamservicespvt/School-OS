// The people with a login in this school, for the Users list and its export.
import "server-only";

import type { Tx } from "../db";
import { stateOf, scopeLabel, type UserState } from "./users";

export type UserRow = {
  id: string;
  name: string;
  username: string;
  phone: string | null;
  email: string | null;
  belongsTo: string | null;
  roles: { id: string; key: string | null; name: string }[];
  scope: string;
  campus: string | null;
  state: UserState;
  lastSignInAt: Date | null;
  twoStep: boolean;
  exceptions: number;
};

export async function schoolUsers(tx: Tx, schoolId: string): Promise<UserRow[]> {
  const accesses = await tx.schoolAccess.findMany({
    where: { schoolId },
    include: { userLogin: true, campus: true, roles: { include: { role: true } } },
    orderBy: { createdAt: "desc" },
  });
  const ids = [...new Set(accesses.map((a) => a.userLoginId))];
  const [staff, students] = await Promise.all([
    tx.staff.findMany({ where: { userLoginId: { in: ids } }, select: { userLoginId: true, fullName: true, designation: true } }),
    tx.student.findMany({ where: { userLoginId: { in: ids } }, select: { userLoginId: true, fullName: true } }),
  ]);
  const rows: UserRow[] = [];
  for (const id of ids) {
    const mine = accesses.filter((a) => a.userLoginId === id);
    const live = mine.find((a) => !a.archivedAt);
    const shown = live ?? mine[0];
    const login = shown.userLogin;
    if (login.archivedAt) continue;
    const st = staff.find((s) => s.userLoginId === id);
    const su = students.find((s) => s.userLoginId === id);
    const roles = shown.roles.map((r) => r.role);
    rows.push({
      id,
      name: login.displayName,
      username: login.username,
      phone: login.phone,
      email: login.email,
      belongsTo: st ? `Staff: ${st.fullName}, ${st.designation}` : su ? `Student: ${su.fullName}` : null,
      roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name })),
      scope: scopeLabel(shown.scope),
      campus: shown.campus?.name ?? null,
      state: stateOf(login.status, Boolean(live)),
      lastSignInAt: login.lastSignInAt,
      twoStep: roles.some((r) => r.requiresTwoStep),
      exceptions: Object.keys((shown.exceptions as object) ?? {}).length,
    });
  }
  return rows;
}

export function filterUsers(rows: UserRow[], q: string, filters: Record<string, string>) {
  const s = q.toLowerCase();
  return rows.filter((r) => {
    if (s && ![r.name, r.username, r.phone ?? "", r.email ?? "", r.belongsTo ?? ""].some((x) => x.toLowerCase().includes(s))) return false;
    if (filters.status && r.state !== filters.status) return false;
    if (filters.role && !r.roles.some((x) => x.id === filters.role)) return false;
    if (filters.twostep === "on" && !r.twoStep) return false;
    if (filters.twostep === "off" && r.twoStep) return false;
    if (filters.exceptions === "yes" && r.exceptions === 0) return false;
    return true;
  });
}

export function sortUsers(rows: UserRow[], sort: string | null, dir: "asc" | "desc") {
  const k = dir === "asc" ? 1 : -1;
  const by: Record<string, (r: UserRow) => string | number> = {
    name: (r) => r.name.toLowerCase(),
    username: (r) => r.username,
    status: (r) => r.state,
    lastSignIn: (r) => r.lastSignInAt?.getTime() ?? 0,
  };
  const f = (sort && by[sort]) || by.name;
  return [...rows].sort((a, b) => (f(a) < f(b) ? -k : f(a) > f(b) ? k : 0));
}
