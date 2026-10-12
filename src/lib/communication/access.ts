// Who may do what in Communication, worked out once per page or action.
// Principal and School Admin have full access; teachers, the Accountant and
// the Receptionist have their own scope (05-roles.md).
import "server-only";

import { requireAction, requirePage, type Current } from "../current";
import { reachFor, type Action } from "../permissions";
import { withSchool } from "../db";
import { scopeFor, type Scope } from "../messaging/recipients";

export type CommAccess = { current: Current; full: boolean; canChange: boolean; scope: Scope; roleKeys: string[]; canEmergency: boolean };

const EMERGENCY_ROLES = ["principal", "school-admin"];

async function build(current: Current): Promise<CommAccess> {
  const change = reachFor(current.permissions, "communication", "create");
  const roleKeys = current.roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  const scope = await withSchool(current.ctx, (tx) => scopeFor(tx, current.ctx, change === "none" ? "own" : change, roleKeys));
  return {
    current,
    full: change === "all",
    canChange: change !== "none",
    scope,
    roleKeys,
    // Open question 1: assumed Principal and School Admin only.
    canEmergency: change !== "none" && roleKeys.some((k) => EMERGENCY_ROLES.includes(k)),
  };
}

/** For Communication pages. */
export async function commPage(action: Action = "view") {
  return build(await requirePage("communication", action));
}

/** For Communication server actions that change something. */
export async function commAction(action: Action = "create") {
  const { current } = await requireAction("communication", action);
  return build(current);
}
