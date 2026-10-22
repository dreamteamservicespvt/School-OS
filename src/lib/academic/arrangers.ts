// Who arranges substitutions (04 §1, 05-roles.md): roles with Full Academic
// Management (Principal, School Admin, Vice Principal, Academic Head or the
// school's own roles) and the Office Staff template (Own: arranging
// substitutions). They hear when periods need cover.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import type { RolePermissions } from "../roles";
import { notify } from "../notifications";
import { loginsForCampus } from "../staff/campus-logins";

/** Active logins that arrange substitutions for a campus (those limited to another campus are left out). */
export async function arrangerLogins(tx: Tx, ctx: SchoolContext, campusId: string): Promise<string[]> {
  const roles = await tx.role.findMany({ where: { schoolId: ctx.schoolId, isEnabled: true, archivedAt: null }, select: { id: true, key: true, permissions: true } });
  const arranging = roles.filter((r) => {
    const level = (r.permissions as Partial<RolePermissions>)["academic-management"];
    return level === "full" || (level === "own" && r.key === "office-staff");
  });
  if (arranging.length === 0) return [];
  const access = await tx.schoolAccess.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { roleId: { in: arranging.map((r) => r.id) } } } },
    select: { userLoginId: true },
  });
  return loginsForCampus(tx, ctx, [...new Set(access.map((a) => a.userLoginId))], campusId);
}

/** Tells the people who arrange substitutions that periods need cover (merged into one notice per day). */
export async function tellArrangers(tx: Tx, ctx: SchoolContext, campusId: string, input: { text: string; date: Date }) {
  const day = input.date.toISOString().slice(0, 10);
  for (const to of await arrangerLogins(tx, ctx, campusId)) {
    await notify(tx, ctx, {
      to, type: "substitution", text: input.text, link: `/academic-management/substitutions?date=${day}`,
      groupKey: `substitutions-needed-${day}`, mergedText: (n) => `${n} notices of periods that need a substitute`,
    });
  }
}
