// A hostel maintenance incident raises a maintenance request in Inventory
// Management (15 Roll Call & Incidents: "maintenance incidents can raise a
// maintenance request", inferred link to Inventory; 14 Rooms, Labs &
// Maintenance: any staff member raises one). The request is the Inventory
// one, made by its own rules (raiseMaintenance): numbered, the store keeper
// and the person in charge of the place are told, a technician is assigned
// there and it is closed with its cost. The place is the hostel itself (the
// facility register gets the hostel the first time) or any room or place
// in the register. Only while Inventory Management is switched on.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { raiseMaintenance } from "../inventory/facilities";
import { InventoryProblem } from "../inventory/problem";
import { PRIORITY } from "../inventory/words";
import { HostelProblem } from "./problem";

export const INVENTORY = "inventory-management" as const;
export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
/** A place choice: "hostel:<hostel id>" for the hostel itself, or a Room id from the facility register. */
export type PlaceChoice = string;

/** The facility register's entry for a hostel (a Room with the hostel's name), if there is one. */
export async function hostelRoom(tx: Tx, hostel: { name: string }) {
  return tx.room.findFirst({ where: { name: { equals: hostel.name.trim(), mode: "insensitive" }, archivedAt: null }, orderBy: { createdAt: "asc" } });
}

/** The hostel's place in the facility register, added the first time a request is raised for it. */
async function placeOf(tx: Tx, ctx: SchoolContext, choice: PlaceChoice, assertHostel: (id: string) => void) {
  if (choice.startsWith("hostel:")) {
    const hostelId = choice.slice(7);
    assertHostel(hostelId);
    const hostel = await tx.hostel.findFirst({ where: { id: hostelId, archivedAt: null } });
    if (!hostel) throw new HostelProblem("Choose the place.", "placeId");
    const found = await hostelRoom(tx, hostel);
    if (found) return found.id;
    const campus = await tx.campus.findFirst({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }] });
    if (!campus) throw new HostelProblem("The school has no campus yet. Ask the School Admin.", "placeId");
    // A place of the same name archived earlier comes back rather than clashing with it.
    const old = await tx.room.findFirst({ where: { campusId: campus.id, name: hostel.name.trim(), archivedAt: { not: null } } });
    const room = old
      ? await tx.room.update({ where: { id: old.id }, data: { archivedAt: null } })
      : await tx.room.create({ data: { schoolId: ctx.schoolId, campusId: campus.id, name: hostel.name.trim(), kind: "activity", createdById: ctx.userId } });
    await tx.facility.upsert({ where: { roomId: room.id }, update: {}, create: { schoolId: ctx.schoolId, roomId: room.id, type: "Other", building: hostel.name.trim(), note: "Hostel (added when its first maintenance request was raised)", updatedById: ctx.userId } });
    await writeAudit(tx, ctx, { action: "created", recordType: "Facility", recordId: room.id, after: { name: room.name, type: "Other", why: "Hostel maintenance request" } });
    return room.id;
  }
  const room = await tx.room.findFirst({ where: { id: choice, archivedAt: null } });
  if (!room) throw new HostelProblem("Choose the place from the list.", "placeId");
  return room.id;
}

export type RaiseFromIncident = { placeId: PlaceChoice; priority: Priority; photoFileId: string | null };

/**
 * Raises the Inventory maintenance request for a maintenance incident (once
 * per incident). The problem is the incident's place and what happened.
 */
export async function raiseFromIncident(tx: Tx, ctx: SchoolContext, incidentId: string, input: RaiseFromIncident, opts: { assertHostel: (hostelId: string | null) => void; inventoryOn: boolean }) {
  if (!opts.inventoryOn) throw new HostelProblem("Inventory Management is switched off for this school, so a maintenance request cannot be raised. Follow the repair up from the incident log.");
  const inc = await tx.hostelIncident.findFirst({ where: { id: incidentId, archivedAt: null } });
  if (!inc) throw new HostelProblem("This incident was not found.");
  opts.assertHostel(inc.hostelId);
  if (inc.type !== "MAINTENANCE") throw new HostelProblem("Only a maintenance incident raises a maintenance request.");
  if (inc.maintenanceRequestId) {
    const r = await tx.maintenanceRequest.findFirst({ where: { id: inc.maintenanceRequestId }, select: { number: true } });
    throw new HostelProblem(`${r?.number ?? "A maintenance request"} is already raised for ${inc.incidentNo}.`);
  }
  if (!PRIORITY[input.priority]) throw new HostelProblem("Choose the priority.", "priority");
  const roomId = await placeOf(tx, ctx, input.placeId, (id) => opts.assertHostel(id));
  const problem = `${inc.place ? `${inc.place}: ` : ""}${inc.description}`.replace(/\s+/g, " ").trim().slice(0, 500);
  let raised;
  try {
    raised = await raiseMaintenance(tx, ctx, { roomId, assetId: null, problem: problem.length >= 5 ? problem : `${problem} (hostel)`, photoFileId: input.photoFileId, priority: input.priority });
  } catch (e) {
    if (e instanceof InventoryProblem) throw new HostelProblem(e.message, e.field === "roomId" ? "placeId" : e.field);
    throw e;
  }
  await tx.hostelIncident.update({ where: { id: inc.id }, data: { maintenanceRequestId: raised.request.id } });
  await writeAudit(tx, ctx, { action: "maintenance-request-raised", recordType: "Hostel Incident", recordId: inc.id, after: { incidentNo: inc.incidentNo, request: raised.request.number, place: raised.room.name, priority: PRIORITY[input.priority].label } });
  return { incident: inc, request: raised.request, room: raised.room };
}
