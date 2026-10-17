// PTM booking by the parent on Parent Link (approved design mod-events.jsx:
// "Parents book a slot on Parent Link; the office can book for them"). The
// school switches it on or off in Events Settings, PTM defaults. A parent
// sees the coming PTMs for their child's class, the teachers who teach the
// child and their free times (never a time inside the break), and books one
// slot per child per PTM. They can change it to another free time or cancel
// it until the day before the PTM; after that, or once the school has booked
// more than one meeting for the child, they call the school. One parent per
// slot is kept by the database update itself (a slot taken a moment ago is
// refused). Every booking, change and cancel is audited, the parent gets the
// confirmation message (automatic message rule "ptm") and the teacher is told.
import "server-only";

import type { Ptm, PtmSlot } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { ParentLinkProblem } from "../parent-link/links";
import { isChildOfGuardian } from "../students/guardian-access";
import { eventsSettings } from "./settings";
import { tellParent } from "./ptm";
import { clock, dayOf, isoOf, longDay, shortDay, timeSpan } from "./words";

export type ParentSlot = { id: string; time: string };
export type ParentTeacher = { staffId: string; name: string; label: string; free: ParentSlot[] };
export type ParentBooking = { slotId: string; staffId: string; teacher: string; label: string; time: string; byOffice: boolean };
export type ParentPtm = {
  ptmId: string;
  when: string;
  window: string;
  venue: string | null;
  breakWords: string | null;
  /** Booking, changing and cancelling are open until the day before the PTM. */
  open: boolean;
  /** The school lets parents book on Parent Link (Events Settings). */
  parentBooking: boolean;
  closesOn: string;
  teachers: ParentTeacher[];
  booked: ParentBooking[];
  /** The parent can change or cancel here (one booking, not yet met). */
  canChange: boolean;
};

const DAY = 86_400_000;

/** A slot that would run into the PTM's break (never made, but checked again on booking). */
const inBreak = (p: Pick<Ptm, "breakStartMin" | "breakEndMin" | "slotMinutes">, startMin: number) =>
  p.breakStartMin != null && p.breakEndMin != null && startMin < p.breakEndMin && startMin + p.slotMinutes > p.breakStartMin;

/** The child must be one the guardian sees on Parent Link (never one with a custody restriction). */
async function assertGuardianOf(tx: Tx, ctx: SchoolContext, guardianId: string, studentId: string) {
  if (!(await isChildOfGuardian(tx, ctx, guardianId, studentId, { studying: true }))) throw new ParentLinkProblem("This child is not on your Parent Link.");
}

/** The child's class place in the PTM's school year, or null when the PTM is not for their class. */
async function placeIn(tx: Tx, ptm: Pick<Ptm, "academicYearId" | "classIds">, studentId: string) {
  const enrol = await tx.enrolment.findFirst({ where: { studentId, academicYearId: ptm.academicYearId, archivedAt: null, status: "STUDYING" }, select: { sectionId: true, classId: true } });
  return enrol && ptm.classIds.includes(enrol.classId) ? enrol : null;
}

/** Whether Parent Link booking is on for the school. */
export async function parentBookingOn(tx: Tx, ctx: SchoolContext) {
  return (await eventsSettings(tx, ctx)).ptmParentBooking;
}

/** Coming PTMs for a child, with the teachers who meet their class, the free times and the child's booking. */
export async function parentPtms(tx: Tx, ctx: SchoolContext, input: { studentId: string; today: string; horizonDays?: number }): Promise<ParentPtm[]> {
  const today = dayOf(input.today);
  const ptms = await tx.ptm.findMany({ where: { archivedAt: null, date: { gte: today, lte: new Date(today.getTime() + (input.horizonDays ?? 60) * DAY) } }, orderBy: { date: "asc" }, take: 4 });
  const on = await parentBookingOn(tx, ctx);
  const out: ParentPtm[] = [];
  for (const p of ptms) {
    const place = await placeIn(tx, p, input.studentId);
    if (!place) continue;
    const [teachers, slots] = await Promise.all([
      tx.ptmTeacher.findMany({ where: { ptmId: p.id }, orderBy: { sortOrder: "asc" } }),
      tx.ptmSlot.findMany({ where: { ptmId: p.id }, orderBy: { startMin: "asc" }, select: { id: true, staffId: true, startMin: true, studentId: true, bookedVia: true, arrivedAt: true } }),
    ]);
    const mine = teachers.filter((t) => !t.sectionIds.length || t.sectionIds.includes(place.sectionId));
    const staff = await tx.staff.findMany({ where: { id: { in: teachers.map((t) => t.staffId) } }, select: { id: true, fullName: true } });
    const name = (id: string) => staff.find((s) => s.id === id)?.fullName ?? "Teacher";
    const label = (id: string) => teachers.find((t) => t.staffId === id)?.label ?? "Teacher";
    const booked = slots.filter((s) => s.studentId === input.studentId);
    const noted = booked.length ? await tx.ptmMeetingNote.count({ where: { slotId: { in: booked.map((b) => b.id) } } }) : 0;
    const open = on && isoOf(p.date) > input.today;
    out.push({
      ptmId: p.id,
      when: longDay(isoOf(p.date)),
      window: timeSpan(p.startMin, p.endMin),
      venue: p.venue,
      breakWords: p.breakStartMin != null && p.breakEndMin != null ? `${clock(p.breakStartMin)} – ${clock(p.breakEndMin)}` : null,
      open,
      parentBooking: on,
      closesOn: shortDay(isoOf(new Date(p.date.getTime() - DAY))),
      teachers: open ? mine.map((t) => ({ staffId: t.staffId, name: name(t.staffId), label: t.label, free: slots.filter((s) => s.staffId === t.staffId && !s.studentId && !inBreak(p, s.startMin)).map((s) => ({ id: s.id, time: clock(s.startMin) })) })) : [],
      booked: booked.map((b) => ({ slotId: b.id, staffId: b.staffId, teacher: name(b.staffId), label: label(b.staffId), time: clock(b.startMin), byOffice: b.bookedVia !== "parent-link" })),
      canChange: open && booked.length <= 1 && noted === 0 && !booked.some((b) => b.arrivedAt),
    });
  }
  return out;
}

type Who = { guardianId: string; studentId: string; today: string };

async function openSlot(tx: Tx, ctx: SchoolContext, slotId: string, today: string) {
  if (!(await parentBookingOn(tx, ctx))) throw new ParentLinkProblem("The school books PTM slots for parents. Please call the school.");
  const slot = await tx.ptmSlot.findFirst({ where: { id: slotId }, include: { ptm: true } });
  if (!slot || slot.ptm.archivedAt) throw new ParentLinkProblem("This PTM was cancelled or changed. Please refresh the page.");
  if (isoOf(slot.ptm.date) <= today) throw new ParentLinkProblem(`Booking for the PTM on ${longDay(isoOf(slot.ptm.date))} closed the day before. Please call the school.`);
  return slot;
}

async function teacherName(tx: Tx, staffId: string) {
  return (await tx.staff.findFirst({ where: { id: staffId }, select: { fullName: true, userLoginId: true } })) ?? { fullName: "the teacher", userLoginId: null };
}

async function guardianName(tx: Tx, guardianId: string) {
  return (await tx.guardian.findFirst({ where: { id: guardianId }, select: { name: true } }))?.name ?? "A parent";
}

/** The parent books (or moves their booking to) a free slot. One booking per child per PTM; one parent per slot. */
export async function bookOnParentLink(tx: Tx, ctx: SchoolContext, who: Who & { slotId: string }) {
  await assertGuardianOf(tx, ctx, who.guardianId, who.studentId);
  const slot = await openSlot(tx, ctx, who.slotId, who.today);
  const p = slot.ptm;
  if (inBreak(p, slot.startMin)) throw new ParentLinkProblem("That time is the break. Pick another time.");
  const place = await placeIn(tx, p, who.studentId);
  if (!place) throw new ParentLinkProblem("This PTM is not for your child's class.");
  const teacherRow = await tx.ptmTeacher.findFirst({ where: { ptmId: p.id, staffId: slot.staffId } });
  if (!teacherRow || (teacherRow.sectionIds.length && !teacherRow.sectionIds.includes(place.sectionId))) throw new ParentLinkProblem("This teacher does not meet parents of your child's class at this PTM.");
  const child = await tx.student.findFirst({ where: { id: who.studentId }, select: { firstName: true, fullName: true } });
  const t = await teacherName(tx, slot.staffId);

  const existing = await tx.ptmSlot.findMany({ where: { ptmId: p.id, studentId: who.studentId } });
  if (existing.some((e) => e.id === slot.id)) return { slot, teacher: t.fullName, time: clock(slot.startMin), changed: false, unchanged: true };
  if (existing.length > 1) throw new ParentLinkProblem("The school has booked more than one meeting for your child at this PTM. Please call the school to change them.");
  const old = existing[0] ?? null;
  if (old) {
    if (old.arrivedAt || (await tx.ptmMeetingNote.findFirst({ where: { slotId: old.id } }))) throw new ParentLinkProblem("This meeting has already started, so it cannot be changed here.");
    await tx.ptmSlot.updateMany({ where: { id: old.id, studentId: who.studentId }, data: { studentId: null, guardianId: null, bookedById: null, bookedAt: null, bookedVia: null, arrivedAt: null, remindedAt: null } });
  }
  // One parent per slot: only a free slot is taken; if another parent took it a moment ago, nothing changes (the whole step is undone).
  const took = await tx.ptmSlot.updateMany({ where: { id: slot.id, studentId: null }, data: { studentId: who.studentId, guardianId: who.guardianId, bookedById: null, bookedAt: new Date(), bookedVia: "parent-link", arrivedAt: null, remindedAt: null } });
  if (took.count === 0) throw new ParentLinkProblem(`${clock(slot.startMin)} was just taken by another parent. Pick another time.`);

  const parent = await guardianName(tx, who.guardianId);
  const when = `${shortDay(isoOf(p.date))}, ${clock(slot.startMin)}`;
  await writeAudit(tx, ctx, {
    action: old ? "booking-changed-by-parent" : "booked-by-parent", recordType: "PTM Slot", recordId: slot.id, actorNote: `${parent}, on Parent Link`,
    before: old ? { time: clock(old.startMin), teacherSlot: old.id } : undefined,
    after: { student: child?.fullName ?? "Student", teacher: t.fullName, time: clock(slot.startMin), date: longDay(isoOf(p.date)) },
  });
  if (t.userLoginId) {
    await notify(tx, ctx, { to: t.userLoginId, type: "ptm-booking", text: `${parent} ${old ? "moved their PTM slot to" : "booked"} ${when} for ${child?.firstName ?? "their child"}, on Parent Link.`, link: `/events-calendar/ptm?day=${p.id}`, groupKey: `ptm-booking:${p.id}`, mergedText: (n) => `${n} PTM bookings from parents on Parent Link` });
  }
  const fresh = await tx.ptmSlot.findUniqueOrThrow({ where: { id: slot.id } });
  await tellParent(tx, ctx, { ...fresh, ptm: p } as PtmSlot & { ptm: Ptm }, t.fullName, "confirm");
  return { slot: fresh, teacher: t.fullName, time: clock(slot.startMin), changed: Boolean(old), unchanged: false };
}

/** The parent cancels their child's booking (until the day before; not once the meeting has started). */
export async function cancelOnParentLink(tx: Tx, ctx: SchoolContext, who: Who & { slotId: string }) {
  await assertGuardianOf(tx, ctx, who.guardianId, who.studentId);
  const slot = await openSlot(tx, ctx, who.slotId, who.today);
  if (slot.studentId !== who.studentId) throw new ParentLinkProblem("This booking is no longer there. Please refresh the page.");
  if (slot.arrivedAt || (await tx.ptmMeetingNote.findFirst({ where: { slotId: slot.id } }))) throw new ParentLinkProblem("This meeting has already started, so it cannot be cancelled here.");
  const freed = await tx.ptmSlot.updateMany({ where: { id: slot.id, studentId: who.studentId }, data: { studentId: null, guardianId: null, bookedById: null, bookedAt: null, bookedVia: null, arrivedAt: null, remindedAt: null } });
  if (freed.count === 0) throw new ParentLinkProblem("This booking is no longer there. Please refresh the page.");
  const [child, t, parent] = await Promise.all([tx.student.findFirst({ where: { id: who.studentId }, select: { firstName: true, fullName: true } }), teacherName(tx, slot.staffId), guardianName(tx, who.guardianId)]);
  await writeAudit(tx, ctx, { action: "booking-cancelled-by-parent", recordType: "PTM Slot", recordId: slot.id, actorNote: `${parent}, on Parent Link`, before: { student: child?.fullName ?? "Student", teacher: t.fullName, time: clock(slot.startMin), date: longDay(isoOf(slot.ptm.date)) } });
  if (t.userLoginId) {
    await notify(tx, ctx, { to: t.userLoginId, type: "ptm-booking", text: `${parent} cancelled the PTM slot at ${shortDay(isoOf(slot.ptm.date))}, ${clock(slot.startMin)} for ${child?.firstName ?? "their child"}, on Parent Link.`, link: `/events-calendar/ptm?day=${slot.ptmId}`, groupKey: `ptm-booking:${slot.ptmId}`, mergedText: (n) => `${n} PTM bookings from parents on Parent Link` });
  }
  return { teacher: t.fullName, time: clock(slot.startMin), when: shortDay(isoOf(slot.ptm.date)) };
}
