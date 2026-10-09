// Creating a school with everything it needs on the first day. The Super
// Admin console's Add School (07-super-admin.md) will call this.

import { randomUUID } from "node:crypto";
import { withSchool } from "./db";
import { writeAudit } from "./audit";
import { MODULES } from "./modules";
import { ALL_ROLE_TEMPLATES } from "./roles";

export type NewSchool = {
  code: string;
  name: string;
  board?: string;
  address?: string;
  groupId?: string;
  campusName?: string;
};

export async function createSchool(input: NewSchool) {
  const schoolId = randomUUID();
  const ctx = { schoolId, userId: null };
  return withSchool(ctx, async (tx) => {
    const school = await tx.school.create({
      data: {
        id: schoolId,
        code: input.code,
        name: input.name,
        board: input.board,
        address: input.address,
        groupId: input.groupId,
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
    // Optional modules stay off until the school switches them on (Settings, Modules On/Off).
    await tx.schoolModule.createMany({
      data: MODULES.filter((m) => m.optional).map((m) => ({ schoolId, moduleKey: m.key, isOn: false })),
    });
    await writeAudit(tx, ctx, { action: "created", recordType: "School", recordId: schoolId, after: { code: input.code, name: input.name } });
    return { school, campus };
  });
}
