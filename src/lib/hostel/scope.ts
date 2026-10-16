// Which hostels a person works in. A Hostel Warden works in the hostels they
// are a warden of (Hostel Settings, Wardens) and nowhere else: for other
// hostels they see totals, never names (owner's rule "Wardens own hostel
// only"). Everyone else who opens the module sees every hostel.
import "server-only";

import type { SchoolContext, Tx } from "../db";
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
