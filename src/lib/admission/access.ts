// Who may see and do what in Admission Management (05-roles.md).
// "Own" (Receptionist / Front Office) adds new enquiries and works on the
// ones they own or added; applications, documents, tests and decisions need
// full reach (Principal, School Admin, Office Staff, Admission Counsellor).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { Current } from "../current";
import type { Reach } from "../permissions";
import { AdmissionProblem } from "./act";

export type Viewer = {
  userId: string;
  see: Reach;
  change: Reach;
  staffId: string | null;
  /** Aadhaar-related fields only for these roles (00-global.md §5). */
  restricted: boolean;
  /** Admit beyond the seats: only the Principal and School Admin (inferred "admit over capacity" permission). */
  overCapacity: boolean;
  roleKeys: string[];
};

export type ViewerSource = Pick<Current, "permissions" | "roles" | "user">;

const RESTRICTED = ["principal", "school-admin"];

export async function viewerFor(tx: Tx, ctx: SchoolContext, current: ViewerSource): Promise<Viewer> {
  const me = ctx.userId ? await tx.staff.findFirst({ where: { userLoginId: ctx.userId, archivedAt: null }, select: { id: true } }) : null;
  const roleKeys = current.roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  return {
    userId: current.user.id,
    see: current.permissions["admission-management"].see,
    change: current.permissions["admission-management"].change,
    staffId: me?.id ?? null,
    restricted: roleKeys.some((k) => RESTRICTED.includes(k)),
    overCapacity: roleKeys.some((k) => RESTRICTED.includes(k)),
    roleKeys,
  };
}

const NOBODY = "00000000-0000-0000-0000-000000000000";

/** The enquiries a viewer may see: all, or the ones they own or added. */
export function enquiryScope(v: Pick<Viewer, "see" | "staffId" | "userId">): Prisma.EnquiryWhereInput {
  if (v.see === "all") return {};
  return { OR: [{ ownerStaffId: v.staffId ?? NOBODY }, { createdById: v.userId }] };
}

export function canWorkOn(v: Pick<Viewer, "change" | "staffId" | "userId">, e: { ownerStaffId: string | null; createdById: string | null }) {
  if (v.change === "all") return true;
  if (v.change === "own") return (v.staffId !== null && e.ownerStaffId === v.staffId) || e.createdById === v.userId;
  return false;
}

export class FullOnlyError extends AdmissionProblem {
  constructor(what = "this") {
    super(`Only the admission team (Principal, School Admin, Office Staff or Admission Counsellor) can do ${what}. Your role can add enquiries and work on your own.`);
  }
}

export function requireFull(v: Pick<Viewer, "change">, what?: string) {
  if (v.change !== "all") throw new FullOnlyError(what);
}
