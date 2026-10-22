// Importing rooms from a spreadsheet (15 Rooms & Beds, P10): one row per room
// with its hostel, floor, room number, number of beds and room type. Each room
// is added as if typed on Add room (its beds are made and numbered); a floor
// not yet in the hostel is added. Undo closes the rooms and their beds (never
// deletes), only while nobody has a bed in them. A warden brings rooms into
// their own hostel only, and undoes only an import into it, wherever the file
// is brought in (the person is read from the import's own context, so the
// rule holds in the background import too). Imported by
// src/lib/import-registry.ts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineImport, RowProblem } from "../importer";
import { accessIn } from "../auth/access";
import { addRoom, closeRoom } from "./rooms";
import { HostelProblem } from "./problem";
import { hostelViewer } from "./access";
import { myHostelIds, type Mine } from "./scope";

type Row = { hostelId: string; hostelName: string; floor: string; roomNo: string; beds: number; roomType: string | null };

export const ROOMS_IMPORT = "hostel-rooms";

/** The hostels the person bringing the file in works in: null for all (everyone but a warden). */
async function ownHostels(tx: Tx, ctx: SchoolContext): Promise<Mine> {
  if (!ctx.userId) return null;
  const a = await accessIn(ctx.userId, ctx.schoolId);
  if (!a) return [];
  return myHostelIds(tx, ctx, hostelViewer({ permissions: a.permissions, roles: a.roles, user: { id: ctx.userId } }));
}

/** Worked out once for each check of a file (one "seen" set per check). */
const OWN = new WeakMap<Set<string>, Promise<Mine>>();
function ownOnce(tx: Tx, ctx: SchoolContext, seen: Set<string>) {
  let p = OWN.get(seen);
  if (!p) { p = ownHostels(tx, ctx); OWN.set(seen, p); }
  return p;
}

defineImport<Row>({
  key: ROOMS_IMPORT,
  label: "Hostel rooms and beds",
  columns: [
    { key: "hostel", label: "Hostel", required: true, example: "Boys' hostel", help: "The hostel's name, as in Hostel Settings.", aliases: ["hostel name", "block", "building"] },
    { key: "floor", label: "Floor", required: true, example: "Ground", help: "A new floor is added to the hostel if it has none by this name.", aliases: ["floor name", "level"] },
    { key: "room", label: "Room number", required: true, example: "B-01", aliases: ["room", "room no", "room no.", "number"] },
    { key: "beds", label: "Beds", example: "4", help: "1 to 12. Empty means 4.", aliases: ["bed count", "number of beds", "capacity"] },
    { key: "type", label: "Room type", example: "Non-AC", help: "For example AC or Non-AC, when fees differ.", aliases: ["room type", "kind"] },
  ],
  check: async (tx, ctx, row, seen) => {
    const problems: string[] = [];
    const hostelName = (row.hostel ?? "").trim();
    const hostel = hostelName ? await tx.hostel.findFirst({ where: { name: { equals: hostelName, mode: "insensitive" }, archivedAt: null } }) : null;
    if (!hostelName) problems.push("Hostel is needed.");
    else if (!hostel) problems.push(`There is no hostel called “${hostelName}”. Add it in Hostel Settings first.`);
    else {
      const mine = await ownOnce(tx, ctx, seen);
      if (mine && !mine.includes(hostel.id)) problems.push(`You work in your own hostel only, not in ${hostel.name}.`);
    }
    const floor = (row.floor ?? "").trim().replace(/\s+/g, " ");
    if (!floor) problems.push("Floor is needed.");
    if (floor.length > 30) problems.push("A floor name can be at most 30 characters.");
    const roomNo = (row.room ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    if (!roomNo) problems.push("Room number is needed.");
    if (roomNo.length > 12) problems.push("A room number can be at most 12 characters.");
    const bedsRaw = (row.beds ?? "").trim();
    const beds = bedsRaw ? Number(bedsRaw) : 4;
    if (!Number.isInteger(beds) || beds < 1 || beds > 12) problems.push("Beds must be a whole number from 1 to 12.");
    if (hostel && roomNo) {
      const k = `${hostel.id}:${roomNo}`;
      if (seen.has(k)) problems.push(`Room ${roomNo} is twice in the file for ${hostel.name}.`);
      seen.add(k);
      const clash = await tx.hostelRoom.findFirst({ where: { hostelId: hostel.id, roomNo: { equals: roomNo, mode: "insensitive" }, releasedAt: null }, select: { id: true } });
      if (clash) problems.push(`Room ${roomNo} is already in ${hostel.name}.`);
    }
    if (problems.length) return { ok: false, problems };
    return { ok: true, value: { hostelId: hostel!.id, hostelName: hostel!.name, floor, roomNo, beds, roomType: row.type?.trim() || null } };
  },
  save: async (tx, ctx, v) => {
    const h = await tx.hostel.findFirst({ where: { id: v.hostelId, archivedAt: null } });
    if (!h) throw new RowProblem(`${v.roomNo}: the hostel ${v.hostelName} is closed.`);
    const floor = h.floors.find((f) => f.toLowerCase() === v.floor.toLowerCase());
    if (!floor) await tx.hostel.update({ where: { id: h.id }, data: { floors: [...h.floors, v.floor] } });
    try {
      const room = await addRoom(tx, ctx, { hostelId: h.id, floor: floor ?? v.floor, roomNo: v.roomNo, beds: v.beds, roomType: v.roomType });
      return { id: room.id, created: true };
    } catch (err) {
      if (err instanceof HostelProblem) throw new RowProblem(`${v.roomNo}: ${err.message}`);
      throw err;
    }
  },
  undo: async (tx, ctx, ids) => {
    const mine = await ownHostels(tx, ctx);
    if (mine !== null && (await tx.hostelRoom.count({ where: { id: { in: ids }, hostelId: { notIn: mine } } }))) {
      throw new Error("This import added rooms in another hostel. Ask the Principal or School Admin to undo it.");
    }
    const taken = await tx.bedAllocation.count({ where: { roomId: { in: ids }, status: "ACTIVE" } });
    if (taken) throw new Error(`${taken} student${taken === 1 ? " has a bed" : "s have beds"} in these rooms. Move them first, then undo the import.`);
    for (const id of ids) {
      const r = await tx.hostelRoom.findFirst({ where: { id, archivedAt: null }, select: { id: true } });
      if (r) await closeRoom(tx, ctx, r.id, "Import undone");
      // A room nobody ever slept in has its number free again, so the corrected file can bring it in.
      if (r && (await tx.bedAllocation.count({ where: { roomId: id } })) === 0) await tx.hostelRoom.update({ where: { id }, data: { releasedAt: new Date() } });
    }
  },
});
