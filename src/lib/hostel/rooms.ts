// Rooms & Beds (15 §2): rooms on a hostel's floors, each with its numbered
// beds, and the bed occupancy view: every bed free, taken or blocked for
// repair, with totals by hostel. A room is added with N beds in one step.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { HostelProblem } from "./problem";
import { bedWords } from "./words";

export type RoomInput = { hostelId: string; floor: string; roomNo: string; beds: number; roomType: string | null };

export async function addRoom(tx: Tx, ctx: SchoolContext, input: RoomInput) {
  const h = await tx.hostel.findFirst({ where: { id: input.hostelId, archivedAt: null } });
  if (!h) throw new HostelProblem("Choose a hostel.", "hostelId");
  if (!h.floors.includes(input.floor)) throw new HostelProblem(`Choose one of ${h.name}'s floors.`, "floor");
  const roomNo = input.roomNo.trim().replace(/\s+/g, " ").toUpperCase();
  if (!roomNo) throw new HostelProblem("Room number is needed.", "roomNo");
  if (roomNo.length > 12) throw new HostelProblem("A room number can be at most 12 characters.", "roomNo");
  if (!Number.isInteger(input.beds) || input.beds < 1 || input.beds > 12) throw new HostelProblem("A room has 1 to 12 beds.", "beds");
  const clash = await tx.hostelRoom.findFirst({ where: { hostelId: h.id, roomNo: { equals: roomNo, mode: "insensitive" }, releasedAt: null } });
  if (clash) throw new HostelProblem(clash.archivedAt ? `Room ${clash.roomNo} was closed earlier in ${h.name}. Use another number.` : `Room ${clash.roomNo} is already in ${h.name}.`, "roomNo");
  const room = await tx.hostelRoom.create({
    data: {
      schoolId: ctx.schoolId, hostelId: h.id, floor: input.floor, roomNo, roomType: input.roomType, createdById: ctx.userId,
      beds: { create: Array.from({ length: input.beds }, (_, i) => ({ schoolId: ctx.schoolId, hostelId: h.id, bedNo: i + 1 })) },
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Hostel Room", recordId: room.id, after: { hostel: h.name, floor: input.floor, room: roomNo, beds: input.beds, type: input.roomType } });
  return room;
}

/** Changes a room's type, or its number of beds (beds are added at the end; only free beds at the end are taken away). */
export async function updateRoom(tx: Tx, ctx: SchoolContext, roomId: string, input: { roomType: string | null; beds: number }) {
  const room = await tx.hostelRoom.findFirst({ where: { id: roomId, archivedAt: null }, include: { beds: { where: { archivedAt: null }, orderBy: { bedNo: "asc" } } } });
  if (!room) throw new HostelProblem("This room was not found.");
  if (!Number.isInteger(input.beds) || input.beds < 1 || input.beds > 12) throw new HostelProblem("A room has 1 to 12 beds.", "beds");
  const have = room.beds.length;
  if (input.beds > have) {
    const top = Math.max(0, ...(await tx.hostelBed.findMany({ where: { roomId: room.id }, select: { bedNo: true } })).map((b) => b.bedNo));
    await tx.hostelBed.createMany({ data: Array.from({ length: input.beds - have }, (_, i) => ({ schoolId: ctx.schoolId, hostelId: room.hostelId, roomId: room.id, bedNo: top + i + 1 })) });
  } else if (input.beds < have) {
    const drop = room.beds.slice(input.beds);
    const taken = await tx.bedAllocation.count({ where: { bedId: { in: drop.map((b) => b.id) }, status: "ACTIVE" } });
    if (taken) throw new HostelProblem(`A student has one of the last ${drop.length === 1 ? "bed" : `${drop.length} beds`}. Move them first, then remove the bed.`, "beds");
    await tx.hostelBed.updateMany({ where: { id: { in: drop.map((b) => b.id) } }, data: { archivedAt: new Date() } });
  }
  await tx.hostelRoom.update({ where: { id: room.id }, data: { roomType: input.roomType } });
  await writeAudit(tx, ctx, { action: "updated", recordType: "Hostel Room", recordId: room.id, before: { type: room.roomType, beds: have }, after: { type: input.roomType, beds: input.beds } });
}

/** Closes an empty room (archived with its beds, never deleted). */
export async function closeRoom(tx: Tx, ctx: SchoolContext, roomId: string, reason: string) {
  const room = await tx.hostelRoom.findFirst({ where: { id: roomId, archivedAt: null } });
  if (!room) throw new HostelProblem("This room was not found.");
  if (reason.trim().length < 5) throw new HostelProblem("Give a reason of at least 5 characters.", "reason");
  const taken = await tx.bedAllocation.count({ where: { roomId: room.id, status: "ACTIVE" } });
  if (taken) throw new HostelProblem(`${taken} student${taken === 1 ? " sleeps" : "s sleep"} in Room ${room.roomNo}. Move them first.`);
  const now = new Date();
  await tx.hostelBed.updateMany({ where: { roomId: room.id, archivedAt: null }, data: { archivedAt: now } });
  await tx.hostelRoom.update({ where: { id: room.id }, data: { archivedAt: now } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Hostel Room", recordId: room.id, before: { room: room.roomNo }, after: { reason: reason.trim() } });
}

/** Blocks a free bed (for repair) or unblocks it, with a reason. */
export async function setBedBlocked(tx: Tx, ctx: SchoolContext, bedId: string, block: boolean, reason: string) {
  const bed = await tx.hostelBed.findFirst({ where: { id: bedId, archivedAt: null }, include: { room: true } });
  if (!bed) throw new HostelProblem("This bed was not found.");
  if (reason.trim().length < 3) throw new HostelProblem(block ? "Say what needs repair, such as Broken plank." : "Say what was done, such as Plank replaced.", "reason");
  const where = bedWords(bed.room.roomNo, bed.bedNo);
  if (block) {
    if (bed.blockedAt) throw new HostelProblem(`${where} is already blocked.`);
    const taken = await tx.bedAllocation.findFirst({ where: { bedId: bed.id, status: "ACTIVE" } });
    if (taken) throw new HostelProblem(`A student has ${where}. Move them to another bed first, then block it.`);
    await tx.hostelBed.update({ where: { id: bed.id }, data: { blockedAt: new Date(), blockedReason: reason.trim(), blockedById: ctx.userId } });
  } else {
    if (!bed.blockedAt) throw new HostelProblem(`${where} is not blocked.`);
    await tx.hostelBed.update({ where: { id: bed.id }, data: { blockedAt: null, blockedReason: null, blockedById: null } });
  }
  await writeAudit(tx, ctx, { action: block ? "blocked" : "unblocked", recordType: "Bed", recordId: bed.id, before: { bed: where, blocked: Boolean(bed.blockedAt), reason: bed.blockedReason }, after: { reason: reason.trim() } });
  return { where };
}

export type BedCell = { id: string; bedNo: number; state: "free" | "taken" | "blocked"; blockedReason: string | null; allocationId: string | null; studentId: string | null };
export type RoomCell = { id: string; hostelId: string; floor: string; roomNo: string; roomType: string | null; beds: BedCell[] };

/** Every room of these hostels with its beds and who has each bed. */
export async function roomGrid(tx: Tx, hostelIds: string[]): Promise<RoomCell[]> {
  if (!hostelIds.length) return [];
  const [rooms, active] = await Promise.all([
    tx.hostelRoom.findMany({ where: { hostelId: { in: hostelIds }, archivedAt: null }, include: { beds: { where: { archivedAt: null }, orderBy: { bedNo: "asc" } } } }),
    tx.bedAllocation.findMany({ where: { hostelId: { in: hostelIds }, status: "ACTIVE" }, select: { id: true, bedId: true, studentId: true } }),
  ]);
  const byBed = new Map(active.map((a) => [a.bedId, a]));
  const natural = new Intl.Collator("en", { numeric: true });
  return rooms
    .sort((a, b) => natural.compare(a.roomNo, b.roomNo))
    .map((r) => ({
      id: r.id, hostelId: r.hostelId, floor: r.floor, roomNo: r.roomNo, roomType: r.roomType,
      beds: r.beds.map((b) => {
        const a = byBed.get(b.id);
        return { id: b.id, bedNo: b.bedNo, state: a ? "taken" : b.blockedAt ? "blocked" : "free", blockedReason: b.blockedReason, allocationId: a?.id ?? null, studentId: a?.studentId ?? null } as BedCell;
      }),
    }));
}

/** Beds, taken, free and blocked for each hostel (totals only: safe for every hostel). */
export async function occupancy(tx: Tx, hostelIds?: string[]) {
  const where = { archivedAt: null, ...(hostelIds ? { hostelId: { in: hostelIds } } : {}) };
  const [beds, blocked, taken, hostels] = await Promise.all([
    tx.hostelBed.groupBy({ by: ["hostelId"], where: { ...where, room: { archivedAt: null } }, _count: { _all: true } }),
    tx.hostelBed.groupBy({ by: ["hostelId"], where: { ...where, room: { archivedAt: null }, blockedAt: { not: null } }, _count: { _all: true } }),
    tx.bedAllocation.groupBy({ by: ["hostelId"], where: { status: "ACTIVE", ...(hostelIds ? { hostelId: { in: hostelIds } } : {}) }, _count: { _all: true } }),
    tx.hostel.findMany({ where: { archivedAt: null, ...(hostelIds ? { id: { in: hostelIds } } : {}) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const n = (rows: { hostelId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.hostelId === id)?._count._all ?? 0;
  const rows = hostels.map((h) => {
    const total = n(beds, h.id);
    const t = n(taken, h.id);
    const b = n(blocked, h.id);
    return { hostel: h, beds: total, taken: t, blocked: b, free: Math.max(0, total - t - b) };
  });
  const sum = (k: "beds" | "taken" | "blocked" | "free") => rows.reduce((s, r) => s + r[k], 0);
  return { rows, total: { beds: sum("beds"), taken: sum("taken"), blocked: sum("blocked"), free: sum("free") } };
}

/** The first free bed of a hostel (by room number, then bed), for the Allocate form. */
export async function firstFreeBed(tx: Tx, hostelId: string, roomType?: string | null) {
  const grid = await roomGrid(tx, [hostelId]);
  for (const r of grid) {
    if (roomType && r.roomType !== roomType) continue;
    const b = r.beds.find((x) => x.state === "free");
    if (b) return { room: r, bed: b };
  }
  return null;
}
