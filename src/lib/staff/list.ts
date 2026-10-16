// The Staff List query, shared by the screen, the export and batch printing,
// so all three use the same filters and the same limits (P1, P8).
import "server-only";

import type { Prisma, StaffStatus } from "@prisma/client";
import type { ListParams } from "../list";
import { orderByFor } from "../list";
import type { Viewer } from "./access";
import { staffScope } from "./access";
import { STAFF_STATUSES } from "./settings";

export const STAFF_FILTERS = ["designation", "department", "status", "type", "campus"] as const;

export function staffWhere(params: ListParams, viewer: Viewer): Prisma.StaffWhereInput {
  const f = params.filters;
  const status = f.status === "all" ? undefined : STAFF_STATUSES.some((s) => s.value === f.status) ? (f.status as StaffStatus) : "ACTIVE";
  const and: Prisma.StaffWhereInput[] = [staffScope(viewer)];
  if (params.q) {
    const q = params.q;
    and.push({ OR: [
      { fullName: { contains: q, mode: "insensitive" } },
      { staffCode: { contains: q, mode: "insensitive" } },
      { designation: { contains: q, mode: "insensitive" } },
      { phone: { contains: q.replace(/\D/g, "") || q } },
      { email: { contains: q, mode: "insensitive" } },
    ] });
  }
  return {
    AND: and,
    archivedAt: params.archived ? { not: null } : null,
    ...(status && !params.archived ? { status } : {}),
    ...(f.designation ? { designation: f.designation } : {}),
    ...(f.department ? { departmentId: f.department === "none" ? null : f.department } : {}),
    ...(f.type ? { employmentType: f.type } : {}),
    ...(f.campus ? { campusId: f.campus } : {}),
  };
}

export function staffOrder(params: ListParams) {
  return orderByFor(params, {
    name: { fullName: params.dir },
    code: { staffCode: params.dir },
    designation: [{ designation: params.dir }, { fullName: "asc" }],
    joining: { joiningDate: params.dir },
  }, [{ fullName: "asc" }]) as Prisma.StaffOrderByWithRelationInput | Prisma.StaffOrderByWithRelationInput[];
}

export function describeFilters(params: ListParams, names: { departments: Map<string, string>; campuses: Map<string, string> }) {
  const parts: string[] = [];
  if (params.q) parts.push(`Search "${params.q}"`);
  const f = params.filters;
  parts.push(`Status: ${f.status === "all" ? "all" : STAFF_STATUSES.find((s) => s.value === f.status)?.label ?? "Active"}`);
  if (f.designation) parts.push(`Designation: ${f.designation}`);
  if (f.department) parts.push(`Department: ${f.department === "none" ? "None" : names.departments.get(f.department) ?? "?"}`);
  if (f.type) parts.push(`Employment type: ${f.type}`);
  if (f.campus) parts.push(`Campus: ${names.campuses.get(f.campus) ?? "?"}`);
  if (params.archived) parts.push("Archived");
  return parts.join(", ");
}
