// Creating a school with everything it needs on the first day. The Super
// Admin console's Add School (07-super-admin.md §4) calls buildSchool() inside
// its own transaction; the demo seed calls createSchool().

import { randomUUID } from "node:crypto";
import type { SchoolStatus } from "@prisma/client";
import { withSchool, type SchoolContext, type Tx } from "./db";
import { writeAudit } from "./audit";
import { MODULES } from "./modules";
import { ALL_ROLE_TEMPLATES } from "./roles";

/**
 * The School Feature for two-step login (TWO_STEP_FEATURE in auth/two-step.ts,
 * which this file cannot import: the seed runs it outside the server). A test
 * keeps the two the same.
 */
export const NEW_SCHOOL_TWO_STEP_FEATURE = "two-step-login";

export type NewSchool = {
  code: string;
  name: string;
  board?: string;
  address?: string;
  groupId?: string;
  campusName?: string;
  city?: string;
  state?: string;
  schoolType?: string;
  phone?: string;
  email?: string;
  status?: SchoolStatus;
  trialEndsOn?: Date;
  /** Optional modules to switch on from the first day (Library, Inventory, Hostel). */
  optionalOn?: string[];
};

/** Makes the school, its main campus, its starting roles and its modules. ctx.schoolId is the new school's id. */
export async function buildSchool(tx: Tx, ctx: SchoolContext, input: NewSchool) {
  const schoolId = ctx.schoolId;
  const school = await tx.school.create({
    data: {
      id: schoolId,
      code: input.code,
      name: input.name,
      board: input.board,
      address: input.address,
      groupId: input.groupId,
      city: input.city,
      state: input.state,
      schoolType: input.schoolType,
      phone: input.phone,
      email: input.email,
      status: input.status ?? "TRIAL",
      trialEndsOn: input.trialEndsOn,
    },
  });
  const campus = await tx.campus.create({
    data: { schoolId, name: input.campusName ?? "Main Campus", address: input.address, isMain: true },
  });
  // Ready roles are on from the first day; templates start switched off (05-roles.md).
  await tx.role.createMany({
    data: ALL_ROLE_TEMPLATES.map((r) => ({
      schoolId,
      key: r.key,
      name: r.name,
      kind: r.kind,
      isEnabled: r.kind === "READY",
      requiresTwoStep: r.requiresTwoStep,
      permissions: r.permissions,
    })),
  });
  // Optional modules stay off until the school switches them on (Settings, Modules On/Off),
  // unless Add School chose them for the school type.
  const on = new Set(input.optionalOn ?? []);
  await tx.schoolModule.createMany({
    data: MODULES.filter((m) => m.optional).map((m) => ({ schoolId, moduleKey: m.key, isOn: on.has(m.key) })),
  });
  // Two-step login is on from the first day for the roles that need it (School Admin,
  // Principal, Accountant: 08-platform-security.md §2). A School Admin can switch it off.
  await tx.schoolFeature.create({ data: { schoolId, featureKey: NEW_SCHOOL_TWO_STEP_FEATURE, isOn: true } });
  await writeAudit(tx, ctx, { action: "created", recordType: "School", recordId: schoolId, after: { code: input.code, name: input.name, twoStepLogin: "on" } });
  return { school, campus };
}

export async function createSchool(input: NewSchool) {
  const schoolId = randomUUID();
  const ctx = { schoolId, userId: null };
  return withSchool(ctx, (tx) => buildSchool(tx, ctx, input));
}
