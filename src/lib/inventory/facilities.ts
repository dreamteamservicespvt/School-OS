// Rooms, Labs & Maintenance (14): the facility register (the same Room
// records the Time Table uses, with the store's details beside them),
// maintenance requests any staff member raises from a phone with a photo
// (assigned to a technician, closed with the cost going to Finance as an
// expense), lab experiments per class and lab safety checks.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDate, formatRupees } from "../format";
import { nextNumber, formatNumber } from "../sequences";
import { addRoom, archiveRoom } from "../academic/rooms";
import { InventoryProblem } from "./problem";
import { costToFinance } from "./assets";
import { storeKeepers } from "./stock";
import { BASE, FACILITY_TYPES, LAB_CHECKLIST, PRIORITY, ROOM_KIND_OF } from "./words";

const ZERO = BigInt(0);

/* ---------- Facility register ---------- */

export type FacilityInput = { roomId: string | null; campusId: string | null; name: string; type: string; capacity: number | null; building: string | null; floor: string | null; inChargeStaffId: string | null; note: string | null };

export async function saveFacility(tx: Tx, ctx: SchoolContext, input: FacilityInput) {
  if (!(FACILITY_TYPES as readonly string[]).includes(input.type)) throw new InventoryProblem("Choose the type.", "type");
  if (input.capacity !== null && (!Number.isInteger(input.capacity) || input.capacity < 0 || input.capacity > 10_000)) throw new InventoryProblem("Capacity must be a whole number.", "capacity");
  if (input.inChargeStaffId && !(await tx.staff.findFirst({ where: { id: input.inChargeStaffId, archivedAt: null } }))) throw new InventoryProblem("Choose the person in charge from the list.", "inChargeStaffId");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 60) throw new InventoryProblem("Give the place a name, like Lab 1 or Main ground.", "name");
  let roomId = input.roomId;
  const kind = ROOM_KIND_OF[input.type] ?? "activity";
  if (!roomId) {
    const campus = input.campusId ? await tx.campus.findFirst({ where: { id: input.campusId } }) : await tx.campus.findFirst({ orderBy: [{ isMain: "desc" }, { createdAt: "asc" }] });
    if (!campus) throw new InventoryProblem("Choose the campus.", "campusId");
    const room = await addRoom(tx, ctx, campus.id, { name, kind, capacity: input.capacity });
    roomId = room.id;
  } else {
    const room = await tx.room.findFirst({ where: { id: roomId } });
    if (!room) throw new InventoryProblem("This place was not found.");
    const clash = await tx.room.findFirst({ where: { campusId: room.campusId, name: { equals: name, mode: "insensitive" }, id: { not: room.id }, archivedAt: null } });
    if (clash) throw new InventoryProblem(`${clash.name} is already in the list.`, "name");
    // A Time Table classroom keeps its kind unless the type really changes it.
    await tx.room.update({ where: { id: room.id }, data: { name, capacity: input.capacity, kind } });
    await writeAudit(tx, ctx, { action: "updated", recordType: "Room", recordId: room.id, before: { name: room.name, kind: room.kind, capacity: room.capacity }, after: { name, kind, capacity: input.capacity } });
  }
  const data = { type: input.type, building: input.building?.trim() || null, floor: input.floor?.trim() || null, inChargeStaffId: input.inChargeStaffId, note: input.note?.trim() || null, updatedById: ctx.userId };
  await tx.facility.upsert({ where: { roomId }, create: { roomId, schoolId: ctx.schoolId, ...data }, update: data });
  await writeAudit(tx, ctx, { action: input.roomId ? "updated" : "created", recordType: "Facility", recordId: roomId, after: { name, ...data } });
  return roomId;
}

/** Archives a place with no assets in it (the Time Table no longer offers it). */
export async function archiveFacility(tx: Tx, ctx: SchoolContext, roomId: string) {
  const assets = await tx.asset.count({ where: { roomId, status: { not: "DISPOSED" } } });
  if (assets) throw new InventoryProblem(`${assets} asset${assets === 1 ? " is" : "s are"} in this place. Move ${assets === 1 ? "it" : "them"} first.`);
  const open = await tx.maintenanceRequest.count({ where: { roomId, status: { in: ["OPEN", "IN_PROGRESS"] } } });
  if (open) throw new InventoryProblem(`${open} maintenance request${open === 1 ? " is" : "s are"} open for this place. Close ${open === 1 ? "it" : "them"} first.`);
  await archiveRoom(tx, ctx, roomId);
}

/* ---------- Maintenance requests ---------- */

export type RaiseInput = { roomId: string; assetId: string | null; problem: string; photoFileId: string | null; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" };

/** Any staff member raises a request (14 Done when 8): the people who look after the place are told. */
export async function raiseMaintenance(tx: Tx, ctx: SchoolContext, input: RaiseInput) {
  const room = await tx.room.findFirst({ where: { id: input.roomId, archivedAt: null } });
  if (!room) throw new InventoryProblem("Choose the place.", "roomId");
  if (!PRIORITY[input.priority]) throw new InventoryProblem("Choose the priority.", "priority");
  const problem = input.problem.trim().replace(/\s+/g, " ");
  if (problem.length < 5) throw new InventoryProblem("Describe the problem, in at least 5 characters.", "problem");
  if (problem.length > 500) throw new InventoryProblem("Keep the problem to 500 characters.", "problem");
  const asset = input.assetId ? await tx.asset.findFirst({ where: { id: input.assetId, status: { not: "DISPOSED" } } }) : null;
  if (input.assetId && !asset) throw new InventoryProblem("Choose the asset from the list, or leave it empty.", "assetId");
  const n = await nextNumber(tx, ctx, "inventory-maintenance");
  const r = await tx.maintenanceRequest.create({
    data: { schoolId: ctx.schoolId, number: formatNumber("MR-", n, 4), roomId: room.id, assetId: asset?.id ?? null, problem, photoFileId: input.photoFileId, priority: input.priority, raisedById: ctx.userId },
  });
  const facility = await tx.facility.findUnique({ where: { roomId: room.id } });
  const inCharge = facility?.inChargeStaffId ? await tx.staff.findFirst({ where: { id: facility.inChargeStaffId }, select: { userLoginId: true } }) : null;
  const to = new Set([...(await storeKeepers(tx, ctx)), ...(inCharge?.userLoginId ? [inCharge.userLoginId] : [])]);
  for (const p of to) {
    await notify(tx, ctx, { to: p, type: "maintenance", text: `${r.number} ${PRIORITY[input.priority].label.toLowerCase()} priority, ${room.name}: ${problem.slice(0, 120)}`, link: `${BASE}/rooms?tab=maintenance&request=${r.id}`, groupKey: "inventory-maintenance", mergedText: (k) => `${k} new maintenance requests` });
  }
  await writeAudit(tx, ctx, { action: "raised", recordType: "Maintenance Request", recordId: r.id, after: { number: r.number, place: room.name, problem, priority: input.priority, photo: Boolean(input.photoFileId), asset: asset?.tag ?? null } });
  return { request: r, room };
}

/** Assigns a technician (a staff member, or an outside person or vendor) and sets the priority; the technician is told. */
export async function assignMaintenance(tx: Tx, ctx: SchoolContext, id: string, input: { technicianStaffId: string | null; technicianName: string | null; vendorId: string | null; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" }) {
  const r = await tx.maintenanceRequest.findFirst({ where: { id } });
  if (!r) throw new InventoryProblem("This request was not found.");
  if (r.status === "DONE" || r.status === "CANCELLED") throw new InventoryProblem("This request is closed.");
  if (!PRIORITY[input.priority]) throw new InventoryProblem("Choose the priority.", "priority");
  const tech = input.technicianStaffId ? await tx.staff.findFirst({ where: { id: input.technicianStaffId, archivedAt: null } }) : null;
  if (input.technicianStaffId && !tech) throw new InventoryProblem("Choose the technician from the list.", "technicianStaffId");
  const outside = input.technicianName?.trim() || null;
  if (input.vendorId && !(await tx.vendor.findFirst({ where: { id: input.vendorId } }))) throw new InventoryProblem("Choose the vendor from the list.", "vendorId");
  if (!tech && !outside && !input.vendorId) throw new InventoryProblem("Choose a staff member, or type the name of the outside technician.", "technicianStaffId");
  await tx.maintenanceRequest.update({ where: { id: r.id }, data: { technicianStaffId: tech?.id ?? null, technicianName: tech ? null : outside, vendorId: input.vendorId, priority: input.priority, status: "IN_PROGRESS", assignedAt: new Date() } });
  const room = await tx.room.findFirst({ where: { id: r.roomId }, select: { name: true } });
  if (tech?.userLoginId) {
    await notify(tx, ctx, { to: tech.userLoginId, type: "maintenance", text: `${r.number} assigned to you (${PRIORITY[input.priority].label.toLowerCase()} priority), ${room?.name ?? "a room"}: ${r.problem.slice(0, 120)}`, link: `${BASE}/report-problem?request=${r.id}` });
  }
  await writeAudit(tx, ctx, { action: "assigned", recordType: "Maintenance Request", recordId: r.id, before: { status: r.status, priority: r.priority }, after: { technician: tech?.fullName ?? outside, priority: input.priority } });
  return { request: r, technician: tech?.fullName ?? outside ?? "the vendor", told: Boolean(tech?.userLoginId) };
}

export type CloseInput = { status: "DONE" | "CANCELLED"; doneOn: Date | null; costPaise: bigint | null; toFinance: boolean; billFileId: string | null; billNo: string | null; duplicateReason: string | null; closingNote: string | null };

/** Closes a request: done (with its cost, which goes to Finance as an expense) or cancelled with a note. */
export async function closeMaintenance(tx: Tx, ctx: SchoolContext, id: string, input: CloseInput) {
  const r = await tx.maintenanceRequest.findFirst({ where: { id } });
  if (!r) throw new InventoryProblem("This request was not found.");
  if (r.status === "DONE" || r.status === "CANCELLED") throw new InventoryProblem("This request is already closed.");
  if (input.status === "DONE" && !input.doneOn) throw new InventoryProblem("Enter the date the work was done.", "doneOn");
  if (input.status === "CANCELLED" && (!input.closingNote || input.closingNote.trim().length < 5)) throw new InventoryProblem("Say why it is cancelled, in at least 5 characters.", "closingNote");
  if (input.costPaise !== null && input.costPaise < ZERO) throw new InventoryProblem("Cost cannot be below ₹0.", "cost");
  const room = await tx.room.findFirst({ where: { id: r.roomId }, select: { name: true } });
  let expenseId: string | null = null;
  let outcome: string | null = null;
  if (input.status === "DONE" && input.toFinance && input.costPaise && input.costPaise > ZERO) {
    const e = await costToFinance(tx, ctx, { amountPaise: input.costPaise, date: input.doneOn!, vendorId: r.vendorId, note: `${r.number} ${room?.name ?? ""}: ${r.problem}`, billFileId: input.billFileId, billNo: input.billNo, duplicateReason: input.duplicateReason });
    expenseId = e.expense.id;
    outcome = e.outcome;
  }
  await tx.maintenanceRequest.update({ where: { id: r.id }, data: { status: input.status, doneOn: input.status === "DONE" ? input.doneOn : null, costPaise: input.costPaise, expenseId, closingNote: input.closingNote?.trim() || null } });
  if (r.raisedById) {
    await notify(tx, ctx, { to: r.raisedById, type: "maintenance", text: input.status === "DONE" ? `${r.number} is done: ${r.problem.slice(0, 80)} (${room?.name ?? ""})` : `${r.number} was cancelled: ${input.closingNote}`, link: `${BASE}/report-problem?request=${r.id}` });
  }
  await writeAudit(tx, ctx, { action: input.status === "DONE" ? "done" : "cancelled", recordType: "Maintenance Request", recordId: r.id, before: { status: r.status }, after: { status: input.status, cost: input.costPaise !== null ? formatRupees(input.costPaise) : null, doneOn: input.doneOn ? formatDate(input.doneOn, "UTC") : null, expense: expenseId } });
  return { request: r, expenseId, outcome };
}

/* ---------- Labs ---------- */

export async function saveExperiment(tx: Tx, ctx: SchoolContext, input: { id: string | null; classId: string; subject: string; title: string; roomId: string | null; materials: string | null }) {
  const cls = await tx.schoolClass.findFirst({ where: { id: input.classId } });
  if (!cls) throw new InventoryProblem("Choose the class.", "classId");
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 3) throw new InventoryProblem("Give the experiment a title.", "title");
  const subject = input.subject.trim();
  if (subject.length < 2) throw new InventoryProblem("Enter the subject.", "subject");
  if (input.roomId && !(await tx.room.findFirst({ where: { id: input.roomId, archivedAt: null } }))) throw new InventoryProblem("Choose the lab from the list.", "roomId");
  const data = { classId: cls.id, subject, title, roomId: input.roomId, materials: input.materials?.trim() || null };
  if (input.id) {
    const before = await tx.labExperiment.findFirst({ where: { id: input.id } });
    if (!before) throw new InventoryProblem("This experiment was not found.");
    const e = await tx.labExperiment.update({ where: { id: before.id }, data });
    await writeAudit(tx, ctx, { action: "updated", recordType: "Lab Experiment", recordId: e.id, before: { title: before.title, subject: before.subject }, after: { title, subject } });
    return e;
  }
  const sortOrder = (await tx.labExperiment.count({ where: { classId: cls.id } })) + 1;
  const e = await tx.labExperiment.create({ data: { schoolId: ctx.schoolId, ...data, sortOrder, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Lab Experiment", recordId: e.id, after: { title, subject, class: cls.name } });
  return e;
}

export async function archiveExperiment(tx: Tx, ctx: SchoolContext, id: string) {
  const e = await tx.labExperiment.findFirst({ where: { id, archivedAt: null } });
  if (!e) throw new InventoryProblem("This experiment was not found.");
  await tx.labExperiment.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Lab Experiment", recordId: id, before: { title: e.title } });
}

/** A lab safety check: each checklist line passed or not; any failure is "Issues found" and the store keeper is told. */
export async function recordSafetyCheck(tx: Tx, ctx: SchoolContext, input: { roomId: string; date: Date; passed: string[]; note: string | null; today: Date }) {
  const room = await tx.room.findFirst({ where: { id: input.roomId, archivedAt: null } });
  if (!room) throw new InventoryProblem("Choose the lab.", "roomId");
  if (input.date > input.today) throw new InventoryProblem("The check date cannot be in the future.", "date");
  const checklist = LAB_CHECKLIST.map((item) => ({ item, ok: input.passed.includes(item) }));
  const failed = checklist.filter((c) => !c.ok);
  if (failed.length && (!input.note || input.note.trim().length < 5)) throw new InventoryProblem("Say what is wrong, in at least 5 characters.", "note");
  const c = await tx.labSafetyCheck.create({ data: { schoolId: ctx.schoolId, roomId: room.id, date: input.date, checklist, result: failed.length ? "ISSUES" : "PASS", note: input.note?.trim() || null, checkedById: ctx.userId } });
  if (failed.length) {
    for (const p of await storeKeepers(tx, ctx)) {
      await notify(tx, ctx, { to: p, type: "lab-safety", text: `Lab safety check, ${room.name}: ${failed.length} issue${failed.length === 1 ? "" : "s"} (${failed.map((f) => f.item).slice(0, 2).join("; ")})`, link: `${BASE}/rooms?tab=labs` });
    }
  }
  await writeAudit(tx, ctx, { action: "safety-check", recordType: "Lab Safety Check", recordId: c.id, after: { lab: room.name, result: c.result, failed: failed.map((f) => f.item) } });
  return { check: c, failed: failed.length, room };
}
