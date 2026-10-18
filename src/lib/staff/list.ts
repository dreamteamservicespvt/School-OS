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

const NOBODY = "00000000-0000-0000-0000-000000000000";

/**
 * One campus (src/lib/campus.ts): the staff of the viewer's campus and their
 * own record; {} for the whole school. For pickers and lists of other people
 * that do not depend on the viewer's "see" reach (leave, documents, exits).
 */
export function campusStaffWhere(v: Pick<Viewer, "campusId" | "staffId">): Prisma.StaffWhereInput {
  return v.campusId ? { OR: [{ campusId: v.campusId }, { id: v.staffId ?? NOBODY }] } : {};
}

/** For records that hold only a staffId: the staff ids the viewer may see (their campus and their own record), or null for the whole school. */
export function campusStaffIds(v: Pick<Viewer, "campusStaff" | "staffId">): string[] | null {
  if (!v.campusStaff) return null;
  return v.staffId && !v.campusStaff.has(v.staffId) ? [...v.campusStaff, v.staffId] : [...v.campusStaff];
}

/** `{ staffId: { in } }` for records keyed by staff (leave, exits, appraisals, training); {} for the whole school. */
export function staffIdOnCampus(v: Pick<Viewer, "campusStaff" | "staffId">): { staffId?: { in: string[] } } {
  const ids = campusStaffIds(v);
  return ids ? { staffId: { in: ids } } : {};
}

/** Is this staff member on another campus than the viewer's (never their own record)? */
export function offCampus(v: Pick<Viewer, "campusStaff" | "staffId">, staffId: string | null | undefined): boolean {
  if (!v.campusStaff) return false;
  return !staffId || (staffId !== v.staffId && !v.campusStaff.has(staffId));
}

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

/** The staff on roll a viewer may see (the Staff List's summary counts). */
export function onRollWhere(viewer: Viewer): Prisma.StaffWhereInput {
  return { AND: [staffScope(viewer)], archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } };
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
