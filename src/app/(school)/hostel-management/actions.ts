"use server";

// Hostel Management's server actions (15 §2). Each checks the person's role
// on the server (requireAction, then what their page lets them do), works in
// the person's own hostel only when they are a warden, runs inside the
// school's walls and answers in plain words.

import type { FormState } from "@/lib/forms";
import { formatRupees } from "@/lib/format";
import { canDecide, decide } from "@/lib/approvals";
import { DOCUMENT_TYPES, IMAGE_TYPES, saveFile } from "@/lib/files";
import { instantOf } from "@/lib/front-office/time";
import { currentYear, currentYears } from "@/lib/academic/years";
import { findStudents } from "@/lib/students/find";
import { personCampusId } from "@/lib/campus";
import {
  hostelAction, inHostel, need, str, id, optionalId, ids, text, maybe, int, money, isoDate, minute, on, HostelProblem, UUID_RE, type HostelWork,
} from "@/lib/hostel/act";
import { assertHostel } from "@/lib/hostel/scope";
import {
  addFloor, addHostel, archiveFeePlan, closeHostel, saveFeePlan, saveMeals, saveMessages, saveRules, saveTimings, setWardens, updateHostel, type InstallmentInput,
} from "@/lib/hostel/settings";
import { addRoom, closeRoom, setBedBlocked, updateRoom } from "@/lib/hostel/rooms";
import { allocate, checkIn, checkOut, moveBed, studentsInfo } from "@/lib/hostel/allocation";
import { cancelPass, markOut, markReturned, requestPass } from "@/lib/hostel/outings";
import { authorisedList, recordVisitor, visitorOut } from "@/lib/hostel/visitors";
import { remindRollCall, saveRollCall } from "@/lib/hostel/rollcall";
import { recordIncident } from "@/lib/hostel/incidents";
import { INVENTORY, raiseFromIncident, type Priority, type RaiseFromIncident } from "@/lib/hostel/maintenance";
import { copyMenu, recordMessExpense, saveHeadCount, saveMenuItem } from "@/lib/hostel/mess";
import { wardenLogins } from "@/lib/hostel/settings";
import { notify } from "@/lib/notifications";
import { writeAudit } from "@/lib/audit";
import { BASE, INCIDENT_TYPE, OUTING_TYPE, ROOM_TYPES, plural, type Gender, type IncidentType, type OutingType } from "@/lib/hostel/words";

type S<T = unknown> = FormState<T>;

const inMine = (w: HostelWork) => (hostelId: string | null) => assertHostel(w.mine, hostelId);

/** A date and a time typed in a form ("2026-10-15" and "18:00"), as the moment in the school's time zone. */
function moment(fd: FormData, w: HostelWork, dayKey: string, timeKey: string, label: string) {
  const d = isoDate(fd, dayKey, `${label} date`)!;
  const m = minute(fd, timeKey, `${label} time`);
  return instantOf(d.toISOString().slice(0, 10), m, w.tz);
}

async function roomInScope(w: HostelWork, roomId: string) {
  const room = await w.tx.hostelRoom.findFirst({ where: { id: roomId, archivedAt: null } });
  if (!room) throw new HostelProblem("This room was not found.");
  assertHostel(w.mine, room.hostelId);
  return room;
}

/* ---------- Finding students in forms ---------- */

/** `campusId`: the student's campus, so the bed sheet offers the fee plans of that campus's year. */
export type FoundStudent = { id: string; name: string; admissionNo: string; cls: string; gender: Gender | null; bed: string | null; hostelId: string | null; campusId?: string | null };

/**
 * Students for the pickers: "new" finds studying students without a bed (for
 * Allocate); "resident" finds students living in the person's own hostels.
 */
export async function findStudentsAction(q: string, mode: "new" | "resident"): Promise<FoundStudent[]> {
  const term = String(q ?? "").trim().slice(0, 60);
  if (term.length < 2) return [];
  try {
    return await inHostel("view", async (w) => {
      if (mode === "new" && !w.can.allocate) return [];
      if (mode === "resident" && !(w.can.outings || w.can.rollcall || w.can.allocate)) return [];
      const active = await w.tx.bedAllocation.findMany({ where: { status: "ACTIVE" }, select: { studentId: true, hostelId: true, roomId: true, bedId: true } });
      const activeBy = new Map(active.map((a) => [a.studentId, a]));
      // The one student search, among students without a bed, or living in the person's own hostels.
      // Each student's class in their own campus's current year.
      const yearIds = (await currentYears(w.tx, w.ctx)).map((y) => y.id);
      const rows = mode === "new"
        ? await findStudents(w.tx, term, { scope: {}, where: { id: { notIn: active.map((a) => a.studentId) } }, yearId: yearIds, statuses: ["ACTIVE"], take: 12 })
        : await findStudents(w.tx, term, { scope: {}, where: { id: { in: active.filter((a) => w.mine === null || w.mine.includes(a.hostelId)).map((a) => a.studentId) } }, yearId: yearIds, statuses: "any", take: 12 });
      const info = await studentsInfo(w.tx, w.ctx, rows.map((r) => r.id));
      const rooms = await w.tx.hostelRoom.findMany({ where: { id: { in: rows.map((r) => activeBy.get(r.id)?.roomId).filter((x): x is string => Boolean(x)) } }, select: { id: true, roomNo: true } });
      const beds = await w.tx.hostelBed.findMany({ where: { id: { in: rows.map((r) => activeBy.get(r.id)?.bedId).filter((x): x is string => Boolean(x)) } }, select: { id: true, bedNo: true } });
      return rows.map((r) => {
        const s = info.get(r.id)!;
        const a = activeBy.get(r.id);
        const room = a ? rooms.find((x) => x.id === a.roomId) : null;
        const bed = a ? beds.find((x) => x.id === a.bedId) : null;
        const g = (s.gender ?? "").toLowerCase();
        return { id: s.id, name: s.name, admissionNo: s.admissionNo, cls: s.classSection ?? "", gender: (["male", "m", "boy"].includes(g) ? "BOYS" : ["female", "f", "girl"].includes(g) ? "GIRLS" : null) as Gender | null, bed: room && bed ? `Room ${room.roomNo}, Bed ${bed.bedNo}` : null, hostelId: a?.hostelId ?? null, campusId: s.campusId };
      });
    });
  } catch {
    return [];
  }
}

export type GuardianChoice = { guardianId: string; name: string; relation: string; phone: string; allowed: boolean; restriction: string | null };

/** A resident's guardians and authorised list (who can take them out or visit). */
export async function guardiansAction(studentId: string): Promise<GuardianChoice[]> {
  if (!/^[0-9a-f-]{36}$/i.test(String(studentId ?? ""))) return [];
  try {
    return await inHostel("view", async (w) => {
      if (!(w.can.outings || w.can.allocate)) return [];
      const a = await w.tx.bedAllocation.findFirst({ where: { studentId, status: "ACTIVE" }, select: { hostelId: true } });
      if (!a || (w.mine !== null && !w.mine.includes(a.hostelId))) return [];
      const list = await authorisedList(w.tx, studentId);
      return list.map((g) => ({ guardianId: g.guardianId, name: g.name, relation: g.relation, phone: g.phone, allowed: g.allowed, restriction: g.restriction }));
    });
  } catch {
    return [];
  }
}

/* ---------- Rooms & Beds ---------- */

export async function addRoomAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("create", fd, async (w) => {
    need(w.can.rooms, "add rooms");
    const hostelId = id(fd, "hostelId", "hostel");
    assertHostel(w.mine, hostelId);
    const type = str(fd, "roomType");
    const room = await addRoom(w.tx, w.ctx, { hostelId, floor: text(fd, "floor", "Floor", { max: 30 }), roomNo: text(fd, "roomNo", "Room number", { max: 12 }), beds: int(fd, "beds", "Beds", { min: 1, max: 12 }), roomType: type ? text(fd, "roomType", "Room type", { max: 30 }) : null });
    const beds = await w.tx.hostelBed.count({ where: { roomId: room.id } });
    return { room: room.roomNo, beds };
  }, (r) => `Room ${r.room} added with ${plural(r.beds, "bed")}.`);
}

export async function updateRoomAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.rooms, "change rooms");
    const room = await roomInScope(w, id(fd, "roomId", "room"));
    const type = str(fd, "roomType");
    await updateRoom(w.tx, w.ctx, room.id, { roomType: type ? text(fd, "roomType", "Room type", { max: 30 }) : null, beds: int(fd, "beds", "Beds", { min: 1, max: 12 }) });
    return room.roomNo;
  }, (no) => `Room ${no} saved.`);
}

export async function closeRoomAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.rooms, "close rooms");
    const room = await roomInScope(w, id(fd, "roomId", "room"));
    await closeRoom(w.tx, w.ctx, room.id, text(fd, "reason", "Reason", { min: 5, max: 200 }));
    return room.roomNo;
  }, (no) => `Room ${no} closed. Its history is kept.`);
}

export async function addFloorAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.rooms, "add floors");
    const hostelId = id(fd, "hostelId", "hostel");
    assertHostel(w.mine, hostelId);
    const floor = text(fd, "floor", "Floor name", { max: 30 });
    const h = await addFloor(w.tx, w.ctx, hostelId, floor);
    return { floor, hostel: h.name };
  }, (r) => `${r.floor} floor added to ${r.hostel}. Now add rooms on it.`);
}

export async function blockBedAction(_p: S, fd: FormData): Promise<S> {
  const block = str(fd, "block") !== "no";
  return hostelAction("edit", fd, async (w) => {
    need(w.can.rooms, "block beds");
    const bed = await w.tx.hostelBed.findFirst({ where: { id: id(fd, "bedId", "bed"), archivedAt: null } });
    if (!bed) throw new HostelProblem("This bed was not found.");
    assertHostel(w.mine, bed.hostelId);
    return setBedBlocked(w.tx, w.ctx, bed.id, block, text(fd, "reason", "Reason", { min: block ? 5 : 3, max: 200 }));
  }, (r) => (block ? `${r.where} blocked for repair.` : `${r.where} is free again.`));
}

/** Adds a hostel or changes one (never the warden: the Principal's or School Admin's). */
export async function saveHostelAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.hostels, "add or change hostels");
    const gender = str(fd, "gender") === "GIRLS" ? "GIRLS" : str(fd, "gender") === "BOYS" ? "BOYS" : null;
    if (!gender) throw new HostelProblem("Choose boys or girls.", "gender");
    const input = { name: text(fd, "name", "Hostel name", { min: 3, max: 60 }), gender: gender as Gender, floors: str(fd, "floors").split(/[,\n]/), note: maybe(fd, "note", "Note", 300) };
    const hostelId = optionalId(fd, "hostelId");
    const h = hostelId ? await updateHostel(w.tx, w.ctx, hostelId, input) : await addHostel(w.tx, w.ctx, input);
    return { name: h.name, added: !hostelId };
  }, (r) => (r.added ? `${r.name} added. Choose its wardens, then add rooms.` : `${r.name} saved.`));
}

export async function closeHostelAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.hostels, "close hostels");
    const h = await w.tx.hostel.findFirst({ where: { id: id(fd, "hostelId", "hostel"), archivedAt: null } });
    if (!h) throw new HostelProblem("This hostel was not found.");
    await closeHostel(w.tx, w.ctx, h.id, text(fd, "reason", "Reason", { min: 5, max: 200 }));
    return h.name;
  }, (n) => `${n} closed. Its rooms, residents and roll calls stay in the history.`);
}

export async function setWardensAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.hostels, "choose wardens");
    const hostelId = id(fd, "hostelId", "hostel");
    const staffIds = ids(fd, "staffId");
    const titles = fd.getAll("title").map((t) => String(t).trim().slice(0, 40));
    const all = fd.getAll("staffId").map((x) => String(x));
    const list = staffIds.map((s) => ({ staffId: s, title: titles[all.indexOf(s)] || "Warden" }));
    if (!list.length) throw new HostelProblem("Choose at least one warden. A hostel needs someone to take roll call and approve outings.", "wardens");
    await setWardens(w.tx, w.ctx, hostelId, list, w.today);
    const h = await w.tx.hostel.findUniqueOrThrow({ where: { id: hostelId } });
    const missing = (await w.tx.staff.findMany({ where: { id: { in: staffIds } }, select: { userLoginId: true } })).filter((s) => !s.userLoginId).length;
    return { name: h.name, n: list.length, missing };
  }, (r) => `${plural(r.n, "warden")} set for ${r.name}.${r.missing ? ` ${plural(r.missing, "warden")} ${r.missing === 1 ? "has" : "have"} no School OS login yet, so cannot approve outings; add one in Staff & HR.` : ""}`);
}

/* ---------- Allocation ---------- */

export async function allocateAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("create", fd, async (w) => {
    need(w.can.allocate, "give beds");
    const studentId = id(fd, "studentId", "student");
    const plan = str(fd, "feePlanId");
    if (!plan) throw new HostelProblem("Choose the hostel fee plan, or No hostel fees.", "feePlanId");
    const r = await allocate(w.tx, w.ctx, {
      studentId, bedId: id(fd, "bedId", "bed"), startDate: isoDate(fd, "startDate", "Check-in date")!, checkedIn: on(fd, "checkedIn"),
      feePlanId: plan === "none" ? "none" : id(fd, "feePlanId", "fee plan"), note: maybe(fd, "note", "Note", 300),
    }, { now: w.now, assertHostel: inMine(w) });
    return { name: r.student.fullName, where: r.where, hostel: r.hostel.name, fees: r.fees.rows ? (w.can.seeFees ? `${formatRupees(r.fees.total)} hostel fees added to their fees` : "hostel fees added to their fees") : null, checkedIn: on(fd, "checkedIn") };
  }, (r) => `${r.name} has ${r.where}, ${r.hostel}${r.checkedIn ? ", checked in" : ""}.${r.fees ? ` ${r.fees[0].toUpperCase()}${r.fees.slice(1)}.` : ""}`);
}

export async function checkInAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.allocate, "check students in");
    const date = str(fd, "date") ? moment(fd, w, "date", "time", "Check-in") : w.now;
    if (date.getTime() > w.now.getTime() + 5 * 60_000) throw new HostelProblem("Check-in cannot be in the future.", "time");
    return checkIn(w.tx, w.ctx, id(fd, "allocationId", "student"), date, inMine(w));
  }, (r) => `${r.name} checked in.`);
}

export async function moveAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.allocate, "move students");
    const r = await moveBed(w.tx, w.ctx, { allocationId: id(fd, "allocationId", "student"), bedId: id(fd, "bedId", "bed"), date: isoDate(fd, "date", "Move date")!, reason: text(fd, "reason", "Reason", { min: 3, max: 200 }) }, { now: w.now, assertHostel: inMine(w) });
    return { ...r, fee: r.feeChange && w.can.seeFees ? `Hostel fees changed: ${formatRupees(r.feeChange.stopped)} stopped, ${formatRupees(r.feeChange.added)} added.` : r.feeChange ? "Hostel fees changed to the new room's plan." : "" };
  }, (r) => `${r.name} moved from ${r.from} to ${r.to}. ${r.fee}`.trim());
}

export async function checkoutAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.allocate, "check students out");
    const date = isoDate(fd, "date", "Check-out date")!;
    if (date.getTime() > w.today.getTime() + 30 * 86_400_000) throw new HostelProblem("Check-out can be at most 30 days ahead.", "date");
    const r = await checkOut(w.tx, w.ctx, { allocationId: id(fd, "allocationId", "student"), date, reason: text(fd, "reason", "Reason", { min: 3, max: 200 }) }, { now: w.now, assertHostel: inMine(w) });
    const fees = !r.fees.stoppedRows ? "" : w.can.seeFees ? ` ${formatRupees(r.fees.stopped)} of later hostel fees stopped.` : " Later hostel fees stopped.";
    const due = r.dueBefore > BigInt(0) ? (w.can.seeFees ? ` ${formatRupees(r.dueBefore)} hostel fees still due: collect them in Fee Management.` : " Hostel fees are still due; the office collects them.") : "";
    return `${r.name} checked out. ${r.where} is free now.${fees}${due}`;
  }, (m) => m);
}

/* ---------- Roll call and incidents ---------- */

export async function saveRollCallAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.rollcall, "take roll call");
    const hostelId = id(fd, "hostelId", "hostel");
    assertHostel(w.mine, hostelId);
    const session = str(fd, "session") === "NIGHT" ? "NIGHT" : "MORNING";
    return saveRollCall(w.tx, w.ctx, { hostelId, date: isoDate(fd, "date", "Date")!, session, absentIds: ids(fd, "absent") }, { now: w.now, tz: w.tz, today: w.today });
  }, (r) => ({
    message: `${r.hostel.name}: roll call saved. ${r.present} present, ${r.absent} absent${r.away ? `, ${r.away} away on passes` : ""}.${r.alerted ? ` The warden${r.alerted > 1 ? "s and the Principal were" : " was"} alerted.` : ""}`,
    tone: r.absent && r.alerted ? "danger" : undefined,
  }));
}

export async function remindRollCallAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("view", fd, async (w) => {
    need(w.can.remind, "remind the warden");
    const session = str(fd, "session") === "NIGHT" ? "NIGHT" : "MORNING";
    return remindRollCall(w.tx, w.ctx, id(fd, "hostelId", "hostel"), isoDate(fd, "date", "Date")!, session);
  }, (r) => `Reminder sent to ${r.people === 1 ? "the warden" : `${r.people} wardens`} of ${r.hostel}.`);
}

/** A leader's reminder to a hostel's wardens about late returns or passes waiting. */
export async function remindWardenAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("view", fd, async (w) => {
    need(w.can.remind, "remind the warden");
    const hostelId = id(fd, "hostelId", "hostel");
    const h = await w.tx.hostel.findFirst({ where: { id: hostelId, archivedAt: null } });
    if (!h) throw new HostelProblem("This hostel was not found.");
    const what = str(fd, "what");
    const words = what === "late" ? "Please follow up on the students not back from their outing." : what === "waiting" ? "Outing passes are waiting for your approval." : "Please check the hostel's open items.";
    const people = await wardenLogins(w.tx, hostelId);
    if (!people.length) throw new HostelProblem(`${h.name} has no warden with a School OS login. Set its wardens in Hostel Settings.`);
    for (const to of people) await notify(w.tx, w.ctx, { to, type: "hostel", text: `${w.current.user.displayName}: ${words}`, link: `${BASE}/outings`, groupKey: `hostel-remind-${what}-${hostelId}-${w.today.toISOString().slice(0, 10)}` });
    await writeAudit(w.tx, w.ctx, { action: "reminded", recordType: "Hostel", recordId: hostelId, after: { what, to: people.length } });
    return { hostel: h.name, n: people.length };
  }, (r) => `Reminder sent to ${r.n === 1 ? "the warden" : `${r.n} wardens`} of ${r.hostel}.`);
}

export async function recordIncidentAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("create", fd, async (w) => {
    need(w.can.rollcall, "record incidents");
    const type = (["DISCIPLINE", "MEDICAL", "MAINTENANCE"].includes(str(fd, "type")) ? str(fd, "type") : "DISCIPLINE") as IncidentType;
    const at = moment(fd, w, "date", "time", "Incident");
    const behaviour = str(fd, "behaviourTypeKey");
    const mayAddBehaviour = (w.current.permissions["student-management"]?.change ?? "none") !== "none";
    const r = await recordIncident(w.tx, w.ctx, {
      type, studentIds: ids(fd, "studentIds"), hostelId: optionalId(fd, "hostelId"), place: maybe(fd, "place", "Place", 120), description: text(fd, "description", "What happened", { min: 3, max: 2000 }),
      at, actionTaken: maybe(fd, "actionTaken", "Action taken", 1000), informParent: on(fd, "informParent"), behaviourTypeKey: type === "DISCIPLINE" && behaviour ? behaviour : null,
    }, { now: w.now, tz: w.tz, assertHostel: inMine(w), mayAddBehaviour });
    // A maintenance incident can raise the Inventory maintenance request in the same step.
    let request: string | null = null;
    if (type === "MAINTENANCE" && on(fd, "raiseRequest") && w.current.modulesOn.has(INVENTORY)) {
      const raised = await raiseFromIncident(w.tx, w.ctx, r.incident.id, await requestInput(w, fd), { assertHostel: inMine(w), inventoryOn: true });
      request = raised.request.number;
    }
    return { no: r.incident.incidentNo, type: INCIDENT_TYPE[type].label, told: r.told, behaviour: Boolean(r.behaviourId), request };
  }, (r) => `${r.type} incident ${r.no} recorded.${r.request ? ` Maintenance request ${r.request} sent to the store keeper.` : ""}${r.behaviour ? " Added to the behaviour record." : ""}${r.told ? ` ${r.told === 1 ? "The parents were" : `${r.told} families were`} told.` : ""}`);
}

/** The place, priority and photo of a maintenance request typed on a hostel form. */
async function requestInput(w: HostelWork, fd: FormData): Promise<RaiseFromIncident> {
  const place = str(fd, "placeId");
  if (!place || !(place.startsWith("hostel:") ? UUID_RE.test(place.slice(7)) : UUID_RE.test(place))) throw new HostelProblem("Choose the place.", "placeId");
  const priority = (["LOW", "NORMAL", "HIGH", "URGENT"].includes(str(fd, "priority")) ? str(fd, "priority") : "NORMAL") as Priority;
  const photo = fd.get("photo");
  const photoFileId = photo instanceof File && photo.size > 0 ? (await saveFile(w.tx, w.ctx, { file: photo, purpose: "maintenance-photo", allowed: IMAGE_TYPES, maxImageWidth: 1600 })).id : null;
  return { placeId: place, priority, photoFileId };
}

/** Raises the maintenance request for a maintenance incident recorded earlier. */
export async function raiseMaintenanceAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("create", fd, async (w) => {
    need(w.can.rollcall, "raise maintenance requests");
    const r = await raiseFromIncident(w.tx, w.ctx, id(fd, "incidentId", "incident"), await requestInput(w, fd), { assertHostel: inMine(w), inventoryOn: w.current.modulesOn.has(INVENTORY) });
    return { request: r.request.number, no: r.incident.incidentNo, place: r.room.name };
  }, (r) => `Maintenance request ${r.request} raised for ${r.no} (${r.place}). The store keeper is told.`);
}

/* ---------- Outing & Visitors ---------- */

export async function requestPassAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("create", fd, async (w) => {
    need(w.can.outings, "make outing passes");
    const type = (str(fd, "outingType") === "LEAVE" ? "LEAVE" : "OUTING") as OutingType;
    const fromAt = moment(fd, w, "fromDate", "fromTime", "From");
    const toAt = moment(fd, w, type === "LEAVE" ? "toDate" : "fromDate", "toTime", "Back by");
    const guardianId = str(fd, "guardianId") && str(fd, "guardianId") !== "other" ? id(fd, "guardianId", "person") : null;
    const r = await requestPass(w.tx, w.ctx, {
      studentId: id(fd, "studentId", "student"), outingType: type, fromAt, toAt, guardianId,
      withName: guardianId ? null : maybe(fd, "withName", "Name", 80), withRelation: guardianId ? null : maybe(fd, "withRelation", "Relation", 30), withPhone: guardianId ? null : maybe(fd, "withPhone", "Phone", 20),
      reason: text(fd, "reason", "Reason", { min: 3, max: 200 }),
    }, { now: w.now, tz: w.tz, assertHostel: inMine(w) });
    return { passNo: r.pass.passNo, name: r.name, approver: r.approver, type: OUTING_TYPE[type].label };
  }, (r) => `${r.type} pass ${r.passNo} for ${r.name} sent to ${r.approver} for approval.`);
}

/** The approver decides a pass right on the list (the same decision as in Approvals; never your own request). */
export async function decidePassAction(_p: S, fd: FormData): Promise<S> {
  let decision: "approve" | "reject" = "approve";
  return hostelAction("view", fd, async (w) => {
    const pass = await w.tx.gatePass.findFirst({ where: { id: id(fd, "passId", "pass"), kind: "HOSTEL_OUTING", archivedAt: null } });
    if (!pass?.approvalId || pass.status !== "WAITING") throw new HostelProblem("This pass is not waiting for approval.");
    const approval = await w.tx.approval.findFirst({ where: { id: pass.approvalId } });
    if (!approval || !(await canDecide(w.tx, w.ctx, approval))) throw new HostelProblem(approval?.askedById === w.ctx.userId ? "You asked for this pass, so someone else approves it." : "This pass is waiting for someone else's approval.");
    decision = str(fd, "decision") === "reject" ? "reject" : "approve";
    await decide(w.tx, w.ctx, approval.id, decision, decision === "reject" ? text(fd, "note", "Reason", { min: 5, max: 300 }) : maybe(fd, "note", "Note", 300));
    return pass.passNo;
  }, (no) => (decision === "approve" ? `Pass ${no} approved. Mark the student out when they leave.` : `Pass ${no} not approved.`));
}

export async function markOutAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.outings, "mark students out");
    return markOut(w.tx, w.ctx, id(fd, "passId", "pass"), { now: w.now, tz: w.tz, assertHostel: inMine(w) });
  }, (r) => `${r.name} marked out on pass ${r.passNo}.${r.told ? " The parents were told." : ""}`);
}

export async function markReturnedAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.outings, "mark students returned");
    return markReturned(w.tx, w.ctx, id(fd, "passId", "pass"), { now: w.now, tz: w.tz, assertHostel: inMine(w) });
  }, (r) => `${r.name} is back in the hostel${r.late ? `, ${r.late >= 60 ? `${Math.floor(r.late / 60)} h ${r.late % 60} min` : `${r.late} min`} late` : ""}.`);
}

export async function cancelPassAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.outings, "cancel passes");
    return cancelPass(w.tx, w.ctx, id(fd, "passId", "pass"), text(fd, "reason", "Reason", { min: 3, max: 200 }), inMine(w));
  }, (r) => `Pass ${r.passNo} cancelled.`);
}

export async function recordVisitorAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("create", fd, async (w) => {
    need(w.can.outings, "record visitors");
    const guardianId = str(fd, "guardianId") && str(fd, "guardianId") !== "other" ? id(fd, "guardianId", "visitor") : null;
    const r = await recordVisitor(w.tx, w.ctx, {
      studentId: str(fd, "studentId") ? id(fd, "studentId", "student") : "", guardianId,
      name: guardianId ? null : maybe(fd, "name", "Visitor's name", 80), relation: guardianId ? null : maybe(fd, "relation", "Relation", 30), phone: guardianId ? null : maybe(fd, "phone", "Phone", 20),
      wardenApproved: on(fd, "wardenApproved"), note: maybe(fd, "note", "Note", 200),
    }, { now: w.now, tz: w.tz, assertHostel: inMine(w) });
    return { name: r.visitor.name, student: r.student.first, passNo: r.visitor.passNo };
  }, (r) => `${r.name} signed in to meet ${r.student}. Visitor pass ${r.passNo}.`);
}

export async function visitorOutAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.outings, "sign visitors out");
    return visitorOut(w.tx, w.ctx, id(fd, "visitorId", "visitor"), { now: w.now, tz: w.tz, assertHostel: inMine(w) });
  }, (r) => `${r.name} signed out.`);
}

/* ---------- Mess ---------- */

export async function saveMenuAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.mess, "set the menu");
    const kcal = str(fd, "kcal") ? int(fd, "kcal", "Calories", { min: 0, max: 3000 }) : null;
    const protein = str(fd, "proteinG") ? int(fd, "proteinG", "Protein", { min: 0, max: 200 }) : null;
    const row = await saveMenuItem(w.tx, w.ctx, { weekStart: isoDate(fd, "week", "Week")!, dayIndex: int(fd, "day", "Day", { min: 0, max: 6 }), meal: text(fd, "meal", "Meal", { max: 30 }), dishes: text(fd, "dishes", "What is served", { max: 200 }), kcal, proteinG: protein, note: maybe(fd, "note", "Nutrition note", 200) });
    return row.meal;
  }, (meal) => `${meal} saved.`);
}

export async function copyMenuAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.mess, "set the menu");
    const to = isoDate(fd, "to", "Week")!;
    const from = isoDate(fd, "from", "Week to copy")!;
    return copyMenu(w.tx, w.ctx, from, to, on(fd, "replace"));
  }, (n) => (n ? `${plural(n, "meal")} copied from last week.` : "Every meal of this week is already set. Nothing was copied."));
}

export async function saveHeadCountAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.mess, "record head counts");
    return saveHeadCount(w.tx, w.ctx, { date: isoDate(fd, "date", "Date")!, meal: text(fd, "meal", "Meal", { max: 30 }), actual: int(fd, "actual", "Plates served", { min: 0, max: 5000 }), note: maybe(fd, "note", "Note", 200) }, { now: w.now, tz: w.tz, today: w.today });
  }, (r) => `${r.meal}: ${r.actual} of ${r.expected} expected.`);
}

export async function messExpenseAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("create", fd, async (w) => {
    need(w.can.mess, "record mess expenses");
    const bill = fd.get("bill");
    const billFileId = bill instanceof File && bill.size > 0 ? (await saveFile(w.tx, w.ctx, { file: bill, purpose: "mess-bill", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 })).id : null;
    const vendorId = optionalId(fd, "vendorId");
    if (vendorId && !(await w.tx.vendor.findFirst({ where: { id: vendorId, archivedAt: null }, select: { id: true } }))) throw new HostelProblem("Choose a vendor from the list.", "vendorId");
    const r = await recordMessExpense(w.tx, w.ctx, { date: isoDate(fd, "date", "Date")!, item: text(fd, "item", "Item or head", { max: 80 }), amountPaise: money(fd, "amount", "Amount")!, vendorId, billFileId, paid: on(fd, "paid"), note: maybe(fd, "note", "Note", 300) }, { today: w.today });
    return { amount: formatRupees(r.row.amountPaise), item: r.row.item, no: r.expense.number, outcome: r.outcome };
  }, (r) => `${r.item}: ${r.amount} recorded as expense ${r.no}${r.outcome === "paid" ? ", paid in cash" : r.outcome === "waiting" ? ", waiting for approval" : ""}. It is in Finance, Expenses.`);
}

/* ---------- Hostel Settings ---------- */

export async function saveRulesAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.settings, "change Hostel Settings");
    await saveRules(w.tx, w.ctx, str(fd, "rules").replace(/\r\n/g, "\n"));
  }, () => "Hostel rules saved.");
}

export async function saveTimingsAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.settings, "change Hostel Settings");
    await saveTimings(w.tx, w.ctx, {
      morningRollMinute: minute(fd, "morning", "Morning roll call"), nightRollMinute: minute(fd, "night", "Night roll call"), outingBackMinute: minute(fd, "outingBack", "Outing back by"),
      visitingDays: fd.getAll("visitingDays").map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      visitingFromMinute: minute(fd, "visitFrom", "Visiting from"), visitingToMinute: minute(fd, "visitTo", "Visiting to"), lateAfterMinutes: int(fd, "lateAfter", "Late alert after", { min: 0, max: 180 }),
    });
  }, () => "Timings saved.");
}

export async function saveMealsAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.settings, "change Hostel Settings");
    await saveMeals(w.tx, w.ctx, str(fd, "meals").split(/[,\n]/));
  }, () => "Meals saved.");
}

export async function saveMessagesAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.settings, "change Hostel Settings");
    await saveMessages(w.tx, w.ctx, { messageOnOut: on(fd, "messageOnOut"), messageOnReturn: on(fd, "messageOnReturn"), messageOnLate: on(fd, "messageOnLate"), messageOnIncident: on(fd, "messageOnIncident"), alertNightAbsent: on(fd, "alertNightAbsent"), alertLate: on(fd, "alertLate") });
  }, () => "Messages and alerts saved.");
}

export async function saveFeePlanAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.feePlans, "set hostel fee plans");
    const planId = optionalId(fd, "planId");
    // A changed plan keeps its own year; a new plan is for the current year of the person's own campus.
    const existing = planId ? await w.tx.hostelFeePlan.findFirst({ where: { id: planId, archivedAt: null }, select: { academicYearId: true } }) : null;
    if (planId && !existing) throw new HostelProblem("This fee plan was not found.");
    const year = existing ? { id: existing.academicYearId } : await currentYear(w.tx, w.ctx, await personCampusId(w.tx, w.ctx, w.current));
    if (!year) throw new HostelProblem("Set up this academic year first (Academic Management).");
    const labels = fd.getAll("instLabel").map((x) => String(x).trim());
    const dues = fd.getAll("instDue").map((x) => String(x).trim());
    const amounts = fd.getAll("instAmount").map((x) => String(x).replace(/[₹,\s]/g, ""));
    const installments: InstallmentInput[] = [];
    labels.forEach((label, i) => {
      if (!label && !dues[i] && !amounts[i]) return;
      const d = new Date(`${dues[i]}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dues[i] ?? "") || Number.isNaN(d.getTime())) throw new HostelProblem(`Installment ${i + 1} needs a due date.`, "installments");
      if (!/^\d+(\.\d{1,2})?$/.test(amounts[i] ?? "")) throw new HostelProblem(`Installment ${i + 1} needs an amount in rupees, like 24000.`, "installments");
      const [r, p = ""] = amounts[i].split(".");
      installments.push({ label, dueDate: d, amountPaise: BigInt(r) * BigInt(100) + BigInt((p + "00").slice(0, 2)) });
    });
    const type = str(fd, "roomType");
    const hostelId = optionalId(fd, "hostelId");
    await saveFeePlan(w.tx, w.ctx, planId, { academicYearId: year.id, name: text(fd, "name", "Plan name", { min: 3, max: 60 }), hostelId, roomType: type && (ROOM_TYPES as readonly string[]).includes(type) ? type : type ? text(fd, "roomType", "Room type", { max: 30 }) : null, includesMess: on(fd, "includesMess"), note: maybe(fd, "note", "Note", 300), installments });
    return { added: !planId };
  }, (r) => (r.added ? "Fee plan added. Students given a bed from now on get these hostel fees." : "Fee plan saved. The change applies to students given a bed from now on."));
}

export async function archiveFeePlanAction(_p: S, fd: FormData): Promise<S> {
  return hostelAction("edit", fd, async (w) => {
    need(w.can.feePlans, "set hostel fee plans");
    await archiveFeePlan(w.tx, w.ctx, id(fd, "planId", "plan"));
  }, () => "Fee plan archived. Fees already added stay as they are.");
}
