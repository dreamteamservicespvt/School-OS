// Importing rooms from a spreadsheet (15 Rooms & Beds, P10): one row per room
// with its hostel, floor, room number, number of beds and room type. Each room
// is added as if typed on Add room (its beds are made and numbered); a floor
// not yet in the hostel is added. Undo closes the rooms and their beds (never
// deletes), only while nobody has a bed in them. Imported by
// src/lib/import-registry.ts.
import "server-only";

import { defineImport } from "../importer";
import { addRoom, closeRoom } from "./rooms";
import { HostelProblem } from "./problem";

type Row = { hostelId: string; hostelName: string; floor: string; roomNo: string; beds: number; roomType: string | null };

export const ROOMS_IMPORT = "hostel-rooms";

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
  check: async (tx, _ctx, row, seen) => {
    const problems: string[] = [];
    const hostelName = (row.hostel ?? "").trim();
    const hostel = hostelName ? await tx.hostel.findFirst({ where: { name: { equals: hostelName, mode: "insensitive" }, archivedAt: null } }) : null;
    if (!hostelName) problems.push("Hostel is needed.");
    else if (!hostel) problems.push(`There is no hostel called “${hostelName}”. Add it in Hostel Settings first.`);
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
      const clash = await tx.hostelRoom.findFirst({ where: { hostelId: hostel.id, roomNo: { equals: roomNo, mode: "insensitive" } }, select: { id: true } });
      if (clash) problems.push(`Room ${roomNo} is already in ${hostel.name}.`);
    }
    if (problems.length) return { ok: false, problems };
    return { ok: true, value: { hostelId: hostel!.id, hostelName: hostel!.name, floor, roomNo, beds, roomType: row.type?.trim() || null } };
  },
  save: async (tx, ctx, v) => {
    const h = await tx.hostel.findFirst({ where: { id: v.hostelId, archivedAt: null } });
    if (!h) throw new Error(`${v.roomNo}: the hostel ${v.hostelName} is closed.`);
    const floor = h.floors.find((f) => f.toLowerCase() === v.floor.toLowerCase());
    if (!floor) await tx.hostel.update({ where: { id: h.id }, data: { floors: [...h.floors, v.floor] } });
    try {
      const room = await addRoom(tx, ctx, { hostelId: h.id, floor: floor ?? v.floor, roomNo: v.roomNo, beds: v.beds, roomType: v.roomType });
      return { id: room.id, created: true };
    } catch (err) {
      if (err instanceof HostelProblem) throw new Error(`${v.roomNo}: ${err.message}`);
      throw err;
    }
  },
  undo: async (tx, ctx, ids) => {
    const taken = await tx.bedAllocation.count({ where: { roomId: { in: ids }, status: "ACTIVE" } });
    if (taken) throw new Error(`${taken} student${taken === 1 ? " has a bed" : "s have beds"} in these rooms. Move them first, then undo the import.`);
    for (const id of ids) {
      const r = await tx.hostelRoom.findFirst({ where: { id, archivedAt: null }, select: { id: true } });
      if (r) await closeRoom(tx, ctx, r.id, "Import undone");
    }
  },
});
