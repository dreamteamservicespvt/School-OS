import "server-only";

import type { SchoolContext, Tx } from "@/lib/db";

/** Staff with a login, and departments, as owner choices ("user:<id>" or "dept:<id>"). */
export async function ownerOptions(tx: Tx, ctx: SchoolContext) {
  const [staff, depts] = await Promise.all([
    tx.staff.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, userLoginId: { not: null } }, select: { userLoginId: true, fullName: true, designation: true }, orderBy: { fullName: "asc" } }),
    tx.department.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return [
    ...depts.map((d) => ({ value: `dept:${d.id}`, label: `Department: ${d.name}` })),
    ...staff.map((s) => ({ value: `user:${s.userLoginId}`, label: `${s.fullName} (${s.designation})` })),
  ];
}
