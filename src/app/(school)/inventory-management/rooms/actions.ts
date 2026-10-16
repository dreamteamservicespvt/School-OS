"use server";

// Rooms, Labs & Maintenance (14 §2): the facility register (the same Room
// records the Time Table uses), maintenance requests (assign a technician,
// close with cost to Finance), lab experiments and lab safety checks.

import type { FormState } from "@/lib/forms";
import { formatRupees } from "@/lib/format";
import { DOCUMENT_TYPES, IMAGE_TYPES, saveFile } from "@/lib/files";
import { file } from "@/lib/fees/act";
import { invAction, need, str, id, optionalId, text, maybe, optionalInt, money, isoDate, on, InventoryProblem } from "@/lib/inventory/act";
import { archiveExperiment, archiveFacility, assignMaintenance, closeMaintenance, raiseMaintenance, recordSafetyCheck, saveExperiment, saveFacility } from "@/lib/inventory/facilities";
import { PRIORITY } from "@/lib/inventory/words";

type S<T = unknown> = FormState<T>;
type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

const priorityOf = (fd: FormData) => {
  const p = str(fd, "priority") || "NORMAL";
  if (!(p in PRIORITY)) throw new InventoryProblem("Choose the priority.", "priority");
  return p as Priority;
};

export async function saveFacilityAction(_p: S, fd: FormData): Promise<S> {
  const roomId = optionalId(fd, "roomId");
  return invAction(roomId ? "edit" : "create", fd, async (w) => {
    need(w.can.rooms, roomId ? "change places" : "add places");
    await saveFacility(w.tx, w.ctx, {
      roomId, campusId: optionalId(fd, "campusId"), name: text(fd, "name", "Name", { max: 60 }), type: str(fd, "type"), capacity: optionalInt(fd, "capacity", "Capacity", { max: 10_000 }),
      building: maybe(fd, "building", "Building", 60), floor: maybe(fd, "floor", "Floor", 20), inChargeStaffId: optionalId(fd, "inChargeStaffId"), note: maybe(fd, "note", "Note", 300),
    });
    return text(fd, "name", "Name", { max: 60 });
  }, (n) => `${n} saved.`);
}

export async function archiveFacilityAction(_p: S, fd: FormData): Promise<S> {
  return invAction("archive", fd, async (w) => {
    need(w.can.rooms, "archive places");
    await archiveFacility(w.tx, w.ctx, id(fd, "roomId", "place"));
  }, () => "Place archived. Its history stays.");
}

/* ---------- Maintenance ---------- */

/** The store keeper raising a request from the page (any staff member raises one from Report a problem). */
export async function raiseAction(_p: S, fd: FormData): Promise<S> {
  return invAction("create", fd, async (w) => {
    need(w.can.rooms, "raise maintenance requests here");
    const photo = file(fd, "photo");
    const photoFileId = photo ? (await saveFile(w.tx, w.ctx, { file: photo, purpose: "maintenance-photo", allowed: IMAGE_TYPES, maxImageWidth: 1600 })).id : null;
    return raiseMaintenance(w.tx, w.ctx, { roomId: id(fd, "placeId", "place"), assetId: optionalId(fd, "assetId"), problem: text(fd, "problem", "Problem", { min: 5, max: 500 }), photoFileId, priority: priorityOf(fd) });
  }, (r) => `${r.request.number} raised for ${r.room.name}.`);
}

export async function assignMaintenanceAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.rooms, "assign technicians");
    return assignMaintenance(w.tx, w.ctx, id(fd, "requestId", "request"), { technicianStaffId: optionalId(fd, "technicianStaffId"), technicianName: maybe(fd, "technicianName", "Technician", 80), vendorId: optionalId(fd, "vendorId"), priority: priorityOf(fd) });
  }, (r) => `${r.request.number} assigned to ${r.technician}${r.told ? ", who is told in the app" : ""}.`);
}

export async function closeMaintenanceAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.rooms, "close maintenance requests");
    const status = str(fd, "status") === "CANCELLED" ? "CANCELLED" : "DONE";
    const doneOn = isoDate(fd, "doneOn", "Done on", { required: status === "DONE" });
    if (doneOn && doneOn > w.today) throw new InventoryProblem("The date cannot be in the future.", "doneOn");
    const f = file(fd, "bill");
    const billFileId = f ? (await saveFile(w.tx, w.ctx, { file: f, purpose: "maintenance-bill", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 })).id : null;
    const cost = status === "DONE" ? money(fd, "cost", "Cost", { required: false }) : null;
    const r = await closeMaintenance(w.tx, w.ctx, id(fd, "requestId", "request"), {
      status, doneOn, costPaise: cost, toFinance: on(fd, "toFinance"), billFileId, billNo: maybe(fd, "billNo", "Bill number", 40), duplicateReason: maybe(fd, "duplicateReason", "Reason", 200), closingNote: maybe(fd, "closingNote", "Note", 300),
    });
    return { ...r, status, cost };
  }, (r) => r.status === "CANCELLED" ? `${r.request.number} cancelled.`
    : `${r.request.number} closed${r.cost ? ` with cost ${formatRupees(r.cost)}` : ""}.${r.expenseId ? ` The cost is in Finance as an expense${r.outcome === "waiting" ? ", waiting for approval" : ""}.` : ""}`);
}

/* ---------- Labs ---------- */

export async function saveExperimentAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.rooms, "change the experiments list");
    const e = await saveExperiment(w.tx, w.ctx, { id: optionalId(fd, "experimentId"), classId: id(fd, "classId", "class"), subject: text(fd, "subject", "Subject", { max: 60 }), title: text(fd, "title", "Experiment", { max: 160 }), roomId: optionalId(fd, "labId"), materials: maybe(fd, "materials", "Materials", 500) });
    return e.title;
  }, (t) => `${t} saved.`);
}

export async function archiveExperimentAction(_p: S, fd: FormData): Promise<S> {
  return invAction("archive", fd, async (w) => {
    need(w.can.rooms, "change the experiments list");
    await archiveExperiment(w.tx, w.ctx, id(fd, "experimentId", "experiment"));
  }, () => "Experiment taken off the list.");
}

export async function safetyCheckAction(_p: S, fd: FormData): Promise<S> {
  return invAction("create", fd, async (w) => {
    need(w.can.rooms, "record lab safety checks");
    return recordSafetyCheck(w.tx, w.ctx, { roomId: id(fd, "labId", "lab"), date: isoDate(fd, "date", "Date")!, passed: fd.getAll("passed").map(String), note: maybe(fd, "note", "Note", 500), today: w.today });
  }, (r) => (r.failed ? `${r.room.name}: ${r.failed} issue${r.failed === 1 ? "" : "s"} recorded. The store keeper is told.` : `${r.room.name}: every check passed.`));
}
