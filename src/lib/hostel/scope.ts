// Which hostels a person works in. A Hostel Warden works in the hostels they
// are a warden of (Hostel Settings, Wardens) and nowhere else: for other
// hostels they see totals, never names (owner's rule "Wardens own hostel
// only"). Everyone else who opens the module sees every hostel.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { anyOtherCampus, type CampusLimit } from "../campus";
import { staffForUser } from "../people";
import type { HostelViewer } from "./access";
import { HostelProblem } from "./problem";

/** null = every hostel; otherwise the ids of the person's own hostels (maybe none). */
export type Mine = string[] | null;

export async function myHostelIds(tx: Tx, ctx: SchoolContext, v: Pick<HostelViewer, "wardenOnly">): Promise<Mine> {
  if (!v.wardenOnly) return null;
  const staff = await staffForUser(tx, ctx);
  if (!staff) return [];
  const rows = await tx.hostelWarden.findMany({ where: { staffId: staff.id, archivedAt: null }, select: { hostelId: true } });
  const ids = [...new Set(rows.map((r) => r.hostelId))];
  if (!ids.length) return [];
  const open = await tx.hostel.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true } });
  return open.map((h) => h.id);
}

export const inScope = (mine: Mine, hostelId: string | null | undefined) => mine === null || (Boolean(hostelId) && mine.includes(hostelId!));

/** A where-part limiting rows with a hostelId to the person's hostels. */
export const hostelWhere = (mine: Mine) => (mine === null ? {} : { hostelId: { in: mine } });

/** Refuses work in a hostel that is not the person's. */
export function assertHostel(mine: Mine, hostelId: string | null | undefined) {
  if (!inScope(mine, hostelId)) throw new HostelProblem("This is not your hostel. A warden works in their own hostel only; ask that hostel's warden.");
}

/**
 * Hostels are the whole school's, but a person kept to one campus works with
 * that campus's students only (20-settings.md, scope "One campus"): another
 * campus's student, or their bed, is not found.
 */
export async function assertResidentsCampus(tx: Tx, limit: CampusLimit | null | undefined, ids: { studentIds?: string[]; allocationIds?: string[] }, field = "studentId") {
  if (!limit?.campusId) return;
  const ofBeds = ids.allocationIds?.length ? (await tx.bedAllocation.findMany({ where: { id: { in: ids.allocationIds } }, select: { studentId: true } })).map((a) => a.studentId) : [];
  if (await anyOtherCampus(tx, limit, [...(ids.studentIds ?? []), ...ofBeds])) throw new HostelProblem("This student was not found, or is on another campus.", field);
}

/**
 * One campus (`ours`: the ids of the person's campus's students, null for the
 * whole school): incidents with one of those students, or with no student at
 * all (a maintenance incident about a room belongs to the hostel).
 */
export function incidentCampusWhere(ours: string[] | null): Prisma.HostelIncidentWhereInput {
  return ours ? { AND: [{ OR: [{ studentIds: { isEmpty: true } }, { studentIds: { hasSome: ours } }] }] } : {};
}

/** The students of an incident the person may see by name: their campus's only (`ours`), or all for the whole school. */
export function shownStudents(ids: string[], ours: string[] | null) {
  if (!ours) return ids;
  const keep = new Set(ours);
  return ids.filter((id) => keep.has(id));
}
