// Rooms and lab bookings (04 §2, optional "academic-rooms"): a room or lab
// is booked for one period on one date, never twice.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { AcademicRuleError, weekday } from "./common";
import { effectiveVersion } from "./timetable";

export const ROOM_KINDS = [
  { value: "classroom", label: "Classroom" },
  { value: "lab", label: "Lab" },
  { value: "activity", label: "Activity room or ground" },
] as const;

export async function roomsFor(tx: Tx, ctx: SchoolContext, campusId: string) {
  return tx.room.findMany({ where: { schoolId: ctx.schoolId, campusId, archivedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
}

/** Every room name used: room records and the rooms written on sections. */
export async function roomNames(tx: Tx, ctx: SchoolContext, campusId: string, yearId: string) {
  const [rooms, sections] = await Promise.all([
    roomsFor(tx, ctx, campusId),
    tx.section.findMany({ where: { academicYearId: yearId, archivedAt: null, room: { not: null } }, select: { room: true }, distinct: ["room"] }),
  ]);
  const names = new Map<string, string>();
  for (const r of rooms) names.set(r.name.toLowerCase(), r.name);
  for (const s of sections) if (s.room && !names.has(s.room.toLowerCase())) names.set(s.room.toLowerCase(), s.room);
  return [...names.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function addRoom(tx: Tx, ctx: SchoolContext, campusId: string, input: { name: string; kind: string; capacity: number | null }) {
  const name = input.name.trim();
  if (!name) throw new AcademicRuleError("Give the room a name, like Lab 1.", "name");
  const same = await tx.room.findFirst({ where: { schoolId: ctx.schoolId, campusId, name: { equals: name, mode: "insensitive" } } });
  if (same && !same.archivedAt) throw new AcademicRuleError(`${same.name} is already in the list.`, "name");
  const room = same
    ? await tx.room.update({ where: { id: same.id }, data: { archivedAt: null, kind: input.kind, capacity: input.capacity, name } })
    : await tx.room.create({ data: { schoolId: ctx.schoolId, campusId, name, kind: input.kind, capacity: input.capacity, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: same ? "restored" : "created", recordType: "Room", recordId: room.id, after: { name, kind: input.kind, capacity: input.capacity } });
  return room;
}

export async function archiveRoom(tx: Tx, ctx: SchoolContext, id: string) {
  const room = await tx.room.findFirst({ where: { id, archivedAt: null } });
  if (!room) throw new AcademicRuleError("This room was already removed.");
  await tx.room.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Room", recordId: id, before: { name: room.name } });
  return room;
}

/** Books a lab for a period; blocked when the room is already booked or has a class then. */
export async function bookLab(tx: Tx, ctx: SchoolContext, input: { roomId: string; date: Date; periodNo: number; sectionId: string | null; staffId: string; purpose: string | null; today: Date }) {
  const room = await tx.room.findFirst({ where: { id: input.roomId, archivedAt: null } });
  if (!room) throw new AcademicRuleError("Choose a room or lab.", "roomId");
  if (input.date < input.today) throw new AcademicRuleError("Choose today or a later date.", "date");
  // One booking at a time per room: serialise bookings of this room.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lab:${room.id}`}))`;
  const taken = await tx.labBooking.findFirst({ where: { roomId: room.id, date: input.date, periodNo: input.periodNo, archivedAt: null } });
  if (taken) {
    const who = taken.sectionId ? await tx.section.findFirst({ where: { id: taken.sectionId }, include: { schoolClass: true } }) : null;
    throw new AcademicRuleError(`${room.name} is already booked${who ? ` for ${who.schoolClass.name} ${who.name}` : ""} in period ${input.periodNo} on ${formatDate(input.date)}.`, "periodNo");
  }
  const version = await effectiveVersion(tx, ctx, room.campusId, input.date);
  if (version) {
    const sections = await tx.section.findMany({ where: { room: { equals: room.name, mode: "insensitive" } }, select: { id: true } });
    const busy = await tx.timetablePeriod.findFirst({
      where: { versionId: version.id, dayOfWeek: weekday(input.date), periodNo: input.periodNo, archivedAt: null, isBreak: false, OR: [{ room: { equals: room.name, mode: "insensitive" } }, { room: null, sectionId: { in: sections.map((s) => s.id) }, OR: [{ subjectId: { not: null } }, { label: { not: null } }] }] },
      include: { section: { include: { schoolClass: true } } },
    });
    if (busy) throw new AcademicRuleError(`${room.name} has ${busy.section.schoolClass.name} ${busy.section.name} in period ${input.periodNo} by the Time Table.`, "periodNo");
  }
  const booking = await tx.labBooking.create({ data: { schoolId: ctx.schoolId, roomId: room.id, date: input.date, periodNo: input.periodNo, sectionId: input.sectionId, staffId: input.staffId, purpose: input.purpose, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Lab Booking", recordId: booking.id, after: { room: room.name, date: input.date.toISOString().slice(0, 10), periodNo: input.periodNo } });
  return { booking, room };
}

export async function cancelBooking(tx: Tx, ctx: SchoolContext, id: string) {
  const b = await tx.labBooking.findFirst({ where: { id, archivedAt: null }, include: { room: true } });
  if (!b) throw new AcademicRuleError("This booking was already cancelled.");
  await tx.labBooking.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Lab Booking", recordId: id, before: { room: b.room.name, date: b.date.toISOString().slice(0, 10), periodNo: b.periodNo } });
  return b;
}

export async function bookingsBetween(tx: Tx, roomId: string, from: Date, to: Date) {
  const rows = await tx.labBooking.findMany({ where: { roomId, archivedAt: null, date: { gte: from, lte: to } }, orderBy: [{ date: "asc" }, { periodNo: "asc" }] });
  const [sections, staff] = await Promise.all([
    tx.section.findMany({ where: { id: { in: rows.map((r) => r.sectionId).filter((x): x is string => Boolean(x)) } }, include: { schoolClass: true } }),
    tx.staff.findMany({ where: { id: { in: rows.map((r) => r.staffId) } }, select: { id: true, fullName: true } }),
  ]);
  return rows.map((r) => {
    const s = sections.find((x) => x.id === r.sectionId);
    return { ...r, sectionLabel: s ? `${s.schoolClass.name} ${s.name}` : null, staffName: staff.find((x) => x.id === r.staffId)?.fullName ?? "" };
  });
}
